# RentSketch Stripe Production Launch Checklist

This document outlines how to safely migrate RentSketch billing from Stripe TEST mode to LIVE mode without requiring code changes.

## Pre-Launch: Test Environment Readiness (COMPLETE)

- [x] Permanent Stripe Price IDs configured in TEST environment
  - Starter Monthly: `price_1UGMtIFhxlZaCpAOu6X6S9AY`
  - Starter Annual: `price_1UGMsnFhxlZaCpAOihLGKKwQ`
  - Pro Monthly: `price_1UGMtcFhxlZaCpAOOcECbrbP`
  - Pro Annual: `price_1UGMswFhxlZaCpAO7NGTqKBC`
  - Business Monthly: `price_1UGMtnFhxlZaCpAO3NQ9poAT`
  - Business Annual: `price_1UGMt7FhxlZaCpAO5cubFV0I`

- [x] Environment variables deployed (TEST keys + TEST price IDs)
  - `STRIPE_SECRET_KEY` (TEST key, starts with `sk_test_`)
  - `STRIPE_WEBHOOK_SECRET` (TEST webhook secret, starts with `whsec_test_`)
  - `STRIPE_PRICE_STARTER_MONTHLY` through `STRIPE_PRICE_COMMERCE_ANNUAL`

- [x] Code refactored to use permanent Stripe Price IDs
  - `businessBilling.js` no longer uses dynamic `price_data`
  - Uses environment variables: `STRIPE_PRICE_${PLAN}_${INTERVAL}`
  - Maps plan ID `commerce` (database key) to UI name "Business"

- [x] Webhook hardening implemented
  - Event deduplication via `processed_stripe_events` table
  - Handles `checkout.session.completed`, `customer.subscription.created/updated/deleted`
  - Subscription status is authoritative; access never granted from success URL
  - Safe return URLs limited to rentsketch.com subdomains

- [x] Checkout idempotency added
  - Uses `${tenantId}-${planId}-${interval}` as idempotency key
  - Retried requests return same checkout session URL

- [x] Dashboard Billing UI verified
  - Uses canonical `/api/business/:slug/billing/*` routes
  - Status fetched from `/api/business/:slug/billing/status`
  - Checkout and portal initiated from `/api/business/:slug/billing/{checkout-session,portal-session}`

- [x] Consumer Event Pass ($9.99/$4.99) preserved
  - Uses dynamic Stripe pricing (no Price ID required)
  - Separate from business subscriptions; not affected by this launch

- [x] Friendly Party Rental protected
  - Free-access bypass in place; cannot accidentally trigger paid checkout
  - RentSketch tenant policy remains untouched; friendlypartyrental.com unaffected

## Launch Day: TEST→LIVE Migration (Human-Only Steps)

**Do NOT proceed until all Pre-Launch items above are marked complete.**

### Step 1: Create Permanent Stripe Price IDs in LIVE Account

In your Stripe LIVE dashboard:

1. Navigate to Products > Add product
2. Create 6 products and prices for the LIVE environment:
   - **Starter / Monthly**: Product name "RentSketch Starter", Price $49/month
   - **Starter / Annual**: Product name "RentSketch Starter", Price $490/year
   - **Pro / Monthly**: Product name "RentSketch Pro", Price $99/month
   - **Pro / Annual**: Product name "RentSketch Pro", Price $990/year
   - **Business / Monthly**: Product name "RentSketch Business", Price $199/month
   - **Business / Annual**: Product name "RentSketch Business", Price $1990/year

3. Copy the **Price IDs** (not product IDs) from the LIVE dashboard.
   - LIVE price IDs start with `price_` (not `price_1...`) and have no `test` in the name.

### Step 2: Update Railway Environment Variables

In Railway dashboard for the `rentsketch-api` service in the **production** environment:

1. Add/update the LIVE Stripe keys:
   - `STRIPE_SECRET_KEY` → LIVE secret key (starts with `sk_live_`)
   - `STRIPE_WEBHOOK_SECRET` → LIVE webhook secret (starts with `whsec_live_`)

2. Add/update the 6 permanent Price IDs from Step 1:
   - `STRIPE_PRICE_STARTER_MONTHLY` → LIVE Starter Monthly price ID
   - `STRIPE_PRICE_STARTER_ANNUAL` → LIVE Starter Annual price ID
   - `STRIPE_PRICE_PRO_MONTHLY` → LIVE Pro Monthly price ID
   - `STRIPE_PRICE_PRO_ANNUAL` → LIVE Pro Annual price ID
   - `STRIPE_PRICE_COMMERCE_MONTHLY` → LIVE Business Monthly price ID
   - `STRIPE_PRICE_COMMERCE_ANNUAL` → LIVE Business Annual price ID

**Important:** Do NOT change the code or redeploy. The existing deployment will automatically use the new LIVE keys and price IDs on next request.

### Step 3: Configure Stripe Webhook (LIVE)

In your Stripe LIVE dashboard:

1. Navigate to Developers > Webhooks
2. Add endpoint: `https://rentsketch-api-production.up.railway.app/api/stripe/webhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the **Signing Secret** (starts with `whsec_live_`)
5. Update Railway's `STRIPE_WEBHOOK_SECRET` with this value (Step 2 above)

### Step 4: Test LIVE Mode (Low-Risk Manual Test)

1. Log in to RentSketch as a test business user (not Friendly)
2. Navigate to /dashboard and click "Billing"
3. **Do NOT proceed past plan selection without explicit approval**
4. Select "Starter" and "Monthly" (safest choice)
5. Click "Upgrade"
6. In Stripe Checkout, use Stripe test card `4242 4242 4242 4242` (yes, test cards still work in LIVE mode for testing webhooks)
7. Confirm payment processes and subscription appears in `/api/business/:slug/billing/status`
8. **Cancel the subscription immediately** in the Stripe billing portal to avoid real charges

### Step 5: Monitor Webhook Delivery

1. In Stripe LIVE dashboard > Developers > Webhooks, check the endpoint's event log
2. Verify all events delivered and processed (green checkmarks)
3. If an event failed, check `SELECT * FROM processed_stripe_events` in the database to understand the failure

### Step 6: Verify Production Behavior

- [ ] Friendly Party Rental still cannot access billing checkout
- [ ] Other test tenants can view plan pricing (GET /api/business/plans)
- [ ] Test tenant checkout creates Stripe customers and sessions
- [ ] Webhook `checkout.session.completed` updates `subscriptions` table
- [ ] Dashboard displays correct subscription status
- [ ] Billing portal (card updates, invoices, cancellation) works end-to-end

## Post-Launch Monitoring

- Monitor `processed_stripe_events` table for duplicate event IDs (should be ~0)
- Check Rails logs for `[stripe webhook] processing failed` errors
- Monitor Stripe dashboard for failed webhook deliveries
- Verify database `subscriptions` table updates match Stripe's state

## Rollback Plan

If LIVE migration must be aborted:

1. In Railway, revert `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to TEST keys
2. Update the 6 price IDs back to TEST environment values
3. No code changes required; existing deployment will revert automatically on next request
4. Remove LIVE webhook endpoint from Stripe dashboard

## Architecture Notes

- **Permanent Price IDs**: Stripe IDs never expire or change; mapped via environment variables for safe test→live swap
- **Plan ID Compatibility**: Database key `commerce` maps to UI name "Business" for backward compatibility with existing tenant subscriptions
- **Event Deduplication**: `processed_stripe_events(id, event_type)` prevents double-processing on webhook retries
- **Access Control**: Subscription status in database is authoritative; success URL is never trusted for access grants
- **Return URL Safety**: Hard-coded allowlist for rentsketch.com subdomains; prevents redirect attacks
- **Consumer Event Pass**: Unaffected by business subscription refactor; uses dynamic Stripe pricing ($9.99/$4.99)

## Code References

- **Permanent Price ID Logic**: `server/src/routes/businessBilling.js` (checkout endpoint, idempotency key generation)
- **Webhook Handler**: `server/src/routes/stripeWebhook.js` (event deduplication, subscription upsert)
- **Pricing Config**: `server/src/pricing.js` (BUSINESS_PLANS definitions)
- **Dashboard Routes**: `/api/business/plans`, `/api/business/:slug/billing/status`, `/api/business/:slug/billing/checkout-session`, `/api/business/:slug/billing/portal-session`

---

**Last Updated**: 2026-09-16  
**Status**: Ready for production launch (TEST mode verified, human approval required for LIVE keys)

