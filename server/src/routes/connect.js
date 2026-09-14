const express = require('express');
const db = require('../db');
const { requireTenantAccess } = require('../middleware/requireAuth');
const { PLATFORM_FEE_PERCENT } = require('../pricing');

const router = express.Router();

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  // eslint-disable-next-line global-require
  const Stripe = require('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// POST /api/tenants/:slug/connect/onboard
// Staff-only: creates (or resumes) a Stripe Express connected account for
// this tenant and returns a Stripe-hosted onboarding link. The tenant's
// own owner completes onboarding on Stripe's own site - this server never
// collects or sees bank account numbers, identity documents, etc.
//
// STATUS: UNVERIFIED. Requires migrations/005_stripe_connect.sql to have
// been run against this database first (adds stripe_connect_account_id /
// stripe_connect_status columns to tenants). Until that migration runs,
// this route will fail with a 500 on the UPDATE below. This route has
// intentionally never been exercised against production, because doing
// so would create a real Stripe Connect account for a real tenant.
router.post('/:slug/connect/onboard', requireTenantAccess, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({ error: 'Payments are not configured for this server yet.' });
  }

  try {
    let accountId = req.tenant.stripe_connect_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: req.tenant.contact_email || undefined,
        business_type: 'company',
        metadata: { tenantId: req.tenant.id, tenantSlug: req.tenant.slug },
      });
      accountId = account.id;
      await db.query(
        `UPDATE tenants SET stripe_connect_account_id = $1, stripe_connect_status = 'pending', updated_at = now() WHERE id = $2`,
        [accountId, req.tenant.id]
      );
    }

    const origin = req.headers.origin || 'https://rentsketch.com';
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/dashboard/#/settings?connect=refresh`,
      return_url: `${origin}/dashboard/#/settings?connect=return`,
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[connect] onboarding failed for tenant', req.tenant.slug, err.message);
    res.status(500).json({ error: 'Could not start Stripe onboarding. Has the 005_stripe_connect.sql migration been run against this database?' });
  }
});

// GET /api/tenants/:slug/connect/status
// Staff-only: current Connect account status plus the platform fee
// percentage that will apply once connected, so the dashboard can show
// "Connect your payouts" vs "Connected" and be transparent about the fee.
// PLATFORM_FEE_PERCENT is a placeholder pending a real business decision -
// see server/src/pricing.js.
router.get('/:slug/connect/status', requireTenantAccess, async (req, res) => {
  res.json({
    status: req.tenant.stripe_connect_status || 'not_connected',
    hasAccount: Boolean(req.tenant.stripe_connect_account_id),
    platformFeePercent: PLATFORM_FEE_PERCENT,
  });
});

module.exports = router;
