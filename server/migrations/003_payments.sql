-- Adds payment tracking to quote_requests, plus a deposit_percent setting on tenants.
-- Safe to re-run: every change is guarded with IF NOT EXISTS.
-- Run after schema.sql (and 002) on any database that predates this file:
-- psql "$DATABASE_URL" -f server/migrations/003_payments.sql

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deposit_percent NUMERIC(5,2) NOT NULL DEFAULT 20;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid';
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS deposit_amount_cents INTEGER;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS amount_paid_cents INTEGER;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
CREATE INDEX IF NOT EXISTS quote_requests_stripe_session_idx ON quote_requests (stripe_checkout_session_id);
