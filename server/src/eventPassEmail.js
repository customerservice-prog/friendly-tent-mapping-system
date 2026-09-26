const crypto = require('crypto');
const db = require('./db');
const { signToken } = require('./auth');
const { getMailer } = require('./mailer');
const { validateWebhookUrl, postWebhook } = require('./outboundWebhook');

function accessUrl(design, tenantSlug, email, expiresAt) {
  // The private link outlives the editing term by 30 days so the customer can
  // return to renew. Editing always checks the current server entitlement.
  const remaining = expiresAt ? Math.max(0, new Date(expiresAt).getTime() - Date.now()) : 0;
  const seconds = Math.ceil(Math.min(400 * 86400000, Math.max(30 * 86400000, remaining + 30 * 86400000)) / 1000);
  const token = signToken({ kind: 'consumer_design_recovery', designId: design.id, email }, { expiresIn: seconds });
  return 'https://rentsketch.com/designer/?tenant=' + encodeURIComponent(tenantSlug) + '#recoveryToken=' + encodeURIComponent(token);
}

function relayConfig() {
  const checked = validateWebhookUrl(process.env.FRIENDLY_RENTSKETCH_WEBHOOK_URL);
  if (!checked.ok || !checked.url || !process.env.FRIENDLY_RENTSKETCH_WEBHOOK_SECRET) return null;
  return { url: checked.url, secret: process.env.FRIENDLY_RENTSKETCH_WEBHOOK_SECRET };
}

async function relay(type, data) {
  const config = relayConfig();
  if (!config) throw new Error('access_email_not_configured');
  const body = JSON.stringify({ id: crypto.randomUUID(), type, createdAt: new Date().toISOString(), data });
  const signature = crypto.createHmac('sha256', config.secret).update(body).digest('hex');
  const response = await postWebhook(config.url, { headers: { 'Content-Type': 'application/json', 'X-RentSketch-Signature': signature }, body, timeoutMs: 22000 });
  const result = await response.json();
  if (!response.ok || !result.ok || result.accessEmailVersion !== 1) throw new Error('access_email_delivery_failed');
  return result;
}

let readiness, checking;
async function emailReadiness() {
  if (readiness && readiness.until > Date.now()) return readiness.ready;
  if (checking) return checking;
  checking = (async () => {
    let ready = false;
    try { ready = relayConfig() ? (await relay('event_pass.email_check', {})).emailReady === true : !!getMailer(); } catch (_) {}
    readiness = { ready, until: Date.now() + (ready ? 120000 : 15000) };
    return ready;
  })();
  try { return await checking; } finally { checking = null; }
}

async function queueReceipt(client, payment, tenantSlug) {
  await client.query(`INSERT INTO event_pass_emails(receipt_payment_id,customer_email,tenant_slug,kind,design_ids)
    VALUES($1,$2,$3,'receipt',$4) ON CONFLICT(receipt_payment_id) DO NOTHING`,
  [payment.id, payment.customer_email.toLowerCase(), tenantSlug, JSON.stringify([payment.design_id])]);
}

async function queueRecovery(email, tenantSlug, designs) {
  // Callers verify a real purchase or included booking before queuing a link.
  if (!designs.length) return;
  const recent = await db.query("SELECT count(*)::int AS count FROM event_pass_emails WHERE customer_email=$1 AND kind='recovery' AND created_at>now()-interval '15 minutes'", [email]);
  if (recent.rows[0].count >= 3) return;
  await db.query(`INSERT INTO event_pass_emails(customer_email,tenant_slug,kind,design_ids)
    VALUES($1,$2,'recovery',$3) ON CONFLICT DO NOTHING`, [email, tenantSlug, JSON.stringify(designs.map(d => d.id))]);
}

async function eventsForEmail(message) {
  const rows = (await db.query(`SELECT d.*,COALESCE(t.slug,'generic') AS tenant_slug,
    (SELECT max(e.expires_at) FROM entitlements e WHERE e.design_id=d.id AND e.status='active') AS access_expires_at
    FROM designs d LEFT JOIN tenants t ON t.id=d.tenant_id
    WHERE d.id=ANY($1::uuid[]) AND (EXISTS(SELECT 1 FROM consumer_payments p WHERE p.design_id=d.id AND p.status='paid' AND lower(p.customer_email)=$2)
      OR EXISTS(SELECT 1 FROM entitlements e WHERE e.design_id=d.id AND e.source='friendly_order' AND e.status='active' AND e.expires_at>now() AND lower(e.customer_email)=$2))
    ORDER BY d.created_at DESC LIMIT 10`, [message.design_ids, message.customer_email])).rows;
  return rows.filter(d => ['friendly', 'generic'].includes(d.tenant_slug)).map(design => ({
    designId: design.id, tenant: design.tenant_slug,
    title: String((design.scene && design.scene.eventName) || ((design.event_type || 'Your') + ' event')).slice(0, 160),
    expiresAt: design.access_expires_at ? new Date(design.access_expires_at).toISOString() : null,
    accessUrl: accessUrl(design, design.tenant_slug, message.customer_email, design.access_expires_at),
  }));
}

let running = false;
async function processEmails() {
  if (running) return;
  running = true;
  try {
    await db.query("UPDATE event_pass_emails SET status='failed',locked_until=NULL,last_error='delivery_interrupted' WHERE status='sending' AND locked_until<now() AND attempts>=5");
    for (let i = 0; i < 5; i++) {
      const message = (await db.query(`WITH next_email AS (
        SELECT id FROM event_pass_emails WHERE attempts<5 AND ((status='pending' AND next_attempt_at<=now()) OR (status='sending' AND locked_until<now()))
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
        UPDATE event_pass_emails e SET status='sending',attempts=e.attempts+1,locked_until=now()+interval '60 seconds'
        FROM next_email n WHERE e.id=n.id RETURNING e.*`)).rows[0];
      if (!message) break;
      try {
        const events = await eventsForEmail(message);
        if (!events.length) throw new Error('paid_event_unavailable');
        if (relayConfig()) {
          const result = await relay('event_pass.access_email', { messageId: message.id, to: message.customer_email, kind: message.kind, events });
          if (result.emailAccepted !== true) throw new Error('access_email_not_accepted');
        } else {
          const mailer = getMailer();
          if (!mailer) throw new Error('access_email_not_configured');
          const text = events.map(e => `${e.title}\nOpen my event: ${e.accessUrl}\nEditing access until: ${e.expiresAt || 'see your event'}`).join('\n\n') + '\n\nKeep this private email to return on another device. Request your link again at https://rentsketch.com/my-event/ . No subscription or automatic renewal. Rental equipment, delivery and tax on rentals are separate.';
          const result = await mailer.send(message.customer_email, message.kind === 'receipt' ? 'Your RentSketch Event Pass is ready' : 'Open your RentSketch event', text);
          if (result?.error) throw new Error('access_email_not_accepted');
        }
        await db.query("UPDATE event_pass_emails SET status='sent',sent_at=now(),locked_until=NULL,last_error=NULL WHERE id=$1", [message.id]);
      } catch (_) {
        await db.query("UPDATE event_pass_emails SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,locked_until=NULL,next_attempt_at=now()+interval '1 minute'*LEAST(30,power(2,attempts)),last_error='delivery_failed' WHERE id=$1", [message.id]);
      }
    }
  } finally { running = false; }
}

function startEmailWorker() {
  const run = () => processEmails().catch(() => console.error('[event-pass-email] Queue check failed; will retry.'));
  run();
  const timer = setInterval(run, 15000);
  timer.unref();
  return timer;
}

module.exports = { accessUrl, emailReadiness, queueReceipt, queueRecovery, processEmails, startEmailWorker, relay };
