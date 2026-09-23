-- Ensure every tenant created after the original branding migration receives
-- a public embed key automatically. Older rows are backfilled first.
UPDATE tenants SET embed_key=encode(gen_random_bytes(16),'hex') WHERE embed_key IS NULL;
ALTER TABLE tenants ALTER COLUMN embed_key SET DEFAULT encode(gen_random_bytes(16),'hex');
