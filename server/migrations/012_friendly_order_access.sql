-- One included event per verified Friendly booking, even with repeated link requests.
CREATE UNIQUE INDEX IF NOT EXISTS entitlements_friendly_order_unique
  ON entitlements(tenant_id,source_reference) WHERE source='friendly_order';
