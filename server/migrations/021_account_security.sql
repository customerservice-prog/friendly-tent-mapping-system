-- Optional authenticator enrollment; no existing account is automatically enrolled.
CREATE TABLE IF NOT EXISTS dashboard_mfa (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_ciphertext text,
  enabled_at timestamptz,
  last_used_step bigint NOT NULL DEFAULT -1,
  pending_ciphertext text,
  pending_expires_at timestamptz,
  pending_credential_hash text,
  failed_attempts integer NOT NULL DEFAULT 0,
  attempt_window_start timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  CHECK ((enabled_at IS NULL) = (secret_ciphertext IS NULL))
);
CREATE TABLE IF NOT EXISTS dashboard_mfa_recovery (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  PRIMARY KEY (user_id, code_hash)
);
CREATE TABLE IF NOT EXISTS dashboard_mfa_challenges (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS dashboard_mfa_challenges_user_idx
  ON dashboard_mfa_challenges(user_id);
