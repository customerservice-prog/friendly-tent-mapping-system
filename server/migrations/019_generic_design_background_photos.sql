-- Generic/Event Pass designs intentionally have tenant_id NULL.
-- Venue photos must support those designs as well as tenant-owned designs.
ALTER TABLE design_background_photos
  ALTER COLUMN tenant_id DROP NOT NULL;
