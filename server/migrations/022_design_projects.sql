-- Revision-aware saves and explicitly named, immutable project checkpoints.
-- Existing drafts begin at revision 1. Old clients must reload before writing.
ALTER TABLE designs ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0);
ALTER TABLE designs ADD COLUMN IF NOT EXISTS project_name TEXT NOT NULL DEFAULT '';
ALTER TABLE designs ADD COLUMN IF NOT EXISTS site_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE designs ADD COLUMN IF NOT EXISTS crew_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE designs ADD COLUMN IF NOT EXISTS project_root_id UUID REFERENCES designs(id) ON DELETE CASCADE;
ALTER TABLE designs ADD COLUMN IF NOT EXISTS legacy_shares_revoked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS designs_project_root_idx ON designs(project_root_id);

CREATE TABLE IF NOT EXISTS design_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id UUID NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  source_revision INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS design_revisions_design_idx ON design_revisions(design_id,created_at DESC);

CREATE TABLE IF NOT EXISTS design_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id UUID NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS design_share_links_design_idx ON design_share_links(design_id,created_at DESC);
