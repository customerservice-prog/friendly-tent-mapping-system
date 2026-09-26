-- Dashboard authentication is independently revocable. Customer share and
-- Event Pass recovery links retain their own expiry and token purpose.
CREATE TABLE IF NOT EXISTS dashboard_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS dashboard_sessions_user_idx
  ON dashboard_sessions(user_id) WHERE revoked_at IS NULL;
