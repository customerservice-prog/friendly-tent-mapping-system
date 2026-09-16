-- RentSketch business subscription billing.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_billing_customer_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS tenants_stripe_billing_customer_idx ON tenants(stripe_billing_customer_id) WHERE stripe_billing_customer_id IS NOT NULL;

INSERT INTO plans(id,name,monthly_price,annual_price,features) VALUES
 ('starter','Starter',49.00,490.00,'{"designer":true,"quotes":true,"branding":"basic"}'::jsonb),
 ('pro','Pro',99.00,990.00,'{"designer":true,"quotes":true,"branding":"custom","payments":true,"orders":true}'::jsonb),
 ('commerce','Business',199.00,1990.00,'{"designer":true,"quotes":true,"branding":"custom","payments":true,"orders":true,"webhooks":true,"staff":"multiple"}'::jsonb),
 ('enterprise','Enterprise',NULL,NULL,'{"custom":true}'::jsonb)
ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,monthly_price=EXCLUDED.monthly_price,annual_price=EXCLUDED.annual_price,features=EXCLUDED.features;

-- Friendly's embedded designer remains free for every customer. This does not
-- alter friendlypartyrental.com; it only protects the RentSketch tenant policy.
UPDATE tenants SET customer_access='free', pass_price_cents=NULL WHERE slug='friendly';
