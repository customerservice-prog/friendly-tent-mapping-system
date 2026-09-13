const express = require('express');
const db = require('../db');

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
  const depositPercent = Number(tenant.deposit_percent || 20);
  const depositCents = Math.max(100, Math.round(estimateTotal * (depositPercent / 100) * 100));
  const origin = (req.body && req.body.origin) || req.headers.origin || '';

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
              success_url: origin + '/designer/?tenant=' + tenant.slug + '&payment=success',
              cancel_url: origin + '/designer/?tenant=' + tenant.slug + '&payment=cancelled',
            });

            await db.query(
              'UPDATE quote_requests SET stripe_checkout_session_id = $1, deposit_amount_cents = $2 WHERE id = $3',
              [session.id, depositCents, quoteRequest.id]
              );

            res.json({ url: session.url });
});

module.exports = router;
