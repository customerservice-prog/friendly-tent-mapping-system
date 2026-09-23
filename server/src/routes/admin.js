const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { hashPassword } = require('../auth');
const { requirePlatformAdmin } = require('../middleware/requireAuth');

const router = express.Router();

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const Stripe = require('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

async function audit(req, action, targetType, targetId, targetLabel, metadata = {}) {
  try {
    await db.query(
      `INSERT INTO platform_admin_audit(admin_user_id,action,target_type,target_id,target_label,metadata)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [req.user?.userId || null, action, targetType || null, targetId || null, targetLabel || null, metadata || {}]
    );
  } catch (err) {
    console.error('[platform audit]', err.message);
  }
}

function safeLimit(value, fallback = 100, max = 250) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(max, Math.round(n))) : fallback;
}

router.get('/tenants', requirePlatformAdmin, async (req, res) => {
  const result = await db.query(
    `SELECT t.id, t.slug, t.name, t.contact_email, t.website, t.logo_url,
            t.subscription_plan, t.subscription_status, t.trial_ends_at,
            t.stripe_connect_status, t.webhook_url, t.allowed_origins, t.created_at,
            (SELECT COUNT(*)::int FROM products p WHERE p.tenant_id=t.id) AS product_count,
            (SELECT COUNT(*)::int FROM products p WHERE p.tenant_id=t.id AND p.active) AS active_product_count,
            (SELECT COUNT(*)::int FROM products p WHERE p.tenant_id=t.id AND p.active AND p.visual_model_id IS NOT NULL) AS mapped_product_count,
            (SELECT COUNT(*)::int FROM designs d WHERE d.tenant_id=t.id) AS design_count,
            (SELECT COUNT(*)::int FROM designs d WHERE d.tenant_id=t.id AND d.created_at>=now()-interval '30 days') AS design_month_count,
            (SELECT MAX(d.updated_at) FROM designs d WHERE d.tenant_id=t.id) AS last_design_at,
            (SELECT COUNT(*)::int FROM quote_requests q WHERE q.tenant_id=t.id) AS quote_request_count,
            (SELECT COUNT(*)::int FROM quote_requests q WHERE q.tenant_id=t.id AND q.status='new') AS new_request_count,
            (SELECT MAX(q.created_at) FROM quote_requests q WHERE q.tenant_id=t.id) AS last_request_at,
            (SELECT COUNT(*)::int FROM tenant_memberships tm WHERE tm.tenant_id=t.id) AS member_count,
            (SELECT COUNT(*)::int FROM platform_tenant_notes n WHERE n.tenant_id=t.id) AS note_count
     FROM tenants t WHERE t.slug<>'generic' ORDER BY t.created_at DESC`
  );
  res.json({ tenants: result.rows });
});

// Detailed platform view for one tenant, including its real user memberships.
router.get('/tenants/:slug', requirePlatformAdmin, async (req, res) => {
  const tenantResult = await db.query('SELECT * FROM tenants WHERE slug = $1', [req.params.slug]);
  const tenant = tenantResult.rows[0];
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  const members = await db.query(
    `SELECT u.id, u.email, u.display_name, tm.role, tm.created_at
     FROM tenant_memberships tm JOIN users u ON u.id = tm.user_id
     WHERE tm.tenant_id = $1 ORDER BY tm.created_at`, [tenant.id]
  );
  res.json({ tenant, members: members.rows });
});

// Platform owner may manage operational tenant metadata. Billing lifecycle is
// deliberately excluded here so Stripe remains authoritative for paid plans.
router.patch('/tenants/:slug', requirePlatformAdmin, async (req, res) => {
  const body = req.body || {};
  const allowed = ['name', 'contactEmail', 'trialEndsAt'];
  if (!allowed.some(k => Object.prototype.hasOwnProperty.call(body, k))) {
    return res.status(400).json({ error: 'No supported tenant fields supplied' });
  }
  const current = await db.query('SELECT * FROM tenants WHERE slug=$1', [req.params.slug]);
  if (!current.rows[0]) return res.status(404).json({ error: 'Tenant not found' });
  const t = current.rows[0];
  const name = body.name !== undefined ? String(body.name).trim() : t.name;
  const contactEmail = body.contactEmail !== undefined ? String(body.contactEmail).trim().toLowerCase() : t.contact_email;
  const trialEndsAt = body.trialEndsAt !== undefined ? (body.trialEndsAt || null) : t.trial_ends_at;
  if (!name) return res.status(400).json({ error: 'Business name is required' });
  const result = await db.query(
    `UPDATE tenants SET name=$1, contact_email=$2, trial_ends_at=$3, updated_at=now()
     WHERE id=$4 RETURNING *`, [name, contactEmail || null, trialEndsAt, t.id]
  );
  await audit(req, 'tenant.updated', 'tenant', t.id, t.slug, { fields: allowed.filter(k => Object.prototype.hasOwnProperty.call(body, k)) });
  res.json({ tenant: result.rows[0] });
});

router.post('/tenants/:slug/members', requirePlatformAdmin, async (req, res) => {
  const email=String(req.body?.email||'').trim().toLowerCase();
  const displayName=String(req.body?.displayName||'').trim().slice(0,120);
  const role=String(req.body?.role||'staff').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return res.status(400).json({error:'Enter a valid email address'});
  if(!['owner','admin','staff','viewer'].includes(role))return res.status(400).json({error:'Invalid role'});
  const tenant=(await db.query('SELECT id,name FROM tenants WHERE slug=$1',[req.params.slug])).rows[0];
  if(!tenant)return res.status(404).json({error:'Tenant not found'});
  let user=(await db.query('SELECT id,email,display_name,is_platform_admin FROM users WHERE lower(email)=$1',[email])).rows[0],created=false,resetUrl=null;
  if(!user){
    const unusable=await hashPassword(crypto.randomBytes(48).toString('base64url'));
    user=(await db.query('INSERT INTO users(email,password_hash,display_name,is_platform_admin) VALUES($1,$2,$3,false) RETURNING id,email,display_name,is_platform_admin',[email,unusable,displayName||null])).rows[0];
    created=true;
  }
  if(user.is_platform_admin)return res.status(409).json({error:'Platform administrators do not need tenant membership invites'});
  await db.query(`INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,$3)
    ON CONFLICT(tenant_id,user_id) DO UPDATE SET role=EXCLUDED.role`,[tenant.id,user.id,role]);
  if(created){
    const token=crypto.randomBytes(32).toString('base64url'),tokenHash=crypto.createHash('sha256').update(token,'utf8').digest('hex');
    await db.query('UPDATE password_reset_tokens SET used_at=COALESCE(used_at,now()) WHERE user_id=$1 AND used_at IS NULL',[user.id]);
    await db.query("INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '24 hours')",[user.id,tokenHash]);
    resetUrl='https://rentsketch.com/dashboard/reset-password.html#token='+encodeURIComponent(token);
  }
  await audit(req,created?'tenant.member_invited':'tenant.member_added','user',user.id,req.params.slug,{role,email});
  res.status(created?201:200).json({member:{id:user.id,email:user.email,display_name:user.display_name,role},created,resetUrl});
});

router.post('/tenants/:slug/members/:userId/reset-link', requirePlatformAdmin, async (req,res)=>{
  const tenant=(await db.query('SELECT id FROM tenants WHERE slug=$1',[req.params.slug])).rows[0];
  if(!tenant)return res.status(404).json({error:'Tenant not found'});
  const user=(await db.query(`SELECT u.id,u.email,u.is_platform_admin FROM users u JOIN tenant_memberships tm ON tm.user_id=u.id WHERE tm.tenant_id=$1 AND u.id=$2`,[tenant.id,req.params.userId])).rows[0];
  if(!user)return res.status(404).json({error:'Tenant user not found'});
  if(user.is_platform_admin)return res.status(409).json({error:'Use the platform-admin account recovery flow for this user'});
  const token=crypto.randomBytes(32).toString('base64url'),tokenHash=crypto.createHash('sha256').update(token,'utf8').digest('hex');
  await db.query('UPDATE password_reset_tokens SET used_at=COALESCE(used_at,now()) WHERE user_id=$1 AND used_at IS NULL',[user.id]);
  await db.query("INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '24 hours')",[user.id,tokenHash]);
  await audit(req,'tenant.password_reset_link_created','user',user.id,req.params.slug,{email:user.email});
  res.json({resetUrl:'https://rentsketch.com/dashboard/reset-password.html#token='+encodeURIComponent(token),expiresInHours:24});
});

router.patch('/tenants/:slug/members/:userId', requirePlatformAdmin, async (req, res) => {
  const role = String((req.body || {}).role || '').trim().toLowerCase();
  if (!['owner', 'admin', 'staff', 'viewer'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const tenant = await db.query('SELECT id FROM tenants WHERE slug=$1', [req.params.slug]);
  if (!tenant.rows[0]) return res.status(404).json({ error: 'Tenant not found' });
  const current = (await db.query('SELECT role FROM tenant_memberships WHERE tenant_id=$1 AND user_id=$2',[tenant.rows[0].id,req.params.userId])).rows[0];
  if (!current) return res.status(404).json({ error: 'Membership not found' });
  if (current.role === 'owner' && role !== 'owner') {
    const owners = await db.query("SELECT COUNT(*)::int AS count FROM tenant_memberships WHERE tenant_id=$1 AND role='owner'",[tenant.rows[0].id]);
    if (Number(owners.rows[0].count||0) <= 1) return res.status(409).json({ error: 'Cannot demote the tenant’s only owner' });
  }
  const result = await db.query(
    `UPDATE tenant_memberships SET role=$1 WHERE tenant_id=$2 AND user_id=$3 RETURNING *`,
    [role, tenant.rows[0].id, req.params.userId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Membership not found' });
  await audit(req, 'tenant.member_role_changed', 'user', req.params.userId, req.params.slug, { role });
  res.json({ membership: result.rows[0] });
});

router.delete('/tenants/:slug/members/:userId', requirePlatformAdmin, async (req, res) => {
  const tenant = await db.query('SELECT id FROM tenants WHERE slug=$1', [req.params.slug]);
  if (!tenant.rows[0]) return res.status(404).json({ error: 'Tenant not found' });
  const owners = await db.query("SELECT user_id FROM tenant_memberships WHERE tenant_id=$1 AND role='owner'", [tenant.rows[0].id]);
  if (owners.rows.length === 1 && String(owners.rows[0].user_id) === String(req.params.userId)) {
    return res.status(409).json({ error: 'Cannot remove the tenant’s only owner' });
  }
  const result = await db.query('DELETE FROM tenant_memberships WHERE tenant_id=$1 AND user_id=$2 RETURNING user_id', [tenant.rows[0].id, req.params.userId]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Membership not found' });
  await audit(req, 'tenant.member_removed', 'user', req.params.userId, req.params.slug);
  res.json({ ok: true });
});

router.get('/overview', requirePlatformAdmin, async (req, res) => {
  const totals = await db.query('SELECT COUNT(*)::int AS count FROM tenants');
  const byStatus = await db.query('SELECT subscription_status, COUNT(*)::int AS count FROM tenants GROUP BY subscription_status');
  const byPlan = await db.query('SELECT subscription_plan, COUNT(*)::int AS count FROM tenants GROUP BY subscription_plan');
  const users = await db.query('SELECT COUNT(*)::int AS count FROM users');
  res.json({ totalTenants: totals.rows[0].count, totalUsers: users.rows[0].count, byStatus: byStatus.rows, byPlan: byPlan.rows });
});

router.get('/revenue', requirePlatformAdmin, async (req, res) => {
  const deposits = await db.query(`SELECT COUNT(*)::int AS count, COALESCE(SUM(amount_paid_cents),0)::int AS total_cents FROM quote_requests WHERE payment_status='paid'`);
  let fees;
  try { fees = await db.query(`SELECT COUNT(*)::int AS count, COALESCE(SUM(platform_fee_cents),0)::int AS total_cents FROM quote_requests WHERE payment_status='paid' AND platform_fee_cents IS NOT NULL AND platform_fee_cents > 0`); }
  catch (err) { fees = { rows: [{ count: 0, total_cents: 0 }] }; }
  const consumerPayments = await db.query(`SELECT payment_type, COUNT(*)::int AS count, COALESCE(SUM(amount_cents),0)::int AS total_cents FROM consumer_payments WHERE status='paid' GROUP BY payment_type`);
  res.json({ consumerDeposits: deposits.rows[0], platformFees: fees.rows[0], consumerPayments: consumerPayments.rows });
});


router.get('/web-vitals', requirePlatformAdmin, async (req, res) => {
  const requestedDays = Number(req.query.days || 7);
  const days = Number.isFinite(requestedDays) ? Math.max(1, Math.min(90, Math.round(requestedDays))) : 7;
  const pathFilter = typeof req.query.path === 'string' && req.query.path.startsWith('/') ? req.query.path.slice(0, 256) : null;
  const params = [days, pathFilter];

  const result = await db.query(
    `SELECT
       CASE WHEN GROUPING(path)=1 THEN 'ALL' ELSE path END AS path,
       GROUPING(path)::int AS grouping_level,
       COUNT(*)::int AS samples,
       ROUND((percentile_cont(0.75) WITHIN GROUP (ORDER BY lcp_ms) FILTER (WHERE lcp_ms IS NOT NULL))::numeric, 1) AS lcp_p75_ms,
       ROUND((percentile_cont(0.75) WITHIN GROUP (ORDER BY cls) FILTER (WHERE cls IS NOT NULL))::numeric, 4) AS cls_p75,
       ROUND((percentile_cont(0.75) WITHIN GROUP (ORDER BY inp_ms) FILTER (WHERE inp_ms IS NOT NULL))::numeric, 1) AS inp_p75_ms,
       ROUND((percentile_cont(0.75) WITHIN GROUP (ORDER BY fcp_ms) FILTER (WHERE fcp_ms IS NOT NULL))::numeric, 1) AS fcp_p75_ms,
       ROUND((percentile_cont(0.75) WITHIN GROUP (ORDER BY ttfb_ms) FILTER (WHERE ttfb_ms IS NOT NULL))::numeric, 1) AS ttfb_p75_ms
     FROM web_vitals
     WHERE collector_version >= 2
       AND created_at >= now() - $1 * interval '1 day'
       AND ($2::text IS NULL OR path = $2)
     GROUP BY GROUPING SETS ((path), ())
     ORDER BY grouping_level DESC, samples DESC, path
     LIMIT 101`,
    params
  );

  const rows = result.rows.map(({ grouping_level, ...row }) => ({
    ...row,
    samples: Number(row.samples || 0),
    lcp_p75_ms: row.lcp_p75_ms == null ? null : Number(row.lcp_p75_ms),
    cls_p75: row.cls_p75 == null ? null : Number(row.cls_p75),
    inp_p75_ms: row.inp_p75_ms == null ? null : Number(row.inp_p75_ms),
    fcp_p75_ms: row.fcp_p75_ms == null ? null : Number(row.fcp_p75_ms),
    ttfb_p75_ms: row.ttfb_p75_ms == null ? null : Number(row.ttfb_p75_ms),
  }));
  const overall = rows.find(row => row.path === 'ALL') || null;
  res.json({
    days,
    path: pathFilter,
    source: 'first-party-rum',
    thresholds: { lcpGoodMs: 2500, clsGood: 0.1, inpGoodMs: 200 },
    overall,
    pages: rows.filter(row => row.path !== 'ALL'),
  });
});


router.get('/console-overview', requirePlatformAdmin, async (req, res) => {
  const [
    tenants, users, designs, paidPasses, paidDeposits, platformFees, subscriptions, monthPasses, monthDeposits,
    recentTenants, monthDesigns, monthRequests, newRequests, refundedPayments, failedPayments, installedTenants,
  ] = await Promise.all([
    db.query("SELECT COUNT(*)::int AS count FROM tenants WHERE slug<>'generic'"),
    db.query("SELECT COUNT(*)::int AS count FROM users WHERE is_platform_admin IS NOT TRUE"),
    db.query("SELECT COUNT(*)::int AS count FROM designs"),
    db.query("SELECT COUNT(*)::int AS count,COALESCE(SUM(amount_cents),0)::bigint AS cents FROM consumer_payments WHERE status='paid'"),
    db.query("SELECT COUNT(*)::int AS count,COALESCE(SUM(amount_paid_cents),0)::bigint AS cents FROM quote_requests WHERE payment_status='paid'"),
    db.query("SELECT COALESCE(SUM(platform_fee_cents),0)::bigint AS cents FROM quote_requests WHERE payment_status='paid' AND platform_fee_cents>0"),
    db.query(`SELECT COUNT(*) FILTER (WHERE s.status='active')::int AS active,
                     COUNT(*) FILTER (WHERE s.status='trialing')::int AS trialing,
                     COUNT(*) FILTER (WHERE s.status IN ('past_due','unpaid','incomplete','paused'))::int AS attention,
                     COALESCE(SUM(CASE WHEN s.status='active' THEN
                       CASE WHEN s.billing_interval='annual' THEN COALESCE(p.annual_price,0)/12
                            ELSE COALESCE(p.monthly_price,0) END ELSE 0 END),0)::numeric(12,2) AS list_mrr
              FROM subscriptions s LEFT JOIN plans p ON p.id=s.plan_id`),
    db.query("SELECT COALESCE(SUM(amount_cents),0)::bigint AS cents FROM consumer_payments WHERE status='paid' AND created_at>=date_trunc('month',now())"),
    db.query("SELECT COALESCE(SUM(amount_paid_cents),0)::bigint AS cents FROM quote_requests WHERE payment_status='paid' AND created_at>=date_trunc('month',now())"),
    db.query("SELECT COUNT(*)::int AS count FROM tenants WHERE slug<>'generic' AND created_at>=now()-interval '30 days'"),
    db.query("SELECT COUNT(*)::int AS count FROM designs WHERE created_at>=date_trunc('month',now())"),
    db.query("SELECT COUNT(*)::int AS count FROM quote_requests WHERE created_at>=date_trunc('month',now())"),
    db.query("SELECT COUNT(*)::int AS count FROM quote_requests WHERE status='new'"),
    db.query("SELECT COUNT(*)::int AS count FROM consumer_payments WHERE status='refunded'"),
    db.query("SELECT COUNT(*)::int AS count FROM consumer_payments WHERE status='failed'"),
    db.query("SELECT COUNT(*)::int AS count FROM tenants WHERE slug<>'generic' AND jsonb_array_length(COALESCE(allowed_origins,'[]'::jsonb))>0"),
  ]);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    tenants: tenants.rows[0].count,
    tenantUsers: users.rows[0].count,
    designs: designs.rows[0].count,
    subscriptions: subscriptions.rows[0],
    eventPassRevenue: { count: paidPasses.rows[0].count, cents: Number(paidPasses.rows[0].cents || 0) },
    tenantDepositVolume: { count: paidDeposits.rows[0].count, cents: Number(paidDeposits.rows[0].cents || 0) },
    platformFeeRevenue: { cents: Number(platformFees.rows[0].cents || 0) },
    month: { eventPassCents: Number(monthPasses.rows[0].cents || 0), depositCents: Number(monthDeposits.rows[0].cents || 0), designs: Number(monthDesigns.rows[0].count||0), requests: Number(monthRequests.rows[0].count||0) },
    recentTenants: Number(recentTenants.rows[0].count||0),
    newRequests: Number(newRequests.rows[0].count||0),
    refundedPayments: Number(refundedPayments.rows[0].count||0),
    failedPayments: Number(failedPayments.rows[0].count||0),
    installedTenants: Number(installedTenants.rows[0].count||0),
  });
});

router.get('/payments', requirePlatformAdmin, async (req, res) => {
  const limit = safeLimit(req.query.limit, 100, 250);
  const kind = String(req.query.kind || 'all');
  const q = String(req.query.q || '').trim().toLowerCase().slice(0, 120);
  const params = [limit, q ? '%' + q + '%' : null];
  const whereKind = kind === 'event_pass' ? "WHERE kind='event_pass'" : kind === 'deposit' ? "WHERE kind='deposit'" : 'WHERE 1=1';
  const result = await db.query(`
    SELECT * FROM (
      SELECT cp.id::text AS id,'event_pass'::text AS kind,cp.payment_type::text AS subtype,
             cp.status::text AS status,cp.amount_cents::bigint AS amount_cents,upper(cp.currency)::text AS currency,
             cp.customer_email::text AS customer_email,NULL::text AS customer_name,
             COALESCE(t.slug,'generic')::text AS tenant_slug,COALESCE(t.name,'Direct consumer')::text AS tenant_name,
             cp.design_id::text AS design_id,cp.stripe_payment_intent_id::text AS payment_intent_id,
             cp.stripe_checkout_session_id::text AS checkout_session_id,cp.created_at
      FROM consumer_payments cp
      LEFT JOIN designs d ON d.id=cp.design_id
      LEFT JOIN tenants t ON t.id=d.tenant_id
      UNION ALL
      SELECT qr.id::text,'deposit'::text,'rental_deposit'::text,qr.payment_status::text,
             COALESCE(qr.amount_paid_cents,qr.deposit_amount_cents,0)::bigint,'USD'::text,
             qr.customer_email::text,qr.customer_name::text,t.slug::text,t.name::text,
             qr.design_id::text,qr.stripe_payment_intent_id::text,qr.stripe_checkout_session_id::text,qr.created_at
      FROM quote_requests qr JOIN tenants t ON t.id=qr.tenant_id
    ) ledger
    ${whereKind}
    AND ($2::text IS NULL OR lower(COALESCE(customer_email,'')||' '||COALESCE(customer_name,'')||' '||COALESCE(tenant_name,'')||' '||COALESCE(payment_intent_id,'')) LIKE $2)
    ORDER BY created_at DESC LIMIT $1
  `, params);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ payments: result.rows.map(row => ({ ...row, amount_cents: Number(row.amount_cents || 0) })) });
});

router.post('/payments/:kind/:id/refund', requirePlatformAdmin, async (req, res) => {
  if (req.body?.confirm !== true) return res.status(400).json({ error: 'Explicit refund confirmation is required.' });
  const stripe = stripeClient();
  if (!stripe) return res.status(503).json({ error: 'Stripe is not configured.' });
  const kind = String(req.params.kind);
  const id = req.params.id;
  if (!['event_pass','deposit'].includes(kind)) return res.status(400).json({ error: 'Unsupported payment type.' });

  if (kind === 'event_pass') {
    const payment = (await db.query(
      `SELECT cp.*,COALESCE(t.slug,'generic') AS tenant_slug
       FROM consumer_payments cp
       LEFT JOIN designs d ON d.id=cp.design_id LEFT JOIN tenants t ON t.id=d.tenant_id
       WHERE cp.id=$1`, [id]
    )).rows[0];
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });
    if (payment.status === 'refunded') return res.json({ ok: true, alreadyRefunded: true });
    if (payment.status !== 'paid' || !payment.stripe_payment_intent_id) return res.status(409).json({ error: 'Only a confirmed paid Event Pass can be refunded here.' });
    const refund = await stripe.refunds.create({
      payment_intent: payment.stripe_payment_intent_id,
      metadata: { kind: 'rentsketch_admin_refund', paymentId: payment.id, paymentType: payment.payment_type },
    }, { idempotencyKey: 'admin-refund:event-pass:' + payment.id });
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("UPDATE consumer_payments SET status='refunded' WHERE id=$1", [payment.id]);
      if (payment.entitlement_id) await client.query("UPDATE entitlements SET status='revoked',revoked_at=now() WHERE id=$1", [payment.entitlement_id]);
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
    await audit(req, 'payment.refunded', 'consumer_payment', payment.id, payment.customer_email, { refundId: refund.id, amountCents: refund.amount });
    return res.json({ ok: true, refund: { id: refund.id, status: refund.status, amountCents: refund.amount } });
  }

  const payment = (await db.query(
    `SELECT qr.*,t.slug AS tenant_slug,t.name AS tenant_name,t.stripe_connect_account_id,t.stripe_connect_status
     FROM quote_requests qr JOIN tenants t ON t.id=qr.tenant_id WHERE qr.id=$1`, [id]
  )).rows[0];
  if (!payment) return res.status(404).json({ error: 'Deposit payment not found.' });
  if (payment.payment_status === 'refunded') return res.json({ ok: true, alreadyRefunded: true });
  if (payment.payment_status !== 'paid' || !payment.stripe_payment_intent_id) return res.status(409).json({ error: 'Only a confirmed paid deposit can be refunded here.' });
  const refundParams = {
    payment_intent: payment.stripe_payment_intent_id,
    metadata: { kind: 'rentsketch_admin_refund', quoteRequestId: payment.id, tenant: payment.tenant_slug },
  };
  if (payment.stripe_connect_account_id && payment.stripe_connect_status === 'active') {
    refundParams.reverse_transfer = true;
    if (Number(payment.platform_fee_cents || 0) > 0) refundParams.refund_application_fee = true;
  }
  const refund = await stripe.refunds.create(refundParams, { idempotencyKey: 'admin-refund:deposit:' + payment.id });
  await db.query("UPDATE quote_requests SET payment_status='refunded' WHERE id=$1", [payment.id]);
  await audit(req, 'payment.refunded', 'quote_request', payment.id, payment.customer_email, { refundId: refund.id, amountCents: refund.amount, tenant: payment.tenant_slug });
  res.json({ ok: true, refund: { id: refund.id, status: refund.status, amountCents: refund.amount } });
});

router.get('/subscriptions', requirePlatformAdmin, async (req, res) => {
  const limit = safeLimit(req.query.limit, 150, 250);
  const result = await db.query(`
    SELECT s.id::text,t.slug,t.name,t.contact_email,s.plan_id,s.status,s.billing_interval,
           s.current_period_start,s.current_period_end,s.cancel_at_period_end,
           s.provider_customer_id,s.provider_subscription_id,
           p.monthly_price,p.annual_price,s.created_at
    FROM subscriptions s
    JOIN tenants t ON t.id=s.tenant_id
    LEFT JOIN plans p ON p.id=s.plan_id
    ORDER BY s.created_at DESC LIMIT $1
  `, [limit]);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ subscriptions: result.rows });
});

router.patch('/subscriptions/:id', requirePlatformAdmin, async (req, res) => {
  if (typeof req.body?.cancelAtPeriodEnd !== 'boolean') return res.status(400).json({ error: 'cancelAtPeriodEnd must be true or false.' });
  const current = (await db.query(`
    SELECT s.*,t.slug,t.name FROM subscriptions s JOIN tenants t ON t.id=s.tenant_id WHERE s.id=$1
  `, [req.params.id])).rows[0];
  if (!current) return res.status(404).json({ error: 'Subscription not found.' });
  if (!current.provider_subscription_id) return res.status(409).json({ error: 'This subscription is not linked to Stripe.' });
  const stripe = stripeClient();
  if (!stripe) return res.status(503).json({ error: 'Stripe is not configured.' });
  const updated = await stripe.subscriptions.update(current.provider_subscription_id, { cancel_at_period_end: req.body.cancelAtPeriodEnd });
  await db.query(
    `UPDATE subscriptions SET cancel_at_period_end=$1,status=$2,current_period_end=$3 WHERE id=$4`,
    [!!updated.cancel_at_period_end, updated.status || current.status,
     updated.current_period_end ? new Date(updated.current_period_end * 1000) : current.current_period_end, current.id]
  );
  await audit(req, req.body.cancelAtPeriodEnd ? 'subscription.cancel_scheduled' : 'subscription.cancel_removed',
    'subscription', current.id, current.slug, { providerSubscriptionId: current.provider_subscription_id });
  res.json({ ok: true, cancelAtPeriodEnd: !!updated.cancel_at_period_end, status: updated.status });
});

router.get('/designs', requirePlatformAdmin, async (req, res) => {
  const limit = safeLimit(req.query.limit, 100, 250);
  const result = await db.query(`
    SELECT d.id::text,COALESCE(t.slug,'generic') AS tenant_slug,COALESCE(t.name,'Direct consumer') AS tenant_name,
           d.event_type,d.guest_count,d.estimate_total,d.created_at,d.updated_at,
           EXISTS(SELECT 1 FROM entitlements e WHERE e.design_id=d.id AND e.status='active' AND (e.expires_at IS NULL OR e.expires_at>now())) AS active_access
    FROM designs d LEFT JOIN tenants t ON t.id=d.tenant_id
    ORDER BY d.updated_at DESC LIMIT $1
  `, [limit]);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ designs: result.rows });
});

router.get('/activity', requirePlatformAdmin, async (req, res) => {
  const limit = safeLimit(req.query.limit, 50, 200);
  const result = await db.query(`
    SELECT a.id::text,a.action,a.target_type,a.target_id,a.target_label,a.metadata,a.created_at,
           u.email AS admin_email,u.display_name AS admin_name
    FROM platform_admin_audit a LEFT JOIN users u ON u.id=a.admin_user_id
    ORDER BY a.created_at DESC LIMIT $1
  `, [limit]);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ activity: result.rows });
});

router.get('/system', requirePlatformAdmin, async (req, res) => {
  const [dbNow, mail, webhooks, failedMail] = await Promise.all([
    db.query('SELECT now() AS now'),
    db.query("SELECT COUNT(*)::int AS pending FROM event_pass_emails WHERE status IN ('pending','sending')"),
    db.query("SELECT COUNT(*)::int AS count FROM processed_stripe_events"),
    db.query("SELECT COUNT(*)::int AS failed FROM event_pass_emails WHERE status='failed'"),
  ]);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    database: { ok: true, serverTime: dbNow.rows[0].now },
    payments: {
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      eventPassEnabled: process.env.EVENT_PASS_ENABLED === 'true',
      processedWebhookEvents: webhooks.rows[0].count,
    },
    email: { pending: mail.rows[0].pending, failed: failedMail.rows[0].failed },
    app: { nodeEnv: process.env.NODE_ENV || 'development' },
  });
});


router.get('/analytics', requirePlatformAdmin, async (req,res)=>{
  const [trend,topTenants,passes]=await Promise.all([
    db.query(`WITH days AS (
      SELECT generate_series(current_date-29,current_date,'1 day'::interval)::date AS day
    ), design_counts AS (
      SELECT created_at::date day,COUNT(*)::int count FROM designs WHERE created_at>=current_date-29 GROUP BY 1
    ), request_counts AS (
      SELECT created_at::date day,COUNT(*)::int count FROM quote_requests WHERE created_at>=current_date-29 GROUP BY 1
    ), pass_totals AS (
      SELECT created_at::date day,COUNT(*)::int count,COALESCE(SUM(amount_cents),0)::bigint cents
      FROM consumer_payments WHERE created_at>=current_date-29 AND status='paid' GROUP BY 1
    )
    SELECT d.day,COALESCE(dc.count,0)::int designs,COALESCE(rc.count,0)::int requests,
           COALESCE(pt.count,0)::int event_passes,COALESCE(pt.cents,0)::bigint event_pass_cents
    FROM days d LEFT JOIN design_counts dc ON dc.day=d.day
    LEFT JOIN request_counts rc ON rc.day=d.day LEFT JOIN pass_totals pt ON pt.day=d.day
    ORDER BY d.day`),
    db.query(`SELECT t.slug,t.name,t.created_at,
      (SELECT COUNT(*)::int FROM designs d WHERE d.tenant_id=t.id) design_count,
      (SELECT COUNT(*)::int FROM quote_requests q WHERE q.tenant_id=t.id) request_count,
      (SELECT COUNT(*)::int FROM quote_requests q WHERE q.tenant_id=t.id AND q.status='booked') booked_count,
      GREATEST(
        COALESCE((SELECT MAX(d.updated_at) FROM designs d WHERE d.tenant_id=t.id),t.created_at),
        COALESCE((SELECT MAX(q.created_at) FROM quote_requests q WHERE q.tenant_id=t.id),t.created_at)
      ) last_activity
      FROM tenants t ORDER BY ((SELECT COUNT(*) FROM designs d WHERE d.tenant_id=t.id)+(SELECT COUNT(*) FROM quote_requests q WHERE q.tenant_id=t.id)) DESC,t.created_at DESC LIMIT 12`),
    db.query(`SELECT payment_type,status,COUNT(*)::int count,COALESCE(SUM(amount_cents),0)::bigint cents
      FROM consumer_payments GROUP BY payment_type,status ORDER BY payment_type,status`)
  ]);
  res.setHeader('Cache-Control','no-store');
  res.json({trend:trend.rows.map(r=>({...r,event_pass_cents:Number(r.event_pass_cents||0)})),topTenants:topTenants.rows,eventPassBreakdown:passes.rows.map(r=>({...r,cents:Number(r.cents||0)}))});
});

router.get('/alerts', requirePlatformAdmin, async (req,res)=>{
  const [billing,newRequests,failedMail,uninstalled,unmapped]=await Promise.all([
    db.query(`SELECT t.slug,t.name,s.status,s.plan_id,s.current_period_end
      FROM subscriptions s JOIN tenants t ON t.id=s.tenant_id
      WHERE s.status IN ('past_due','unpaid','incomplete','paused') ORDER BY s.current_period_end NULLS FIRST LIMIT 50`),
    db.query(`SELECT q.id::text,t.slug,t.name,q.customer_name,q.customer_email,q.estimate_total,q.created_at
      FROM quote_requests q JOIN tenants t ON t.id=q.tenant_id WHERE q.status='new' ORDER BY q.created_at DESC LIMIT 50`),
    db.query(`SELECT e.id::text,e.customer_email,e.tenant_slug,e.attempts,e.last_error,e.created_at
      FROM event_pass_emails e WHERE e.status='failed' ORDER BY e.created_at DESC LIMIT 50`),
    db.query(`SELECT t.slug,t.name,t.created_at FROM tenants t
      WHERE t.slug<>'generic' AND jsonb_array_length(COALESCE(t.allowed_origins,'[]'::jsonb))=0 AND t.created_at<now()-interval '2 days'
      ORDER BY t.created_at DESC LIMIT 50`),
    db.query(`SELECT t.slug,t.name,COUNT(*)::int missing
      FROM products p JOIN tenants t ON t.id=p.tenant_id
      WHERE t.slug<>'generic' AND p.active AND p.category IN ('tent','table','chair','dance_floor','lighting','linen') AND p.visual_model_id IS NULL
      GROUP BY t.id,t.slug,t.name HAVING COUNT(*)>0 ORDER BY missing DESC LIMIT 50`)
  ]);
  res.setHeader('Cache-Control','no-store');
  res.json({
    counts:{billing:billing.rows.length,newRequests:newRequests.rows.length,failedMail:failedMail.rows.length,uninstalled:uninstalled.rows.length,unmapped:unmapped.rows.length},
    billing:billing.rows,newRequests:newRequests.rows,failedMail:failedMail.rows,uninstalled:uninstalled.rows,unmapped:unmapped.rows
  });
});

router.get('/tenants/:slug/notes', requirePlatformAdmin, async (req,res)=>{
  const tenant=(await db.query('SELECT id FROM tenants WHERE slug=$1',[req.params.slug])).rows[0];
  if(!tenant)return res.status(404).json({error:'Tenant not found'});
  const result=await db.query(`SELECT n.id::text,n.body,n.created_at,u.email AS admin_email,u.display_name AS admin_name
    FROM platform_tenant_notes n LEFT JOIN users u ON u.id=n.admin_user_id
    WHERE n.tenant_id=$1 ORDER BY n.created_at DESC LIMIT 100`,[tenant.id]);
  res.json({notes:result.rows});
});

router.post('/tenants/:slug/notes', requirePlatformAdmin, async (req,res)=>{
  const body=String(req.body?.body||'').trim();
  if(!body||body.length>4000)return res.status(400).json({error:'Note must be between 1 and 4000 characters'});
  const tenant=(await db.query('SELECT id,name FROM tenants WHERE slug=$1',[req.params.slug])).rows[0];
  if(!tenant)return res.status(404).json({error:'Tenant not found'});
  const result=await db.query(`INSERT INTO platform_tenant_notes(tenant_id,admin_user_id,body) VALUES($1,$2,$3) RETURNING id::text,body,created_at`,[tenant.id,req.user?.userId||null,body]);
  await audit(req,'tenant.note_added','tenant',tenant.id,req.params.slug,{noteId:result.rows[0].id});
  res.status(201).json({note:result.rows[0]});
});

router.delete('/tenants/:slug/notes/:noteId', requirePlatformAdmin, async (req,res)=>{
  const tenant=(await db.query('SELECT id FROM tenants WHERE slug=$1',[req.params.slug])).rows[0];
  if(!tenant)return res.status(404).json({error:'Tenant not found'});
  const removed=await db.query('DELETE FROM platform_tenant_notes WHERE id=$1 AND tenant_id=$2 RETURNING id::text',[req.params.noteId,tenant.id]);
  if(!removed.rows[0])return res.status(404).json({error:'Note not found'});
  await audit(req,'tenant.note_deleted','tenant',tenant.id,req.params.slug,{noteId:req.params.noteId});
  res.json({ok:true});
});

module.exports = router;
