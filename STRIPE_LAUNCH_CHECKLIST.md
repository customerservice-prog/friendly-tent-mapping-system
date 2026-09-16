# RentSketch Stripe TEST→LIVE Launch Checklist

## Pre-Launch (Production Deployment Complete ✓)

**Commit**: `c08d2e2` (feat: production-ready Stripe billing with permanent Price IDs and webhook hardening)  
**Deployment**: SUCCESS (7058400e-82a7-4278-9c1b-783d56d24320)  
**Status**: API running, /health = 200, all plans pricing verified

### Production Verification Checklist

- [x] /health endpoint returns `{"ok": true}`
- [x] /api/business/plans returns exact pricing:
  - Starter: $49/month, $490/year
  - Pro: $99/month, $990/year
  - Business (id: `commerce`): $199/month, $1990/year
- [x] All 6 STRIPE_PRICE_* env vars set in Railway production environment
- [x] Friendly Party Rental checkout blocked (tested via code review)
- [x] No secrets logged in build or deploy logs
- [x] Webhook route accessible (`/api/stripe/webhook` responds 404 to GET, ready for POST)
- [x] Dashboard routes remain unchanged: `/api/business/:slug/billing/*`

---

## TEST→LIVE Migration (Human-Only Steps)

### Step 1: Create LIVE Stripe Products & Prices

In Stripe LIVE dashboard (stripe.com/dashboard):

1. **Products Menu** → Create 6 new products with exact prices:
   - **RentSketch Starter** → $49/month + $490/year
   - **RentSketch Pro** → $99/month + $990/year
   - **RentSketch Business** → $199/month + $1990/year

2. Copy the **Price IDs** (not product IDs) from each product's pricing section.
   - LIVE price IDs look like `price_1ABC...` (no `test` in name)

### Step 2: Update Railway Environment

In Railway dashboard → rentsketch-api service → Variables:

Replace the 6 TEST price IDs with LIVE price IDs and update Stripe keys:
- `STRIPE_PRICE_STARTER_MONTHLY` → LIVE Starter monthly
- `STRIPE_PRICE_STARTER_ANNUAL` → LIVE Starter annual
- `STRIPE_PRICE_PRO_MONTHLY` → LIVE Pro monthly
- `STRIPE_PRICE_PRO_ANNUAL` → LIVE Pro annual
- `STRIPE_PRICE_COMMERCE_MONTHLY` → LIVE Business monthly
- `STRIPE_PRICE_COMMERCE_ANNUAL` → LIVE Business annual
- `STRIPE_SECRET_KEY` → LIVE key (starts with `sk_live_`)
- `STRIPE_WEBHOOK_SECRET` → LIVE webhook secret (starts with `whsec_live_`)

**After updating variables, Railway will automatically trigger a deployment.** Monitor the deployment to SUCCESS. No code changes needed.

### Step 3: Configure Webhook in Stripe LIVE

In Stripe LIVE dashboard → Developers → Webhooks → Add Endpoint:

- **URL**: `https://rentsketch-api-production.up.railway.app/api/stripe/webhook`
- **Events to listen to**:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- **Copy the Signing Secret** (starts with `whsec_live_`)
- Update Railway's `STRIPE_WEBHOOK_SECRET` variable with this value (if not already set in Step 2)

### Step 4: Verify LIVE Configuration (Required Before First Real Transaction)

1. Log in to RentSketch as a test business user (not Friendly)
2. Go to /dashboard → Billing
3. **Verify the page loads without errors** and shows the correct plan pricing
4. **Do NOT enter Stripe Checkout yet**
5. Instead, in Stripe LIVE dashboard → Developers → Webhooks, verify the webhook endpoint is registered
6. Confirm webhook test events deliver successfully (Stripe provides a "Send test event" option)

### Step 5: First Real Transaction (After Webhook Verified)

Only after webhook delivery is confirmed in Step 4:

1. Create a small test transaction with a **real card** (Stripe LIVE never accepts test card numbers like `4242...`)
2. Use a card you own or a temporary test debit card from your bank
3. **Amount: Choose the smallest plan (Starter monthly = $49)** to minimize risk
4. Monitor Stripe dashboard and webhook logs to verify payment processes end-to-end
5. If successful, immediately cancel the subscription in the billing portal
6. If any errors occur, do NOT retry; check logs and contact Stripe support

### Step 6: Post-Launch Monitoring

- [ ] Monitor Stripe dashboard webhook logs for failures
- [ ] Check `processed_stripe_events` table for unexpected duplicates
- [ ] Verify dashboard subscription status reflects Stripe state accurately
- [ ] Friendly Party Rental still cannot access paid billing checkout

---

## Rollback Plan

If anything goes wrong:

1. Revert the 8 variables in Railway to TEST values:
   - All 6 STRIPE_PRICE_* back to TEST price IDs
   - `STRIPE_SECRET_KEY` to TEST key
   - `STRIPE_WEBHOOK_SECRET` to TEST webhook secret
2. Railway will automatically redeploy
3. No code changes. Service auto-reverts on next request.

---

## Architecture Summary

**Permanent Price IDs**: Stored in environment variables, never in code. Allows safe TEST→LIVE migration without code changes.

**Backward Compatibility**: Plan ID `commerce` (database key) maps to "Business" (UI name). Existing tenant subscriptions unaffected.

**Consumer Event Pass**: Uses dynamic Stripe pricing ($9.99/$4.99 renewal); unaffected by business subscription changes.

**Access Control**: Subscription status in database is authoritative. Success URL never grants access. Webhooks are the source of truth.

**Idempotency**: Checkout sessions deduplicated by `${tenantId}-${planId}-${interval}`. Webhook events deduplicated by Stripe event ID.

---

## Code References

- **Checkout logic with Price ID lookup**: `server/src/routes/businessBilling.js` (lines ~80–120)
- **Webhook handler with deduplication**: `server/src/routes/stripeWebhook.js`
- **Pricing config**: `server/src/pricing.js`
- **Environment variable naming**: `STRIPE_PRICE_${PLAN}_${INTERVAL}` where PLAN is uppercase (STARTER, PRO, COMMERCE) and INTERVAL is uppercase (MONTHLY, ANNUAL)

---

**Last Updated**: 2026-09-16  
**Status**: LIVE migration ready. Awaiting human approval to execute Steps 1–6 above.

