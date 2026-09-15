// ONE authoritative server-side access-resolution engine.
//
// Every route that needs to know whether a person may view/edit a design,
// and whether they must pay first, calls resolveAccess() here instead of
// re-implementing its own ad-hoc checks. This module never trusts the
// client - only the design's own tenant_id (from the DB), the tenant's
// configured access policy (from the DB), a verified staff session, and
// active rows in `entitlements` (written only after a real Stripe webhook
// or a verified order-integration call).
//
// Case matrix this implements (see master brief):
//   A. Direct consumer, no pass          -> preview, must pay EVENT_PASS_CENTS
//   B. Direct consumer, active pass       -> paid, included
//   C. Tenant customer, qualifying order  -> included, reason active_order
//   D. Tenant customer, no order (policy order_then_paid) -> preview, must pay tenant price
//   E. Tenant policy free                 -> included, reason tenant_free
//   F. Tenant policy paid (Commerce)      -> preview, must pay tenant-configured price
//   G. Staff                              -> included, full capabilities

const db = require('./db');
const { EVENT_PASS_CENTS } = require('./pricing');

const FULL_CAPABILITIES = ['view', 'edit', 'save', '3d', 'export', 'share'];

async function findActiveEntitlement(designId) {
  if (!designId) return null;
  const result = await db.query(
    `SELECT * FROM entitlements
       WHERE design_id = $1 AND status = 'active' AND (expires_at IS NULL OR expires_at > now())
       ORDER BY expires_at DESC NULLS LAST
       LIMIT 1`,
    [designId]
  );
  return result.rows[0] || null;
}

// design: row from `designs` (or null if none created yet). tenant: row
// from `tenants`, or null for the generic direct-consumer product.
// isStaff: true only if the caller presented a verified bearer token for
// a staff membership on this exact tenant (checked by the caller via
// requireTenantAccess before calling this with isStaff: true).
async function resolveAccess({ design, tenant, isStaff }) {
  if (isStaff) {
    return {
      context: 'staff',
      access: 'included',
      reason: 'staff',
      expiresAt: null,
      capabilities: FULL_CAPABILITIES,
      paymentRequired: false,
      price: null,
      currency: 'usd',
      tenant: tenant ? tenant.slug : null,
    };
  }

  const entitlement = design ? await findActiveEntitlement(design.id) : null;

  if (!tenant) {
    if (entitlement) {
      return {
        context: 'consumer',
        access: 'paid',
        reason: entitlement.source,
        expiresAt: entitlement.expires_at,
        capabilities: entitlement.capabilities,
        paymentRequired: false,
        price: null,
        currency: 'usd',
        tenant: null,
      };
    }
    return {
      context: 'consumer',
      access: 'preview',
      reason: 'consumer_pass',
      expiresAt: null,
      capabilities: ['view'],
      paymentRequired: true,
      price: EVENT_PASS_CENTS,
      currency: 'usd',
      tenant: null,
    };
  }

  const policy = tenant.customer_access || 'paid';
  const tenantPrice = tenant.pass_price_cents != null ? tenant.pass_price_cents : EVENT_PASS_CENTS;

  if (policy === 'free') {
    return {
      context: 'tenant_customer',
      access: 'included',
      reason: 'tenant_free',
      expiresAt: null,
      capabilities: FULL_CAPABILITIES,
      paymentRequired: false,
      price: null,
      currency: 'usd',
      tenant: tenant.slug,
    };
  }

  if (policy === 'order_then_paid' && entitlement && entitlement.source === 'active_order') {
    return {
      context: 'tenant_customer',
      access: 'included',
      reason: 'active_order',
      expiresAt: entitlement.expires_at,
      capabilities: entitlement.capabilities,
      paymentRequired: false,
      price: null,
      currency: 'usd',
      tenant: tenant.slug,
    };
  }

  if (entitlement) {
    return {
      context: 'tenant_customer',
      access: 'paid',
      reason: entitlement.source,
      expiresAt: entitlement.expires_at,
      capabilities: entitlement.capabilities,
      paymentRequired: false,
      price: null,
      currency: 'usd',
      tenant: tenant.slug,
    };
  }

  return {
    context: 'tenant_customer',
    access: 'preview',
    reason: 'tenant_paid_pass',
    expiresAt: null,
    capabilities: ['view'],
    paymentRequired: true,
    price: tenantPrice,
    currency: 'usd',
    tenant: tenant.slug,
  };
}

module.exports = { resolveAccess, findActiveEntitlement };
