// Real Postgres (PGlite) + real Express routes, fake Stripe, no production writes.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite'), express = require('express'), jwt = require('jsonwebtoken');
const root = path.resolve(__dirname, '..'), pg = new PGlite();
const env = { EVENT_PASS_ENABLED: 'true', STRIPE_SECRET_KEY: 'isolated-fixture-secret', STRIPE_WEBHOOK_SECRET: 'whsec_fixture', NODE_ENV: 'test' };
let lock = Promise.resolve(), failLedger = false, creates = 0, failEmail = false;
const deliveries = [];
const sessions = new Map(), idempotency = new Map();
const db = {
  query: (sql, args) => pg.query(sql, args),
  pool: { connect: async () => {
    let release; const previous = lock; lock = new Promise(r => release = r); await previous;
    return { query: async (sql, args) => { if (failLedger && sql.startsWith("UPDATE consumer_payments SET status='paid'")) { failLedger = false; throw Error('injected ledger failure'); } return pg.query(sql, args); }, release };
  } },
};
class Stripe {
  accounts = { retrieve: async () => ({ charges_enabled: true }) };
  checkout = { sessions: {
    create: async (args, opts) => {
      assert.equal(args.payment_method_types, undefined);
      if (idempotency.has(opts.idempotencyKey)) return sessions.get(idempotency.get(opts.idempotencyKey));
      const id = 'cs_live_isolatedsession' + (++creates), row = { id, url: 'https://checkout.stripe.com/c/pay/' + id, status: 'open', payment_status: 'unpaid', currency: 'usd', amount_total: args.line_items[0].price_data.unit_amount, metadata: args.metadata, args };
      sessions.set(id, row); idempotency.set(opts.idempotencyKey, id); return row;
    },
    retrieve: async id => { if (!sessions.has(id)) throw Error('Unknown checkout'); return sessions.get(id); },
  } };
  webhooks = { constructEvent: (body, signature) => { if (signature !== 'fixture-valid') throw Error('Invalid signature'); return JSON.parse(body); } };
}
const pricing = require('../server/src/pricing');
function load(file, deps) {
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), { module: mod, exports: mod.exports, require: id => { if (!(id in deps)) throw Error('Unexpected dependency ' + id); return deps[id]; }, process: { env }, console, Date, Buffer, URL, setTimeout, clearTimeout, setInterval, AbortController }, { filename: file });
  return mod.exports;
}
const auth = { signToken: (p, o) => jwt.sign(p, 'isolated-test-secret', o), verifyToken: s => jwt.verify(s, 'isolated-test-secret') };
const email = load('server/src/eventPassEmail.js', { crypto: require('crypto'), './db': db, './auth': auth, './outboundWebhook': { validateWebhookUrl: () => ({ ok: false }) }, './mailer': { getMailer: () => ({ send: async (to, subject, text) => { if (failEmail) throw Error('isolated SMTP outage'); deliveries.push({ to, subject, text }); return {}; } }) } });
// Keep worker ticks explicit so simulated Postgres transactions cannot interleave
// through the single PGlite connection. Production uses distinct pooled clients.
let smtpReady = true;
const mailQueue = { ...email, emailReadiness: async () => smtpReady && email.emailReadiness(), processEmails: async () => {} };
const bookedOrders = new Map(); let orderLookupFails = false;
const orderAccess = load('server/src/friendlyOrderAccess.js', { crypto: require('crypto'), './db': db, './eventPassEmail': { relay: async (type, input) => {
  if (orderLookupFails) throw Error('isolated order service outage');
  return { orderAccessVersion: 1, order: [...bookedOrders.values()].find(o => (input.orderId ? o.id === input.orderId : o.orderNumber === input.orderNumber) && (input.firstName ? input.firstName.toLowerCase() === o.firstName.toLowerCase() : o.customerEmail === input.email)) || null };
} } });
const pass = load('server/src/eventPass.js', { './db': db, './pricing': pricing, './eventPassEmail': mailQueue, stripe: Stripe });
const access = load('server/src/eventPassAccess.js', { './db': db, './eventPass': pass, './friendlyOrderAccess': orderAccess });
const consumer = load('server/src/routes/consumerEventPass.js', { express, crypto: require('crypto'), '../db': db, '../auth': auth, '../access': { resolveAccess: async () => ({}) }, '../eventPass': pass, '../eventPassAccess': access, '../eventPassEmail': mailQueue, '../friendlyOrderAccess': orderAccess });
const designs = load('server/src/routes/designs.js', { express, '../db': db, '../middleware/requireAuth': { requireTenantAccess: (req,res,next) => next() }, '../eventPassAccess': access });
const quotes = load('server/src/routes/quoteRequests.js', { express, crypto: require('crypto'), '../db': db, '../mailer': { getMailer: () => null }, '../middleware/requireAuth': { requireTenantRole: () => (req,res,next) => next() }, '../orderProviders/quoteRequestOrderProvider': {}, '../outboundWebhook': {}, '../eventPass': pass, '../eventPassAccess': access });
const webhook = load('server/src/routes/stripeWebhook.js', { express, '../db': db, '../pricing': pricing, stripe: Stripe, '../eventPass': pass, '../orderProviders/quoteRequestOrderProvider': {} });
const app = express(); app.use('/webhook', express.raw({ type: 'application/json' }), webhook); app.use(express.json()); app.use('/api/consumer', consumer); app.use('/api/tenants', designs); app.use('/api/tenants', quotes); app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
const tenant = '10000000-0000-4000-8000-000000000001', other = '10000000-0000-4000-8000-000000000002';
let server, base;
async function request(url, body, signature, method) {
  const r = await fetch(base + url, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', ...(signature ? { 'stripe-signature': signature } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.text().then(t => { try { return JSON.parse(t); } catch { return t; } }) };
}
async function draft(t = tenant) {
  const scene = { tentId: 'frame-20x20', objects: [], surfaceType: 'concrete' };
  const row = (await pg.query('INSERT INTO designs(tenant_id,anonymous_session_id,scene) VALUES($1,$2,$3) RETURNING *', [t, 'owner-private-token', scene])).rows[0];
  return row;
}
const buy = (d, extra = {}, renewal = false) => request('/api/consumer/designs/' + d.id + '/event-pass/' + (renewal ? 'renewal-' : '') + 'checkout-session', { customerEmail: 'buyer@example.invalid', anonymousSessionId: 'owner-private-token', ...extra });
const restore = id => request('/api/consumer/event-pass/restore', { checkoutSessionId: id });
(async () => {
  await pg.exec(`CREATE TABLE tenants(id uuid PRIMARY KEY,slug text); CREATE TABLE designs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,anonymous_session_id text,scene jsonb,event_type text,guest_count int,estimate_total numeric,schema_version int,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now()); CREATE TABLE users(id uuid PRIMARY KEY);`);
  await pg.exec(fs.readFileSync(path.join(root, 'server/migrations/004_entitlements.sql'), 'utf8'));
  await pg.exec(fs.readFileSync(path.join(root, 'server/migrations/011_event_pass_access_email.sql'), 'utf8'));
  await pg.exec(fs.readFileSync(path.join(root, 'server/migrations/012_friendly_order_access.sql'), 'utf8'));
  await pg.exec(fs.readFileSync(path.join(root, 'server/migrations/013_preview_limit.sql'), 'utf8'));
  await pg.query('INSERT INTO tenants VALUES($1,$2),($3,$4)', [tenant, 'friendly', other, 'lakeside']);
  server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = 'http://127.0.0.1:' + server.address().port;
  let r = await request('/api/consumer/event-pass/offer?tenant=friendly'); assert.equal(r.body.priceCents, 999); assert.equal(r.body.durationDays, 30); assert.equal(r.body.required, true); assert.equal(r.body.paymentMode, 'test');
  env.EVENT_PASS_ENABLED = 'false'; assert.equal((await request('/api/consumer/event-pass/offer?tenant=friendly')).body.required, false); env.EVENT_PASS_ENABLED = 'true';
  assert.equal((await request('/api/consumer/event-pass/offer?tenant=lakeside')).body.required, false);
  const previewSession = { tenant: 'friendly', anonymousSessionId: 'isolated-preview-session' };
  const previewLease = await request('/api/consumer/event-pass/preview', previewSession);
  assert.equal(previewLease.status,200);assert.equal(previewLease.body.durationSeconds,300);assert.ok(previewLease.body.remainingSeconds<=300);
  const sameLease = await request('/api/consumer/event-pass/preview',{...previewSession,tenant:'generic',durationSeconds:999999});
  assert.equal(sameLease.body.expiresAt,previewLease.body.expiresAt,'product, tenant and requested duration cannot reset the deadline');
  assert.equal((await pg.query('SELECT count(*)::int AS n FROM consumer_previews')).rows[0].n,1);
  await pg.query("UPDATE consumer_previews SET expires_at=now()-interval '1 second'");
  assert.equal((await request('/api/consumer/event-pass/preview',previewSession)).body.remainingSeconds,0,'expired preview cannot restart');
  assert.equal((await request('/api/consumer/event-pass/preview',{...previewSession,tenant:'lakeside'})).body.limited,false);
  assert.equal((await request('/api/consumer/event-pass/preview',{...previewSession,anonymousSessionId:'bad'})).status,400);
  const preview = { tentId: 'pole-20x20', objects: [], guestCount: 0, lightingId: 'lighting-none' }, furnished = { ...preview, objects: [{ id: 't1', kind: 'table', tableId: 'round-5ft' }] };
  for (const route of ['/api/consumer/designs', '/api/tenants/friendly/designs']) {
    assert.equal((await request(route, { scene: furnished, anonymousSessionId: 'owner-private-token' })).status, 402, 'a new free draft cannot save furniture');
    const created = await request(route, { scene: preview, anonymousSessionId: 'owner-private-token' }); assert.equal(created.status, 201);
    assert.equal((await request(route + '/' + created.body.id, { scene: furnished, anonymousSessionId: 'owner-private-token', paid: true }, null, 'PATCH')).status, 402, 'PATCH cannot bypass paid access');
    assert.equal((await request(route + '/' + created.body.id, { scene: preview, anonymousSessionId: 'wrong' }, null, 'PATCH')).status, 404);
  }
  assert.equal((await request('/api/tenants/lakeside/designs', { scene: furnished, anonymousSessionId: 'other-owner' })).status, 201, 'other tenant policies are preserved');
  const inflatable = { ...preview, tentId: null, objects: [{ id: 'slide', kind: 'inflatable', inflatableId: 'water-slide' }] };
  assert.equal(access.isPreviewScene(inflatable), true);
  assert.equal(access.isPreviewScene({ ...inflatable, objects: [...inflatable.objects, ...inflatable.objects] }), false);
  assert.equal(access.isPreviewScene({ ...preview, lightingId: 'bistro' }), false);
  const d = await draft();
  assert.equal((await buy(d, { anonymousSessionId: 'someone-else' })).status, 404);
  assert.equal((await buy(d, { customerEmail: 'not-an-email' })).status, 400);
  assert.equal((await buy(await draft(other))).status, 409);
  assert.equal((await buy(d, {}, true)).status, 409, 'cannot buy cheaper renewal without a paid pass');
  r = await buy(d, { customerEmail: '', priceCents: 1, paid: true }); assert.equal(r.status, 200);
  const session = [...sessions.values()][0]; assert.equal(session.amount_total, 999); assert.equal(session.args.mode, 'payment');
  assert.equal(session.args.customer_email, undefined, 'direct CTA lets Stripe collect the purchaser email');
  assert.equal(session.args.branding_settings.display_name, 'RentSketch');
  assert.equal(session.args.branding_settings.logo.url, 'https://www.friendlypartyrental.com/images/logo.png');
  assert.equal(session.args.branding_settings.button_color, '#0b3d91');
  assert.equal(session.args.line_items[0].price_data.product_data.name, 'RentSketch Event Pass — Friendly Party Rental');
  assert.match(session.args.success_url, /tenant=friendly/); assert.match(session.args.success_url, /checkout_session_id=\{CHECKOUT_SESSION_ID\}/);
  const canceled = new URL(session.args.cancel_url), token = new URLSearchParams(canceled.hash.slice(1)).get('draft');
  r = await request('/api/consumer/event-pass/restore', { draftToken: token }); assert.equal(r.body.id, d.id); assert.equal(r.body.active, false); assert.equal(r.body.scene.tentId, d.scene.tentId);
  assert.equal((await buy(d)).body.url, session.url); assert.equal(creates, 1, 'reuses open checkout');
  assert.equal((await restore(session.id)).status, 202);
  const event = { id: 'evt_fixture', type: 'checkout.session.completed', data: { object: session } };
  assert.equal((await request('/webhook', event, 'wrong')).status, 400);
  await request('/webhook', event, 'fixture-valid'); assert.equal((await pg.query('SELECT * FROM entitlements')).rows.length, 0, 'unpaid session never grants access');
  session.customer_details = { email: 'paid@example.invalid' };
  session.payment_status = 'paid'; session.status = 'complete'; session.payment_intent = 'pi_fixture';
  failLedger = true;
  assert.equal((await restore(session.id)).status, 500);
  assert.equal((await pg.query('SELECT * FROM entitlements')).rows.length, 0, 'failed fulfillment rolls back the access grant');
  assert.equal((await pg.query('SELECT status FROM consumer_payments')).rows[0].status, 'pending');
  assert.equal((await pg.query('SELECT * FROM event_pass_emails')).rows.length, 0, 'failed entitlement cannot queue a receipt');
  const fulfilled = await Promise.all([restore(session.id), request('/webhook', event, 'fixture-valid'), restore(session.id)]);
  assert.ok(fulfilled.every(x => x.status === 200));
  assert.equal((await pg.query('SELECT * FROM entitlements')).rows.length, 1, 'webhook and return race grant exactly once');
  r = await restore(session.id); assert.equal(r.body.active, true); assert.deepEqual(r.body.scene, d.scene); assert.equal(r.body.anonymousSessionId, 'owner-private-token');
  assert.equal((await buy(d)).body.active, true, 'already paid never charged again'); assert.equal(creates, 1);
  assert.equal((await request('/api/consumer/event-pass/resume', { designId: d.id, anonymousSessionId: 'wrong' })).status, 404);
  assert.equal(r.body.customerEmail, 'paid@example.invalid', 'email follows the verified Stripe checkout');
  assert.ok(Math.abs(Date.parse(r.body.expiresAt) - Date.now() - 30*86400000) < 10000, 'new purchase grants exactly 30 days');
  assert.equal((await pg.query('SELECT * FROM event_pass_emails')).rows.length, 1, 'duplicate fulfillment queues one receipt');
  const privateLink = new URL(r.body.accessUrl), recoveryToken = new URLSearchParams(privateLink.hash.slice(1)).get('recoveryToken');
  assert.equal((await request('/api/consumer/event-pass/restore', { recoveryToken })).body.id, d.id, 'emailed link restores the same event on a new device');
  assert.equal((await request('/api/consumer/designs/' + d.id)).status, 401, 'a design UUID alone cannot fetch a paid layout');
  assert.equal((await request('/api/tenants/friendly/designs/' + d.id, { scene: furnished, anonymousSessionId: 'owner-private-token' }, null, 'PATCH')).status, 200, 'paid owner can save furniture');
  await pg.query("UPDATE entitlements SET expires_at=now()-interval '1 day' WHERE design_id=$1", [d.id]);
  r = await request('/api/consumer/event-pass/resume', { designId: d.id, anonymousSessionId: 'owner-private-token' }); assert.equal(r.body.active, false); assert.equal(r.body.renewable, true);
  assert.equal((await request('/api/tenants/friendly/designs/' + d.id, { scene: furnished, anonymousSessionId: 'owner-private-token' }, null, 'PATCH')).status, 402, 'expired pass cannot save');
  assert.equal((await request('/api/tenants/friendly/quote-requests', { designId: d.id, anonymousSessionId: 'owner-private-token', customerName: 'Isolated', customerEmail: 'fixture@example.invalid' })).status, 402, 'expired pass cannot quote its layout');
  assert.equal((await request('/api/tenants/friendly/quote-requests', { designId: d.id, anonymousSessionId: 'wrong', customerName: 'Isolated', customerEmail: 'fixture@example.invalid' })).status, 404, 'quote requires design ownership');
  await buy(d, {}, true); const renewal = [...sessions.values()][1]; assert.equal(renewal.amount_total, 499);
  assert.equal(renewal.args.branding_settings.display_name, 'RentSketch');
  assert.equal(renewal.args.branding_settings.logo.url, 'https://www.friendlypartyrental.com/images/logo.png');
  assert.equal(renewal.args.line_items[0].price_data.product_data.name, 'RentSketch Event Pass Renewal — Friendly Party Rental');
  renewal.payment_status = 'paid'; renewal.status = 'complete'; renewal.payment_intent = 'pi_renewal';
  assert.equal((await request('/webhook', { id: 'evt_async', type: 'checkout.session.async_payment_succeeded', data: { object: renewal } }, 'fixture-valid')).status, 200);
  assert.equal((await restore(renewal.id)).body.active, true); assert.equal((await pg.query('SELECT * FROM entitlements')).rows.length, 2);
  const bad = await draft(); await buy(bad); const wrongAmount = [...sessions.values()][2]; wrongAmount.payment_status = 'paid'; wrongAmount.amount_total = 1;
  assert.equal((await restore(wrongAmount.id)).status, 500, 'wrong amount cannot unlock');
  const generic = await draft(null); await buy(generic); const g = [...sessions.values()][3]; assert.match(g.args.success_url, /tenant=generic/);
  assert.equal((await request('/api/consumer/designs/recovery-link', { email: 'buyer@example.invalid', tenant: 'other' })).status, 400);
  assert.equal((await request('/api/consumer/designs/recovery-link', { email: 'unknown@example.invalid' })).status, 200);
  assert.equal((await pg.query("SELECT * FROM event_pass_emails WHERE kind='recovery'")).rows.length, 0, 'unknown email queues nothing');
  assert.equal((await request('/api/consumer/designs/recovery-link', { email: 'paid@example.invalid' })).status, 200);
  await request('/api/consumer/designs/recovery-link', { email: 'paid@example.invalid' });
  assert.equal((await pg.query("SELECT * FROM event_pass_emails WHERE kind='recovery'")).rows.length, 1, 'repeated recovery requests coalesce');
  const pendingOnly = auth.signToken({ kind: 'consumer_design_recovery', designId: generic.id, email: 'buyer@example.invalid' }, { expiresIn: '1h' });
  assert.equal((await request('/api/consumer/event-pass/restore', { recoveryToken: pendingOnly })).status, 404, 'pending purchase cannot recover paid access');
  failEmail = true; await email.processEmails();
  assert.equal((await pg.query("SELECT * FROM event_pass_emails WHERE status='sent'")).rows.length, 0, 'SMTP outage does not claim delivery');
  assert.equal(deliveries.length, 0);
  failEmail = false; await pg.query("UPDATE event_pass_emails SET next_attempt_at=now()"); await email.processEmails();
  assert.equal((await pg.query("SELECT * FROM event_pass_emails WHERE status!='sent'")).rows.length, 0, 'queued receipt and recovery retry successfully');
  assert.equal(deliveries.length, 3, 'one receipt per payment and one coalesced recovery');
  for (const delivery of deliveries) { assert.match(delivery.text, /#recoveryToken=/); assert.match(delivery.text, /my-event/); }
  const sentCount = deliveries.length; await restore(session.id); await email.processEmails(); assert.equal(deliveries.length, sentCount, 'returning later does not resend receipts');
  // Pending legacy sessions keep their original purchased duration.
  await pg.query('UPDATE consumer_payments SET duration_days=NULL WHERE design_id=$1', [generic.id]);
  g.payment_status = 'paid'; g.status = 'complete'; g.payment_intent = 'pi_legacy';
  const legacy = await restore(g.id); assert.ok(Math.abs(Date.parse(legacy.body.expiresAt) - Date.now() - 30*86400000) < 10000);
  const expiredToken = auth.signToken({ kind: 'consumer_design_recovery', designId: d.id, email: 'paid@example.invalid' }, { expiresIn: -1 });
  assert.equal((await request('/api/consumer/event-pass/restore', { recoveryToken: expiredToken })).status, 400);
  const booked = { id: 'friendly-order-fixture', orderNumber: '9126', firstName:'Booked', eligible: true, customerEmail: 'booked@example.invalid', customerName: 'Booked Customer', eventDate: '2027-06-01', expiresAt: '2027-06-08T00:00:00Z', deliveryZip: '13090', surfaceType: 'grass', items: [{ slug: '20x20-pole-tent', name: '20x20 Pole Tent', quantity: 1 }] };
  bookedOrders.set(booked.id, booked);
  const claim = body => request('/api/consumer/order-access/request', body);
  assert.equal((await request('/api/consumer/order-access/status')).body.available, true);
  const mailRowsBeforeBooking = (await pg.query('SELECT count(*)::int AS n FROM event_pass_emails')).rows[0].n;
  smtpReady = false;
  const declined = await claim({ orderNumber: '9126', firstName: 'Wrong' });
  assert.equal(declined.status, 403); assert.match(declined.body.error, /No active confirmed Friendly booking/); assert.equal(declined.body.accessUrl, undefined);
  assert.equal((await claim({ orderNumber: 'missing', firstName: 'Booked' })).status, 403);
  assert.equal((await claim({ orderNumber: '9126', email: booked.customerEmail })).status, 400, 'the public form requires name and order, never email');
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM entitlements WHERE source='friendly_order'")).rows[0].n, 0, 'a guessed booking cannot unlock a design');
  const claimResult = await claim({ orderNumber: '#9126', firstName: ' BOOKED ', email:'attacker@example.invalid', anonymousSessionId: 'attacker-chosen' });
  assert.equal(claimResult.status, 200, 'booking opens even when SMTP is unavailable');
  assert.equal(claimResult.body.ok, true); assert.match(claimResult.body.accessUrl, /^https:\/\/rentsketch\.com\/designer\/\?tenant=friendly#recoveryToken=/);
  assert.equal(claimResult.body.anonymousSessionId, undefined, 'use the existing signed restore path');
  const repeatClaim = await claim({ orderNumber: '9126', firstName: 'Booked' });
  assert.equal(repeatClaim.status, 200);
  const included = (await pg.query("SELECT d.* FROM designs d JOIN entitlements e ON e.design_id=d.id WHERE e.source='friendly_order'")).rows;
  assert.equal(included.length, 1, 'repeated requests reuse one booking design'); assert.notEqual(included[0].anonymous_session_id, 'attacker-chosen');
  assert.equal(included[0].scene.orderStart.items[0].slug, '20x20-pole-tent');
  assert.equal((await pg.query('SELECT count(*)::int AS n FROM event_pass_emails')).rows[0].n, mailRowsBeforeBooking, 'booking login never queues an email');
  assert.equal(deliveries.some(m=>m.to===booked.customerEmail||m.to==='attacker@example.invalid'), false, 'booking login never sends an email');
  const bookingToken = new URLSearchParams(new URL(claimResult.body.accessUrl).hash.slice(1)).get('recoveryToken');
  const opened = await request('/api/consumer/event-pass/restore', { recoveryToken: bookingToken });
  assert.equal(opened.status, 200); assert.equal(opened.body.active, true); assert.equal(opened.body.includedWithOrder, true); assert.equal(opened.body.renewable, false); assert.equal(opened.body.orderNumber, '9126');
  const beforeCharges = creates;
  assert.equal((await buy(included[0], { anonymousSessionId: opened.body.anonymousSessionId })).body.active, true); assert.equal(creates, beforeCharges, 'a booked customer never enters paid checkout');
  assert.equal((await request('/api/tenants/friendly/designs/' + included[0].id, { scene: furnished, anonymousSessionId: opened.body.anonymousSessionId }, null, 'PATCH')).status, 200);
  assert.equal((await request('/api/tenants/lakeside/designs/' + included[0].id, { scene: furnished, anonymousSessionId: opened.body.anonymousSessionId }, null, 'PATCH')).status, 404);
  orderLookupFails = true;
  assert.equal((await claim({ orderNumber: '9126', firstName: 'Booked' })).status, 503, 'outage is retryable, not a false decline');
  assert.equal((await request('/api/consumer/event-pass/restore', { recoveryToken: bookingToken })).status, 500); assert.equal(creates, beforeCharges);
  orderLookupFails = false; booked.eligible = false;
  assert.equal((await request('/api/consumer/event-pass/restore', { recoveryToken: bookingToken })).body.active, false, 'cancellation is checked against Friendly on reopen');
  assert.equal((await request('/api/tenants/friendly/designs/' + included[0].id, { scene: furnished, anonymousSessionId: opened.body.anonymousSessionId }, null, 'PATCH')).status, 402, 'canceled booking cannot keep saving');
  assert.equal((await request('/api/tenants/friendly/designs/' + included[0].id, { scene: preview, anonymousSessionId: opened.body.anonymousSessionId }, null, 'PATCH')).status, 402, 'canceled booking cannot erase the saved scene with a bare preview');
  assert.equal((await claim({ orderNumber: '9126', firstName: 'Booked' })).status, 403, 'canceled booking is declined immediately');
  bookedOrders.set('expired-fixture', { ...booked, id: 'expired-fixture', orderNumber: 'EXPIRED', eligible: true, expiresAt: new Date(Date.now()-1000).toISOString() });
  assert.equal((await claim({ orderNumber: 'EXPIRED', firstName: 'Booked' })).status, 403);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM entitlements WHERE source='friendly_order'")).rows[0].n, 1);
  smtpReady = true;
  const directBefore = creates;
  const directResponse = await fetch(base + '/api/consumer/event-pass/direct-checkout?tenant=friendly&source=homepage-test', { redirect: 'manual' });
  assert.equal(directResponse.status, 303, 'direct paid CTA responds with See Other to Stripe');
  assert.match(directResponse.headers.get('location') || '', /^https:\/\/checkout\.stripe\.com\//);
  assert.equal(creates, directBefore + 1, 'direct paid CTA creates exactly one Stripe Checkout session');
  const directSession = [...sessions.values()].at(-1);
  assert.equal(directSession.args.customer_email, undefined, 'Stripe hosted checkout collects purchaser email');
  assert.equal(directSession.amount_total, 999);
  assert.equal(directSession.metadata.kind, 'consumer_event_pass');
  assert.equal(directSession.metadata.tenant, 'friendly');
  assert.equal(directSession.metadata.source, 'homepage-test');
  assert.equal(directSession.args.branding_settings.display_name, 'RentSketch');
  assert.equal(directSession.args.branding_settings.logo.url, 'https://www.friendlypartyrental.com/images/logo.png');
  assert.equal(directSession.args.branding_settings.background_color, '#ffffff');
  assert.equal(directSession.args.branding_settings.button_color, '#0b3d91');
  assert.equal(directSession.args.line_items[0].price_data.product_data.name, 'RentSketch Event Pass — Friendly Party Rental');
  const directLedger = (await pg.query('SELECT customer_email,status,amount_cents,duration_days FROM consumer_payments WHERE stripe_checkout_session_id=$1',[directSession.id])).rows[0];
  assert.equal(directLedger.customer_email, '');
  assert.equal(directLedger.status, 'pending');
  assert.equal(directLedger.amount_cents, 999);
  assert.equal(directLedger.duration_days, 30);
  const genericBefore = creates;
  const genericResponse = await fetch(base + '/api/consumer/event-pass/direct-checkout?tenant=generic&source=marketing-test', { redirect: 'manual' });
  assert.equal(genericResponse.status, 303);
  assert.equal(creates, genericBefore + 1);
  const genericSession = [...sessions.values()].at(-1);
  assert.equal(genericSession.metadata.tenant, 'generic');
  assert.equal(genericSession.metadata.source, 'marketing-test');
  assert.equal(genericSession.amount_total, 999);
  assert.equal(genericSession.args.branding_settings.display_name, 'RentSketch');
  assert.equal(genericSession.args.branding_settings.logo.url, 'https://rentsketch.com/assets/brand-mark.svg');
  assert.equal(genericSession.args.branding_settings.button_color, '#183429');
  assert.equal(genericSession.args.line_items[0].price_data.product_data.name, 'RentSketch Event Pass');
  console.log('PASS included order access: immediate signed access after name/order match, clear declines, zero queued/sent emails, SMTP-independent access, one layout per booking, server-owned session, no second charge, tenant isolation, cancellation and order-service failure. Isolated fixtures only.');
  console.log('PASS Event Pass API: real SQL/rollback, Friendly and direct $9.99 checkout, tenant isolation, ownership, open-session reuse, cancel restore, unpaid rejection, duplicate/racing fulfillment, delayed payment, $4.99 renewal, exact empty-tent recovery. Fake Stripe only; no production writes.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (server) await new Promise(r => server.close(r)); await pg.close(); });
