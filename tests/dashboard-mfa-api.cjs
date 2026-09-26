// RFC vectors, actual crypto, real SQL in isolated Postgres, and HTTP routes.
// Never enrolls an account, sends an email, or changes production credentials.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');
const express = require('express');
const root = path.resolve(__dirname, '..');
const pg = new PGlite();
const env = { NODE_ENV: 'test', JWT_SECRET: 'isolated-mfa-key-never-used-in-production', MFA_ENCRYPTION_KEY: 'a1'.repeat(32) };
let tail = Promise.resolve();
// PGlite exposes one connection. Serialize transactions like conflicting user
// row locks in Postgres; simultaneous callers still exercise one-use guards.
const db = { query: (sql, values) => pg.query(sql, values), pool: { async connect() {
  const previous = tail; let release;
  tail = new Promise(resolve => { release = resolve; });
  await previous;
  return { query: (sql, values) => pg.query(sql, values), release };
} } };
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const userId = '10000000-0000-4000-8000-000000000001';
const otherId = '10000000-0000-4000-8000-000000000002';
let password = 'isolated-test-password';
function load(file, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    module, exports: module.exports, require: name => {
      assert.ok(name in dependencies, 'Unexpected dependency ' + name);
      return dependencies[name];
    }, process: { env }, Buffer, console, Date, URL,
  }, { filename: file });
  return module.exports;
}
const revokeUserDashboardSessions = (id, client) => client.query('UPDATE dashboard_sessions SET revoked_at=now() WHERE user_id=$1', [id]);
const mfa = load('server/src/dashboardMfa.js', { crypto, './db': db,
  './auth': { verifyPassword: async (supplied, stored) => hash(supplied) === stored },
  './dashboardSessions': { revokeUserDashboardSessions } });
let issued = 0;
const createSession = async (user, client) => {
  assert.equal(user.mfa_verified, true, 'only verified factor can authorize session creation');
  const sid = 'issued-session-' + ++issued;
  await client.query("INSERT INTO dashboard_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')", [hash(sid), user.id]);
  return { token: sid, session: { id: hash(sid), idleTimeoutSeconds: 1800 } };
};
const freshUser = async () => (await pg.query('SELECT * FROM users WHERE id=$1', [userId])).rows[0];
const challenge = async () => mfa.createMfaLoginChallenge(await freshUser());
const login = (value, code, issue = createSession) => mfa.completeMfaLogin(value.challengeToken, code, issue);
const resetLimits = () => pg.query('UPDATE dashboard_mfa SET failed_attempts=0,locked_until=NULL,attempt_window_start=now() WHERE user_id=$1', [userId]);
const resetStep = () => pg.query('UPDATE dashboard_mfa SET last_used_step=-1 WHERE user_id=$1', [userId]);
let server;

(async () => {
  const key = mfa.encodeBase32(Buffer.from('12345678901234567890'));
  assert.equal(key, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.equal(mfa.decodeBase32(key).toString(), '12345678901234567890');
  // All RFC 6238 Appendix B timestamps for the deployed SHA-1 variant,
  // including beyond 32-bit Unix time. Test all SHA-256/512 vectors as well.
  const vectors = [
    [59, '94287082', '46119246', '90693936'],
    [1111111109, '07081804', '68084774', '25091201'],
    [1111111111, '14050471', '67062674', '99943326'],
    [1234567890, '89005924', '91819424', '93441116'],
    [2000000000, '69279037', '90698825', '38618901'],
    [20000000000, '65353130', '77737706', '47863826'],
  ];
  const seeds = ['12345678901234567890', '12345678901234567890123456789012', '1234567890123456789012345678901234567890123456789012345678901234'];
  for (const [time, ...expected] of vectors) for (const [index, algorithm] of ['sha1', 'sha256', 'sha512'].entries()) {
    assert.equal(mfa.totp(mfa.encodeBase32(Buffer.from(seeds[index])), time, 8, algorithm), expected[index]);
  }
  const code = mfa.totp(key, 1234567890);
  assert.equal(mfa.matchingStep(key, code, -1, 1234567890), 41152263);
  assert.equal(mfa.matchingStep(key, code, 41152263, 1234567890), null);
  assert.equal(mfa.matchingStep(key, code, -1, 1234567890 + 61), null);
  assert.equal(mfa.matchingStep(key, '1'.repeat(10000), -1, 1234567890), null);
  const encrypted = mfa.encryptSecret(userId, key);
  assert.ok(!encrypted.includes(key)); assert.equal(mfa.decryptSecret(userId, encrypted), key);
  assert.throws(() => mfa.decryptSecret(otherId, encrypted), 'ciphertext is bound to its user');
  const tampered = encrypted.split('.');
  const changedBytes = Buffer.from(tampered[3], 'base64url'); changedBytes[0] ^= 1;
  tampered[3] = changedBytes.toString('base64url');
  assert.throws(() => mfa.decryptSecret(userId, tampered.join('.')));
  const originalKey = env.JWT_SECRET; env.JWT_SECRET = 'different-key';
  assert.equal(mfa.decryptSecret(userId, encrypted), key, 'JWT rotation does not destroy MFA encryption'); env.JWT_SECRET = originalKey;
  const originalEncryptionKey = env.MFA_ENCRYPTION_KEY; env.MFA_ENCRYPTION_KEY = 'b2'.repeat(32);
  assert.throws(() => mfa.decryptSecret(userId, encrypted)); env.MFA_ENCRYPTION_KEY = originalEncryptionKey;
  env.NODE_ENV = 'production'; delete env.MFA_ENCRYPTION_KEY;
  assert.throws(() => mfa.encryptSecret(userId, key), error => error.status === 503);
  env.MFA_ENCRYPTION_KEY = 'malformed';
  assert.throws(() => mfa.encryptSecret(userId, key), error => error.status === 503);
  env.NODE_ENV = 'test'; env.MFA_ENCRYPTION_KEY = originalEncryptionKey;
  console.log('PASS RFC 6238 vectors, skew/replay validation, authenticated secret encryption and user binding');

  await pg.exec('CREATE TABLE users(id uuid PRIMARY KEY,email text,password_hash text,display_name text);');
  for (const file of ['020_dashboard_sessions.sql', '021_account_security.sql']) await pg.exec(fs.readFileSync(path.join(root, 'server/migrations', file), 'utf8'));
  // Migration is safely repeatable under the existing deployment runner.
  await pg.exec(fs.readFileSync(path.join(root, 'server/migrations/021_account_security.sql'), 'utf8'));
  await pg.query('INSERT INTO users VALUES($1,$2,$3,$4)', [userId, 'mfa@example.invalid', hash(password), 'Test account']);
  assert.equal((await mfa.getMfaStatus(userId)).enabled, false);
  assert.equal(await challenge(), null, 'MFA is optional and no account is automatically enrolled');
  await assert.rejects(mfa.startEnrollment(userId, 'wrong-password'), /Current password/);
  const setup = await mfa.startEnrollment(userId, password);
  assert.match(setup.secret, /^[A-Z2-7]{32}$/); assert.match(setup.otpauthUri, /^otpauth:\/\/totp\/RentSketch/);
  assert.equal(await challenge(), null, 'unconfirmed enrollment never locks out a user');
  let status = await mfa.getMfaStatus(userId);
  assert.equal(status.pendingEnrollment, true); assert.equal(status.enabled, false);
  assert.ok(!JSON.stringify(status).includes(setup.secret), 'status never exposes setup secret');
  const pending = (await pg.query('SELECT * FROM dashboard_mfa WHERE user_id=$1', [userId])).rows[0];
  assert.ok(!JSON.stringify(pending).includes(setup.secret), 'database never stores plaintext TOTP seed');
  await pg.query("INSERT INTO dashboard_sessions(token_hash,user_id,expires_at) VALUES('before-enrollment',$1,now()+interval '1 hour')", [userId]);
  const enabled = await mfa.confirmEnrollment(userId, password, mfa.totp(setup.secret));
  assert.equal(enabled.enabled, true); assert.equal(enabled.signInRequired, true); assert.equal(enabled.recoveryCodes.length, 10);
  assert.equal(new Set(enabled.recoveryCodes).size, 10);
  assert.match(enabled.recoveryCodes[0], /^[A-F0-9]{8}(?:-[A-F0-9]{8}){3}$/);
  assert.ok((await pg.query("SELECT revoked_at FROM dashboard_sessions WHERE token_hash='before-enrollment'")).rows[0].revoked_at);
  const hashes = (await pg.query('SELECT code_hash FROM dashboard_mfa_recovery')).rows;
  for (const recovery of enabled.recoveryCodes) assert.ok(!JSON.stringify(hashes).includes(recovery.replace(/-/g, '')));
  assert.equal((await mfa.getMfaStatus(userId)).recoveryCodesRemaining, 10);
  await assert.rejects(mfa.startEnrollment(userId, password), /already enabled/);
  await assert.rejects(mfa.confirmEnrollment(userId, password, mfa.totp(setup.secret)), /already enabled/);
  console.log('PASS opt-in enrollment requires password and TOTP; encrypted persistence; one-time recovery display; session revocation');

  const first = await challenge();
  assert.equal(first.mfaRequired, true); assert.equal(first.token, undefined);
  const persistedChallenge = (await pg.query('SELECT * FROM dashboard_mfa_challenges LIMIT 1')).rows[0];
  assert.notEqual(persistedChallenge.token_hash, first.challengeToken);
  await assert.rejects(login(first, mfa.totp(setup.secret)), /already used/, 'enrollment code cannot be replayed for login');
  await resetStep();
  const validCode = mfa.totp(setup.secret);
  const [sameA, sameB] = await Promise.allSettled([login(first, validCode), login(first, validCode)]);
  assert.equal([sameA, sameB].filter(x => x.status === 'fulfilled').length, 1, 'same challenge succeeds once under concurrent callers');
  assert.equal(issued, 1);
  const second = await challenge();
  await assert.rejects(login(second, validCode), /already used/, 'factor replay across distinct challenges is denied');
  const recovered = await login(second, enabled.recoveryCodes[0].toLowerCase());
  assert.ok(recovered.session.token); assert.equal((await mfa.getMfaStatus(userId)).recoveryCodesRemaining, 9);
  const third = await challenge();
  await assert.rejects(login(third, enabled.recoveryCodes[0]), /already used/);
  const concurrent = await Promise.allSettled([login(third, enabled.recoveryCodes[1]), login(await challenge(), enabled.recoveryCodes[1])]);
  assert.equal(concurrent.filter(x => x.status === 'fulfilled').length, 1, 'one recovery code can only create one concurrent session');
  const rollbackChallenge = await challenge();
  await assert.rejects(login(rollbackChallenge, enabled.recoveryCodes[2], async () => { throw new Error('Database unavailable'); }), /Database unavailable/);
  await login(rollbackChallenge, enabled.recoveryCodes[2]);
  console.log('PASS challenge/factor/recovery replay, concurrent single-use and full rollback when session issuance fails');

  const expired = await challenge();
  await pg.query("UPDATE dashboard_mfa_challenges SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [hash(expired.challengeToken)]);
  await assert.rejects(login(expired, enabled.recoveryCodes[3]), /expired/);
  const beforePassword = await challenge();
  password = 'new-isolated-password'; await pg.query('UPDATE users SET password_hash=$2 WHERE id=$1', [userId, hash(password)]);
  await assert.rejects(login(beforePassword, enabled.recoveryCodes[3]), /expired/, 'password replacement independently invalidates challenge');
  assert.equal((await mfa.getMfaStatus(userId)).enabled, true, 'password reset never disables second factor');
  const invalidated = await challenge(); await mfa.invalidateMfaChallenges(userId);
  await assert.rejects(login(invalidated, enabled.recoveryCodes[3]), /expired/);
  await resetLimits();
  for (let batch = 0; batch < 2; batch++) {
    const limited = await challenge();
    for (let attempt = 0; attempt < 5; attempt++) await assert.rejects(login(limited, 'invalid'), /invalid/);
    if (!batch) await assert.rejects(login(limited, enabled.recoveryCodes[3]), /expired/);
  }
  await assert.rejects(challenge(), error => error.status === 429);
  assert.equal((await pg.query('SELECT failed_attempts FROM dashboard_mfa WHERE user_id=$1', [userId])).rows[0].failed_attempts, 10);
  await assert.rejects(mfa.changeMfa(userId, password, enabled.recoveryCodes[3], 'disable'), error => error.status === 429);
  await resetLimits();
  console.log('PASS five-minute expiry, password-change binding, explicit revocation, persisted per-challenge and cross-challenge account attempt limits');

  const stale = await challenge();
  await assert.rejects(mfa.changeMfa(userId, 'wrong-password', enabled.recoveryCodes[3], 'disable'), /Current password/);
  const rotated = await mfa.changeMfa(userId, password, enabled.recoveryCodes[3], 'recovery-codes');
  assert.equal(rotated.recoveryCodes.length, 10);
  await assert.rejects(login(stale, rotated.recoveryCodes[0]), /expired/);
  await assert.rejects(login(await challenge(), enabled.recoveryCodes[4]), /already used/);
  assert.equal((await pg.query('SELECT count(*)::int n FROM dashboard_sessions WHERE revoked_at IS NULL')).rows[0].n, 0);
  const routes = load('server/src/routes/accountSecurity.js', {
    express, '../dashboardMfa': mfa, '../dashboardSessions': { createDashboardSession: createSession,
      verifyDashboardToken: async token => { if (token !== 'isolated-session') throw new Error('Invalid'); return { userId }; } },
    '../dashboardHttpSession': {
      getDashboardToken: req => req.headers.authorization?.replace(/^Bearer /, ''),
      requireDashboardBootstrap: req => { if (req.headers['x-rentsketch-client'] !== 'dashboard') throw new mfa.MfaError(403, 'Dashboard request required'); },
      sendDashboardSession: (req, res, user, session) => res.json({ user: { id: user.id }, session: session.session }),
    },
  });
  const app = express(); app.use(express.json()); app.use('/api/auth', routes);
  app.use((err, req, res, next) => res.status(500).json({ error: 'Internal server error' }));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  async function request(route, body, headers = {}) {
    const response = await fetch(base + '/api/auth' + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
  }
  assert.equal((await request('/security')).status, 401);
  const read = await request('/security', null, { authorization: 'Bearer isolated-session' });
  assert.equal(read.status, 200); assert.equal(read.cache, 'no-store'); assert.equal(read.body.mfa.enabled, true);
  assert.ok(!JSON.stringify(read.body).includes(setup.secret));
  const httpChallenge = await challenge();
  assert.equal((await request('/login/mfa', { challengeToken: httpChallenge.challengeToken, code: rotated.recoveryCodes[0] })).status, 403);
  const complete = await request('/login/mfa', { challengeToken: httpChallenge.challengeToken, code: rotated.recoveryCodes[0] }, { 'x-rentsketch-client': 'dashboard' });
  assert.equal(complete.status, 200); assert.equal(complete.cache, 'no-store'); assert.equal(complete.body.token, undefined);
  assert.equal((await request('/login/mfa', { challengeToken: httpChallenge.challengeToken, code: rotated.recoveryCodes[1] }, { 'x-rentsketch-client': 'dashboard' })).status, 401);
  const disabled = await mfa.changeMfa(userId, password, rotated.recoveryCodes[1], 'disable');
  assert.equal(disabled.enabled, false); assert.equal(await challenge(), null);
  assert.equal((await mfa.getMfaStatus(userId)).recoveryCodesRemaining, 0);
  const restarted = await mfa.startEnrollment(userId, password);
  await pg.query("UPDATE dashboard_mfa SET pending_expires_at=now()-interval '1 second' WHERE user_id=$1", [userId]);
  await assert.rejects(mfa.confirmEnrollment(userId, password, mfa.totp(restarted.secret)), /setup expired/);
  const pendingAgain = await mfa.startEnrollment(userId, password);
  await mfa.invalidateMfaChallenges(userId);
  await assert.rejects(mfa.confirmEnrollment(userId, password, mfa.totp(pendingAgain.secret)), /setup expired/);
  console.log('PASS HTTP no-store/auth/origin bootstrap boundary; password+factor required to rotate/remove; recovery rotation and factor removal revoke sessions; enrollment expiry');

  // Integrate the actual login, cookie/CSRF transport, JWT issuer, session
  // guards and MFA router. Only bcrypt work is replaced by the fixture hash.
  const jwt = require('jsonwebtoken');
  const actualAuth = load('server/src/auth.js', { bcryptjs: { hash: async value => hash(value), compare: async (value, stored) => hash(value) === stored }, jsonwebtoken: jwt });
  const actualSessions = load('server/src/dashboardSessions.js', { crypto, './db': db, './auth': actualAuth });
  const actualMfa = load('server/src/dashboardMfa.js', { crypto, './db': db, './auth': actualAuth, './dashboardSessions': actualSessions });
  const httpSession = load('server/src/dashboardHttpSession.js', { crypto, './auth': actualAuth });
  const actualLoginRoutes = load('server/src/routes/auth.js', { express, crypto,
    '../clientIp': require('../server/src/clientIp'), '../db': db, '../auth': actualAuth,
    '../dashboardSessions': actualSessions, '../dashboardHttpSession': httpSession, '../dashboardMfa': actualMfa });
  const actualSecurityRoutes = load('server/src/routes/accountSecurity.js', { express,
    '../dashboardSessions': actualSessions, '../dashboardHttpSession': httpSession, '../dashboardMfa': actualMfa });
  await pg.exec('CREATE TABLE tenants(id uuid PRIMARY KEY,slug text,name text); CREATE TABLE tenant_memberships(user_id uuid,tenant_id uuid,role text);');
  app.use('/integrated/auth', actualLoginRoutes, actualSecurityRoutes);
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
  async function integrated(route, body, headers = {}) {
    const response = await fetch(base + '/integrated/auth' + route, {
      method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', origin: 'https://rentsketch.com', 'x-rentsketch-client': 'dashboard', ...headers }, body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') };
  }
  const initialLogin = await integrated('/login', { email: 'mfa@example.invalid', password });
  assert.equal(initialLogin.status, 200, JSON.stringify(initialLogin.body));
  assert.equal(initialLogin.body.token, undefined); assert.match(initialLogin.cookie, /HttpOnly/);
  assert.match(initialLogin.cookie, /Secure/); assert.match(initialLogin.cookie, /SameSite=Strict/);
  const cookieHeader = initialLogin.cookie.split(';')[0];
  const authenticated = { cookie: cookieHeader, 'x-rentsketch-csrf': initialLogin.body.session.csrfToken };
  assert.equal((await integrated('/security/mfa/enroll', { currentPassword: password }, { cookie: cookieHeader })).status, 403, 'cookie mutations require CSRF');
  const realSetup = await integrated('/security/mfa/enroll', { currentPassword: password }, authenticated);
  assert.equal(realSetup.status, 200);
  const realEnable = await integrated('/security/mfa/confirm', { currentPassword: password, code: actualMfa.totp(realSetup.body.secret) }, authenticated);
  assert.equal(realEnable.status, 200); assert.equal(realEnable.body.recoveryCodes.length, 10);
  assert.equal((await integrated('/me', null, authenticated)).status, 401, 'activation revokes prior password-only browser session');
  await assert.rejects(actualSessions.createDashboardSession(await freshUser()), /Two-step verification/, 'session issuer closes password-login versus MFA-enrollment race');
  const realChallenge = await integrated('/login', { email: 'mfa@example.invalid', password });
  assert.equal(realChallenge.status, 200); assert.equal(realChallenge.body.mfaRequired, true);
  assert.equal(realChallenge.body.token, undefined); assert.equal(realChallenge.body.session, undefined); assert.equal(realChallenge.cookie, null);
  const anonymousProtected = await integrated('/me', null, { cookie: '__Host-rentsketch_dashboard=' + realChallenge.body.challengeToken });
  assert.equal(anonymousProtected.status, 401, 'opaque MFA challenge cannot authenticate protected requests');
  const realComplete = await integrated('/login/mfa', { challengeToken: realChallenge.body.challengeToken, code: realEnable.body.recoveryCodes[0] });
  assert.equal(realComplete.status, 200, JSON.stringify(realComplete.body)); assert.match(realComplete.cookie, /HttpOnly/);
  assert.equal(realComplete.body.token, undefined); assert.ok(realComplete.body.session.csrfToken);
  const signedInHeaders = { cookie: realComplete.cookie.split(';')[0], 'x-rentsketch-csrf': realComplete.body.session.csrfToken };
  const signedIn = await integrated('/me', null, signedInHeaders);
  assert.equal(signedIn.status, 200); assert.equal(signedIn.body.user.id, userId);
  assert.equal((await integrated('/login/mfa', { challengeToken: realChallenge.body.challengeToken, code: realEnable.body.recoveryCodes[1] })).status, 401);
  const signOut = await integrated('/logout', {}, signedInHeaders); assert.equal(signOut.status, 200);
  assert.equal((await integrated('/me', null, signedInHeaders)).status, 401);
  await pg.exec(fs.readFileSync(path.join(root, 'server/migrations/016_password_reset_tokens.sql'), 'utf8'));
  const resetToken = crypto.randomBytes(32).toString('hex');
  await pg.query("INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')", [userId, hash(resetToken)]);
  const pendingBeforeReset = await integrated('/login', { email: 'mfa@example.invalid', password });
  const resetResponse = await integrated('/reset-password', { token: resetToken, newPassword: 'new-after-password-recovery' });
  assert.equal(resetResponse.status, 200, JSON.stringify(resetResponse.body));
  assert.equal((await integrated('/login/mfa', { challengeToken: pendingBeforeReset.body.challengeToken, code: realEnable.body.recoveryCodes[1] })).status, 401);
  const afterReset = await integrated('/login', { email: 'mfa@example.invalid', password: 'new-after-password-recovery' });
  assert.equal(afterReset.status, 200); assert.equal(afterReset.body.mfaRequired, true); assert.equal(afterReset.cookie, null);
  assert.equal((await actualMfa.getMfaStatus(userId)).enabled, true);
  const afterResetMfa = await integrated('/login/mfa', { challengeToken: afterReset.body.challengeToken, code: realEnable.body.recoveryCodes[1] });
  assert.equal(afterResetMfa.status, 200); assert.match(afterResetMfa.cookie, /HttpOnly/);
  console.log('PASS actual login+MFA+JWT+HttpOnly cookie integration; no pre-factor session; CSRF enforcement; enrollment/login race guard; protected access and logout');
  console.log('PASS actual password recovery invalidates pending challenges and still requires the existing second factor');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { server?.close(); await pg.close(); });
