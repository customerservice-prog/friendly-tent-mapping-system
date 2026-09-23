CREATE TABLE IF NOT EXISTS platform_admin_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  target_label TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_admin_audit_created_idx ON platform_admin_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS platform_admin_audit_target_idx ON platform_admin_audit(target_type,target_id);
