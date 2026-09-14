-- Adds a per-transaction platform fee ledger column to quote_requests, so
-- the platform's own cut of a tenant's Stripe Connect deposit (computed in
-- server/src/routes/payments.js at checkout-session creation time) is
-- recorded as a durable, queryable fact instead of only existing
-- transiently inside the Stripe Checkout Session request. Without this,
-- there was no way to answer "how much platform fee revenue have we
-- actually taken?" without going into Stripe's own dashboard and manually
-- reconciling every connected account.
--
-- Purely additive: adds one nullable column, no default charge is implied.
-- NULL means "no fee was computed for this payment" (e.g. tenant not on
-- Stripe Connect yet, or PLATFORM_FEE_PERCENT was 0 at the time). Safe to
-- re-run.
--
-- Run after schema.sql, 002, 003, 004, and 005 on any database that
-- predates this file:
--   psql "$DATABASE_URL" -f server/migrations/006_platform_fee_ledger.sql

ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS platform_fee_cents INTEGER;
