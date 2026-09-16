-- RentSketch business subscription billing.
-- Ensures all preceding migrations (002-007) have been applied first.

-- Migration 007 prerequisite: tenant access policy columns.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS customer_access TEXT NOT NULL DEFAULT 'paid'
  CHECK (customer_access IN ('free', 'order_then_paid', 'paid'));
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pass_price_cents INTEGER;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pass_duration_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS active_order_grace_days INTEGER NOT NULL DEFAULT 7;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS credit_pass_to_order BOOLEAN NOT NULL DEFAULT false;

-- Now apply this migration's changes.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_billing_customer_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS tenants_stripe_billing_customer_idx ON tenants(stripe_billing_customer_id) WHERE stripe_billing_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_subscription_idx ON subscriptions(provider_subscription_id) WHERE provider_subscription_id IS NOT NULL;

INSERT INTO plans(id,name,monthly_price,annual_price,features) VALUES
 ('starter','Starter',49.00,490.00,'{"designer":true,"quotes":true,"branding":"basic"}'::jsonb),
 ('pro','Pro',99.00,990.00,'{"designer":true,"quotes":true,"branding":"custom","payments":true,"orders":true}'::jsonb),
 ('commerce','Business',199.00,1990.00,'{"designer":true,"quotes":true,"branding":"custom","payments":true,"orders":true,"webhooks":true,"staff":"multiple"}'::jsonb),
 ('enterprise','Enterprise',NULL,NULL,'{"custom":true}'::jsonb)
ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,monthly_price=EXCLUDED.monthly_price,annual_price=EXCLUDED.annual_price,features=EXCLUDED.features;

-- Friendly's embedded designer remains free for every customer. This does not
-- alter friendlypartyrental.com; it only protects the RentSketch tenant policy.
UPDATE tenants SET customer_access='free',pass_price_cents=NULL WHERE slug='friendly';

