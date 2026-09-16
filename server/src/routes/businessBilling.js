const express = require('express');
const { verifyToken } = require('../auth');
const db = require('../db');
const { BUSINESS_PLANS } = require('../pricing');

const router = express.Router();

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const Stripe = require('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function safeOrigin(req) {
  const configured = (process.env.APP_URL || 'https://rentsketch.com').replace(/\/$/, '');
  const candidate = req.headers.origin;
  return candidate && /^https:\/\/([a-z0-9-]+\.)?rentsketch\.com$/i.test(candidate) ? candidate : configured;
}

// Billing must remain reachable after a trial expires. The normal tenant
// middleware intentionally returns 402 for expired trials, which would create
// a dead-end where a legitimate owner could no longer pay. This middleware
// authenticates tenant membership but deliberately does not enforce product
// access/trial state.
async function requireBillingAccess(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });
    const payload = verifyToken(token);
    const tenantResult = await db.query('SELECT * FROM tenants WHERE slug=$1', [req.params.slug]);
    const tenant = tenantResult.rows[0];
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (!payload.isPlatformAdmin) {
      const membership = await db.query(
        'SELECT role FROM tenant_memberships WHERE tenant_id=$1 AND user_id=$2',
        [tenant.id, payload.userId]
      );
      if (!membership.rows[0]) return res.status(403).json({ error: 'You do not have access to this tenant' });
      if (!['owner', 'admin'].includes(membership.rows[0].role)) {
        return res.status(403).json({ error: 'Only a tenant owner or admin can manage billing' });
      }
    }
    req.tenant = tenant;
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Public plan catalog. Prices shown by clients should come from here.
router.get('/plans', (req, res) => res.json({ currency: 'usd', plans: Object.values(BUSINESS_PLANS) }));

// Current server-authoritative billing state for dashboard/account UI.
router.get('/:slug/billing/status', requireBillingAccess, async (req, res) => {
  const t = req.tenant;
  const sub = await db.query(
    `SELECT plan_id,status,billing_interval,current_period_start,current_period_end,cancel_at_period_end
    FROM subscriptions WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [t.id]
  );
  res.json({
    plan: t.subscription_plan || null,
    status: t.subscription_status || null,
    trialEndsAt: t.trial_ends_at || null,
    friendlyFree: t.slug === 'friendly',
    subscription: sub.rows[0] || null,
  });
});

// Starts a recurring Stripe subscription for an authenticated tenant.
// Uses permanent Stripe Price IDs from environment variables to enable
// safe test→live migration without code changes.
router.post('/:slug/billing/checkout-session', requireBillingAccess, async (req, res) => {
  const stripe = stripeClient();
  if (!stripe) return res.status(503).json({ error: 'Payments are not configured.' });
  const tenant = req.tenant;

  // Friendly is intentionally free during the current rollout and must never
  // accidentally enter the paid SaaS checkout flow.
  if (tenant.slug === 'friendly') {
    return res.status(400).json({ error: 'Friendly Party Rental currently has free RentSketch access.' });
  }

  const planId = String(req.body?.plan || '').toLowerCase();
  const interval = req.body?.interval === 'annual' ? 'annual' : 'monthly';
  const plan = BUSINESS_PLANS[planId];

  if (!plan || planId === 'enterprise') {
    return res.status(400).json({ error: 'Choose Starter, Pro, or Business.' });
  }

  // Map plan ID to Stripe permanent Price ID from environment.
  // Environment variable naming: STRIPE_PRICE_<PLANID>_<INTERVAL>
  // Examples: STRIPE_PRICE_STARTER_MONTHLY, STRIPE_PRICE_COMMERCE_ANNUAL
  const priceEnvKey = `STRIPE_PRICE_${planId.toUpperCase()}_${interval.toUpperCase()}`;
  const stripePriceId = process.env[priceEnvKey];

  if (!stripePriceId) {
    console.error(
      `[billing] missing permanent Stripe price ID in environment: ${priceEnvKey}. ` +
      `Ensure STRIPE_PRICE_STARTER_MONTHLY/ANNUAL, STRIPE_PRICE_PRO_MONTHLY/ANNUAL, ` +
      `STRIPE_PRICE_COMMERCE_MONTHLY/ANNUAL are set.`
    );
    return res.status(503).json({ error: 'Payments are not fully configured.' });
  }

  let customerId = tenant.stripe_billing_customer_id || null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: tenant.contact_email || undefined,
      name: tenant.name,
      metadata: { tenantId: tenant.id, tenantSlug: tenant.slug },
    });
    customerId = customer.id;
    await db.query('UPDATE tenants SET stripe_billing_customer_id=$1, updated_at=now() WHERE id=$2', [
      customerId,
      tenant.id,
    ]);
  }

  const origin = safeOrigin(req);

  // Idempotency: use tenant_id + plan + interval as idempotency key to prevent
  // duplicate sessions if the request is retried. Stripe will return the same
  // session URL on retry.
  const idempotencyKey = `${tenant.id}-${planId}-${interval}`;

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: stripePriceId, quantity: 1 }],
        metadata: {
          kind: 'business_subscription',
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          planId,
          interval,
        },
        subscription_data: {
          metadata: {
            kind: 'business_subscription',
            tenantId: tenant.id,
            tenantSlug: tenant.slug,
            planId,
            interval,
          },
        },
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
        success_url: `${origin}/dashboard/?billing=success`,
        cancel_url: `${origin}/business/pricing.html?billing=cancelled&plan=${encodeURIComponent(planId)}`,
      },
      { idempotencyKey }
    );
    res.json({ url: session.url });
  } catch (err) {
    console.error('[billing checkout] error creating session:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Stripe-hosted billing portal for card changes, invoices and cancellation.
router.post('/:slug/billing/portal-session', requireBillingAccess, async (req, res) => {
  const stripe = stripeClient();
  if (!stripe) return res.status(503).json({ error: 'Payments are not configured.' });
  const tenant = req.tenant;

  if (tenant.slug === 'friendly') {
    return res.status(400).json({ error: 'Friendly Party Rental currently has free RentSketch access.' });
  }

  if (!tenant.stripe_billing_customer_id) {
    return res.status(409).json({ error: 'No billing account exists yet. Choose a plan first.' });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_billing_customer_id,
      return_url: `${safeOrigin(req)}/dashboard/?billing=portal-return`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('[billing portal] error creating session:', err.message);
    res.status(500).json({ error: 'Failed to create billing portal session' });
  }
});

module.exports = router;

