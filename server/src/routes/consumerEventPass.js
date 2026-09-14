// POST/GET routes for the RentSketch Direct Consumer "Event Pass".
// This is a SEPARATE payment type from the Friendly rental deposit
// (payments.js) and from business subscriptions - see docs/ROADMAP.md.
//
// The server is authoritative for price and expiration. The client can
// never set paid=true, an expiry date, or a price - those are only ever
// written here, after Stripe's webhook confirms payment (stripeWebhook.js).

const express = require('express');
const { query } = require('../db');
const { EVENT_PASS_CENTS } = require('../pricing');

const router = express.Router();

function getStripe() {
    if (!process.env.STRIPE_SECRET_KEY) return null;
    // eslint-disable-next-line global-require
  const Stripe = require('stripe');
    return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// POST /api/consumer/designs/:designId/event-pass/checkout-session
// Creates a Stripe Checkout Session for the $9.99 / 30-day Event Pass on a
// generic (non-tenant) consumer design. Returns the hosted checkout URL.
router.post('/designs/:designId/event-pass/checkout-session', async (req, res) => {
    const stripe = getStripe();
    if (!stripe) {
          return res.status(503).json({ error: 'Payments are not configured for this server yet.' });
    }

              const { customerEmail } = req.body || {};
    if (!customerEmail) {
          return res.status(400).json({ error: 'customerEmail is required' });
    }

              const designResult = await query('SELECT * FROM designs WHERE id = $1', [req.params.designId]);
    const design = designResult.rows[0];
    if (!design) {
          return res.status(404).json({ error: 'Design not found' });
    }
    if (design.tenant_id) {
          // Tenant-attached designs use a different pass type (tenant_paid_pass),
      // built separately - see ROADMAP.md.
      return res.status(400).json({ error: 'This design belongs to a rental company and uses a different pass type.' });
    }

              const origin = req.headers.origin || (req.body && req.body.origin);

              const session = await stripe.checkout.sessions.create({
                    mode: 'payment',
                    payment_method_types: ['card'],
                    customer_email: customerEmail,
                    line_items: [
                      {
                                price_data: {
                                            currency: 'usd',
                                            unit_amount: EVENT_PASS_CENTS,
                                            product_data: {
                                                          name: 'RentSketch Event Pass',
                                                          description: '30 days of full editing access to your event design',
                                            },
                                },
                                quantity: 1,
                      },
                          ],
                    metadata: {
                            kind: 'consumer_event_pass',
                            designId: design.id,
                            customerEmail,
                    },
                    success_url: `${origin}/designer/?design=${design.id}&payment=success`,
                    cancel_url: `${origin}/designer/?design=${design.id}&payment=cancelled`,
              });

              await query(
                    `INSERT INTO consumer_payments (design_id, customer_email, payment_type, amount_cents, status, stripe_checkout_session_id)
                         VALUES ($1, $2, 'consumer_event_pass', $3, 'pending', $4)`,
                    [design.id, customerEmail, EVENT_PASS_CENTS, session.id]
                  );

              res.json({ url: session.url });
});

// GET /api/consumer/designs/:designId/entitlement
// Server-authoritative check: does this design currently have an active
// entitlement? The frontend must use this - not the Stripe success URL - to
// decide whether to unlock editing.
router.get('/designs/:designId/entitlement', async (req, res) => {
    const result = await query(
          `SELECT * FROM entitlements
               WHERE design_id = $1 AND status = 'active' AND (expires_at IS NULL OR expires_at > now())
                    ORDER BY expires_at DESC NULLS LAST
                         LIMIT 1`,
          [req.params.designId]
        );
    const entitlement = result.rows[0];
    if (!entitlement) {
          return res.json({ active: false });
    }
    res.json({
          active: true,
          source: entitlement.source,
          expiresAt: entitlement.expires_at,
          capabilities: entitlement.capabilities,
    });
});

module.exports = router;
