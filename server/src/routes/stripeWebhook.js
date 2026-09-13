// POST /api/stripe/webhook
// Mounted in app.js BEFORE the global express.json() middleware, using its
// own express.raw() body parser, because Stripe's signature verification
// requires the exact raw request body bytes, not a JSON-parsed object.
const express = require('express');
const db = require('../db');

const router = express.Router();

function getStripe() {
    if (!process.env.STRIPE_SECRET_KEY) return null;
  // Lazy require so the rest of the server still boots (and every OTHER
  // route still works) even before STRIPE_SECRET_KEY / the stripe package
  // are configured. Payment routes fail clearly instead of crashing.
// eslint-disable-next-line global-require
  const Stripe = require('stripe');
    return new Stripe(process.env.STRIPE_SECRET_KEY);
}

router.post('/', async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).send('Payments not configured');

              const signature = req.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
          // eslint-disable-next-line no-console
  console.error('[stripe webhook] signature verification failed', err.message);
        return res.status(400).send('Invalid signature');
    }

              if (event.type === 'checkout.session.completed') {
                    const session = event.data.object;
                    const quoteRequestId = session.metadata && session.metadata.quoteRequestId;
                if (quoteRequestId) {
                        await db.query(
                                  `UPDATE quote_requests
                                  SET payment_status = 'paid', status = 'booked',
                                              amount_paid_cents = $1, stripe_payment_intent_id = $2
                                              WHERE id = $3`,
                          [session.amount_total, session.payment_intent, quoteRequestId]
                          );
                }
              }

              res.json({ received: true });
});

module.exports = router;
