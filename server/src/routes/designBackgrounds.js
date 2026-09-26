const express = require('express');
const { verifyDashboardToken } = require('../dashboardSessions');
const crypto = require('crypto');
const db = require('../db');
const { isConfiguredPlatformAdmin } = require('../middleware/requireAuth');
const { savePermission } = require('../eventPassAccess');

const router = express.Router();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const MAX_BYTES = 4 * 1024 * 1024;
const rawPhoto = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_BYTES });

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function tokenHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}
function bearer(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}
function photoType(buf) {
  if (!Buffer.isBuffer(buf) || !buf.length) return null;
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
async function tenantForSlug(slug) {
  return (await db.query('SELECT * FROM tenants WHERE slug=$1', [slug])).rows[0] || null;
}
async function designFor(tenantId, designId) {
  return (await db.query('SELECT * FROM designs WHERE id=$1 AND tenant_id=$2', [designId, tenantId])).rows[0] || null;
}
async function genericDesignFor(designId) {
  return (await db.query(
    "SELECT * FROM designs WHERE id=$1 AND (tenant_id IS NULL OR tenant_id=(SELECT id FROM tenants WHERE slug='generic'))",
    [designId]
  )).rows[0] || null;
}
async function staffAllowed(req, tenant) {
  const token = bearer(req);
  if (!token) return false;
  try {
    const payload = await verifyDashboardToken(token);
    if (await isConfiguredPlatformAdmin(payload)) return true;
    if (!tenant || !payload.userId) return false;
    const row = (await db.query(
      'SELECT role FROM tenant_memberships WHERE tenant_id=$1 AND user_id=$2',
      [tenant.id, payload.userId]
    )).rows[0];
    return !!row && ['owner','admin','staff'].includes(String(row.role || '').toLowerCase());
  } catch (_) {
    return false;
  }
}
async function editPermission(req, tenant, design) {
  if (await staffAllowed(req, tenant)) return { ok: true, ownerSession: design.anonymous_session_id || null };
  const session = clean(req.headers['x-rentsketch-session'], 160);
  if (!session || !design.anonymous_session_id || session !== design.anonymous_session_id) {
    return { ok: false, status: 403, body: { error: 'This design does not belong to this editing session.' } };
  }
  const denied = await savePermission(tenant, design, design.scene);
  if (denied) return { ok: false, status: 402, body: denied };
  return { ok: true, ownerSession: session };
}


async function storePhoto(req, res, tenant, design, pathPrefix) {
  const permission = await editPermission(req, tenant, design);
  if (!permission.ok) return res.status(permission.status).json(permission.body);
  if (!Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(415).json({ error: 'Choose a JPG, PNG, or WebP photo.' });
  }
  if (req.body.length > MAX_BYTES) return res.status(413).json({ error: 'Photo is too large after compression.' });
  const detected = photoType(req.body);
  if (!detected) return res.status(415).json({ error: 'Unsupported or invalid image file.' });

  const accessToken = crypto.randomBytes(24).toString('base64url');
  const tenantId = tenant?.id || design.tenant_id || null;
  const result = await db.query(
    `INSERT INTO design_background_photos
       (design_id,tenant_id,anonymous_session_id,access_token_hash,mime_type,byte_size,image_bytes)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,created_at`,
    [design.id, tenantId, permission.ownerSession, tokenHash(accessToken), detected, req.body.length, req.body]
  );
  await db.query(
    `DELETE FROM design_background_photos
      WHERE design_id=$1 AND id NOT IN (
        SELECT id FROM design_background_photos WHERE design_id=$1 ORDER BY created_at DESC LIMIT 16
      )`,
    [design.id]
  );
  const id = result.rows[0].id;
  const path = pathPrefix + encodeURIComponent(id) + '?t=' + encodeURIComponent(accessToken);
  return res.status(201).json({ id, path, mimeType: detected, byteSize: req.body.length, createdAt: result.rows[0].created_at });
}
function sendPhoto(res, row, supplied) {
  if (!row || !supplied) return res.status(404).end();
  const expected = Buffer.from(row.access_token_hash, 'hex');
  const actual = Buffer.from(tokenHash(supplied), 'hex');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return res.status(404).end();
  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
  res.setHeader('Content-Length', row.image_bytes.length);
  return res.end(row.image_bytes);
}

router.post('/:slug/designs/:id/background-photo', rawPhoto, wrap(async (req, res) => {
  const tenant = await tenantForSlug(req.params.slug);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  const design = await designFor(tenant.id, req.params.id);
  if (!design) return res.status(404).json({ error: 'Design not found' });
  return storePhoto(req, res, tenant, design, '/api/tenants/' + encodeURIComponent(tenant.slug) + '/background-photo/');
}));

router.get('/:slug/background-photo/:photoId', wrap(async (req, res) => {
  const tenant = await tenantForSlug(req.params.slug);
  if (!tenant) return res.status(404).end();
  const row = (await db.query(
    `SELECT mime_type,image_bytes,access_token_hash
       FROM design_background_photos
      WHERE id=$1 AND tenant_id=$2`,
    [req.params.photoId, tenant.id]
  )).rows[0];
  return sendPhoto(res, row, clean(req.query.t, 200));
}));

router.delete('/:slug/designs/:id/background-photo/:photoId', wrap(async (req, res) => {
  const tenant = await tenantForSlug(req.params.slug);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  const design = await designFor(tenant.id, req.params.id);
  if (!design) return res.status(404).json({ error: 'Design not found' });
  const permission = await editPermission(req, tenant, design);
  if (!permission.ok) return res.status(permission.status).json(permission.body);
  await db.query('DELETE FROM design_background_photos WHERE id=$1 AND design_id=$2 AND tenant_id=$3', [req.params.photoId, design.id, tenant.id]);
  res.json({ ok: true });
}));


/* Generic/Event Pass Photo Match routes.
   These designs are saved through /api/consumer and normally have tenant_id NULL. */
router.post('/designs/:id/background-photo', rawPhoto, wrap(async (req, res) => {
  const design = await genericDesignFor(req.params.id);
  if (!design) return res.status(404).json({ error: 'Design not found' });
  return storePhoto(req, res, null, design, '/api/consumer/background-photo/');
}));

router.get('/background-photo/:photoId', wrap(async (req, res) => {
  const row = (await db.query(
    `SELECT p.mime_type,p.image_bytes,p.access_token_hash
       FROM design_background_photos p
       JOIN designs d ON d.id=p.design_id
      WHERE p.id=$1
        AND (d.tenant_id IS NULL OR d.tenant_id=(SELECT id FROM tenants WHERE slug='generic'))`,
    [req.params.photoId]
  )).rows[0];
  return sendPhoto(res, row, clean(req.query.t, 200));
}));

router.delete('/designs/:id/background-photo/:photoId', wrap(async (req, res) => {
  const design = await genericDesignFor(req.params.id);
  if (!design) return res.status(404).json({ error: 'Design not found' });
  const permission = await editPermission(req, null, design);
  if (!permission.ok) return res.status(permission.status).json(permission.body);
  await db.query(
    `DELETE FROM design_background_photos
      WHERE id=$1 AND design_id=$2`,
    [req.params.photoId, design.id]
  );
  res.json({ ok: true });
}));

module.exports = router;
