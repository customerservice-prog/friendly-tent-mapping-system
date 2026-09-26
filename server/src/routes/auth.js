const { clientIp } = require('../clientIp');
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { hashPassword, verifyPassword } = require('../auth');
const { createDashboardSession, verifyDashboardToken, revokeDashboardSession, revokeUserDashboardSessions } = require('../dashboardSessions');
const { getDashboardToken, publicDashboardSession, requireDashboardBootstrap, sendDashboardSession } = require('../dashboardHttpSession');
const { createMfaLoginChallenge, invalidateMfaChallenges } = require('../dashboardMfa');

const router = express.Router();
router.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const loginBuckets = new Map();
const passwordBuckets = new Map();
const resetBuckets = new Map();
function limited(map,key,max,windowMs){const now=Date.now();let b=map.get(key);if(!b||now-b.start>windowMs)b={start:now,count:0};b.count++;map.set(key,b);return b.count>max;}
function clearLogin(email,ip){loginBuckets.delete('account:'+email);loginBuckets.delete('pair:'+email+':'+ip);}

async function dashboardPayload(req, options) {
  const token = getDashboardToken(req);
  if (!token) return null;
  req.dashboardToken = token;
  return verifyDashboardToken(token, options);
}

function configuredPlatformAdminEmail() {
  return String(process.env.PLATFORM_ADMIN_EMAIL || '').trim().toLowerCase();
}

function isConfiguredPlatformAdminEmail(email) {
  const configured = configuredPlatformAdminEmail();
  return Boolean(configured && String(email || '').trim().toLowerCase() === configured);
}

router.post('/login', wrap(async (req, res) => {
  requireDashboardBootstrap(req);
  const { email, password } = req.body || {};
  if (typeof email!=='string'||typeof password!=='string'||!email.trim()||!password) return res.status(400).json({ error: 'email and password are required' });
  if(email.length>254||password.length>256)return res.status(400).json({error:'Invalid email or password'});
  const normalizedEmail = email.trim().toLowerCase(),ip=clientIp(req),windowMs=15*60*1000;
  if(limited(loginBuckets,'ip:'+ip,30,windowMs)||limited(loginBuckets,'account:'+normalizedEmail,12,windowMs)||limited(loginBuckets,'pair:'+normalizedEmail+':'+ip,10,windowMs))return res.status(429).json({error:'Too many login attempts. Please wait and try again.'});
  const result = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
  clearLogin(normalizedEmail,ip);
  const challenge = await createMfaLoginChallenge(user);
  if (challenge) return res.json(challenge);
  const session = await createDashboardSession(user);
  return sendDashboardSession(req, res, user, session);
}));

router.post('/logout', wrap(async (req, res) => {
  const token = getDashboardToken(req);
  if (token) await revokeDashboardSession(token);
  // Revoke only: a delayed logout response must not delete a newer login cookie.
  res.json({ ok: true });
}));

router.get('/me', wrap(async (req, res) => {
  let payload;
  try { payload = await dashboardPayload(req, { touch: false }); } catch (err) { return res.status(err.status === 403 ? 403 : 401).json({ error: err.status === 403 ? err.message : 'Invalid or expired session' }); }
  if (!payload) return res.status(401).json({ error: 'Sign in to your dashboard to continue.' });

  const userResult = await db.query('SELECT id, email, display_name FROM users WHERE id = $1', [payload.userId]);
  const currentUser = userResult.rows[0];
  if (!currentUser) return res.status(401).json({ error: 'Account not found' });
  const isPlatformAdmin = isConfiguredPlatformAdminEmail(currentUser.email);

  let memberships;
  if (isPlatformAdmin) {
    memberships = await db.query(
      `SELECT t.slug, t.name, 'platform_admin'::text AS role
       FROM tenants t ORDER BY t.name`
    );
  } else {
    memberships = await db.query(
      `SELECT t.slug, t.name, tm.role FROM tenant_memberships tm
       JOIN tenants t ON t.id = tm.tenant_id
       WHERE tm.user_id = $1 ORDER BY t.name`,
      [payload.userId]
    );
  }

  res.json({
    user: { id: currentUser.id, email: currentUser.email, displayName: currentUser.display_name, isPlatformAdmin },
    tenants: memberships.rows,
    session: publicDashboardSession(req.dashboardToken),
  });
}));


async function sessionOwner(req, res) {
  try {
    const payload = await dashboardPayload(req, { touch: req.method !== 'GET' });
    if (payload) return payload;
  } catch (err) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return null; }
  }
  res.status(401).json({ error: 'Sign in to your dashboard to continue.' });
  return null;
}

router.post('/heartbeat', wrap(async (req, res) => {
  if (!await sessionOwner(req, res)) return;
  res.json({ ok: true, session: publicDashboardSession(req.dashboardToken) });
}));
router.get('/sessions', wrap(async (req, res) => {
  const owner = await sessionOwner(req, res); if (!owner) return;
  const current = publicDashboardSession(req.dashboardToken).id;
  const result = await db.query("SELECT token_hash,created_at,last_seen_at,expires_at FROM dashboard_sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now() AND last_seen_at>now()-interval '30 minutes' ORDER BY created_at DESC", [owner.userId]);
  res.json({ sessions: result.rows.map(row => ({ id: row.token_hash, current: row.token_hash === current, createdAt: row.created_at, lastSeenAt: row.last_seen_at, expiresAt: row.expires_at })) });
}));
router.post('/sessions/revoke-others', wrap(async (req, res) => {
  const owner = await sessionOwner(req, res); if (!owner) return;
  const current = publicDashboardSession(req.dashboardToken).id;
  await db.query('UPDATE dashboard_sessions SET revoked_at=now() WHERE user_id=$1 AND token_hash<>$2 AND revoked_at IS NULL', [owner.userId, current]);
  res.json({ ok: true });
}));
router.delete('/sessions/:id', wrap(async (req, res) => {
  const owner = await sessionOwner(req, res); if (!owner) return;
  if (!/^[a-f0-9]{64}$/.test(req.params.id)) return res.status(404).json({ error: 'Session not found' });
  const result = await db.query('UPDATE dashboard_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1 AND token_hash=$2 RETURNING token_hash', [owner.userId, req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Session not found' });
  res.json({ ok: true, current: req.params.id === publicDashboardSession(req.dashboardToken).id });
}));


router.post('/reset-password', wrap(async (req, res) => {
  requireDashboardBootstrap(req);
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  const ip = clientIp(req);

  if (limited(resetBuckets, 'ip:' + ip, 12, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many reset attempts. Please wait and try again.' });
  }
  if (token.length < 32 || token.length > 512) {
    return res.status(400).json({ error: 'Invalid or expired reset link' });
  }
  if (newPassword.length < 12) {
    return res.status(400).json({ error: 'New password must be at least 12 characters' });
  }
  if (Buffer.byteLength(newPassword, 'utf8') > 72) {
    return res.status(400).json({ error: 'New password must be no more than 72 UTF-8 bytes' });
  }

  const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const candidate = (await client.query('SELECT user_id FROM password_reset_tokens WHERE token_hash=$1', [tokenHash])).rows[0];
    if (!candidate) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Invalid or expired reset link' }); }
    // All credential/session/MFA changes lock the account before its tokens.
    // Revalidate the one-time link after acquiring this lock.
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [candidate.user_id]);
    const reset = await client.query(
      `SELECT prt.id, prt.user_id
       FROM password_reset_tokens prt
       WHERE prt.token_hash = $1
         AND prt.used_at IS NULL
         AND prt.expires_at > now()
       FOR UPDATE`,
      [tokenHash]
    );
    const row = reset.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    const passwordHash = await hashPassword(newPassword);
    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, row.user_id]);
    await revokeUserDashboardSessions(row.user_id, client);
    await invalidateMfaChallenges(row.user_id, client);
    await client.query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [row.id]);
    await client.query(
      'UPDATE password_reset_tokens SET used_at = COALESCE(used_at, now()) WHERE user_id = $1 AND used_at IS NULL',
      [row.user_id]
    );
    await client.query('COMMIT');
    resetBuckets.delete('ip:' + ip);
    return res.json({ ok: true });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[auth reset-password]', err);
    return res.status(500).json({ error: 'Could not reset password. Please try again.' });
  } finally {
    client.release();
  }
}));

router.post('/change-password', wrap(async (req, res) => {
  let payload;
  try { payload = await dashboardPayload(req); } catch (err) { return res.status(err.status === 403 ? 403 : 401).json({ error: err.status === 403 ? err.message : 'Invalid or expired session' }); }
  if (!payload) return res.status(401).json({ error: 'Sign in to your dashboard to continue.' });
  if(limited(passwordBuckets,String(payload.userId)+':'+clientIp(req),10,60*60*1000))return res.status(429).json({error:'Too many password-change attempts. Please wait and try again.'});
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword!=='string'||typeof newPassword!=='string'||!currentPassword||!newPassword) return res.status(400).json({ error: 'Current and new password are required' });
  if(currentPassword.length>256||Buffer.byteLength(newPassword,'utf8')>72)return res.status(400).json({error:'New password must be no more than 72 UTF-8 bytes'});
  if (newPassword.length < 12) return res.status(400).json({ error: 'New password must be at least 12 characters' });
  if (currentPassword === newPassword) return res.status(400).json({ error: 'New password must be different' });
  const result = await db.query('SELECT id, password_hash FROM users WHERE id = $1', [payload.userId]);
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: 'Account not found' });
  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });
  const newHash = await hashPassword(newPassword);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query('UPDATE users SET password_hash = $1 WHERE id = $2 AND password_hash = $3 RETURNING id', [newHash, user.id, user.password_hash]);
    if (!updated.rows[0]) { await client.query('ROLLBACK'); return res.status(401).json({ error: 'Your password changed. Please sign in again.' }); }
    await revokeUserDashboardSessions(user.id, client);
    await invalidateMfaChallenges(user.id, client);
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
  passwordBuckets.delete(String(payload.userId)+':'+clientIp(req));
  res.json({ ok: true, signInRequired: true });
}));

module.exports = router;
