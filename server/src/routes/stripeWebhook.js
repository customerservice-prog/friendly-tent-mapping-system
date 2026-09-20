const express = require('express');
const { query, pool } = require('../db');
const { fulfillEventPass, PASS_KINDS } = require('../eventPass');
const { syncOrderEntitlement } = require('../orderProviders/quoteRequestOrderProvider');

const router = express.Router();

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const Stripe = require('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// Upsert business subscription from Stripe event, updating tenant billing state.
// This is the authoritative source for subscription status; access decisions
// must check the subscription status in the database, never assume success
// from the success URL.
async function upsertBusinessSubscription(sub, metadata = {}, execute = query) {
  const tenantId = metadata.tenantId || sub.metadata?.tenantId;
  if (!tenantId) return;

  let planId = metadata.planId || sub.metadata?.planId || 'starter';
  let interval = metadata.interval || sub.metadata?.interval || 'monthly';
  const priceId = sub.items?.data?.[0]?.price?.id;
  // Portal changes update subscription items, not the original metadata.
  if (priceId) for (const plan of ['starter','pro','commerce']) for (const term of ['monthly','annual']) {
    if (process.env[`STRIPE_PRICE_${plan.toUpperCase()}_${term.toUpperCase()}`] === priceId) { planId=plan; interval=term; }
  }
  const status = sub.status || 'active';
  const periodStart = sub.current_period_start || sub.items?.data?.[0]?.current_period_start;
  const periodEnd = sub.current_period_end || sub.items?.data?.[0]?.current_period_end;
  const start = periodStart ? new Date(periodStart * 1000) : null;
  const end = periodEnd ? new Date(periodEnd * 1000) : null;

  await execute(
    `INSERT INTO subscriptions(tenant_id,plan_id,provider_customer_id,provider_subscription_id,status,billing_interval,current_period_start,current_period_end,cancel_at_period_end)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT(provider_subscription_id) WHERE provider_subscription_id IS NOT NULL DO UPDATE SET plan_id=EXCLUDED.plan_id,status=EXCLUDED.status,billing_interval=EXCLUDED.billing_interval,current_period_start=EXCLUDED.current_period_start,current_period_end=EXCLUDED.current_period_end,cancel_at_period_end=EXCLUDED.cancel_at_period_end`,
    [tenantId, planId, String(sub.customer || ''), sub.id, status, interval, start, end, !!sub.cancel_at_period_end]
  );

  // Update tenant's billing snapshot for fast dashboard queries.
  // The subscription table remains the authoritative source.
  await execute('UPDATE tenants SET subscription_plan=$1,subscription_status=$2,updated_at=now() WHERE id=$3', [
    planId,
    status,
    tenantId,
  ]);
}

// Webhook POST handler: process Stripe events with idempotency.
// The processed_stripe_events table deduplicates by event.id, preventing
// double-processing if Stripe retries delivery. Within a transaction,
// we insert the event ID first; if it already exists, we return immediately.
router.post('/', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).send('Payments not configured');

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe webhook] signature verification failed', err.message);
    return res.status(400).send('Invalid signature');
  }

  // Event Pass fulfillment is idempotent by Checkout Session, not event ID.
  // Process it before the legacy event marker, which cannot roll back failures.
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)
      && PASS_KINDS.includes(event.data.object.metadata?.kind)) {
    try {
      await fulfillEventPass(event.data.object);
      return res.json({ received: true });
    } catch (err) {
      console.error('[stripe webhook] Event Pass fulfillment failed', event.id, err.message);
      return res.status(500).send('Event Pass fulfillment failed');
    }
  }

  // Commit the business update and event marker together. An interrupted
  // update must remain retryable; recording the marker first outside a
  // transaction previously caused Stripe retries to skip failed purchases.
  const object = event.data.object;
  const businessCheckout = event.type === 'checkout.session.completed' && object.metadata?.kind === 'business_subscription' && object.subscription;
  const businessChange = ['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type) && object.metadata?.tenantId;
  if (businessCheckout || businessChange) {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const tenantId = object.metadata.tenantId;
      // Serialize status updates before fetching Stripe's latest state so an
      // older delivered event cannot overwrite a later cancellation/payment.
      await client.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE', [tenantId]);
      const marker = await client.query('INSERT INTO processed_stripe_events(id,event_type) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id',[event.id,event.type]);
      if (marker.rows.length) {
        const subscription = await stripe.subscriptions.retrieve(businessCheckout ? object.subscription : object.id);
        await upsertBusinessSubscription(subscription, businessCheckout ? object.metadata : {}, (sql,args)=>client.query(sql,args));
      }
      await client.query('COMMIT');
      return res.json({received:true,...(!marker.rows.length?{duplicate:true}:{})});
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      console.error('[stripe webhook] Business subscription fulfillment failed',event.id,err.message);
      return res.status(500).send('Subscription fulfillment failed');
    } finally { client?.release(); }
  }

  // Idempotency: attempt to record this event as processed. If it already
  // exists, return success immediately without reprocessing.
  const idem = await query('INSERT INTO processed_stripe_events(id,event_type) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id', [
    event.id,
    event.type,
  ]);

  if (!idem.rows.length) {
    // Event already processed; return success without retrying handlers.
    console.log(`[stripe webhook] duplicate event ${event.id}, skipping`);
    return res.json({ received: true, duplicate: true });
  }

  try {
    // Handle checkout.session.completed: confirms payment intent and creates/updates entitlements or subscriptions.
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object;
      const m = s.metadata || {};

      if (m.kind === 'business_subscription' && s.subscription) {
        // For business subscriptions, retrieve the full subscription object from Stripe
        // to ensure we have complete data (status, current_period_end, etc.).
        const sub = await stripe.subscriptions.retrieve(s.subscription);
        await upsertBusinessSubscription(sub, m);
      } else if (m.quoteRequestId) {
        const u = await query(
          `UPDATE quote_requests SET payment_status='paid',status='booked',amount_paid_cents=$1,stripe_payment_intent_id=$2 WHERE id=$3 RETURNING *`,
          [s.amount_total, s.payment_intent, m.quoteRequestId]
        );
        if (u.rows[0]) {
          const tr = await query('SELECT * FROM tenants WHERE id=$1', [u.rows[0].tenant_id]);
          await syncOrderEntitlement(u.rows[0], tr.rows[0]);
        }
      }
    }
    // Handle subscription.created / subscription.updated: Stripe notifies us of subscription changes.
    // These update the database but MUST NOT grant access directly; access is checked against
    // the subscription status in the database at request time.
    else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      await upsertBusinessSubscription(event.data.object);
    }
    // Handle subscription.deleted: cancellation (either by customer or admin).
    else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      await upsertBusinessSubscription(sub);
      const tenantId = sub.metadata?.tenantId;
      if (tenantId) {
        await query(`UPDATE tenants SET subscription_status='canceled',updated_at=now() WHERE id=$1`, [tenantId]);
      }
    }
    // NOTE: invoice.paid and invoice.payment_failed are NOT currently handled.
    // Subscription status is the authoritative source for access control:
    // - invoice.paid: subscription.updated will already have updated status if payment succeeded.
    // - invoice.payment_failed: the subscription remains active during the dunning period (governed
    //   by Stripe's retry policy), and subscription.updated fires when the subscription is
    //   ultimately canceled. Therefore, we rely on subscription.updated to reflect the true state.
    // If in the future we need to surface invoice payment failures to the user (e.g., dunning
    // notifications), those can be added without affecting access control.
  } catch (err) {
    console.error('[stripe webhook] processing failed', event.id, err);
    return res.status(500).send('Webhook processing failed');
  }

  res.json({ received: true });
});

module.exports = router;
