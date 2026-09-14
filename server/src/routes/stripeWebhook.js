// POST /api/stripe/webhook
// Mounted in app.js BEFORE the global express.json() middleware, using its
// own express.raw() body parser, because Stripe's signature verification
// requires the exact raw request body bytes, not a JSON-parsed object.
const express = require('express');
const { query } = require('../db');
const { EVENT_PASS_DURATION_DAYS, EVENT_PASS_RENEWAL_DURATION_DAYS } = require('../pricing');

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
      if (!stripe) {
              return res.status(503).send('Payments not configured');
      }

              const signature = req.headers['stripe-signature'];
      let event;
      try {
              event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
      } catch (err) {
              // eslint-disable-next-line no-console
        console.error('[stripe webhook] signature verification failed', err.message);
              return res.status(400).send('Invalid signature');
      }

              const idempotency = await query(
                      'INSERT INTO processed_stripe_events (id, event_type) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id',
                      [event.id, event.type]
                    );
      if (idempotency.rows.length === 0) {
              return res.json({ received: true, duplicate: true });
      }

              if (event.type === 'checkout.session.completed') {
                      const session = event.data.object;

        if (session.metadata && session.metadata.kind === 'consumer_event_pass') {
                  const { designId, customerEmail } = session.metadata;
                  const expiresAt = new Date(Date.now() + EVENT_PASS_DURATION_DAYS * 24 * 60 * 60 * 1000);

                        const entitlementResult = await query(
                                    `INSERT INTO entitlements (design_id, customer_email, source, status, starts_at, expires_at, payment_reference)
                                             VALUES ($1, $2, 'consumer_purchase', 'active', now(), $3, $4)
                                                      RETURNING id`,
                                    [designId, customerEmail, expiresAt, session.payment_intent]
                                  );

                        await query(
                                    `UPDATE consumer_payments
                                             SET status = 'paid', stripe_payment_intent_id = $1, entitlement_id = $2
                                                      WHERE stripe_checkout_session_id = $3`,
                                    [session.payment_intent, entitlementResult.rows[0].id, session.id]
                                  );
        } else if (session.metadata && session.metadata.kind === 'consumer_event_pass_renewal') {
      const { designId, customerEmail } = session.metadata;
      const currentResult = await query(
        `SELECT expires_at FROM entitlements
         WHERE design_id = $1 AND status = 'active' AND (expires_at IS NULL OR expires_at > now())
         ORDER BY expires_at DESC NULLS LAST LIMIT 1`,
        [designId]
      );
      const currentExpiry = currentResult.rows[0] && currentResult.rows[0].expires_at
        ? new Date(currentResult.rows[0].expires_at).getTime()
        : 0;
      const base = Math.max(Date.now(), currentExpiry);
      const expiresAt = new Date(base + EVENT_PASS_RENEWAL_DURATION_DAYS * 24 * 60 * 60 * 1000);

      const entitlementResult = await query(
        `INSERT INTO entitlements (design_id, customer_email, source, status, starts_at, expires_at, payment_reference)
         VALUES ($1, $2, 'consumer_renewal', 'active', now(), $3, $4)
         RETURNING id`,
        [designId, customerEmail, expiresAt, session.payment_intent]
      );

      await query(
        `UPDATE consumer_payments
         SET status = 'paid', stripe_payment_intent_id = $1, entitlement_id = $2
         WHERE stripe_checkout_session_id = $3`,
        [session.payment_intent, entitlementResult.rows[0].id, session.id]
      );
    } else if (session.metadata && session.metadata.quoteRequestId) {
                  const { quoteRequestId } = session.metadata;
                  await query(
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
