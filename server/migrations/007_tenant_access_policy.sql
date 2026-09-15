-- Adds per-tenant customer access policy configuration.
-- Governs whether a tenant's customers get RentSketch access for free,
-- free only with a qualifying active order (else must buy a pass), or
-- must always pay. Purely additive - existing tenants default to the
-- current real-world behavior (paid, same $9.99/30-day pass as direct
-- consumers) so nothing changes until a tenant explicitly configures this.
--
-- Run after schema.sql and 004_entitlements.sql:
--   psql "$DATABASE_URL" -f server/migrations/007_tenant_access_policy.sql

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS customer_access TEXT NOT NULL DEFAULT 'paid'
    CHECK (customer_access IN ('free', 'order_then_paid', 'paid'));

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS pass_price_cents INTEGER;
  -- NULL means "use the platform default Event Pass price" (see pricing.js).

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS pass_duration_days INTEGER NOT NULL DEFAULT 30;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS active_order_grace_days INTEGER NOT NULL DEFAULT 7;
  -- How long after the event date an order-based entitlement stays valid.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS credit_pass_to_order BOOLEAN NOT NULL DEFAULT false;
  -- If true, a consumer's paid pass purchase is remembered as order credit
  -- when they later book a qualifying order with this tenant.
