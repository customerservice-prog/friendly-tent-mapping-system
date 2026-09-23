-- Privacy-safe first-party field performance telemetry.
-- One row represents one public RentSketch page view. No names, emails,
-- IP addresses, session identifiers, event designs, or payment data are stored.
CREATE TABLE IF NOT EXISTS web_vitals (
  id BIGSERIAL PRIMARY KEY,
  path TEXT NOT NULL,
  navigation_type TEXT,
  device_class TEXT NOT NULL,
  lcp_ms NUMERIC,
  cls NUMERIC,
  inp_ms NUMERIC,
  fcp_ms NUMERIC,
  ttfb_ms NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS web_vitals_created_at_idx
  ON web_vitals(created_at DESC);

CREATE INDEX IF NOT EXISTS web_vitals_path_created_at_idx
  ON web_vitals(path, created_at DESC);
