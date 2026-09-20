// Event Pass pricing and fulfillment shared by Checkout and its return/webhook.
// Uses the existing designs, consumer_payments and entitlements tables.
const db = require('./db');
const pricing = require('./pricing');

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const Stripe = require('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function isPassEnabled(tenant) {
  return process.env.EVENT_PASS_ENABLED === 'true' && (!tenant || ['friendly', 'generic'].includes(tenant.slug));
}

function passOffer(tenant) {
  return {
    required: isPassEnabled(tenant),
    priceCents: pricing.EVENT_PASS_CENTS,
    durationDays: pricing.EVENT_PASS_DURATION_DAYS,
    renewalPriceCents: pricing.EVENT_PASS_RENEWAL_CENTS,
    renewalDurationDays: pricing.EVENT_PASS_RENEWAL_DURATION_DAYS,
    currency: 'usd',
    recurring: false,
  };
}

let readinessCache;
async function paymentReadiness() {
  const key = process.env.STRIPE_SECRET_KEY || '';
  const mode = /^(sk|rk)_live_/.test(key) ? 'live' : 'test';
  if (!key || !process.env.STRIPE_WEBHOOK_SECRET || (process.env.NODE_ENV === 'production' && mode !== 'live')) {
    return { available: false, paymentMode: mode };
  }
  if (readinessCache && readinessCache.until > Date.now()) return readinessCache.value;
  let available = false;
  try {
    const account = await getStripe().accounts.retrieve();
    // Confirm the deployed key belongs to the intended RentSketch account.
    available = !!account.charges_enabled && (!process.env.EVENT_PASS_STRIPE_ACCOUNT_ID || account.id === process.env.EVENT_PASS_STRIPE_ACCOUNT_ID);
    await db.query('SELECT e.capabilities,p.entitlement_id FROM entitlements e LEFT JOIN consumer_payments p ON p.entitlement_id=e.id LIMIT 0');
  } catch (_) { available = false; }
  const value = { available, paymentMode: mode };
  readinessCache = { until: Date.now() + (available ? 60000 : 5000), value };
  return value;
}

const PASS_KINDS = ['consumer_event_pass', 'consumer_event_pass_renewal'];

async function fulfillEventPass(session) {
  if (!PASS_KINDS.includes(session.metadata?.kind) || session.payment_status !== 'paid') return false;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    // The ledger row is the lock, so webhook retries and the customer's return
    // can race safely. A failed transaction leaves the payment retryable.
    const result = await client.query('SELECT * FROM consumer_payments WHERE stripe_checkout_session_id=$1 FOR UPDATE', [session.id]);
    const payment = result.rows[0];
    if (!payment) throw new Error('Event Pass payment record not found');
    if (payment.status === 'paid' && payment.entitlement_id) {
      await client.query('COMMIT');
      return true;
    }
    const renewal = session.metadata.kind === 'consumer_event_pass_renewal';
    if (payment.design_id !== session.metadata.designId ||
        payment.payment_type !== (renewal ? 'event_pass_extension' : 'consumer_event_pass') ||
        session.currency !== payment.currency || session.amount_total !== payment.amount_cents) {
      throw new Error('Event Pass payment does not match the saved purchase');
    }
    const design = (await client.query('SELECT * FROM designs WHERE id=$1 FOR UPDATE', [payment.design_id])).rows[0];
    if (!design) throw new Error('Event Pass design not found');
    let base = Date.now();
    if (renewal) {
      const current = (await client.query("SELECT expires_at FROM entitlements WHERE design_id=$1 AND status='active' ORDER BY expires_at DESC NULLS LAST LIMIT 1", [design.id])).rows[0];
      if (current?.expires_at) base = Math.max(base, new Date(current.expires_at).getTime());
    }
    const days = renewal ? pricing.EVENT_PASS_RENEWAL_DURATION_DAYS : pricing.EVENT_PASS_DURATION_DAYS;
    const expiresAt = new Date(base + days * 86400000);
    const entitlement = await client.query(
      `INSERT INTO entitlements(tenant_id,design_id,customer_email,anonymous_session_id,source,status,starts_at,expires_at,payment_reference)
       VALUES($1,$2,$3,$4,$5,'active',now(),$6,$7) RETURNING id`,
      [design.tenant_id, design.id, payment.customer_email, design.anonymous_session_id,
        renewal ? 'consumer_renewal' : (design.tenant_id ? 'tenant_paid_pass' : 'consumer_purchase'), expiresAt,
        typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id]
    );
    await client.query("UPDATE consumer_payments SET status='paid',stripe_payment_intent_id=$1,entitlement_id=$2 WHERE id=$3", [
      typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
      entitlement.rows[0].id, payment.id,
    ]);
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally { client.release(); }
}

module.exports = { getStripe, isPassEnabled, passOffer, paymentReadiness, fulfillEventPass, PASS_KINDS };
