// Real isolated Postgres, HTTP, session/CSRF and project operations. No network services.
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const { PGlite } = require('@electric-sql/pglite'), express = require('express'), jwt = require('jsonwebtoken');
const root = path.resolve(__dirname, '..'), pg = new PGlite();
const env = { PLATFORM_ADMIN_EMAIL: 'platform@example.invalid', NODE_ENV: 'test' };
let lock = Promise.resolve(), rejectNextWrite = false;
const db = { query: (sql, args) => pg.query(sql, args), pool: { connect: async () => {
  let release; const prior = lock; lock = new Promise(resolve => release = resolve); await prior;
  return { query: (sql, args) => { if (rejectNextWrite && sql.startsWith('UPDATE designs SET scene=')) { rejectNextWrite = false; throw Error('isolated storage failure'); } return pg.query(sql, args); }, release };
} } };
function load(file, deps) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), { module, exports: module.exports,
    require: name => { if (!(name in deps)) throw Error('Unexpected dependency ' + name); return deps[name]; },
    process: { env }, console, Buffer, URL, Date, setTimeout, clearTimeout, setInterval }, { filename: file });
  return module.exports;
}
const auth = { signToken: (value, options) => jwt.sign(value, 'isolated-project-signing-key', options), verifyToken: value => jwt.verify(value, 'isolated-project-signing-key') };
const sessions = load('server/src/dashboardSessions.js', { crypto, './db': db, './auth': auth });
const httpSession = load('server/src/dashboardHttpSession.js', { crypto, './auth': auth });
const authz = load('server/src/middleware/requireAuth.js', { '../dashboardHttpSession': httpSession, '../dashboardSessions': sessions, '../db': db });
const pass = { isPassEnabled: () => true };
const access = load('server/src/eventPassAccess.js', { './db': db, './eventPass': pass, './friendlyOrderAccess': { refreshOrderAccess: async () => {} } });
const projects = load('server/src/designProjects.js', { crypto, './db': db, './dashboardHttpSession': httpSession, './dashboardSessions': sessions, './middleware/requireAuth': authz, './eventPassAccess': access, './auth': auth });
const designs = load('server/src/routes/designs.js', { express, '../db': db, '../clientIp': require('../server/src/clientIp'), '../middleware/requireAuth': authz, '../designProjects': projects });
const backgrounds = load('server/src/routes/designBackgrounds.js', { express, crypto, '../db': db, '../dashboardHttpSession': httpSession, '../dashboardSessions': sessions, '../middleware/requireAuth': authz, '../eventPassAccess': access });
const resolvedAccess = load('server/src/access.js', { './db': db, './pricing': { EVENT_PASS_CENTS: 999 }, './eventPass': pass });
const accessEmail = load('server/src/eventPassEmail.js', { crypto, './db': db, './auth': auth, './mailer': { getMailer: () => null }, './outboundWebhook': {} });
const consumer = load('server/src/routes/consumerEventPass.js', { express, crypto, '../db': db, '../clientIp': require('../server/src/clientIp'), '../auth': auth, '../dashboardHttpSession': httpSession, '../dashboardSessions': sessions, '../middleware/requireAuth': authz, '../eventPassAccess': access, '../access': resolvedAccess, '../eventPass': pass, '../eventPassEmail': accessEmail, '../friendlyOrderAccess': { refreshOrderAccess: async () => null }, '../designProjects': projects });
const app = express(); app.use(express.json({ limit: '250kb' })); app.use('/api/tenants', designs, backgrounds); app.use('/api/consumer', consumer, backgrounds);
app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal server error' }));
let server, base;
const tenant = '00000000-0000-4000-8000-000000000001', other = '00000000-0000-4000-8000-000000000002', generic = '00000000-0000-4000-8000-000000000003';
const owner = 'owner-browser-private-capability', otherOwner = 'another-private-browser-capability';
const preview = { tentId: null, objects: [], zones: [], aisles: [] }, layout = { tentId: 'frame-20x20', objects: [{ id: 't1', kind: 'table', x: 2, y: 2 }] };
async function request(url, method = 'GET', body, headers = {}) {
  const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})), cache: response.headers.get('cache-control') };
}
const own = { 'x-rentsketch-session': owner };
const post = (url, body = {}, headers = own) => request(url, 'POST', body, headers);
const patch = (url, body, headers = own) => request(url, 'PATCH', body, headers);
const get = (url, headers = own) => request(url, 'GET', undefined, headers);
async function paid(id) { await pg.query("INSERT INTO entitlements(design_id,source,status,expires_at) VALUES($1,'consumer_purchase','active',now()+interval '1 day')", [id]); }
async function staff(role, tenantId = tenant, platform = false) {
  const id = crypto.randomUUID(); await pg.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)', [id, platform ? env.PLATFORM_ADMIN_EMAIL : id + '@example.invalid', 'fixture-hash']);
  if (role) await pg.query('INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,$3)', [tenantId, id, role]);
  const issued = await sessions.createDashboardSession({ id });
  return { origin: 'https://rentsketch.com', 'sec-fetch-site': 'same-origin', cookie: '__Host-rentsketch_dashboard=' + issued.token, 'x-rentsketch-csrf': httpSession.publicDashboardSession(issued.token).csrfToken };
}
(async () => {
  await pg.exec(`CREATE TABLE tenants(id uuid PRIMARY KEY,slug text UNIQUE,subscription_status text,customer_access text);
    CREATE TABLE users(id uuid PRIMARY KEY,email text,password_hash text);
    CREATE TABLE tenant_memberships(tenant_id uuid,user_id uuid,role text);
    CREATE TABLE designs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid REFERENCES tenants(id),owner_user_id uuid,anonymous_session_id text,schema_version int DEFAULT 1,event_type text,guest_count int,scene jsonb,estimate_total numeric,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
  for (const name of ['004_entitlements.sql','011_event_pass_access_email.sql','018_design_background_photos.sql','019_generic_design_background_photos.sql','020_dashboard_sessions.sql','021_account_security.sql','022_design_projects.sql']) await pg.exec(fs.readFileSync(path.join(root, 'server/migrations', name), 'utf8'));
  await pg.query("INSERT INTO tenants(id,slug,subscription_status) VALUES($1,'friendly','active'),($2,'other','active'),($3,'generic','active')", [tenant, other, generic]);
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port;
  let r = await post('/api/tenants/friendly/designs', { scene: preview, projectName: 'Wedding plan', siteNotes: 'Driveway gate 8 ft' });
  assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body.revision, 1);
  const id = r.body.id, url = '/api/tenants/friendly/designs/' + id;
  assert.equal((await get(url, {})).status, 401); assert.equal((await get(url, { 'x-rentsketch-session': otherOwner })).status, 404);
  assert.equal((await get(url.replace('friendly', 'other'))).status, 404);
  assert.equal((await get('/api/consumer/designs/' + id)).status, 404, 'generic cannot read tenant data');
  assert.equal((await patch(url, { scene: preview })).status, 428, 'old client cannot overwrite without revision');
  assert.equal((await patch(url, { scene: layout, expectedRevision: 1 })).status, 402, 'ownership does not replace paid access');
  await paid(id);
  const writers = await Promise.all([patch(url, { scene: layout, expectedRevision: 1 }), patch(url, { scene: preview, expectedRevision: 1 })]);
  assert.deepEqual(writers.map(x => x.status).sort(), [200,409]); assert.equal(writers.find(x => x.status === 409).body.currentRevision, 2);
  assert.equal((await get(url)).body.revision, 2); assert.equal(Number((await pg.query('SELECT count(*) AS n FROM design_revisions')).rows[0].n), 0, 'autosave stores no unbounded snapshots');
  assert.equal((await patch(url, { expectedRevision: 2, projectName: 'x'.repeat(121) })).status, 400);
  assert.equal((await patch(url, { expectedRevision: 2, crewNotes: 'private crew' })).status, 403);
  const staffHeaders = await staff('staff'), viewerHeaders = await staff('viewer'), outsiderHeaders = await staff('owner', other);
  assert.equal((await get(url, viewerHeaders)).status, 401); assert.equal((await get(url, outsiderHeaders)).status, 401);
  assert.equal((await get(url, staffHeaders)).status, 200, 'staff can open customer design without stealing owner credential');
  assert.equal((await get(url, staffHeaders)).body.anonymousSessionId, undefined);
  assert.equal((await patch(url, { expectedRevision: 2, crewNotes: 'Gate key with crew lead' }, { ...staffHeaders, 'x-rentsketch-csrf': '' })).status, 403);
  r = await patch(url, { expectedRevision: 2, crewNotes: 'Gate key with crew lead', scene: layout }, staffHeaders); assert.equal(r.status, 200); assert.equal(r.body.revision, 3);
  assert.equal((await get(url)).body.crewNotes, undefined);
  console.log('PASS atomic optimistic saves, old-client rejection, tenant/owner/staff boundaries, CSRF, bounded private metadata');

  const checkpoint = await post(url + '/revisions', { expectedRevision: 3, name: 'Approved tables' });
  assert.equal(checkpoint.status, 201); assert.equal(checkpoint.body.revision, 3); const checkpointId = checkpoint.body.checkpoint.id;
  assert.equal((await patch(url, { expectedRevision: 3, scene: preview, siteNotes: 'changed site' })).body.revision, 4);
  assert.equal((await post(url + '/revisions/' + checkpointId + '/restore', { expectedRevision: 3 })).status, 409);
  const restored = await post(url + '/revisions/' + checkpointId + '/restore', { expectedRevision: 4 });
  assert.equal(restored.status, 200); assert.equal(restored.body.revision, 5); assert.deepEqual(restored.body.scene, layout);
  assert.equal((await get(url + '/revisions')).body.revisions.length, 1);
  assert.equal((await get(url, staffHeaders)).body.crewNotes, 'Gate key with crew lead');
  rejectNextWrite = true; assert.equal((await post(url + '/revisions/' + checkpointId + '/restore', { expectedRevision: 5 })).status, 500);
  assert.equal((await get(url)).body.revision, 5, 'failed restore cannot partially advance revision');
  const copy = await post(url + '/alternatives', { expectedRevision: 5, name: 'Rain option', scene: { ...layout, tentId: 'frame-30x30' } });
  assert.equal(copy.status, 201); assert.equal(copy.body.revision, 1); assert.equal(copy.body.accessDesignId, id); const copyUrl = '/api/tenants/friendly/designs/' + copy.body.id;
  assert.equal((await get(url)).body.scene.tentId, 'frame-20x20', 'alternative preserves unsaved scene without replacing original');
  assert.equal((await post(copyUrl + '/revisions/' + checkpointId + '/restore', { expectedRevision: 1 })).status, 404);
  assert.equal((await get(url + '/alternatives')).body.alternatives.length, 2);
  await pg.query("INSERT INTO consumer_payments(design_id,customer_email,amount_cents,status) VALUES($1,'paid-owner@example.invalid',999,'paid')", [id]);
  const copyResume = await post('/api/consumer/event-pass/resume', { designId: copy.body.id, anonymousSessionId: owner });
  assert.equal(copyResume.status, 200); assert.ok(copyResume.body.accessUrl);
  const recoveryToken = new URLSearchParams(new URL(copyResume.body.accessUrl).hash.slice(1)).get('recoveryToken');
  const recoveredCopy = await post('/api/consumer/event-pass/restore', { recoveryToken }, {});
  assert.equal(recoveredCopy.status, 200); assert.equal(recoveredCopy.body.id, copy.body.id); assert.equal(recoveredCopy.body.scene.tentId, 'frame-30x30'); assert.equal(recoveredCopy.body.accessDesignId, id);
  const wrongEmailRecovery = auth.signToken({ kind: 'consumer_design_recovery', designId: copy.body.id, email: 'wrong-owner@example.invalid' }, { expiresIn: '1h' });
  assert.equal((await post('/api/consumer/event-pass/restore', { recoveryToken: wrongEmailRecovery }, {})).status, 404);
  assert.equal((await patch(copyUrl, { expectedRevision: 1, siteNotes: 'Rain day' })).status, 200);
  assert.equal((await get('/api/consumer/designs/' + copy.body.id + '/access', {})).body.paymentRequired, false);
  assert.equal((await post('/api/consumer/designs/' + copy.body.id + '/event-pass/checkout-session', { anonymousSessionId: owner })).body.accessDesignId, id);
  await pg.query("UPDATE entitlements SET status='revoked' WHERE design_id=$1", [id]);
  assert.equal((await patch(copyUrl, { expectedRevision: 2, scene: layout })).status, 402);
  assert.equal((await post(copyUrl + '/alternatives', { expectedRevision: 2, name: 'Unauthorized paid copy' })).status, 402);
  assert.equal((await get('/api/consumer/designs/' + copy.body.id + '/access', {})).body.paymentRequired, true);
  await pg.query("UPDATE entitlements SET status='active' WHERE design_id=$1", [id]);
  await pg.query('UPDATE designs SET anonymous_session_id=$2 WHERE id=$1', [id, otherOwner]);
  assert.equal((await get(copyUrl)).status, 404, 'booking ownership rotation also invalidates copied owner capabilities');
  assert.equal((await get(copyUrl, { 'x-rentsketch-session': otherOwner })).status, 200);
  await pg.query('UPDATE designs SET anonymous_session_id=$2 WHERE id=$1', [id, owner]);
  console.log('PASS immutable named checkpoints, restore revision/rollback, alternate local work, inherited live entitlement and root ownership');

  const photoComposition = { mode: 'ground-plane', confirmed: true, camera: { position: [0,5,12], target: [0,0,0], fov: 50 }, sourcePhotoId: 'approved-photo' };
  const scanGeometry = { frames: [{ url: 'https://api.example.invalid/background-photo/approved-photo?t=photo-capability', position: [1,2,3] }], bounds: { width: 40, depth: 60 } };
  await pg.query('UPDATE designs SET scene=$2 WHERE id=$1', [id, { ...layout, eventName: 'Autumn event', photoComposition, venueScan: scanGeometry, customer: { name: 'Private owner', email: 'private@example.invalid', phone: 'private-phone', date: '2026-10-05' }, customerName: 'private flat name', contactNames: ['private names'], metadata: { firstName: 'private first', lastName: 'private last', fullName: 'private full', phoneNumber: 'private phone', emailAddresses: ['private email'], product: { name: 'Premium table' } }, deliveryZip: 'private-zip', crewNotes: 'private nested crew', venue: { address: 'private street', staffNotes: 'private access' } }]);
  const shared = await post(url + '/share', { expiresInDays: 7 }); assert.equal(shared.status, 200); assert.equal(shared.body.expiresInDays, 7);
  const token = new URLSearchParams(new URL(shared.body.url).hash.slice(1)).get('share');
  const open = () => post('/api/tenants/friendly/shared-design/restore', { token }, {});
  r = await open(); assert.equal(r.status, 200); assert.equal(r.body.readOnly, true); assert.equal(r.body.crewNotes, undefined); assert.equal(r.body.anonymousSessionId, undefined); assert.equal(r.body.accessDesignId, undefined);
  assert.equal(r.body.scene.eventName, 'Autumn event'); assert.equal(r.body.scene.customer.date, '2026-10-05'); assert.deepEqual(r.body.scene.objects, layout.objects);
  assert.deepEqual(r.body.scene.photoComposition, photoComposition); assert.deepEqual(r.body.scene.venueScan, scanGeometry);
  assert.equal(r.body.scene.metadata.product.name, 'Premium table');
  assert.ok(!JSON.stringify(r.body).includes('private'), 'share strips embedded contact/address/crew fields and customer identity without affecting geometry');
  assert.equal((await get(url + '/revisions', { 'x-rentsketch-session': token })).status, 404);
  assert.equal((await post(url + '/alternatives', { expectedRevision: 5, name: 'stolen', anonymousSessionId: token }, {})).status, 404);
  assert.equal((await post('/api/tenants/other/shared-design/restore', { token }, {})).status, 404);
  assert.equal((await request(copyUrl + '/shares/' + shared.body.id, 'DELETE', undefined, own)).status, 404);
  assert.equal((await request(url + '/shares/' + shared.body.id, 'DELETE', undefined, own)).status, 200); assert.equal((await open()).status, 404);
  const expiring = await post(url + '/share', { expiresInDays: 1 });
  await pg.query("UPDATE design_share_links SET expires_at=now()-interval '1 second' WHERE id=$1", [expiring.body.id]);
  assert.equal((await post('/api/tenants/friendly/shared-design/restore', { token: new URLSearchParams(new URL(expiring.body.url).hash.slice(1)).get('share') }, {})).status, 404);
  const legacy = auth.signToken({ kind: 'tenant_design_share', designId: id, tenantSlug: 'friendly' }, { expiresIn: '1d' });
  assert.equal((await post('/api/tenants/friendly/shared-design/restore', { token: legacy }, {})).status, 200);
  assert.equal((await post(url + '/shares/revoke-legacy')).status, 200);
  assert.equal((await post('/api/tenants/friendly/shared-design/restore', { token: legacy }, {})).status, 404);
  assert.equal((await get(url + '/shares')).body.legacySharesEnabled, false);
  console.log('PASS independently revocable/expiring read-only share capabilities, no edit credentials/private notes, legacy revocation');

  const createdGeneric = await post('/api/consumer/designs', { scene: preview }); assert.equal(createdGeneric.status, 201);
  const genericUrl = '/api/consumer/designs/' + createdGeneric.body.id;
  assert.equal((await patch(genericUrl, { expectedRevision: 1, siteNotes: 'Generic notes' })).body.revision, 2);
  assert.equal((await patch(genericUrl, { scene: preview })).status, 428);
  assert.equal((await get('/api/tenants/friendly/designs/' + createdGeneric.body.id)).status, 404);
  const genericStaff = await staff('owner', generic); assert.equal((await get(genericUrl, genericStaff)).status, 401, 'generic company membership never accesses NULL consumer designs');
  const genericShare = await post(genericUrl + '/share', { expiresInDays: 30 });
  assert.equal((await post('/api/tenants/generic/shared-design/restore', { token: new URLSearchParams(new URL(genericShare.body.url).hash.slice(1)).get('share') }, {})).status, 200);
  assert.equal((await post('/api/consumer/event-pass/resume', { designId: createdGeneric.body.id, anonymousSessionId: owner })).body.revision, 2);
  console.log('PASS generic/NULL project contract, same optimistic guards, generic company boundary and revision-aware resume');

  const photoResponse = await fetch(base + url + '/background-photo', { method: 'POST', headers: { 'content-type': 'image/jpeg', ...own }, body: Buffer.from([255,216,255,224,0,16,255,217]) });
  const photo = await photoResponse.json(); assert.equal(photoResponse.status, 201); const photoUrl = url + '/background-photo/' + photo.id;
  assert.equal((await patch(url, { expectedRevision: 5, scene: { ...layout, backgroundPhoto: { id: photo.id, url: 'https://api.example.invalid' + photo.path } } })).status, 200);
  const photoCheckpoint = await post(url + '/revisions', { expectedRevision: 6, name: 'Photo approved' }); assert.equal(photoCheckpoint.status, 201);
  assert.equal((await patch(url, { expectedRevision: 6, scene: layout })).status, 200);
  assert.equal((await request(photoUrl, 'DELETE', undefined, own)).body.retained, true);
  // More than the previous retention limit must not remove a checkpoint photo.
  for (let i=0;i<17;i++) await fetch(base + url + '/background-photo', { method: 'POST', headers: { 'content-type': 'image/jpeg', ...own }, body: Buffer.from([255,216,255,224,0,16,255,217]) });
  assert.equal((await pg.query('SELECT count(*) AS n FROM design_background_photos WHERE id=$1', [photo.id])).rows[0].n, 1);
  assert.equal((await post(url + '/revisions/' + photoCheckpoint.body.checkpoint.id + '/restore', { expectedRevision: 7 })).body.scene.backgroundPhoto.id, photo.id);
  assert.equal((await request(photoUrl, 'DELETE', undefined, own)).body.retained, true, 'live scene references protect asset too');
  await pg.query(`INSERT INTO design_revisions(design_id,name,source_revision,snapshot) SELECT $1,'retained-'||n,1,$2 FROM generate_series(1,48) n`, [id, { scene: preview }]);
  assert.equal((await post(url + '/revisions', { expectedRevision: 8, name: 'over limit' })).body.code, 'checkpoint_limit');
  assert.equal((await get(url + '/revisions')).body.revisions.length, 50, 'named checkpoints never silently deleted');
  console.log('PASS photo retention across named checkpoints/current scenes and automatic cleanup; explicit bounded immutable history');

  const quotaProject = await post('/api/tenants/friendly/designs', { scene: preview }); await paid(quotaProject.body.id);
  const quotaUrl = '/api/tenants/friendly/designs/' + quotaProject.body.id;
  const quotaCopy = await post(quotaUrl + '/alternatives', { expectedRevision: 1, name: 'Quota sibling' });
  const seedIds = Array.from({ length: 127 }, () => crypto.randomUUID());
  await pg.query('UPDATE designs SET scene=$2 WHERE id=$1', [quotaProject.body.id, { ...preview, venueScan: { frames: seedIds.map(id => ({ url: 'https://api.example.invalid/background-photo/' + id })) } }]);
  for (let i = 0; i < seedIds.length; i++) await pg.query(`INSERT INTO design_background_photos(id,design_id,tenant_id,access_token_hash,mime_type,byte_size,image_bytes)
    VALUES($1,$2,$3,$4,'image/jpeg',8,$5)`, [seedIds[i], i === 126 ? quotaCopy.body.id : quotaProject.body.id, tenant, 'fixture-' + i, Buffer.from([255,216,255,224,0,16,255,217])]);
  const upload = async designId => {
    const result = await fetch(base + '/api/tenants/friendly/designs/' + designId + '/background-photo', { method: 'POST', headers: { 'content-type': 'image/jpeg', ...own }, body: Buffer.from([255,216,255,224,0,16,255,217]) });
    return { status: result.status, body: await result.json() };
  };
  const concurrentUploads = await Promise.all([upload(quotaProject.body.id), upload(quotaCopy.body.id)]);
  assert.deepEqual(concurrentUploads.map(value => value.status).sort(), [201,413], 'one root lock makes the quota atomic across alternatives');
  assert.equal(concurrentUploads.find(value => value.status === 413).body.code, 'project_photo_limit');
  assert.equal(Number((await pg.query('SELECT count(*) AS n FROM design_background_photos p JOIN designs d ON p.design_id=d.id WHERE d.id=$1 OR d.project_root_id=$1', [quotaProject.body.id])).rows[0].n), 128);
  const byteQuota = await post('/api/tenants/friendly/designs', { scene: preview }); await paid(byteQuota.body.id);
  await pg.query(`INSERT INTO design_background_photos(design_id,tenant_id,access_token_hash,mime_type,byte_size,image_bytes)
    SELECT $1,$2,'bytes-'||n,'image/jpeg',4194304,$3 FROM generate_series(1,64) n`, [byteQuota.body.id, tenant, Buffer.from([255,216,255,224,0,16,255,217])]);
  assert.equal((await upload(byteQuota.body.id)).status, 413, 'byte budget applies before the count budget');
  console.log('PASS atomic 128-photo/256-MiB project quota across alternatives without deleting referenced captures');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { server?.close(); await pg.close(); });
