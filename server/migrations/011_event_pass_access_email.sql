-- Snapshot the purchased term; older pending Checkouts retain their 30-day term.
ALTER TABLE consumer_payments ADD COLUMN IF NOT EXISTS duration_days INTEGER;

-- Transactional access emails. A receipt is queued with its entitlement, so a
-- browser closing or a temporary mail outage cannot lose the customer's link.
CREATE TABLE IF NOT EXISTS event_pass_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_payment_id UUID UNIQUE REFERENCES consumer_payments(id) ON DELETE CASCADE,
  customer_email TEXT NOT NULL,
  tenant_slug TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('receipt', 'recovery')),
  design_ids JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS event_pass_email_pending_idx ON event_pass_emails(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS event_pass_email_recipient_idx ON event_pass_emails(customer_email, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS event_pass_email_recovery_waiting_idx
  ON event_pass_emails(customer_email, tenant_slug)
  WHERE kind='recovery' AND status IN ('pending','sending');
