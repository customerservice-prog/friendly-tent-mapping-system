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
const { resolveAccess } = require('../access');
const { getStripe, isPassEnabled, passOffer, paymentReadiness, fulfillEventPass, PASS_KINDS } = require('../eventPass');
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

const router = express.Router();

// safeOrigin: strict allowlisting for rentsketch.com subdomains with APP_URL fallback.
// Never concatenates arbitrary/undefined origins into Stripe return URLs.
function safeOrigin(req) {
    const configured = (process.env.APP_URL || 'https://rentsketch.com').replace(/\/$/, '');
    const candidate = req.headers.origin;
    return candidate && /^https:\/\/([a-z0-9-]+\.)?rentsketch\.com$/i.test(candidate) ? candidate : configured;
}

async function designTenant(design) {
    if (!design.tenant_id) return null;
    return (await query('SELECT * FROM tenants WHERE id=$1', [design.tenant_id])).rows[0] || null;
}

async function designResponse(design) {
    const tenant = await designTenant(design);
    const active = (await query("SELECT * FROM entitlements WHERE design_id=$1 AND status='active' AND (expires_at IS NULL OR expires_at>now()) ORDER BY expires_at DESC NULLS LAST LIMIT 1", [design.id])).rows[0];
    const paid = (await query("SELECT id FROM consumer_payments WHERE design_id=$1 AND status='paid' LIMIT 1", [design.id])).rows.length > 0;
    return { id: design.id, tenant: tenant?.slug || 'generic', scene: design.scene,
        anonymousSessionId: design.anonymous_session_id, active: !!active,
        expiresAt: active?.expires_at || null, renewable: paid };
}

// Price and launch switch come from the same server authority as Checkout.
router.get('/event-pass/offer', wrap(async (req, res) => {
    const slug = String(req.query.tenant || 'generic');
    const tenant = slug === 'generic' ? null : (await query('SELECT * FROM tenants WHERE slug=$1', [slug])).rows[0];
    if (slug !== 'generic' && !tenant) return res.status(404).json({ error: 'Rental company not found' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ...passOffer(tenant), ...(await paymentReadiness()) });
}));

// Resume an owned draft without depending on email delivery or browser flags.
router.post('/event-pass/resume', wrap(async (req, res) => {
    const { designId, anonymousSessionId } = req.body || {};
    if (!designId || !anonymousSessionId) return res.status(400).json({ error: 'Design and session are required' });
    const design = (await query('SELECT * FROM designs WHERE id=$1 AND anonymous_session_id=$2', [designId, anonymousSessionId])).rows[0];
    if (!design) return res.status(404).json({ error: 'Saved design not found for this browser' });
    res.setHeader('Cache-Control', 'no-store');
    res.json(await designResponse(design));
}));

// The opaque Checkout Session is the private recovery credential. Stripe,
// rather than payment=success in a URL, verifies the purchase. No contact
// details or draft ownership tokens are placed into the return URL.
router.post('/event-pass/restore', wrap(async (req, res) => {
    if (req.body?.draftToken || req.body?.recoveryToken) {
        let payload;
        try { payload = verifyToken(req.body.draftToken || req.body.recoveryToken); } catch (_) { return res.status(400).json({ error: 'This return link expired' }); }
        const expectedKind = req.body.draftToken ? 'event_pass_draft' : 'consumer_design_recovery';
        if (payload.kind !== expectedKind) return res.status(400).json({ error: 'Invalid return link' });
        const design = (await query('SELECT * FROM designs WHERE id=$1', [payload.designId])).rows[0];
        if (!design) return res.status(404).json({ error: 'Saved draft not found' });
        res.setHeader('Cache-Control', 'no-store');
        return res.json(await designResponse(design));
    }
    const sessionId = req.body?.checkoutSessionId;
    if (typeof sessionId !== 'string' || !/^cs_(live|test)_[A-Za-z0-9_]{10,240}$/.test(sessionId)) {
        return res.status(400).json({ error: 'A valid checkout reference is required' });
    }
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'Payment verification is temporarily unavailable' });
    let session;
    try { session = await stripe.checkout.sessions.retrieve(sessionId); }
    catch (_) { return res.status(404).json({ error: 'Checkout could not be found' }); }
    if (!PASS_KINDS.includes(session.metadata?.kind)) return res.status(404).json({ error: 'Event Pass not found' });
    const design = (await query('SELECT * FROM designs WHERE id=$1', [session.metadata.designId])).rows[0];
    if (!design) return res.status(404).json({ error: 'Saved design not found' });
    res.setHeader('Cache-Control', 'no-store');
    if (session.payment_status !== 'paid') return res.status(202).json({ ...(await designResponse(design)), active: false, pending: true });
    await fulfillEventPass(session);
    res.json(await designResponse(design));
}));

function checkout(renewal) {
    return wrap(async (req, res) => {
        const body = req.body || {}, customerEmail = String(body.customerEmail || '').trim().toLowerCase();
        if (customerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
            return res.status(400).json({ error: 'Please enter a valid email address' });
        }
        const design = (await query('SELECT * FROM designs WHERE id=$1', [req.params.designId])).rows[0];
        if (!design || !body.anonymousSessionId || body.anonymousSessionId !== design.anonymous_session_id) {
            return res.status(404).json({ error: 'Save this design in your browser before checkout' });
        }
        const tenant = await designTenant(design), offer = passOffer(tenant);
        if (!isPassEnabled(tenant)) return res.status(409).json({ error: 'This designer does not require an Event Pass' });
        const current = await designResponse(design);
        if (current.active) return res.json({ active: true, expiresAt: current.expiresAt });
        if (renewal && !current.renewable) return res.status(409).json({ error: 'An existing paid Event Pass is required to renew' });
        const ready = await paymentReadiness();
        if (!ready.available) return res.status(503).json({ error: 'Checkout is temporarily unavailable. Your preview and draft are safe.' });
        const stripe = getStripe(), kind = renewal ? 'consumer_event_pass_renewal' : 'consumer_event_pass';
        const amount = renewal ? offer.renewalPriceCents : offer.priceCents;
        const days = renewal ? offer.renewalDurationDays : offer.durationDays;
        const pending = (await query("SELECT stripe_checkout_session_id FROM consumer_payments WHERE design_id=$1 AND status='pending' AND payment_type=$2 AND amount_cents=$3 ORDER BY created_at DESC LIMIT 1", [design.id, renewal ? 'event_pass_extension' : kind, amount])).rows[0];
        if (pending) {
            const previous = await stripe.checkout.sessions.retrieve(pending.stripe_checkout_session_id);
            if (previous.payment_status === 'paid') {
                await fulfillEventPass(previous);
                return res.json({ active: true, ...(await designResponse(design)) });
            }
            if (previous.status === 'open' && previous.url) return res.json({ url: previous.url });
        }
        const origin = safeOrigin(req), slug = tenant?.slug || 'generic';
        const returnPath = `${origin}/designer/?tenant=${encodeURIComponent(slug)}&design=${design.id}`;
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: customerEmail,
            line_items: [{ price_data: { currency: 'usd', unit_amount: amount, product_data: {
                name: renewal ? 'RentSketch Event Pass Renewal' : 'RentSketch Event Pass',
                description: `${days} days to edit, save, print and share one event design. One-time payment; rental equipment is separate.`,
            } }, quantity: 1 }],
            metadata: { kind, designId: design.id, tenant: slug },
            success_url: returnPath + '&payment=success&checkout_session_id={CHECKOUT_SESSION_ID}',
            cancel_url: returnPath + '&payment=cancelled#draft=' + encodeURIComponent(signToken({ kind: 'event_pass_draft', designId: design.id }, { expiresIn: '24h' })),
        }, { idempotencyKey: `event-pass:${design.id}:${kind}:${Math.floor(Date.now() / 1800000)}` });
        await query(`INSERT INTO consumer_payments(design_id,customer_email,payment_type,amount_cents,status,stripe_checkout_session_id)
            VALUES($1,$2,$3,$4,'pending',$5) ON CONFLICT(stripe_checkout_session_id) DO NOTHING`,
            [design.id, customerEmail, renewal ? 'event_pass_extension' : kind, amount, session.id]);
        res.json({ url: session.url });
    });
}
router.post('/designs/:designId/event-pass/checkout-session', checkout(false));
router.post('/designs/:designId/event-pass/renewal-checkout-session', checkout(true));

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
    const origin = safeOrigin(req);
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

// GET /api/consumer/designs/:designId
// Fetches a generic (non-tenant) consumer design's saved data. This is
// what lets the /designs/recovery-link + /designs/recover flow below
// actually resume editing on a NEW device - those two only ever hand back
// a designId, never the scene itself. Scoped to tenant_id IS NULL, the
// same rule PATCH below uses, so this can never be used to read a rental
// company's tenant-attached design data.
router.get('/designs/:designId', async (req, res) => {
    const result = await query(
        'SELECT id, event_type, guest_count, scene, estimate_total, schema_version FROM designs WHERE id = $1 AND tenant_id IS NULL',
        [req.params.designId]
    );
    const design = result.rows[0];
    if (!design) return res.status(404).json({ error: 'Design not found' });
    res.json({
        id: design.id,
        eventType: design.event_type,
        guestCount: design.guest_count,
        scene: design.scene,
        estimateTotal: design.estimate_total,
        schemaVersion: design.schema_version,
    });
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

// GET /api/consumer/designs/:designId/access
// THE authoritative access-resolution endpoint (see server/src/access.js).
// The frontend renders exactly what this returns and never decides access
// itself. Works for a generic consumer design (tenant_id NULL) and for a
// tenant-scoped design (created via /api/tenants/:slug/designs) alike.
router.get('/designs/:designId/access', async (req, res) => {
    const designResult = await query('SELECT * FROM designs WHERE id = $1', [req.params.designId]);
    const design = designResult.rows[0];
    if (!design) return res.status(404).json({ error: 'Design not found' });

    let tenant = null;
    if (design.tenant_id) {
        const tenantResult = await query('SELECT * FROM tenants WHERE id = $1', [design.tenant_id]);
        tenant = tenantResult.rows[0] || null;
    }

    let isStaff = false;
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token && tenant) {
        try {
            const payload = verifyToken(token);
            if (payload.isPlatformAdmin) {
                isStaff = true;
            } else {
                const membership = await query(
                    'SELECT * FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2',
                    [tenant.id, payload.userId]
                );
                isStaff = !!membership.rows[0];
            }
        } catch (err) {
            isStaff = false; // invalid/expired token - fall through as a normal customer
        }
    }

    const access = await resolveAccess({ design, tenant, isStaff });
    res.json(access);
});

// PATCH /api/consumer/designs/:designId
// Persists in-progress edits. A design that has never gone through the
// Event Pass flow is still in free "guided studio" drafting and saves
// without restriction. Once any entitlement has ever existed for it, an
// ACTIVE one is required to keep saving - expired/revoked means read-only
// until renewed. Server-authoritative; the client cannot bypass this.
router.patch('/designs/:designId', async (req, res) => {
    const { scene, eventType, guestCount, estimateTotal, anonymousSessionId } = req.body || {};
    if (!scene) return res.status(400).json({ error: 'scene is required' });
    if (!anonymousSessionId) return res.status(400).json({ error: 'anonymousSessionId is required to update a draft' });

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
         WHERE id = $5 AND anonymous_session_id = $6 AND (tenant_id IS NULL OR tenant_id=(SELECT id FROM tenants WHERE slug='generic'))
         RETURNING id`,
        [scene, eventType || null, guestCount || null, estimateTotal || null, req.params.designId, anonymousSessionId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Design not found' });
    res.json({ ok: true, id: req.params.designId });
});


module.exports = router;
