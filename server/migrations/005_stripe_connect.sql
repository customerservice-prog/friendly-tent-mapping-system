-- Adds Stripe Connect account tracking to tenants, needed so a business's
-- deposit payments (003_payments.sql) can eventually be split between the
-- platform and the tenant's own connected Stripe account, instead of every
-- deposit landing only in the platform's own Stripe balance.
--
-- Purely additive: adds columns only, with safe defaults. Does not alter
-- any existing table's existing columns or data. Safe to re-run.
--
-- IMPORTANT: this file must be run manually against the production
-- database by someone with direct DB access before the Connect onboarding
-- routes (server/src/routes/connect.js) will work. It is NOT applied
-- automatically on deploy - there is no migration runner in this project
-- (see server/README.md). Until this is run, the new routes will return a
-- 500 error, and the platform-fee split on checkout sessions cannot be
-- turned on.
--
-- Run after schema.sql, 002, 003, and 004 on any database that predates
-- this file:
--   psql "$DATABASE_URL" -f server/migrations/005_stripe_connect.sql

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_connect_status TEXT NOT NULL DEFAULT 'not_connected';
