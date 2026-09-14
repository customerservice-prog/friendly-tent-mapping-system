const express = require('express');
const db = require('../db');
const { requirePlatformAdmin } = require('../middleware/requireAuth');

const router = express.Router();

// GET /api/admin/tenants
// Platform-admin only: cross-tenant overview for the super-admin panel.
// Lists every rental company on RentSketch with basic plan/trial/status
// info and lightweight usage counts, so the platform owner can see the
// whole business at a glance. Gated by requirePlatformAdmin, which checks
// users.is_platform_admin (there is no self-service way to set this flag -
// it can only be set directly in the database).
router.get('/tenants', requirePlatformAdmin, async (req, res) => {
  const result = await db.query(
    `SELECT t.id, t.slug, t.name, t.contact_email, t.subscription_plan,
            t.subscription_status, t.trial_ends_at, t.stripe_connect_status,
            t.created_at,
            (SELECT COUNT(*)::int FROM products p WHERE p.tenant_id = t.id) AS product_count,
            (SELECT COUNT(*)::int FROM quote_requests q WHERE q.tenant_id = t.id) AS quote_request_count,
            (SELECT COUNT(*)::int FROM tenant_memberships tm WHERE tm.tenant_id = t.id) AS member_count
     FROM tenants t
     ORDER BY t.created_at DESC`
  );
  res.json({ tenants: result.rows });
});

// GET /api/admin/overview
// Platform-admin only: aggregate stats (tenant counts by plan/status) for
// the super-admin dashboard header cards.
router.get('/overview', requirePlatformAdmin, async (req, res) => {
  const totals = await db.query('SELECT COUNT(*)::int AS count FROM tenants');
  const byStatus = await db.query(
    'SELECT subscription_status, COUNT(*)::int AS count FROM tenants GROUP BY subscription_status'
  );
  const byPlan = await db.query(
    'SELECT subscription_plan, COUNT(*)::int AS count FROM tenants GROUP BY subscription_plan'
  );
  const users = await db.query('SELECT COUNT(*)::int AS count FROM users');
  res.json({
    totalTenants: totals.rows[0].count,
    totalUsers: users.rows[0].count,
    byStatus: byStatus.rows,
    byPlan: byPlan.rows,
  });
});

module.exports = router;
