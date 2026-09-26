const crypto = require('crypto');
const db = require('./db');
const { getDashboardToken } = require('./dashboardHttpSession');
const { verifyDashboardToken } = require('./dashboardSessions');
const { isConfiguredPlatformAdmin } = require('./middleware/requireAuth');
const { savePermission, permissionDesign } = require('./eventPassAccess');
const { verifyToken } = require('./auth');

const MAX_SCENE_BYTES = 192 * 1024, MAX_CHECKPOINTS = 50, MAX_ALTERNATIVES = 20;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function fail(status, error, code, extra) { const e = new Error(error); Object.assign(e, { status, code }, extra); throw e; }
function bounded(value, name, max, required = false) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail(400, name + ' must be plain text up to ' + max + ' characters.');
  const result = value.trim();
  if (required && !result) fail(400, name + ' is required.');
  return result;
}
function validateScene(scene) {
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) fail(400, 'scene must be an object');
  let encoded;
  try { encoded = JSON.stringify(scene); } catch (_) { fail(400, 'Scene nesting is too complex to save'); }
  if (Buffer.byteLength(encoded, 'utf8') > MAX_SCENE_BYTES) fail(400, 'Design is too large to save');
  for (const key of ['objects', 'zones', 'aisles']) {
    if (scene[key] !== undefined && (!Array.isArray(scene[key]) || scene[key].length > 500)) fail(400, 'Invalid or too many ' + key + ' in this design');
  }
  if (scene.tentId != null && typeof scene.tentId !== 'string') fail(400, 'Invalid tentId');
}
function publicScene(value, depth = 0) {
  if (depth > 64) return null;
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => publicScene(item, depth + 1));
  const result = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (['proto','constructor','prototype','crewnotes','staffnotes','internalnotes','privatenotes','anonymoussessionid','recoverytoken','drafttoken','accesstoken','accessurl','firstname','lastname','fullname','givenname','familyname','billingname','shippingname'].includes(normalized)
        || /email|phone|address/.test(normalized) || /(?:zip|zipcode|postalcode)$/.test(normalized) || /^(?:customer|contact)names?$/.test(normalized)) continue;
    if (normalized === 'customer' || normalized === 'contact') {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        result[key] = Object.fromEntries(Object.entries(item).filter(([name]) => ['date','eventDate','eventName'].includes(name)).map(([name, content]) => [name, publicScene(content, depth + 1)]));
      }
      continue;
    }
    result[key] = publicScene(item, depth + 1);
  }
  return result;
}
function ownerToken(req) {
  const value = req.headers['x-rentsketch-session'] || req.body?.anonymousSessionId;
  return typeof value === 'string' && value.length <= 160 && value.trim() === value ? value : '';
}
async function staffIdentity(req, tenant) {
  try {
    const token = getDashboardToken(req); if (!token) return null;
    const payload = await verifyDashboardToken(token);
    if (await isConfiguredPlatformAdmin(payload)) return payload;
    if (!tenant || !payload.userId) return null;
    const membership = (await db.query('SELECT role FROM tenant_memberships WHERE tenant_id=$1 AND user_id=$2', [tenant.id, payload.userId])).rows[0];
    return membership && ['owner', 'admin', 'staff'].includes(String(membership.role).toLowerCase()) ? payload : null;
  } catch (error) {
    if (error.status === 403) throw error; // Bad cookie origin/CSRF never becomes anonymous access.
    return null;
  }
}
async function scopeFor(req, generic = false) {
  if (generic) return { tenant: null, generic: true };
  const tenant = (await db.query('SELECT * FROM tenants WHERE slug=$1', [req.params.slug])).rows[0];
  if (!tenant) fail(404, 'Tenant not found');
  return { tenant, generic: tenant.slug === 'generic' };
}
function scopedQuery(scope, id, lock = false) {
  return {
    text: 'SELECT * FROM designs WHERE id=$1 AND ' + (scope.generic ? "(tenant_id IS NULL OR tenant_id=(SELECT id FROM tenants WHERE slug='generic'))" : 'tenant_id=$2') + (lock ? ' FOR UPDATE' : ''),
    args: scope.generic ? [id] : [id, scope.tenant.id],
  };
}
async function findDesign(scope, id, execute = db, lock = false) {
  if (!uuid(id)) fail(404, 'Design not found');
  const q = scopedQuery(scope, id, lock);
  const design = (await execute.query(q.text, q.args)).rows[0];
  if (!design) fail(404, 'Design not found');
  return design;
}
async function authorize(req, scope, design) {
  // A generic API does not confer the generic tenant's staff authority over
  // tenant_id NULL consumer designs. Only the configured platform admin can.
  const actualTenant = design.tenant_id ? scope.tenant || (await db.query('SELECT * FROM tenants WHERE id=$1', [design.tenant_id])).rows[0] : null;
  const staff = await staffIdentity(req, actualTenant);
  const owner = ownerToken(req), ownership = await permissionDesign(design);
  if (!staff && (!owner || !ownership.anonymous_session_id || owner !== ownership.anonymous_session_id)) fail(owner ? 404 : 401, 'Open your private event link to access this design.');
  return { staff, tenant: actualTenant };
}
async function permitted(auth, design, scene) {
  const denied = auth.staff ? null : await savePermission(auth.tenant, design, scene);
  if (denied) fail(402, denied.error, denied.code);
}
function expectedRevision(body, design) {
  if (!Number.isSafeInteger(body?.expectedRevision) || body.expectedRevision < 1) fail(428, 'Reload this saved design before saving changes.', 'revision_required', { currentRevision: design.revision });
  if (body.expectedRevision !== design.revision) fail(409, 'This design changed in another tab or device. Review the saved version or keep your work as an alternative.', 'revision_conflict', { currentRevision: design.revision });
}
function number(value, fallback, max, name) {
  if (value === undefined) return fallback;
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) fail(400, 'Invalid ' + name);
  return n;
}
function normalize(body, design = {}, staff) {
  if (body.crewNotes !== undefined && !staff) fail(403, 'Only rental staff can change crew notes.');
  const next = {
    scene: body.scene === undefined ? design.scene : body.scene,
    schema_version: number(body.schemaVersion, design.schema_version || 1, 100, 'schemaVersion'),
    event_type: body.eventType === undefined ? design.event_type || null : body.eventType === null ? null : bounded(body.eventType, 'eventType', 100),
    guest_count: number(body.guestCount, design.guest_count ?? null, 100000, 'guestCount'),
    estimate_total: number(body.estimateTotal, design.estimate_total ?? null, 100000000, 'estimateTotal'),
    project_name: body.projectName === undefined ? design.project_name || '' : bounded(body.projectName, 'Project name', 120),
    site_notes: body.siteNotes === undefined ? design.site_notes || '' : bounded(body.siteNotes, 'Site notes', 4000),
    crew_notes: body.crewNotes === undefined ? design.crew_notes || '' : bounded(body.crewNotes, 'Crew notes', 8000),
  };
  validateScene(next.scene);
  if (!Number.isInteger(next.schema_version) || next.schema_version < 1 || (next.guest_count !== null && !Number.isInteger(next.guest_count))) fail(400, 'Schema version and guest count must be whole numbers.');
  return next;
}
function detail(design, tenant, staff = false) {
  return { id: design.id, tenant: tenant?.slug || 'generic', revision: design.revision,
    scene: design.scene, schemaVersion: design.schema_version, eventType: design.event_type,
    guestCount: design.guest_count, estimateTotal: design.estimate_total,
    projectName: design.project_name || '', siteNotes: design.site_notes || '',
    ...(staff ? { crewNotes: design.crew_notes || '', staffAccess: true } : {}),
    accessDesignId: design.project_root_id || design.id, updatedAt: design.updated_at };
}
async function transaction(work) {
  const client = await db.pool.connect();
  try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function context(req, generic, write = false) {
  const scope = await scopeFor(req, generic);
  const design = await findDesign(scope, req.params.id || req.params.designId);
  const auth = await authorize(req, scope, design);
  return { scope, design, auth };
}
async function edit(req, generic, work) {
  const ctx = await context(req, generic, true);
  return transaction(async client => {
    const root = ctx.design.project_root_id ? await findDesign(ctx.scope, ctx.design.project_root_id, client, true) : null;
    const design = await findDesign(ctx.scope, ctx.design.id, client, true);
    // Anonymous ownership may be rotated between the preliminary read and lock.
    if (!ctx.auth.staff && ownerToken(req) !== (root || design).anonymous_session_id) fail(404, 'Design not found');
    return work(client, design, ctx.auth, ctx.scope);
  });
}
async function create(req, generic) {
  const scope = await scopeFor(req, generic), staff = await staffIdentity(req, scope.tenant);
  const owner = ownerToken(req);
  if (!owner && !staff) fail(400, 'anonymousSessionId is required to create a draft');
  const next = normalize(req.body || {}, {}, staff);
  await permitted({ staff, tenant: scope.tenant }, null, next.scene);
  const result = await db.query(`INSERT INTO designs(tenant_id,owner_user_id,anonymous_session_id,schema_version,event_type,guest_count,scene,estimate_total,project_name,site_notes,crew_notes)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
  [generic ? null : scope.tenant.id, staff?.userId || null, owner || null, next.schema_version, next.event_type, next.guest_count, next.scene, next.estimate_total, next.project_name, next.site_notes, next.crew_notes]);
  return detail(result.rows[0], scope.tenant, !!staff);
}
async function read(req, generic) {
  const { design, auth } = await context(req, generic);
  return detail(design, auth.tenant, !!auth.staff);
}
async function update(req, generic) {
  return edit(req, generic, async (client, design, auth) => {
    expectedRevision(req.body, design);
    const next = normalize(req.body || {}, design, auth.staff);
    await permitted(auth, design, next.scene);
    return write(client, design, next, auth);
  });
}
async function write(client, design, next, auth) {
  const result = await client.query(`UPDATE designs SET scene=$1,schema_version=$2,event_type=$3,guest_count=$4,estimate_total=$5,
    project_name=$6,site_notes=$7,crew_notes=$8,revision=revision+1,updated_at=now() WHERE id=$9 AND revision=$10 RETURNING *`,
  [next.scene, next.schema_version, next.event_type, next.guest_count, next.estimate_total, next.project_name, next.site_notes, next.crew_notes, design.id, design.revision]);
  if (!result.rows[0]) fail(409, 'This design changed. Reload before saving.', 'revision_conflict');
  return { ...detail(result.rows[0], auth.tenant, !!auth.staff), updated: true };
}
function handler(fn, status = 200) {
  return (req, res, next) => Promise.resolve().then(() => fn(req)).then(body => { res.setHeader('Cache-Control', 'no-store'); return res.status(status).json(body); }).catch(error => {
    if ([400,401,402,403,404,409,428,429].includes(error.status)) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(error.status).json({ error: error.message, ...(error.code ? { code: error.code } : {}), ...(error.currentRevision ? { currentRevision: error.currentRevision } : {}) });
    }
    next(error);
  });
}
function register(router, base, generic = false) {
  router.get(base + '/:id', handler(req => read(req, generic)));
  router.get(base + '/:id/revisions', handler(async req => {
    const { design } = await context(req, generic);
    const rows = await db.query('SELECT id,name,source_revision AS "sourceRevision",created_at AS "createdAt" FROM design_revisions WHERE design_id=$1 ORDER BY created_at DESC,id DESC', [design.id]);
    return { revision: design.revision, revisions: rows.rows, limit: MAX_CHECKPOINTS };
  }));
  router.post(base + '/:id/revisions', handler(req => edit(req, generic, async (client, design, auth) => {
    expectedRevision(req.body, design); await permitted(auth, design, design.scene);
    const name = bounded(req.body?.name, 'Checkpoint name', 120, true);
    if (Number((await client.query('SELECT count(*) AS n FROM design_revisions WHERE design_id=$1', [design.id])).rows[0].n) >= MAX_CHECKPOINTS) fail(409, 'This design has 50 saved checkpoints. Create a named alternative to continue.', 'checkpoint_limit');
    const row = (await client.query('INSERT INTO design_revisions(design_id,name,source_revision,snapshot) VALUES($1,$2,$3,$4) RETURNING id,name,source_revision AS "sourceRevision",created_at AS "createdAt"', [design.id, name, design.revision, normalize({}, design, true)])).rows[0];
    return { revision: design.revision, checkpoint: row };
  }), 201));
  router.post(base + '/:id/revisions/:revisionId/restore', handler(req => edit(req, generic, async (client, design, auth) => {
    expectedRevision(req.body, design);
    if (!uuid(req.params.revisionId)) fail(404, 'Checkpoint not found');
    const checkpoint = (await client.query('SELECT snapshot FROM design_revisions WHERE id=$1 AND design_id=$2', [req.params.revisionId, design.id])).rows[0];
    if (!checkpoint) fail(404, 'Checkpoint not found');
    const next = checkpoint.snapshot;
    // Customer restores never overwrite staff-only operational notes.
    if (!auth.staff) next.crew_notes = design.crew_notes;
    validateScene(next.scene); await permitted(auth, design, next.scene);
    return write(client, design, next, auth);
  })));
  router.get(base + '/:id/alternatives', handler(async req => {
    const { design } = await context(req, generic);
    const rows = await db.query(`SELECT id,project_name AS "projectName",revision,updated_at AS "updatedAt" FROM designs
      WHERE (id=$1 OR project_root_id=$1) AND tenant_id IS NOT DISTINCT FROM $2 ORDER BY created_at,id`, [design.project_root_id || design.id, design.tenant_id]);
    return { alternatives: rows.rows, limit: MAX_ALTERNATIVES };
  }));
  router.post(base + '/:id/alternatives', handler(async req => {
    const ctx = await context(req, generic);
    return transaction(async client => {
      // Always lock the root first so two alternatives cannot deadlock when
      // both copy each other and enforce the shared project count atomically.
      const root = await findDesign(ctx.scope, ctx.design.project_root_id || ctx.design.id, client, true);
      const design = root.id === ctx.design.id ? root : await findDesign(ctx.scope, ctx.design.id, client, true);
      if (!ctx.auth.staff && ownerToken(req) !== root.anonymous_session_id) fail(404, 'Design not found');
      expectedRevision(req.body, design);
      const next = normalize({ ...(req.body || {}), projectName: bounded(req.body?.name, 'Alternative name', 120, true) }, design, ctx.auth.staff);
      await permitted(ctx.auth, design, next.scene);
      const count = Number((await client.query('SELECT count(*) AS n FROM designs WHERE id=$1 OR project_root_id=$1', [root.id])).rows[0].n);
      if (count >= MAX_ALTERNATIVES) fail(409, 'This project has 20 alternatives.', 'alternative_limit');
      const row = (await client.query(`INSERT INTO designs(tenant_id,owner_user_id,anonymous_session_id,schema_version,event_type,guest_count,scene,estimate_total,project_name,site_notes,crew_notes,project_root_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [design.tenant_id, design.owner_user_id, root.anonymous_session_id, next.schema_version, next.event_type, next.guest_count, next.scene, next.estimate_total, next.project_name, next.site_notes, next.crew_notes, root.id])).rows[0];
      return detail(row, ctx.auth.tenant, !!ctx.auth.staff);
    });
  }, 201));
  router.post(base + '/:id/share', handler(req => edit(req, generic, async (client, design, auth) => {
    const days = req.body?.expiresInDays === undefined ? 30 : req.body.expiresInDays;
    if (![1,7,30,180].includes(days)) fail(400, 'Choose a share duration of 1, 7, 30, or 180 days.');
    await permitted(auth, design, design.scene);
    if (Number((await client.query('SELECT count(*) AS n FROM design_share_links WHERE design_id=$1 AND revoked_at IS NULL AND expires_at>now()', [design.id])).rows[0].n) >= 20) fail(409, 'Revoke an active share link before creating another.', 'share_limit');
    const token = 'rs2_' + crypto.randomBytes(32).toString('base64url');
    const row = (await client.query(`INSERT INTO design_share_links(design_id,token_hash,expires_at) VALUES($1,$2,now()+$3*interval '1 day') RETURNING id,expires_at AS "expiresAt"`, [design.id, crypto.createHash('sha256').update(token).digest('hex'), days])).rows[0];
    // Keep a bounded inactive history, without removing any live share link.
    await client.query(`DELETE FROM design_share_links WHERE design_id=$1 AND (revoked_at IS NOT NULL OR expires_at<=now()) AND id NOT IN
      (SELECT id FROM design_share_links WHERE design_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100)`, [design.id]);
    return { ...row, expiresInDays: days, url: 'https://rentsketch.com/designer/?tenant=' + encodeURIComponent(auth.tenant?.slug || 'generic') + '#share=' + encodeURIComponent(token) };
  })));
  router.get(base + '/:id/shares', handler(async req => {
    const { design } = await context(req, generic);
    const rows = await db.query('SELECT id,created_at AS "createdAt",expires_at AS "expiresAt",revoked_at AS "revokedAt" FROM design_share_links WHERE design_id=$1 ORDER BY created_at DESC,id DESC LIMIT 120', [design.id]);
    return { shares: rows.rows, legacySharesEnabled: !design.legacy_shares_revoked_at };
  }));
  router.delete(base + '/:id/shares/:shareId', handler(req => edit(req, generic, async (client, design) => {
    if (!uuid(req.params.shareId)) fail(404, 'Share link not found');
    const row = (await client.query('UPDATE design_share_links SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 AND design_id=$2 RETURNING id', [req.params.shareId, design.id])).rows[0];
    if (!row) fail(404, 'Share link not found'); return { ok: true };
  })));
  router.post(base + '/:id/shares/revoke-legacy', handler(req => edit(req, generic, async (client, design) => {
    await client.query('UPDATE designs SET legacy_shares_revoked_at=COALESCE(legacy_shares_revoked_at,now()) WHERE id=$1', [design.id]);
    return { ok: true, legacySharesEnabled: false };
  })));
}
async function restoreShared(req) {
  const scope = await scopeFor(req), token = String(req.body?.token || '');
  let design;
  if (/^rs2_[A-Za-z0-9_-]{43}$/.test(token)) {
    const row = (await db.query('SELECT design_id FROM design_share_links WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()', [crypto.createHash('sha256').update(token).digest('hex')])).rows[0];
    if (!row) fail(404, 'This shared layout link is expired or revoked.');
    design = await findDesign(scope, row.design_id);
  } else {
    let payload;
    try { payload = verifyToken(token); } catch (_) { fail(400, 'This shared layout link is invalid or expired'); }
    if (payload.kind !== 'tenant_design_share' || payload.tenantSlug !== scope.tenant.slug || !uuid(payload.designId)) fail(400, 'Invalid shared layout link');
    design = await findDesign(scope, payload.designId);
    if (design.legacy_shares_revoked_at) fail(404, 'This shared layout link was revoked.');
  }
  // Do not return owner capabilities, staff notes, checkpoint history, or
  // access/recovery links through a read-only share capability.
  const { accessDesignId, ...visible } = detail(design, scope.tenant, false);
  return { ...visible, scene: publicScene(design.scene), readOnly: true };
}
module.exports = { create, read, update, register, handler, restoreShared, detail, staffIdentity, MAX_SCENE_BYTES };
