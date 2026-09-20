const db = require('./db');
const { isPassEnabled } = require('./eventPass');

// A free checkpoint contains only the rental being inspected. It cannot hold
// a furnished event, lighting order, guest plan, zones, or uploaded full layout.
function isPreviewScene(scene) {
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) return false;
  if (!Array.isArray(scene.objects) || scene.objects.length > 1) return false;
  if ((scene.zones && (!Array.isArray(scene.zones) || scene.zones.length)) ||
      (scene.aisles && (!Array.isArray(scene.aisles) || scene.aisles.length))) return false;
  if (Number(scene.guestCount || 0) !== 0 || scene.needDance || scene.lastTableConfig || scene.matchedPackageId) return false;
  if (scene.lightingId && scene.lightingId !== 'lighting-none') return false;
  if (scene.objects.length) {
    const item = scene.objects[0];
    return scene.tentId == null && item && item.kind === 'inflatable' && typeof item.inflatableId === 'string';
  }
  return scene.tentId == null || typeof scene.tentId === 'string';
}

async function activePass(designId) {
  await require('./friendlyOrderAccess').refreshOrderAccess(designId);
  return (await db.query("SELECT id,expires_at FROM entitlements WHERE design_id=$1 AND status='active' AND (expires_at IS NULL OR expires_at>now()) LIMIT 1", [designId])).rows[0] || null;
}

async function savePermission(tenant, design, scene) {
  if (!isPassEnabled(tenant)) return null;
  if (design && await activePass(design.id)) return null;
  const paid = design && (await db.query("SELECT id FROM consumer_payments WHERE design_id=$1 AND status='paid' LIMIT 1", [design.id])).rows.length;
  const booked = design && (await db.query("SELECT id FROM entitlements WHERE design_id=$1 AND source='friendly_order' LIMIT 1", [design.id])).rows.length;
  if (!paid && !booked && isPreviewScene(scene)) return null;
  if (booked && !paid) return { error: 'This booking’s included design access is no longer active. Contact Friendly about your booking or choose an Event Pass.', code: 'event_pass_required' };
  return { error: paid ? 'Your Event Pass has expired. Renew to keep editing this event.' : 'Choose an Event Pass to arrange and save your event. The rental preview is free.', code: paid ? 'event_pass_expired' : 'event_pass_required' };
}

module.exports = { isPreviewScene, activePass, savePermission };
