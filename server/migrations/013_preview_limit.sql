-- A shared deadline for this anonymous browser, across Friendly/direct products.
-- Store only a hash of the existing anonymous identifier, not names or IPs.
CREATE TABLE IF NOT EXISTS consumer_previews (
  session_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
