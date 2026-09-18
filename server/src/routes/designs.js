const express = require('express');
const db = require('../db');
const { requireTenantAccess } = require('../middleware/requireAuth');

const router = express.Router();
const buckets = new Map();
const MAX_SCENE_BYTES = 192 * 1024;
const MAX_OBJECTS = 500;

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
}
function limited(key) {
  const now = Date.now(), windowMs = 60 * 60 * 1000, max = 120;
  let b = buckets.get(key);
  if (!b || now - b.start > windowMs) b = { start: now, count: 0 };
  b.count++;
  buckets.set(key, b);
  return b.count > max;
}
function text(v, max) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
function finiteNumber(v, min, max) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : null;
}
function validateScene(scene) {
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) return 'scene must be an object';
  let encoded;
  try { encoded = JSON.stringify(scene); } catch (_) { return 'scene must be valid JSON'; }
  if (Buffer.byteLength(encoded, 'utf8') > MAX_SCENE_BYTES) return 'Design is too large to save';
  for (const key of ['objects', 'zones', 'aisles']) {
    if (scene[key] !== undefined && !Array.isArray(scene[key])) return `${key} must be an array`;
    if (Array.isArray(scene[key]) && scene[key].length > MAX_OBJECTS) return `Too many ${key} in this design`;
  }
  if (scene.tentId !== undefined && typeof scene.tentId !== 'string') return 'Invalid tentId';
  return null;
}

// POST /api/tenants/:slug/designs
// Anonymous-first save used by autosave and quote submission. It is deliberately
// generous enough for normal autosave while bounded against database abuse.
router.post('/:slug/designs', async (req, res) => {
  const tenantResult = await db.query('SELECT id FROM tenants WHERE slug = $1', [req.params.slug]);
  const tenant = tenantResult.rows[0];
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  const ip = clientIp(req);
  if (limited(`${tenant.id}:${ip}`)) return res.status(429).json({ error: 'Too many design saves. Please wait a moment and try again.' });

  const body = req.body || {};
  const sceneError = validateScene(body.scene);
  if (sceneError) return res.status(400).json({ error: sceneError });

  const eventType = text(body.eventType, 100) || null;
  const guestCount = finiteNumber(body.guestCount, 0, 100000);
  const estimateTotal = finiteNumber(body.estimateTotal, 0, 100000000);
  const anonymousSessionId = text(body.anonymousSessionId, 160) || null;
  const schemaVersion = Number.isInteger(Number(body.schemaVersion)) ? Math.max(1, Math.min(100, Number(body.schemaVersion))) : 1;

  const result = await db.query(
    `INSERT INTO designs (tenant_id, anonymous_session_id, schema_version, event_type, guest_count, scene, estimate_total)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [tenant.id, anonymousSessionId, schemaVersion, eventType, guestCount, body.scene, estimateTotal]
  );
  res.status(201).json({ id: result.rows[0].id });
});

// GET /api/tenants/:slug/designs
// Staff-only: recent saved designs, used by the dashboard Overview page.
router.get('/:slug/designs', requireTenantAccess, async (req, res) => {
  const result = await db.query(
    `SELECT id, event_type, guest_count, estimate_total, created_at FROM designs
     WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.tenant.id]
  );
  res.json({ designs: result.rows });
});

module.exports = router;
