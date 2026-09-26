// Real routes and SQL with isolated PGlite and fake Stripe. Never sends a payment.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const { PGlite } = require('@electric-sql/pglite');
const pg = new PGlite();
let lock = Promise.resolve(), failEntitlement = false, eventPassCalls = 0;
const db = { query: (sql, args) => pg.query(sql, args), pool: { connect: async () => {
  let release;
  const previous = lock;
  lock = new Promise(resolve => { release = resolve; });
  await previous;
  return { query: (sql, args) => {
    if (failEntitlement && sql.includes('INSERT INTO entitlements')) { failEntitlement = false; throw Error('isolated entitlement failure'); }
    return pg.query(sql, args);
  }, release };
} } };
const env = { STRIPE_SECRET_KEY: 'isolated-fixture-only', STRIPE_WEBHOOK_SECRET: 'isolated-webhook-only' };
class Stripe {
  webhooks = { constructEvent: (body, signature) => {
    if (signature !== 'fixture-valid') throw Error('invalid signature');
    return JSON.parse(body);
  } };
}
function load(file, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    module, exports: module.exports, require: name => {
      assert.ok(name in dependencies, 'Unexpected dependency: ' + name);
      return dependencies[name];
    }, console, process: { env }, Date, Buffer,
  }, { filename: file });
  return module.exports;
}
const provider = load('server/src/orderProviders/quoteRequestOrderProvider.js', { '../db': db });
const webhook = load('server/src/routes/stripeWebhook.js', {
  express, '../db': db, '../eventPass': { PASS_KINDS: ['consumer_event_pass'], fulfillEventPass: async () => { eventPassCalls++; } },
  '../orderProviders/quoteRequestOrderProvider': provider, stripe: Stripe,
});
const payments = load('server/src/routes/payments.js', { express });
const app = express();
app.use('/webhook', express.raw({ type: 'application/json' }), webhook);
app.use(express.json());
app.use('/api/tenants', payments);
let server, base;
async function post(route, body, signature = 'fixture-valid') {
  const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': signature }, body: JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: (() => { try { return JSON.parse(text); } catch (_) { return text; } })() };
}
(async () => {
  await pg.exec(`CREATE TABLE tenants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slug text,active_order_grace_days int);
    CREATE TABLE quote_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,design_id uuid,
      customer_email text,event_date timestamptz,status text,payment_status text,deposit_amount_cents int,
      amount_paid_cents int,stripe_checkout_session_id text,stripe_payment_intent_id text);
    CREATE TABLE entitlements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,design_id uuid,
      customer_email text,source text,status text,expires_at timestamptz,source_reference uuid,revoked_at timestamptz);
    CREATE TABLE processed_stripe_events(id text PRIMARY KEY,event_type text);`);
  const tenant = (await pg.query("INSERT INTO tenants(slug,active_order_grace_days) VALUES('fixture',7) RETURNING *")).rows[0];
  const other = (await pg.query("INSERT INTO tenants(slug) VALUES('other') RETURNING *")).rows[0];
  const quote = (await pg.query(`INSERT INTO quote_requests(tenant_id,design_id,customer_email,event_date,status,payment_status,deposit_amount_cents,stripe_checkout_session_id)
    VALUES($1,gen_random_uuid(),'buyer@example.invalid',now()+interval '30 days','quoted','unpaid',2500,'cs_original') RETURNING *`, [tenant.id])).rows[0];
  const session = { id: 'cs_original', mode: 'payment', status: 'complete', payment_status: 'paid', currency: 'usd', amount_total: 2500,
    payment_intent: 'pi_original', metadata: { quoteRequestId: quote.id, tenantId: tenant.id, tenantSlug: tenant.slug } };
  const event = { id: 'evt_original', type: 'checkout.session.completed', data: { object: session } };
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  const retired = await post('/api/tenants/fixture/quote-requests/' + quote.id + '/checkout-session', { estimateTotal: 0.01, origin: 'https://attacker.invalid' });
  assert.equal(retired.status, 410);
  assert.equal(retired.body.code, 'rental_deposit_checkout_unavailable');
  assert.equal(retired.body.url, undefined);
  assert.equal((await post('/webhook', event, 'invalid')).status, 400);
  for (const [index, change] of [
    { id: 'cs_different' }, { mode: 'subscription' }, { status: 'open' }, { payment_status: 'unpaid' },
    { currency: 'eur' }, { amount_total: 100 }, { amount_total: 2500.5 }, { payment_intent: null },
    { metadata: { ...session.metadata, tenantId: other.id } }, { metadata: { ...session.metadata, tenantSlug: 'other' } },
    { metadata: { ...session.metadata, quoteRequestId: other.id } },
  ].entries()) {
    const response = await post('/webhook', { ...event, id: 'evt_rejected_' + index, data: { object: { ...session, ...change } } });
    assert.equal(response.status, 200);
    assert.equal(response.body.ignored, true, JSON.stringify(change));
  }
  assert.equal((await pg.query('SELECT * FROM entitlements')).rows.length, 0, 'mismatched sessions never grant access');
  assert.equal((await pg.query('SELECT * FROM processed_stripe_events')).rows.length, 0, 'ignored payments do not consume fulfillment markers');
  for (const fields of ["status='declined'", "status='quoted',payment_status='refunded'"]) {
    await pg.query('UPDATE quote_requests SET ' + fields + ' WHERE id=$1', [quote.id]);
    assert.equal((await post('/webhook', event)).body.ignored, true);
  }
  await pg.query("UPDATE quote_requests SET status='quoted',payment_status='unpaid' WHERE id=$1", [quote.id]);
  failEntitlement = true;
  assert.equal((await post('/webhook', event)).status, 500);
  assert.equal((await pg.query('SELECT payment_status FROM quote_requests WHERE id=$1', [quote.id])).rows[0].payment_status, 'unpaid', 'payment rolls back with entitlement');
  assert.equal((await pg.query('SELECT * FROM processed_stripe_events')).rows.length, 0, 'failed fulfillment remains retryable');
  const settled = await Promise.all([post('/webhook', event), post('/webhook', event)]);
  assert.ok(settled.every(result => result.status === 200));
  assert.ok(settled.some(result => result.body.duplicate));
  const paid = (await pg.query('SELECT * FROM quote_requests WHERE id=$1', [quote.id])).rows[0];
  assert.equal(paid.status, 'booked');
  assert.equal(paid.payment_status, 'paid');
  assert.equal(paid.amount_paid_cents, 2500);
  const access = (await pg.query('SELECT * FROM entitlements')).rows;
  assert.equal(access.length, 1);
  assert.equal(access[0].status, 'active');
  const delayed = await post('/webhook', { ...event, id: 'evt_delayed', type: 'checkout.session.async_payment_succeeded' });
  assert.equal(delayed.body.duplicate, true);
  assert.equal((await pg.query('SELECT * FROM entitlements')).rows.length, 1, 'another completion event cannot extend or duplicate access');
  await pg.query("UPDATE quote_requests SET payment_status='refunded' WHERE id=$1", [quote.id]);
  assert.equal((await post('/webhook', { ...event, id: 'evt_after_refund' })).body.ignored, true, 'late success cannot overwrite a refund');
  await post('/webhook', { ...event, id: 'evt_pass', data: { object: { ...session, metadata: { kind: 'consumer_event_pass' } } } });
  assert.equal(eventPassCalls, 1, 'separate Event Pass fulfillment remains available');
  console.log('PASS legacy deposit security: creation closed; signed settlement requires exact session, tenant, paid status, USD and amount; declined/refunded rejection; payment+entitlement+marker rollback, retry and concurrent deduplication; Event Pass unaffected. Isolated SQL and fake Stripe only.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { server?.close(); await pg.close(); });
