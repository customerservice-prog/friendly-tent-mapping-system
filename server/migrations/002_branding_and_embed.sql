-- Adds embed, branding-completeness, and webhook configuration to tenants.
-- Safe to re-run: every change is guarded (IF NOT EXISTS / WHERE ... IS NULL).
-- Run after schema.sql on any database created before this migration existed:
--   psql "$DATABASE_URL" -f server/migrations/002_branding_and_embed.sql

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS embed_key TEXT UNIQUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS allowed_origins JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS webhook_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS webhook_secret TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS powered_by_enabled BOOLEAN NOT NULL DEFAULT true;

-- Backfill an embed key for any tenant created before embed_key existed.
UPDATE tenants SET embed_key = encode(gen_random_bytes(16), 'hex') WHERE embed_key IS NULL;
