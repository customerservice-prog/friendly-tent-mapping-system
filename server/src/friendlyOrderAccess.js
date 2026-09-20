const crypto = require('crypto');
const db = require('./db');
const { relay } = require('./eventPassEmail');

async function lookupOrder(input) {
  const result = await relay('event_pass.order_lookup', input);
  if (result.orderAccessVersion !== 1) throw new Error('Order verification is temporarily unavailable. Please try again.');
  const order = result.order;
  if (!order) return null;
  if (typeof order.id !== 'string' || typeof order.customerEmail !== 'string' ||
      !Number.isFinite(Date.parse(order.expiresAt)) || typeof order.eligible !== 'boolean') throw new Error('Invalid order verification response');
  return order;
}

async function orderAccessReady() {
  try { return (await relay('event_pass.order_check', {})).orderAccessVersion === 1; } catch (_) { return false; }
}

async function claimOrder(order, tenant) {
  if (!order?.eligible || tenant?.slug !== 'friendly' || Date.parse(order.expiresAt) <= Date.now()) return null;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    // Lock this booking while finding/creating its single design.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['friendly-order:' + order.id]);
    const existing = (await client.query("SELECT design_id,customer_email FROM entitlements WHERE tenant_id=$1 AND source='friendly_order' AND source_reference=$2", [tenant.id, order.id])).rows[0];
    let id = existing?.design_id;
    if (!id) {
      const scene = { tentId: null, objects: [], zones: [], aisles: [], guestCount: 0, lightingId: 'lighting-none',
        eventName: 'Friendly order #' + order.orderNumber, customer: { name: order.customerName, email: order.customerEmail, date: order.eventDate },
        deliveryZip: order.deliveryZip, surfaceType: order.surfaceType,
        orderStart: { items: (order.items || []).slice(0,200) } };
      // Create ownership on the server after Friendly verifies the booking.
      // Never let a submitted browser session choose the saved design's owner.
      id = (await client.query(`INSERT INTO designs(tenant_id,anonymous_session_id,schema_version,scene)
        VALUES($1,$2,1,$3) RETURNING id`, [tenant.id, crypto.randomBytes(32).toString('hex'), scene])).rows[0].id;
      await client.query(`INSERT INTO entitlements(tenant_id,design_id,customer_email,source,status,expires_at,source_reference)
        VALUES($1,$2,$3,'friendly_order','active',$4,$5)`, [tenant.id,id,order.customerEmail,order.expiresAt,order.id]);
    } else {
      if (existing.customer_email !== order.customerEmail) await client.query('UPDATE designs SET anonymous_session_id=$2 WHERE id=$1', [id,crypto.randomBytes(32).toString('hex')]);
      await client.query("UPDATE entitlements SET status='active',revoked_at=NULL,customer_email=$2,expires_at=$3 WHERE design_id=$1 AND source='friendly_order'", [id,order.customerEmail,order.expiresAt]);
    }
    await client.query('COMMIT');
    checks.delete(id);
    return { id };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

// Recheck the actual booking on reopen and protected writes. A canceled order
// or an outage must not silently unlock editing or trigger another charge.
const checks = new Map();
async function refreshOrderAccess(designId, force = false) {
  const access = (await db.query("SELECT * FROM entitlements WHERE design_id=$1 AND source='friendly_order' LIMIT 1", [designId])).rows[0];
  if (!access) return null;
  const cached = checks.get(designId);
  if (!force && cached && cached.until > Date.now()) return cached.order;
  const order = await lookupOrder({ orderId: access.source_reference, email: access.customer_email });
  const eligible = order?.eligible && Date.parse(order.expiresAt) > Date.now();
  await db.query("UPDATE entitlements SET status=$2,expires_at=COALESCE($3,expires_at),revoked_at=CASE WHEN $2='active' THEN NULL ELSE now() END WHERE id=$1", [access.id,eligible?'active':'revoked',order?.expiresAt||null]);
  if (checks.size > 1000) checks.clear();
  checks.set(designId,{until:Date.now()+60000,order});
  return order;
}

module.exports = { lookupOrder, claimOrder, refreshOrderAccess, orderAccessReady };
