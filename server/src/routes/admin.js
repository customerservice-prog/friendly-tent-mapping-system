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

// GET /api/admin/revenue
// Platform-admin only: payment taxonomy rollup. RentSketch has distinct
// money flows that must never be confused with each other:
//   1. consumerDeposits - money end-customers pay a Friendly tenant
//      business toward their own rental order (quote_requests). This is
//      the TENANT's revenue, not the platform's, unless a Connect fee
//      applies (#2).
//   2. platformFees - the platform's own cut of #1, taken via Stripe
//      Connect's application_fee_amount only when a tenant has an active
//      connected account and a real (non-zero) PLATFORM_FEE_PERCENT has
//      been set (see server/src/pricing.js - currently 0, a placeholder
//      pending a real business decision). Persisted per-transaction on
//      quote_requests.platform_fee_cents (migrations/006) so it can be
//      reported here instead of only living inside Stripe's own dashboard.
//   3. consumerPayments - RentSketch's own direct-to-consumer product (the
//      Event Pass + renewals), tracked in consumer_payments. Platform
//      revenue, unrelated to any tenant.
//   4. tenantSubscriptions - recurring SaaS billing tenants would pay
//      RentSketch for their plan (Starter/Pro/Commerce/Enterprise). NOT
//      YET IMPLEMENTED: no Stripe Billing integration, no
//      stripe_customer_id/stripe_subscription_id on tenants, and no real
//      Stripe Price IDs configured. subscription_plan/subscription_status
//      are descriptive fields only, not evidence of an actual charge.
router.get('/revenue', requirePlatformAdmin, async (req, res) => {
  const deposits = await db.query(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount_paid_cents), 0)::int AS total_cents
     FROM quote_requests WHERE payment_status = 'paid'`
  );

  let fees;
  try {
    fees = await db.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(platform_fee_cents), 0)::int AS total_cents
       FROM quote_requests
       WHERE payment_status = 'paid' AND platform_fee_cents IS NOT NULL AND platform_fee_cents > 0`
    );
  } catch (err) {
    // undefined_column (42703): migrations/006_platform_fee_ledger.sql has not been run yet.
    fees = { rows: [{ count: 0, total_cents: 0 }] };
  }

  const consumerPayments = await db.query(
    `SELECT payment_type, COUNT(*)::int AS count, COALESCE(SUM(amount_cents), 0)::int AS total_cents
     FROM consumer_payments WHERE status = 'paid' GROUP BY payment_type`
  );

  res.json({
    consumerDeposits: deposits.rows[0],
    platformFees: fees.rows[0],
    consumerPayments: consumerPayments.rows,
    tenantSubscriptions: {
      implemented: false,
      note: 'Stripe Billing for tenant subscription plans has not been built yet (no Stripe Price IDs configured - pending a real business pricing decision). subscription_plan/subscription_status are descriptive fields only, not evidence of an actual charge.',
    },
  });
});

module.exports = router;
