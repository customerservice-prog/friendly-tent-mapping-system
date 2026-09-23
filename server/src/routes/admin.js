const express = require('express');
const db = require('../db');
const { requirePlatformAdmin } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/tenants', requirePlatformAdmin, async (req, res) => {
  const result = await db.query(
    `SELECT t.id, t.slug, t.name, t.contact_email, t.subscription_plan,
            t.subscription_status, t.trial_ends_at, t.stripe_connect_status,
            t.created_at,
            (SELECT COUNT(*)::int FROM products p WHERE p.tenant_id = t.id) AS product_count,
            (SELECT COUNT(*)::int FROM quote_requests q WHERE q.tenant_id = t.id) AS quote_request_count,
            (SELECT COUNT(*)::int FROM tenant_memberships tm WHERE tm.tenant_id = t.id) AS member_count
     FROM tenants t ORDER BY t.created_at DESC`
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
  res.json({ tenant: result.rows[0] });
});

router.patch('/tenants/:slug/members/:userId', requirePlatformAdmin, async (req, res) => {
  const role = String((req.body || {}).role || '').trim().toLowerCase();
  if (!['owner', 'admin', 'staff', 'viewer'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const tenant = await db.query('SELECT id FROM tenants WHERE slug=$1', [req.params.slug]);
  if (!tenant.rows[0]) return res.status(404).json({ error: 'Tenant not found' });
  const result = await db.query(
    `UPDATE tenant_memberships SET role=$1 WHERE tenant_id=$2 AND user_id=$3 RETURNING *`,
    [role, tenant.rows[0].id, req.params.userId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Membership not found' });
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

module.exports = router;
