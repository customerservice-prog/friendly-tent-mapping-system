// Built-in quote-request order-entitlement adapter.
//
// Any tenant using RentSketch's own quote_requests flow can use this provider.
// External ordering systems can add their own adapter later without coupling
// core entitlement logic to one rental company.

const db = require('../db');

const QUALIFYING_STATUSES = ['booked'];
const DEFAULT_GRACE_DAYS = 7;

async function syncOrderEntitlement(quoteRequest, tenant, execute = db.query) {
  if (!quoteRequest || !quoteRequest.design_id) return { granted: false };

  await execute(
    `UPDATE entitlements SET status = 'revoked', revoked_at = now()
       WHERE design_id = $1 AND source = 'active_order' AND status = 'active'`,
    [quoteRequest.design_id]
  );

  if (!QUALIFYING_STATUSES.includes(quoteRequest.status)) {
    return { granted: false };
  }

  const configuredGrace = Number(tenant && tenant.active_order_grace_days);
  const graceDays = Number.isFinite(configuredGrace) && configuredGrace >= 0
    ? configuredGrace
    : DEFAULT_GRACE_DAYS;
  const eventDate = quoteRequest.event_date ? new Date(quoteRequest.event_date) : new Date();
  const expiresAt = new Date(eventDate.getTime() + graceDays * 24 * 60 * 60 * 1000);

  await execute(
    `INSERT INTO entitlements
       (tenant_id, design_id, customer_email, source, status, expires_at, source_reference)
     VALUES ($1, $2, $3, 'active_order', 'active', $4, $5)`,
    [quoteRequest.tenant_id, quoteRequest.design_id, quoteRequest.customer_email, expiresAt, quoteRequest.id]
  );

  return { granted: true, expiresAt };
}

module.exports = { syncOrderEntitlement, QUALIFYING_STATUSES };
