-- One-time, high-entropy password reset tokens.
-- Tokens are stored only as SHA-256 hashes; the plaintext token belongs to the account owner.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS password_reset_tokens_active_idx ON password_reset_tokens (token_hash, expires_at) WHERE used_at IS NULL;

-- Emergency one-time reset issued for the RentSketch platform owner.
-- The plaintext token is never committed; only this irreversible hash is stored.
INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
SELECT id, 'ba3858f023dc22cd73944e28a667346447c6a713da5f3b5ef191cb7706864ae1', now() + interval '24 hours'
FROM users
WHERE lower(email) = 'bryanpineda315@gmail.com'
ON CONFLICT (token_hash) DO NOTHING;
