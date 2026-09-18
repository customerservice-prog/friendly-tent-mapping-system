CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feedback_type TEXT NOT NULL DEFAULT 'general',
  message TEXT NOT NULL,
  customer_email TEXT,
  entry_mode TEXT,
  product_id TEXT,
  view_mode TEXT,
  page_url TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_tenant_idx ON feedback (tenant_id);
CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback (created_at DESC);
