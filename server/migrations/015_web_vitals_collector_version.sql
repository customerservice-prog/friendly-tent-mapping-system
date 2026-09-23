-- Version the RUM collector so reports can ignore the initial deployment
-- window that may contain synthetic Lighthouse browser samples.
ALTER TABLE web_vitals
  ADD COLUMN IF NOT EXISTS collector_version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS web_vitals_version_created_at_idx
  ON web_vitals(collector_version, created_at DESC);
