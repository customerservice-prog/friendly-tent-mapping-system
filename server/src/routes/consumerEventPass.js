// POST/GET routes for the RentSketch Direct Consumer "Event Pass".
// This is a SEPARATE payment type from the Friendly rental deposit
// (payments.js) and from business subscriptions - see docs/ROADMAP.md.
//
// The server is authoritative for price and expiration. The client can
// never set paid=true, an expiry date, or a price - those are only ever
// written here, after Stripe's webhook confirms payment (stripeWebhook.js).

const express = require('express');
const { query } = require('../db');
const { createHash } = require('crypto');
const { signToken, verifyToken } = require('../auth');
const { resolveAccess } = require('../access');
const { getStripe, isPassEnabled, passOffer, paymentReadiness, fulfillEventPass, PASS_KINDS } = require('../eventPass');
const { savePermission } = require('../eventPassAccess');
const { accessUrl, emailReadiness, queueRecovery, processEmails } = require('../eventPassEmail');
const { lookupOrder, claimOrder, refreshOrderAccess, orderAccessReady } = require('../friendlyOrderAccess');
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

const router = express.Router();
const PREVIEW_SECONDS = 5 * 60;

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
    const order = await refreshOrderAccess(design.id, true);
    const booking = (await query("SELECT * FROM entitlements WHERE design_id=$1 AND source='friendly_order' LIMIT 1", [design.id])).rows[0];
    const active = (await query("SELECT * FROM entitlements WHERE design_id=$1 AND status='active' AND (expires_at IS NULL OR expires_at>now()) ORDER BY expires_at DESC NULLS LAST LIMIT 1", [design.id])).rows[0];
    const paid = (await query("SELECT id,customer_email FROM consumer_payments WHERE design_id=$1 AND status='paid' ORDER BY created_at DESC LIMIT 1", [design.id])).rows[0];
    const expiresAt = active?.expires_at || (await query('SELECT expires_at FROM entitlements WHERE design_id=$1 ORDER BY created_at DESC LIMIT 1', [design.id])).rows[0]?.expires_at || null;
    const email = paid ? (await query('SELECT status FROM event_pass_emails WHERE receipt_payment_id=$1', [paid.id])).rows[0] : booking && (await query('SELECT status FROM event_pass_emails WHERE design_ids @> $1::jsonb AND customer_email=$2 ORDER BY created_at DESC LIMIT 1', [JSON.stringify([design.id]),booking.customer_email])).rows[0];
    return { id: design.id, tenant: tenant?.slug || 'generic', scene: design.scene,
        anonymousSessionId: design.anonymous_session_id, active: !!active,
        expiresAt, renewable: !!paid, includedWithOrder: !!booking, orderNumber: order?.orderNumber || null,
        customerEmail: paid?.customer_email || booking?.customer_email || null,
        accessUrl: paid || booking ? accessUrl(design, tenant?.slug || 'generic', paid?.customer_email || booking.customer_email, expiresAt) : null,
        emailDelivery: email?.status || (paid ? 'pending' : null) };
}

// Price and launch switch come from the same server authority as Checkout.
router.get('/event-pass/offer', wrap(async (req, res) => {
    const slug = String(req.query.tenant || 'generic');
    const tenant = slug === 'generic' ? null : (await query('SELECT * FROM tenants WHERE slug=$1', [slug])).rows[0];
    if (slug !== 'generic' && !tenant) return res.status(404).json({ error: 'Rental company not found' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ...passOffer(tenant), previewDurationSeconds: PREVIEW_SECONDS, ...(await paymentReadiness()) });
}));

router.post('/event-pass/preview', wrap(async (req, res) => {
    const sid = req.body?.anonymousSessionId, slug = req.body?.tenant || 'generic';
    if (typeof sid !== 'string' || !/^[a-zA-Z0-9_:-]{16,160}$/.test(sid)) return res.status(400).json({ error: 'A valid preview session is required.' });
    const tenant = slug === 'generic' ? null : (await query('SELECT * FROM tenants WHERE slug=$1', [slug])).rows[0];
    if (slug !== 'generic' && !tenant) return res.status(404).json({ error: 'Rental company not found' });
    res.setHeader('Cache-Control', 'no-store');
    if (!isPassEnabled(tenant)) return res.json({ limited: false });
    const hash = createHash('sha256').update('preview:' + sid).digest('hex');
    const row = (await query(`INSERT INTO consumer_previews(session_hash,expires_at)
      VALUES($1,now()+$2*interval '1 second')
      ON CONFLICT(session_hash) DO UPDATE SET session_hash=EXCLUDED.session_hash
      RETURNING expires_at,GREATEST(0,EXTRACT(EPOCH FROM expires_at-now())) AS remaining_seconds`, [hash,PREVIEW_SECONDS])).rows[0];
    res.json({ limited: true, durationSeconds: PREVIEW_SECONDS, expiresAt: row.expires_at, remainingSeconds: Number(row.remaining_seconds) });
}));

// This verifies SMTP without sending any message or exposing credentials.
router.get('/event-pass/email-status', wrap(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ready: await emailReadiness() });
}));

router.get('/order-access/status', wrap(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ available: await orderAccessReady() });
}));

const orderBuckets = new Map();
router.post('/order-access/request', wrap(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const firstName = typeof req.body?.firstName === 'string' ? req.body.firstName.trim().replace(/\s+/g, ' ') : '';
    const orderNumber = typeof req.body?.orderNumber === 'string' ? req.body.orderNumber.trim().replace(/^#\s*/, '') : '';
    const validIdentity = firstName && firstName.length <= 100 && !/[\u0000-\u001f]/.test(firstName);
    if (!validIdentity || !/^[a-zA-Z0-9-]{1,80}$/.test(orderNumber)) return res.status(400).json({ error: 'Enter your first name and Friendly order number.' });
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const now = Date.now();
    for (const [key, bucket] of orderBuckets) if (bucket.until < now) orderBuckets.delete(key);
    for (const key of ['ip:' + ip, 'order:' + orderNumber.toLowerCase()]) {
        const bucket = orderBuckets.get(key) || { count: 0, until: now + 15 * 60000 };
        bucket.count++; orderBuckets.set(key, bucket);
        if (bucket.count > (key.startsWith('ip:') ? 20 : 5)) return res.status(429).json({ error: 'Too many booking checks. Please wait a few minutes and try again.' });
    }
    let order;
    try { order = await lookupOrder({ orderNumber, firstName }); }
    catch (_) { return res.status(503).json({ error: 'Friendly order verification is temporarily unavailable. Please try again shortly.' }); }
    const declined = 'No active confirmed Friendly booking matched those details. Check your first name and order number, or call 315-884-1498.';
    if (!order?.eligible || Date.parse(order.expiresAt) <= Date.now()) return res.status(403).json({ error: declined });
    const tenant = (await query("SELECT * FROM tenants WHERE slug='friendly'")).rows[0];
    if (!tenant) return res.status(503).json({ error: 'Friendly order verification is temporarily unavailable. Please try again shortly.' });
    const design = await claimOrder(order, tenant);
    if (!design) return res.status(403).json({ error: declined });
    // The first-name/order match authorizes this booking's designer directly.
    // Reuse the signed restore path without checking SMTP or sending an email.
    res.json({ ok: true, accessUrl: accessUrl(design, 'friendly', order.customerEmail, order.expiresAt) });
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
        if (expectedKind === 'consumer_design_recovery') {
            const paid = await query("SELECT id FROM consumer_payments WHERE design_id=$1 AND status='paid' AND lower(customer_email)=$2 LIMIT 1", [design.id, String(payload.email || '').trim().toLowerCase()]);
            const booking = await query("SELECT id FROM entitlements WHERE design_id=$1 AND source='friendly_order' AND lower(customer_email)=$2 LIMIT 1", [design.id, String(payload.email || '').trim().toLowerCase()]);
            if (!paid.rows.length && !booking.rows.length) return res.status(404).json({ error: 'Event not found for this access link' });
        }
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

// GET /api/consumer/event-pass/direct-checkout
// Server-driven paid entry used by Friendly's explicit $9.99 CTA.
// No designer JavaScript is required before Stripe Checkout.
router.get('/event-pass/direct-checkout', wrap(async (req, res) => {
    const slug = String(req.query.tenant || 'friendly');
    if (!['friendly','generic'].includes(slug)) return res.status(400).send('Invalid rental company');
    const tenant = slug === 'generic' ? null : (await query('SELECT * FROM tenants WHERE slug=$1', [slug])).rows[0];
    if (slug !== 'generic' && !tenant) return res.status(404).send('Rental company not found');
    if (!isPassEnabled(tenant)) return res.status(409).send('Event Pass is unavailable');
    const ready = await paymentReadiness();
    if (!ready.available) return res.status(503).send('Secure checkout is temporarily unavailable. Please try again shortly.');
    if (!await emailReadiness()) return res.status(503).send('Access email is temporarily unavailable. Please try again shortly.');

    const stripe = getStripe();
    const offer = passOffer(tenant);
    const sid = 'direct_' + require('crypto').randomBytes(24).toString('hex');
    const scene = {
      tentId: null, objects: [], zones: [], aisles: [], guestCount: 0,
      lightingId: 'lighting-none', eventName: 'My Event',
      customer: { name: '', email: '', date: '' }, surfaceType: 'grass'
    };
    const design = (await query(
      'INSERT INTO designs(tenant_id,anonymous_session_id,schema_version,scene) VALUES($1,$2,1,$3) RETURNING *',
      [tenant?.id || null, sid, scene]
    )).rows[0];
    const origin = safeOrigin(req);
    const returnPath = origin + '/designer/?tenant=' + encodeURIComponent(slug) + '&design=' + encodeURIComponent(design.id);
    const source = String(req.query.source || 'friendly_paid_cta').slice(0,100);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price_data: { currency: 'usd', unit_amount: offer.priceCents, product_data: {
        name: 'RentSketch Event Pass',
        description: offer.durationDays + ' days to edit, save, print and share one event design. One-time payment; rental equipment is separate.',
      } }, quantity: 1 }],
      metadata: { kind: 'consumer_event_pass', designId: design.id, tenant: slug, durationDays: String(offer.durationDays), source },
      success_url: returnPath + '&payment=success&checkout_session_id={CHECKOUT_SESSION_ID}',
      cancel_url: returnPath + '&payment=cancelled#draft=' + encodeURIComponent(signToken({ kind:'event_pass_draft', designId:design.id }, { expiresIn:'24h' })),
    }, { idempotencyKey: 'direct-event-pass:' + design.id });

    await query(`INSERT INTO consumer_payments(design_id,customer_email,payment_type,amount_cents,status,stripe_checkout_session_id,duration_days)
      VALUES($1,'','consumer_event_pass',$2,'pending',$3,$4) ON CONFLICT(stripe_checkout_session_id) DO NOTHING`,
      [design.id, offer.priceCents, session.id, offer.durationDays]);

    if (!session.url || !session.url.startsWith('https://checkout.stripe.com/')) throw new Error('Stripe did not return a secure Checkout URL');
    res.redirect(303, session.url);
}));

router.post('/event-pass/direct-checkout', wrap(async (req, res) => {
    const slug = String(req.body?.tenant || 'friendly');
    const anonymousSessionId = String(req.body?.anonymousSessionId || '').trim();
    if (!['friendly','generic'].includes(slug)) return res.status(400).json({ error: 'Invalid Event Pass tenant' });
    if (!/^[a-zA-Z0-9_:-]{16,160}$/.test(anonymousSessionId)) return res.status(400).json({ error: 'A valid browser session is required.' });
    const tenant = slug === 'generic' ? null : (await query('SELECT * FROM tenants WHERE slug=$1', [slug])).rows[0];
    if (slug !== 'generic' && !tenant) return res.status(404).json({ error: 'Rental company not found' });
    const offer = passOffer(tenant);
    if (!isPassEnabled(tenant)) return res.status(409).json({ error: 'This designer does not require an Event Pass' });
    const ready = await paymentReadiness();
    if (!ready.available) return res.status(503).json({ error: 'Checkout is temporarily unavailable. Please try again shortly.' });
    if (!await emailReadiness()) return res.status(503).json({ error: 'Access email is temporarily unavailable. Please try again shortly; you have not been charged.' });
    const stripe = getStripe();

    const prior = (await query(`
      SELECT p.stripe_checkout_session_id,p.design_id
      FROM consumer_payments p
      JOIN designs d ON d.id=p.design_id
      LEFT JOIN tenants t ON t.id=d.tenant_id
      WHERE p.status='pending'
        AND p.payment_type='consumer_event_pass'
        AND p.amount_cents=$1
        AND COALESCE(p.duration_days,30)=$2
        AND d.anonymous_session_id=$3
        AND COALESCE(t.slug,'generic')=$4
      ORDER BY p.created_at DESC LIMIT 1`,
      [offer.priceCents,offer.durationDays,anonymousSessionId,slug])).rows[0];
    if (prior?.stripe_checkout_session_id) {
      try {
        const existing = await stripe.checkout.sessions.retrieve(prior.stripe_checkout_session_id);
        if (existing.payment_status === 'paid') {
          await fulfillEventPass(existing);
          return res.json({ active: true, designId: prior.design_id });
        }
        if (existing.status === 'open' && existing.url) return res.json({ url: existing.url, designId: prior.design_id });
      } catch (_) {}
    }

    const scene = {
      eventName: 'My Event',
      eventType: null,
      guestCount: 0,
      tentId: null,
      objects: [],
      zones: [],
      aisles: [],
      surfaceType: 'notSure',
      lightingId: 'lighting-none',
      customer: { name: '', email: '', date: '' },
      deliveryZip: ''
    };
    const design = (await query(
      `INSERT INTO designs(tenant_id,anonymous_session_id,schema_version,event_type,guest_count,scene)
       VALUES($1,$2,1,NULL,0,$3) RETURNING id`,
      [tenant?.id || null, anonymousSessionId, scene]
    )).rows[0];

    const origin = safeOrigin(req);
    const returnPath = `${origin}/designer/?tenant=${encodeURIComponent(slug)}&design=${design.id}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price_data: { currency: 'usd', unit_amount: offer.priceCents, product_data: {
        name: 'RentSketch Event Pass',
        description: `${offer.durationDays} days to edit, save, print and share one event design. One-time payment; rental equipment is separate.`,
      } }, quantity: 1 }],
      metadata: { kind: 'consumer_event_pass', designId: design.id, tenant: slug, durationDays: String(offer.durationDays), source: 'direct_paid_cta' },
      success_url: returnPath + '&payment=success&checkout_session_id={CHECKOUT_SESSION_ID}',
      cancel_url: returnPath + '&payment=cancelled#draft=' + encodeURIComponent(signToken({ kind: 'event_pass_draft', designId: design.id }, { expiresIn: '24h' })),
    }, { idempotencyKey: `event-pass-direct:${slug}:${anonymousSessionId}:${Math.floor(Date.now()/1800000)}` });

    await query(`INSERT INTO consumer_payments(design_id,customer_email,payment_type,amount_cents,status,stripe_checkout_session_id,duration_days)
      VALUES($1,'','consumer_event_pass',$2,'pending',$3,$4) ON CONFLICT(stripe_checkout_session_id) DO NOTHING`,
      [design.id,offer.priceCents,session.id,offer.durationDays]);
    res.json({ url: session.url, designId: design.id });
}));

function checkout(renewal) {
    return wrap(async (req, res) => {
        const body = req.body || {}, customerEmail = String(body.customerEmail || '').trim().toLowerCase();
        if (customerEmail && (customerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))) {
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
        if (!await emailReadiness()) return res.status(503).json({ error: 'Access email is temporarily unavailable. Please try again shortly; you have not been charged.' });
        const stripe = getStripe(), kind = renewal ? 'consumer_event_pass_renewal' : 'consumer_event_pass';
        const amount = renewal ? offer.renewalPriceCents : offer.priceCents;
        const days = renewal ? offer.renewalDurationDays : offer.durationDays;
        const pending = (await query("SELECT stripe_checkout_session_id,customer_email FROM consumer_payments WHERE design_id=$1 AND status='pending' AND payment_type=$2 AND amount_cents=$3 AND COALESCE(duration_days,30)=$4 ORDER BY created_at DESC LIMIT 1", [design.id, renewal ? 'event_pass_extension' : kind, amount, days])).rows[0];
        if (pending) {
            const previous = await stripe.checkout.sessions.retrieve(pending.stripe_checkout_session_id);
            if (previous.payment_status === 'paid') {
                await fulfillEventPass(previous);
                return res.json({ active: true, ...(await designResponse(design)) });
            }
            if (previous.status === 'open' && previous.url && (!customerEmail || !pending.customer_email || pending.customer_email === customerEmail)) return res.json({ url: previous.url });
        }
        const origin = safeOrigin(req), slug = tenant?.slug || 'generic';
        const returnPath = `${origin}/designer/?tenant=${encodeURIComponent(slug)}&design=${design.id}`;
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            ...(customerEmail ? { customer_email: customerEmail } : {}),
            line_items: [{ price_data: { currency: 'usd', unit_amount: amount, product_data: {
                name: renewal ? 'RentSketch Event Pass Renewal' : 'RentSketch Event Pass',
                description: `${days} days to edit, save, print and share one event design. One-time payment; rental equipment is separate.`,
            } }, quantity: 1 }],
            metadata: { kind, designId: design.id, tenant: slug, durationDays: String(days) },
            success_url: returnPath + '&payment=success&checkout_session_id={CHECKOUT_SESSION_ID}',
            cancel_url: returnPath + '&payment=cancelled#draft=' + encodeURIComponent(signToken({ kind: 'event_pass_draft', designId: design.id }, { expiresIn: '24h' })),
        }, { idempotencyKey: `event-pass:${design.id}:${kind}:${days}:${createHash('sha256').update(customerEmail || 'stripe-collected-email').digest('hex').slice(0,24)}:${Math.floor(Date.now() / 1800000)}` });
        await query(`INSERT INTO consumer_payments(design_id,customer_email,payment_type,amount_cents,status,stripe_checkout_session_id,duration_days)
            VALUES($1,$2,$3,$4,'pending',$5,$6) ON CONFLICT(stripe_checkout_session_id) DO NOTHING`,
            [design.id, customerEmail, renewal ? 'event_pass_extension' : kind, amount, session.id, days]);
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
router.post('/designs', wrap(async (req, res) => {
    const { scene, eventType, guestCount, estimateTotal, anonymousSessionId, schemaVersion } = req.body || {};
    if (!scene) {
        return res.status(400).json({ error: 'scene is required' });
    }
    const denied = await savePermission(null, null, scene);
    if (denied) return res.status(402).json(denied);
    const result = await query(
        `INSERT INTO designs (tenant_id, anonymous_session_id, schema_version, event_type, guest_count, scene, estimate_total)
         VALUES (NULL, $1, $2, $3, $4, $5, $6) RETURNING id`,
        [anonymousSessionId || null, schemaVersion || 1, eventType || null, guestCount || null, scene, estimateTotal || null]
    );
    res.status(201).json(result.rows[0]);
}));

// POST /api/consumer/designs/recovery-link
// A consumer who paid for an Event Pass on one device/browser has no
// account to log into elsewhere - this lets them get a link back to their
// paid design on a NEW device, without ever creating a password. The link
// is only ever delivered by emailing it - it is NEVER returned directly in
// the API response - and the response is identical whether or not the
// email actually matched a paid design, so this endpoint can never be used
// to probe which emails own a paid design on this design id.
const recoveryBuckets = new Map();
router.post('/designs/recovery-link', wrap(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const tenant = req.body?.tenant == null ? null : String(req.body.tenant);
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter the email address used at checkout.' });
    if (tenant && !['friendly', 'generic'].includes(tenant)) return res.status(400).json({ error: 'Invalid rental company' });
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const now = Date.now();
    for (const [key, entry] of recoveryBuckets) if (entry.until < now) recoveryBuckets.delete(key);
    const bucket = recoveryBuckets.get(ip) || { count: 0, until: now + 15 * 60000 };
    bucket.count++; recoveryBuckets.set(ip, bucket);
    if (bucket.count > 30) return res.status(429).json({ error: 'Please wait a few minutes before requesting another access email.' });
    if (!await emailReadiness()) return res.status(503).json({ error: 'Access email is temporarily unavailable. Your paid event is safe. Please try again shortly.' });
    const matches = await query(`SELECT d.id FROM designs d LEFT JOIN tenants t ON t.id=d.tenant_id
      WHERE (EXISTS(SELECT 1 FROM consumer_payments p WHERE p.design_id=d.id AND p.status='paid' AND lower(p.customer_email)=$1)
      OR EXISTS(SELECT 1 FROM entitlements e WHERE e.design_id=d.id AND e.source='friendly_order' AND e.status='active' AND e.expires_at>now() AND lower(e.customer_email)=$1))
      AND COALESCE(t.slug,'generic') IN ('friendly','generic')
      AND ($2::text IS NULL OR COALESCE(t.slug,'generic')=$2)
      ORDER BY d.created_at DESC LIMIT 10`, [email, tenant]);
    await queueRecovery(email, tenant || '*', matches.rows);
    processEmails().catch(() => console.error('[event-pass-email] Recovery queued for retry.'));
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true });
}));

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
router.get('/designs/:designId', wrap(async (req, res) => {
    const owner = req.headers['x-rentsketch-session'];
    if (!owner) return res.status(401).json({ error: 'Open your private event link to access this design.' });
    const result = await query(
        'SELECT id, event_type, guest_count, scene, estimate_total, schema_version FROM designs WHERE id = $1 AND tenant_id IS NULL AND anonymous_session_id=$2',
        [req.params.designId, owner]
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
}));

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

// Paid editing applies to every save, including designs that have never paid.
// A bare rental preview can be checkpointed so Checkout restores that rental.
router.patch('/designs/:designId', wrap(async (req, res) => {
    const { scene, eventType, guestCount, estimateTotal, anonymousSessionId } = req.body || {};
    if (!scene) return res.status(400).json({ error: 'scene is required' });
    if (!anonymousSessionId) return res.status(400).json({ error: 'anonymousSessionId is required to update a draft' });
    const design = (await query("SELECT * FROM designs WHERE id=$1 AND anonymous_session_id=$2 AND (tenant_id IS NULL OR tenant_id=(SELECT id FROM tenants WHERE slug='generic'))", [req.params.designId, anonymousSessionId])).rows[0];
    if (!design) return res.status(404).json({ error: 'Design not found' });
    const denied = await savePermission(null, design, scene);
    if (denied) return res.status(402).json(denied);

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
}));


module.exports = router;
