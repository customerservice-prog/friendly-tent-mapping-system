-- RentSketch minimum production schema.
-- Postgres. Kept deliberately small: this is the minimum set of tables
-- needed to make tenants, products, designs, and quote requests real,
-- persisted, tenant-scoped records instead of hardcoded JS + mailto links.
-- Billing tables (plans/subscriptions) exist as placeholders only - see
-- server/README.md and /docs/ROADMAP.md for what is intentionally deferred.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- A rental company (or the generic RentSketch tenant used by the public demo).
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  legal_name TEXT,
  logo_url TEXT,
  contact_email TEXT,
  phone TEXT,
  website TEXT,
  primary_color TEXT DEFAULT '#2f6fed',
  secondary_color TEXT DEFAULT '#0b1b3a',
  tagline TEXT,
  show_prices BOOLEAN NOT NULL DEFAULT true,
  subscription_plan TEXT NOT NULL DEFAULT 'trial',
  subscription_status TEXT NOT NULL DEFAULT 'trialing',
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A person who can log in. Platform admins (Bryan/RentSketch operator) are
-- flagged here rather than modeled as a special tenant, per the brief's
-- "platform admin is different from tenant admin" requirement.
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  is_platform_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One-time password reset tokens. Only an irreversible SHA-256 token hash is
-- stored; reset links expire and are marked used after a successful change.
CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens (user_id);
CREATE INDEX password_reset_tokens_active_idx ON password_reset_tokens (token_hash, expires_at) WHERE used_at IS NULL;

-- Platform-owner audit history for sensitive administrative actions.
CREATE TABLE platform_admin_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  target_label TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX platform_admin_audit_created_idx ON platform_admin_audit(created_at DESC);
CREATE INDEX platform_admin_audit_target_idx ON platform_admin_audit(target_type,target_id);

-- Which users can access which tenant, and with what role. This is the
-- authorization join table every tenant-scoped route checks against.
CREATE TABLE tenant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner', -- owner | admin | staff | viewer
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

-- A tenant's own catalog item (tent, table, chair, dance floor, lighting...).
-- external_id mirrors the id used in the designer's static data files
-- (e.g. 'pole-20x40') so the frontend can keep working the same way while
-- the source of truth moves from a JS file to this table.
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  external_id TEXT,
  name TEXT NOT NULL,
  sku TEXT,
  price_per_day NUMERIC(10,2),
  price_type TEXT NOT NULL DEFAULT 'per_day',
  width_ft NUMERIC(6,2),
  length_ft NUMERIC(6,2),
  capacity INTEGER,
  photo_url TEXT,
  visual_model_id TEXT, -- future: maps to a shared master visual library
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX products_tenant_idx ON products (tenant_id);

-- A saved layout snapshot. Anonymous by default (anonymous_session_id) so a
-- customer never has to create an account just to save/return to a design.
CREATE TABLE designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id),
  anonymous_session_id TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  event_type TEXT,
  guest_count INTEGER,
  scene JSONB NOT NULL,
  estimate_total NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX designs_tenant_idx ON designs (tenant_id);

-- The structured record that replaces the mailto: "Request a Quote" link.
CREATE TABLE quote_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  design_id UUID REFERENCES designs(id),
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  event_date DATE,
  guest_count INTEGER,
  event_type TEXT,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimate_total NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'new', -- new | contacted | quoted | booked | declined
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX quote_requests_tenant_idx ON quote_requests (tenant_id);

-- Plan catalog (Starter/Pro/Business). Prices are NOT finalized - see
-- ROADMAP.md. This table exists so entitlements can be checked centrally
-- instead of scattered "if plan === ..." conditionals.
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_price NUMERIC(10,2),
  annual_price NUMERIC(10,2),
  features JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Placeholder for a future billing provider (e.g. Stripe). Not wired up.
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id TEXT REFERENCES plans(id),
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'trialing',
  billing_interval TEXT NOT NULL DEFAULT 'monthly',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
