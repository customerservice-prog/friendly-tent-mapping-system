// Real Postgres (PGlite) + real Express routes, fake Stripe, no production writes.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite'), express = require('express'), jwt = require('jsonwebtoken');
const root = path.resolve(__dirname, '..'), pg = new PGlite();
const env = { EVENT_PASS_ENABLED: 'true', STRIPE_SECRET_KEY: 'isolated-fixture-secret', STRIPE_WEBHOOK_SECRET: 'whsec_fixture', NODE_ENV: 'test' };
let lock = Promise.resolve(), failLedger = false, creates = 0;
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
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), { module: mod, exports: mod.exports, require: id => { if (!(id in deps)) throw Error('Unexpected dependency ' + id); return deps[id]; }, process: { env }, console, Date, Buffer }, { filename: file });
  return mod.exports;
}
const pass = load('server/src/eventPass.js', { './db': db, './pricing': pricing, stripe: Stripe });
const auth = { signToken: (p, o) => jwt.sign(p, 'isolated-test-secret', o), verifyToken: s => jwt.verify(s, 'isolated-test-secret') };
const consumer = load('server/src/routes/consumerEventPass.js', { express, '../db': db, '../pricing': pricing, '../mailer': { getMailer: () => null }, '../auth': auth, '../access': { resolveAccess: async () => ({}) }, '../eventPass': pass });
const webhook = load('server/src/routes/stripeWebhook.js', { express, '../db': db, '../pricing': pricing, stripe: Stripe, '../eventPass': pass, '../orderProviders/quoteRequestOrderProvider': {} });
const app = express(); app.use('/webhook', express.raw({ type: 'application/json' }), webhook); app.use(express.json()); app.use('/api/consumer', consumer); app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
const tenant = '10000000-0000-4000-8000-000000000001', other = '10000000-0000-4000-8000-000000000002';
let server, base;
async function request(url, body, signature) {
  const r = await fetch(base + url, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(signature ? { 'stripe-signature': signature } : {}) }, body: body ? JSON.stringify(body) : undefined });
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
  await pg.exec(`CREATE TABLE tenants(id uuid PRIMARY KEY,slug text); CREATE TABLE designs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,anonymous_session_id text,scene jsonb,event_type text,guest_count int,estimate_total numeric,schema_version int,updated_at timestamptz DEFAULT now()); CREATE TABLE users(id uuid PRIMARY KEY);`);
  await pg.exec(fs.readFileSync(path.join(root, 'server/migrations/004_entitlements.sql'), 'utf8'));
  await pg.query('INSERT INTO tenants VALUES($1,$2),($3,$4)', [tenant, 'friendly', other, 'lakeside']);
  server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = 'http://127.0.0.1:' + server.address().port;
  let r = await request('/api/consumer/event-pass/offer?tenant=friendly'); assert.equal(r.body.priceCents, 999); assert.equal(r.body.required, true); assert.equal(r.body.paymentMode, 'test');
  env.EVENT_PASS_ENABLED = 'false'; assert.equal((await request('/api/consumer/event-pass/offer?tenant=friendly')).body.required, false); env.EVENT_PASS_ENABLED = 'true';
  assert.equal((await request('/api/consumer/event-pass/offer?tenant=lakeside')).body.required, false);
  const d = await draft();
  assert.equal((await buy(d, { anonymousSessionId: 'someone-else' })).status, 404);
  assert.equal((await buy(d, { customerEmail: 'not-an-email' })).status, 400);
  assert.equal((await buy(await draft(other))).status, 409);
  assert.equal((await buy(d, {}, true)).status, 409, 'cannot buy cheaper renewal without a paid pass');
  r = await buy(d, { priceCents: 1, paid: true }); assert.equal(r.status, 200);
  const session = [...sessions.values()][0]; assert.equal(session.amount_total, 999); assert.equal(session.args.mode, 'payment');
  assert.match(session.args.success_url, /tenant=friendly/); assert.match(session.args.success_url, /checkout_session_id=\{CHECKOUT_SESSION_ID\}/);
  const canceled = new URL(session.args.cancel_url), token = new URLSearchParams(canceled.hash.slice(1)).get('draft');
  r = await request('/api/consumer/event-pass/restore', { draftToken: token }); assert.equal(r.body.id, d.id); assert.equal(r.body.active, false); assert.equal(r.body.scene.tentId, d.scene.tentId);
  assert.equal((await buy(d)).body.url, session.url); assert.equal(creates, 1, 'reuses open checkout');
  assert.equal((await restore(session.id)).status, 202);
  const event = { id: 'evt_fixture', type: 'checkout.session.completed', data: { object: session } };
  assert.equal((await request('/webhook', event, 'wrong')).status, 400);
  await request('/webhook', event, 'fixture-valid'); assert.equal((await pg.query('SELECT * FROM entitlements')).rows.length, 0, 'unpaid session never grants access');
  session.payment_status = 'paid'; session.status = 'complete'; session.payment_intent = 'pi_fixture';
  failLedger = true;
  assert.equal((await restore(session.id)).status, 500);
  assert.equal((await pg.query('SELECT * FROM entitlements')).rows.length, 0, 'failed fulfillment rolls back the access grant');
  assert.equal((await pg.query('SELECT status FROM consumer_payments')).rows[0].status, 'pending');
  const fulfilled = await Promise.all([restore(session.id), request('/webhook', event, 'fixture-valid'), restore(session.id)]);
  assert.ok(fulfilled.every(x => x.status === 200));
  assert.equal((await pg.query('SELECT * FROM entitlements')).rows.length, 1, 'webhook and return race grant exactly once');
  r = await restore(session.id); assert.equal(r.body.active, true); assert.deepEqual(r.body.scene, d.scene); assert.equal(r.body.anonymousSessionId, 'owner-private-token');
  assert.equal((await buy(d)).body.active, true, 'already paid never charged again'); assert.equal(creates, 1);
  assert.equal((await request('/api/consumer/event-pass/resume', { designId: d.id, anonymousSessionId: 'wrong' })).status, 404);
  await pg.query("UPDATE entitlements SET expires_at=now()-interval '1 day' WHERE design_id=$1", [d.id]);
  r = await request('/api/consumer/event-pass/resume', { designId: d.id, anonymousSessionId: 'owner-private-token' }); assert.equal(r.body.active, false); assert.equal(r.body.renewable, true);
  await buy(d, {}, true); const renewal = [...sessions.values()][1]; assert.equal(renewal.amount_total, 499);
  renewal.payment_status = 'paid'; renewal.status = 'complete'; renewal.payment_intent = 'pi_renewal';
  assert.equal((await request('/webhook', { id: 'evt_async', type: 'checkout.session.async_payment_succeeded', data: { object: renewal } }, 'fixture-valid')).status, 200);
  assert.equal((await restore(renewal.id)).body.active, true); assert.equal((await pg.query('SELECT * FROM entitlements')).rows.length, 2);
  const bad = await draft(); await buy(bad); const wrongAmount = [...sessions.values()][2]; wrongAmount.payment_status = 'paid'; wrongAmount.amount_total = 1;
  assert.equal((await restore(wrongAmount.id)).status, 500, 'wrong amount cannot unlock');
  const generic = await draft(null); await buy(generic); const g = [...sessions.values()][3]; assert.match(g.args.success_url, /tenant=generic/);
  console.log('PASS Event Pass API: real SQL/rollback, Friendly and direct $9.99 checkout, tenant isolation, ownership, open-session reuse, cancel restore, unpaid rejection, duplicate/racing fulfillment, delayed payment, $4.99 renewal, exact empty-tent recovery. Fake Stripe only; no production writes.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (server) await new Promise(r => server.close(r)); await pg.close(); });
