-- Adds the entitlement engine + consumer payment ledger + a Stripe webhook
-- idempotency guard, needed for the RentSketch Direct Consumer Event Pass
-- ($9.99 / 30 days). This is a SEPARATE payment type from the Friendly
-- rental deposit (003_payments.sql) and from business subscriptions.
-- Purely additive: creates new tables only. Does not alter any existing
-- table. Safe to re-run (every statement is guarded with IF NOT EXISTS).
--
-- Run after schema.sql, 002, and 003 on any database that predates this file:
--   psql "$DATABASE_URL" -f server/migrations/004_entitlements.sql

-- Records every Stripe event id we have processed, so a retried/duplicate
-- webhook delivery can never create a second entitlement or double-credit
-- access. Shared by every webhook branch (deposit, event pass, and later
-- subscriptions/Connect).
CREATE TABLE IF NOT EXISTS processed_stripe_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

-- The authoritative access record. Access is never decided by a frontend
-- flag or the Stripe success URL - only by an active row here.
-- source: consumer_purchase | consumer_renewal | tenant_paid_pass |
--         active_tenant_order | tenant_free_access | business_staff |
--         trial | admin_grant
-- status: active | expired | revoked
CREATE TABLE IF NOT EXISTS entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    design_id UUID REFERENCES designs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    customer_email TEXT,
    anonymous_session_id TEXT,
    source TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    capabilities JSONB NOT NULL DEFAULT '["view","edit","save","3d","export","share"]'::jsonb,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    source_reference TEXT,
    payment_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
  );
CREATE INDEX IF NOT EXISTS entitlements_design_idx ON entitlements (design_id);
CREATE INDEX IF NOT EXISTS entitlements_tenant_idx ON entitlements (tenant_id);

-- Payment ledger for consumer-facing charges (Event Pass + renewals). Kept
-- separate from quote_requests, which tracks the Friendly rental deposit.
-- payment_type: consumer_event_pass | event_pass_extension
-- status: pending | paid | failed
CREATE TABLE IF NOT EXISTS consumer_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    design_id UUID REFERENCES designs(id) ON DELETE CASCADE,
    customer_email TEXT NOT NULL,
    payment_type TEXT NOT NULL DEFAULT 'consumer_event_pass',
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    status TEXT NOT NULL DEFAULT 'pending',
    stripe_checkout_session_id TEXT UNIQUE,
    stripe_payment_intent_id TEXT,
    entitlement_id UUID REFERENCES entitlements(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
CREATE INDEX IF NOT EXISTS consumer_payments_design_idx ON consumer_payments (design_id);
