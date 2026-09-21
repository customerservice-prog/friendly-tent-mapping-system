const crypto = require('crypto');
const db = require('./db');
const { fulfillEventPass } = require('./eventPass');

const RUN_ID = 'qa_event_pass_email_recovery_20260921_v1';

async function runOneTimeEventPassQa() {
  if (process.env.RUN_EVENT_PASS_QA_ONCE !== RUN_ID) return;
  const email = String(process.env.QA_EVENT_PASS_EMAIL || '').trim().toLowerCase();
  if (!email || !email.includes('@')) throw new Error('QA_EVENT_PASS_EMAIL is required');

  const tenant = (await db.query("SELECT id,slug FROM tenants WHERE slug='friendly' LIMIT 1")).rows[0];
  if (!tenant) throw new Error('Friendly tenant not found');

  let payment = (await db.query('SELECT * FROM consumer_payments WHERE stripe_checkout_session_id=$1 LIMIT 1',[RUN_ID])).rows[0];
  let design;

  if (!payment) {
    const sessionOwner = crypto.randomBytes(32).toString('hex');
    const scene = {
      eventName: 'RentSketch QA — Email Recovery',
      eventType: 'qa',
      guestCount: 8,
      qaProof: RUN_ID,
      tent: { id:'pole-20x20', type:'pole', widthFt:20, lengthFt:20 },
      surfaceType: 'grass',
      anchoringMethod: 'stake',
      objects: [
        { id:'qa-table-1', kind:'table', tableId:'round-5ft', shape:'round', widthFt:5, depthFt:5, x:7.5, y:7.5, rotationDeg:0, seatCount:8, chairId:'resin-white', linenId:'linen-round-120', linenColor:'White' }
      ]
    };
    design = (await db.query(
      'INSERT INTO designs(tenant_id,anonymous_session_id,schema_version,scene) VALUES($1,$2,1,$3) RETURNING *',
      [tenant.id, sessionOwner, scene]
    )).rows[0];
    payment = (await db.query(
      `INSERT INTO consumer_payments(design_id,customer_email,payment_type,amount_cents,status,stripe_checkout_session_id,duration_days,currency)
       VALUES($1,$2,'consumer_event_pass',999,'pending',$3,30,'usd') RETURNING *`,
      [design.id, email, RUN_ID]
    )).rows[0];
  } else {
    design = (await db.query('SELECT * FROM designs WHERE id=$1 LIMIT 1',[payment.design_id])).rows[0];
  }

  const session = {
    id: RUN_ID,
    payment_status: 'paid',
    currency: 'usd',
    amount_total: 999,
    payment_intent: 'qa_event_pass_email_recovery_pi',
    customer_details: { email },
    metadata: { kind:'consumer_event_pass', designId:design.id, tenant:'friendly' }
  };

  await fulfillEventPass(session);

  const verified = (await db.query(`
    SELECT p.status,p.amount_cents,p.duration_days,e.status AS entitlement_status,e.expires_at,d.scene
    FROM consumer_payments p
    JOIN designs d ON d.id=p.design_id
    LEFT JOIN entitlements e ON e.id=p.entitlement_id
    WHERE p.stripe_checkout_session_id=$1 LIMIT 1`,[RUN_ID])).rows[0];
  const mail = (await db.query(
    "SELECT status,attempts,sent_at,last_error FROM event_pass_emails WHERE receipt_payment_id=$1 ORDER BY created_at DESC LIMIT 1",
    [payment.id]
  )).rows[0];

  console.log('[event-pass-qa]', JSON.stringify({
    runId: RUN_ID,
    designId: design.id,
    paymentStatus: verified?.status,
    entitlementStatus: verified?.entitlement_status,
    expiresAt: verified?.expires_at,
    sceneProof: verified?.scene?.qaProof,
    furnishedObjects: Array.isArray(verified?.scene?.objects) ? verified.scene.objects.length : null,
    emailStatus: mail?.status || 'queued',
    emailAttempts: mail?.attempts || 0
  }));
}

module.exports = runOneTimeEventPassQa;
