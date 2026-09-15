// Reference implementation of the order-entitlement adapter interface.
//
// A tenant's "order" system tells RentSketch when a customer has a
// qualifying booking, so that customer gets free access to the SAME
// design they already built, instead of being asked to pay for an Event
// Pass. This file implements that for tenants (like Friendly) whose
// order is a `quote_requests` row created by this same RentSketch
// designer's built-in request-a-quote flow - it works for ANY tenant
// using that flow, not only the tenant literally named 'friendly'.
//
// A tenant on a genuinely separate external order system (Goodshuffle,
// Point of Rental, a custom API, etc.) would get its OWN provider file
// implementing the same syncOrderEntitlement(order, tenant) signature,
// selected per-tenant once that integration exists. There is only one
// real implementation today, so a full registry is deferred until a
// second one is actually needed - do not invent providers speculatively.
//
// This NEVER trusts a customer-entered identifier. It only fires when an
// authenticated tenant staff member changes a quote request's status
// (see routes/quoteRequests.js) - that is the sole source of truth for
// whether an order genuinely qualifies.

const db = require('../db');

const QUALIFYING_STATUSES = ['booked'];
const DEFAULT_GRACE_DAYS = 7;

// Re-evaluates the active_order entitlement for a quote request's design
// every time its status changes. Idempotent and safe to call on every
// status update, including ones that do not change qualification.
async function syncOrderEntitlement(quoteRequest, tenant) {
  if (!quoteRequest || !quoteRequest.design_id) return { granted: false };

  // A status change is the new authoritative truth - always clear any
  // prior active_order grant for this design before possibly re-granting.
  await db.query(
    `UPDATE entitlements SET status = 'revoked', revoked_at = now()
       WHERE design_id = $1 AND source = 'active_order' AND status = 'active'`,
    [quoteRequest.design_id]
  );

  if (!QUALIFYING_STATUSES.includes(quoteRequest.status)) {
    return { granted: false };
  }

  const graceDays = tenant && Number.isFinite(tenant.active_order_grace_days)
    ? tenant.active_order_grace_days
    : DEFAULT_GRACE_DAYS;
  const eventDate = quoteRequest.event_date ? new Date(quoteRequest.event_date) : new Date();
  const expiresAt = new Date(eventDate.getTime() + graceDays * 24 * 60 * 60 * 1000);

  await db.query(
    `INSERT INTO entitlements
       (tenant_id, design_id, customer_email, source, status, expires_at, source_reference)
     VALUES ($1, $2, $3, 'active_order', 'active', $4, $5)`,
    [quoteRequest.tenant_id, quoteRequest.design_id, quoteRequest.customer_email, expiresAt, quoteRequest.id]
  );

  return { granted: true, expiresAt };
}

module.exports = { syncOrderEntitlement, QUALIFYING_STATUSES };
