// POST/GET routes for the RentSketch Direct Consumer "Event Pass".
// This is a SEPARATE payment type from the Friendly rental deposit
// (payments.js) and from business subscriptions - see docs/ROADMAP.md.
//
// The server is authoritative for price and expiration. The client can
// never set paid=true, an expiry date, or a price - those are only ever
// written here, after Stripe's webhook confirms payment (stripeWebhook.js).

const express = require('express');
const { query } = require('../db');
const { getMailer } = require('../mailer');
const { signToken, verifyToken } = require('../auth');
const { EVENT_PASS_CENTS, EVENT_PASS_RENEWAL_CENTS, EVENT_PASS_RENEWAL_DURATION_DAYS } = require('../pricing');

const router = express.Router();

function getStripe() {
    if (!process.env.STRIPE_SECRET_KEY) return null;
    // eslint-disable-next-line global-require
  const Stripe = require('stripe');
    return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// POST /api/consumer/designs
// Saves a snapshot of a direct consumer's layout with no tenant
// attached (tenant_id is NULL). Anonymous by default - no login
// required. This is what the Event Pass checkout below is gated on;
// tenant-attached designs use POST /api/tenants/:slug/designs instead.
router.post('/designs', async (req, res) => {
    const { scene, eventType, guestCount, estimateTotal, anonymousSessionId, schemaVersion } = req.body || {};
    if (!scene) {
        return res.status(400).json({ error: 'scene is required' });
    }
    const result = await query(
        `INSERT INTO designs (tenant_id, anonymous_session_id, schema_version, event_type, guest_count, scene, estimate_total)
         VALUES (NULL, $1, $2, $3, $4, $5, $6) RETURNING id`,
        [anonymousSessionId || null, schemaVersion || 1, eventType || null, guestCount || null, scene, estimateTotal || null]
        );
    res.status(201).json(result.rows[0]);
});

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


// PATCH /api/consumer/designs/:designId
// Persists in-progress edits. A design that has never gone through the
// Event Pass flow is still in free "guided studio" drafting and saves
// without restriction. Once any entitlement has ever existed for it, an
// ACTIVE one is required to keep saving - expired/revoked means read-only
// until renewed. Server-authoritative; the client cannot bypass this.
router.patch('/designs/:designId', async (req, res) => {
  const { scene, eventType, guestCount, estimateTotal } = req.body || {};
  if (!scene) return res.status(400).json({ error: 'scene is required' });

  const everHad = await query('SELECT id FROM entitlements WHERE design_id = $1 LIMIT 1', [req.params.designId]);
  if (everHad.rows.length > 0) {
    const active = await query(
      `SELECT id FROM entitlements
       WHERE design_id = $1 AND status = 'active' AND (expires_at IS NULL OR expires_at > now())
       LIMIT 1`,
      [req.params.designId]
    );
    if (active.rows.length === 0) {
      return res.status(402).json({ error: 'Your Event Pass has expired. Renew to keep editing.', code: 'event_pass_expired' });
    }
  }

  const result = await query(
    `UPDATE designs SET scene = $1, event_type = COALESCE($2, event_type),
       guest_count = COALESCE($3, guest_count), estimate_total = COALESCE($4, estimate_total),
       updated_at = now()
     WHERE id = $5 AND tenant_id IS NULL
     RETURNING id`,
    [scene, eventType || null, guestCount || null, estimateTotal || null, req.params.designId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Design not found' });
  res.json({ ok: true });
});

// POST /api/consumer/designs/:designId/event-pass/renewal-checkout-session
// $4.99 / +30 days on an EXISTING design - never creates a new design or a
// new payment ledger row of the initial-purchase kind. metadata.kind is
// deliberately distinct from 'consumer_event_pass' so the webhook can never
// confuse a renewal with a first purchase.
router.post('/designs/:designId/event-pass/renewal-checkout-session', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'Payments are not configured for this server yet.' });

  const { customerEmail } = req.body || {};
  if (!customerEmail) return res.status(400).json({ error: 'customerEmail is required' });

  const designResult = await query('SELECT * FROM designs WHERE id = $1', [req.params.designId]);
  const design = designResult.rows[0];
  if (!design) return res.status(404).json({ error: 'Design not found' });
  if (design.tenant_id) {
    return res.status(400).json({ error: 'This design belongs to a rental company and uses a different pass type.' });
  }

  const origin = req.headers.origin || (req.body && req.body.origin);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: customerEmail,
    line_items: [{
      price_data: {
        currency: 'usd',
        unit_amount: EVENT_PASS_RENEWAL_CENTS,
        product_data: {
          name: 'RentSketch Event Pass Renewal',
          description: '+30 more days of full editing access to your event design',
        },
      },
      quantity: 1,
    }],
    metadata: {
      kind: 'consumer_event_pass_renewal',
      designId: design.id,
      customerEmail,
    },
    success_url: `${origin}/designer/?design=${design.id}&payment=success`,
    cancel_url: `${origin}/designer/?design=${design.id}&payment=cancelled`,
  });

  await query(
    `INSERT INTO consumer_payments (design_id, customer_email, payment_type, amount_cents, status, stripe_checkout_session_id)
     VALUES ($1, $2, 'event_pass_extension', $3, 'pending', $4)`,
    [design.id, customerEmail, EVENT_PASS_RENEWAL_CENTS, session.id]
  );

  res.json({ url: session.url });
});


// POST /api/consumer/designs/recovery-link
// A consumer who paid for an Event Pass on one device/browser has no
// account to log into elsewhere - this lets them get a link back to their
// paid design on a NEW device, without ever creating a password. The link
// is only ever delivered by emailing it - it is NEVER returned directly in
// the API response - and the response is identical whether or not the
// email actually matched a paid design, so this endpoint can never be used
// to probe which emails own a paid design on this design id.
router.post('/designs/recovery-link', async (req, res) => {
const { email } = req.body || {};
if (!email) return res.status(400).json({ error: 'email is required' });

const normalizedEmail = String(email).toLowerCase();
const match = await query(
`SELECT design_id FROM entitlements WHERE lower(customer_email) = $1
 UNION
 SELECT design_id FROM consumer_payments WHERE lower(customer_email) = $1
 ORDER BY design_id DESC
 LIMIT 1`,
[normalizedEmail]
);
if (match.rows.length === 0) {
return res.json({ ok: true });
}

const mailer = getMailer();
if (!mailer) {
return res.status(503).json({ error: 'Email delivery is not configured for this server yet.' });
}

const designId = match.rows[0].design_id;
const token = signToken(
{ kind: 'consumer_design_recovery', designId, email: normalizedEmail },
{ expiresIn: '15m' }
);
const origin = req.headers.origin || (req.body && req.body.origin) || '';
const link = origin + '/designer/?recoveryToken=' + encodeURIComponent(token);

await mailer.send(
normalizedEmail,
'Your RentSketch event design link',
'Continue editing your event design: ' + link + '\n\nThis link expires in 15 minutes.'
);

res.json({ ok: true });
});

// GET /api/consumer/designs/recover?token=...
// Redeems the token from the emailed recovery link and hands back the
// design id so the frontend can resume editing on this new device.
router.get('/designs/recover', async (req, res) => {
const { token } = req.query || {};
if (!token) return res.status(400).json({ error: 'token is required' });
try {
const payload = verifyToken(token);
if (payload.kind !== 'consumer_design_recovery') {
return res.status(400).json({ error: 'Invalid recovery token' });
}
res.json({ designId: payload.designId });
} catch (err) {
res.status(400).json({ error: 'This recovery link is invalid or has expired.' });
}
});

module.exports = router;
