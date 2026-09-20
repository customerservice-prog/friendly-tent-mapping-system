const express = require('express');
const db = require('../db');
const { requireTenantAccess } = require('../middleware/requireAuth');
const { savePermission } = require('../eventPassAccess');

const router = express.Router();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
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
  // Outdoor inflatable layouts intentionally have no tent selection.
  if (scene.tentId != null && typeof scene.tentId !== 'string') return 'Invalid tentId';
  return null;
}
function normalizedBody(body) {
  body = body || {};
  return {
    scene: body.scene,
    eventType: text(body.eventType, 100) || null,
    guestCount: finiteNumber(body.guestCount, 0, 100000),
    estimateTotal: finiteNumber(body.estimateTotal, 0, 100000000),
    anonymousSessionId: text(body.anonymousSessionId, 160) || null,
    schemaVersion: Number.isInteger(Number(body.schemaVersion)) ? Math.max(1, Math.min(100, Number(body.schemaVersion))) : 1,
  };
}
async function tenantForSlug(slug) {
  return (await db.query('SELECT id,slug FROM tenants WHERE slug = $1', [slug])).rows[0] || null;
}
function rateLimitSave(req, tenant) {
  return limited(`${tenant.id}:${clientIp(req)}`);
}

// POST /api/tenants/:slug/designs
// Creates the first anonymous design snapshot. Subsequent autosaves should use
// PATCH /:id with the same anonymousSessionId so one browser draft stays one
// design row instead of creating a new database record every few seconds.
router.post('/:slug/designs', wrap(async (req, res) => {
  const tenant = await tenantForSlug(req.params.slug);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  if (rateLimitSave(req, tenant)) return res.status(429).json({ error: 'Too many design saves. Please wait a moment and try again.' });

  const body = normalizedBody(req.body);
  const sceneError = validateScene(body.scene);
  if (sceneError) return res.status(400).json({ error: sceneError });

  const denied = await savePermission(tenant, null, body.scene);
  if (denied) return res.status(402).json(denied);

  const result = await db.query(
    `INSERT INTO designs (tenant_id, anonymous_session_id, schema_version, event_type, guest_count, scene, estimate_total)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [tenant.id, body.anonymousSessionId, body.schemaVersion, body.eventType, body.guestCount, body.scene, body.estimateTotal]
  );
  res.status(201).json({ id: result.rows[0].id });
}));

// PATCH /api/tenants/:slug/designs/:id
// Anonymous draft update. The session id acts as the draft ownership token and
// must match both the requested tenant and the existing design row. A caller
// cannot update another anonymous customer's design by guessing its UUID.
router.patch('/:slug/designs/:id', wrap(async (req, res) => {
  const tenant = await tenantForSlug(req.params.slug);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  if (rateLimitSave(req, tenant)) return res.status(429).json({ error: 'Too many design saves. Please wait a moment and try again.' });

  const body = normalizedBody(req.body);
  if (!body.anonymousSessionId) return res.status(400).json({ error: 'anonymousSessionId is required to update a draft' });
  const sceneError = validateScene(body.scene);
  if (sceneError) return res.status(400).json({ error: sceneError });

  const design = (await db.query('SELECT * FROM designs WHERE id=$1 AND tenant_id=$2 AND anonymous_session_id=$3', [req.params.id, tenant.id, body.anonymousSessionId])).rows[0];
  if (!design) return res.status(404).json({ error: 'Draft not found for this session' });
  const denied = await savePermission(tenant, design, body.scene);
  if (denied) return res.status(402).json(denied);

  const result = await db.query(
    `UPDATE designs
       SET schema_version=$1,event_type=$2,guest_count=$3,scene=$4,estimate_total=$5,updated_at=now()
     WHERE id=$6 AND tenant_id=$7 AND anonymous_session_id=$8
     RETURNING id`,
    [body.schemaVersion, body.eventType, body.guestCount, body.scene, body.estimateTotal, req.params.id, tenant.id, body.anonymousSessionId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Draft not found for this session' });
  res.json({ id: result.rows[0].id, updated: true });
}));

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
