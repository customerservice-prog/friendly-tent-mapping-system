-- Uploaded venue/backyard photos used as private design backgrounds.
-- The image body stays out of the design JSON so autosave/share payloads remain small.
CREATE TABLE IF NOT EXISTS design_background_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id UUID NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  anonymous_session_id TEXT,
  access_token_hash TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 4194304),
  image_bytes BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS design_background_photos_design_idx
  ON design_background_photos(design_id, created_at DESC);
CREATE INDEX IF NOT EXISTS design_background_photos_tenant_idx
  ON design_background_photos(tenant_id, created_at DESC);
