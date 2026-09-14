const express = require('express');
const db = require('../db');
const { PLATFORM_FEE_PERCENT } = require('../pricing');

const router = express.Router();

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  // eslint-disable-next-line global-require
const Stripe = require('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// POST /api/tenants/:slug/quote-requests/:id/checkout-session
// Creates a Stripe Checkout Session for a deposit on an existing quote
// request, and returns the hosted checkout URL to redirect the customer
// to. No card data ever touches this server - Stripe hosts the form.
router.post('/:slug/quote-requests/:id/checkout-session', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({ error: 'Payments are not configured for this server yet.' });
  }

            const tenantResult = await db.query('SELECT * FROM tenants WHERE slug = $1', [req.params.slug]);
  const tenant = tenantResult.rows[0];
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

            const qrResult = await db.query(
              'SELECT * FROM quote_requests WHERE id = $1 AND tenant_id = $2',
              [req.params.id, tenant.id]
              );
  const quoteRequest = qrResult.rows[0];
  if (!quoteRequest) return res.status(404).json({ error: 'Quote request not found' });

            const estimateTotal = Number(quoteRequest.estimate_total || 0);
  if (!(estimateTotal > 0)) {
    return res.status(400).json({ error: 'This tenant has not set up pricing yet, so a deposit amount cannot be calculated.' });
  }

  const depositPercent = Number(tenant.deposit_percent || 20);
  const depositCents = Math.max(100, Math.round(estimateTotal * (depositPercent / 100) * 100));
  const origin = (req.body && req.body.origin) || req.headers.origin || '';

            // If this tenant has connected a Stripe Express account (routes/connect.js)
            // and it is active, split the deposit: the tenant's own connected account
            // receives the funds directly, and the platform keeps PLATFORM_FEE_PERCENT
            // as its fee. PLATFORM_FEE_PERCENT defaults to 0 (see pricing.js) until a
            // real business decision is made, so this is safe even though it has not
            // been exercised against a real connected account yet.
            const connectFeeParams = (tenant.stripe_connect_account_id && tenant.stripe_connect_status === 'active' && PLATFORM_FEE_PERCENT > 0)
              ? {
                  application_fee_amount: Math.round(depositCents * (PLATFORM_FEE_PERCENT / 100)),
                  transfer_data: { destination: tenant.stripe_connect_account_id },
                }
              : undefined;

            const feeCents = connectFeeParams ? connectFeeParams.application_fee_amount : null;

            const session = await stripe.checkout.sessions.create({
              mode: 'payment',
              payment_method_types: ['card'],
              customer_email: quoteRequest.customer_email || undefined,
              line_items: [{
                price_data: {
                  currency: 'usd',
                  unit_amount: depositCents,
                  product_data: {
                    name: 'Event Deposit - ' + (tenant.name || 'RentSketch'),
                    description: depositPercent + '% deposit toward estimated total of $' + estimateTotal.toFixed(2) + '/day',
                  },
                },
                  quantity: 1,
                }],
              metadata: { quoteRequestId: quoteRequest.id, tenantId: tenant.id, tenantSlug: tenant.slug },
              payment_intent_data: connectFeeParams,
              success_url: origin + '/designer/?tenant=' + tenant.slug + '&payment=success',
              cancel_url: origin + '/designer/?tenant=' + tenant.slug + '&payment=cancelled',
            });

            await db.query(
              'UPDATE quote_requests SET stripe_checkout_session_id = $1, deposit_amount_cents = $2, platform_fee_cents = $3 WHERE id = $4',
              [session.id, depositCents, feeCents, quoteRequest.id]
              );

            res.json({ url: session.url });
});

module.exports = router;
