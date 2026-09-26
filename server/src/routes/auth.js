const { clientIp } = require('../clientIp');
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { hashPassword, verifyPassword } = require('../auth');
const { createDashboardSession, verifyDashboardToken, revokeDashboardSession, revokeUserDashboardSessions } = require('../dashboardSessions');

const router = express.Router();
router.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const loginBuckets = new Map();
const passwordBuckets = new Map();
const resetBuckets = new Map();
function limited(map,key,max,windowMs){const now=Date.now();let b=map.get(key);if(!b||now-b.start>windowMs)b={start:now,count:0};b.count++;map.set(key,b);return b.count>max;}
function clearLogin(email,ip){loginBuckets.delete('account:'+email);loginBuckets.delete('pair:'+email+':'+ip);}

async function bearerPayload(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  return verifyDashboardToken(token);
}

function configuredPlatformAdminEmail() {
  return String(process.env.PLATFORM_ADMIN_EMAIL || '').trim().toLowerCase();
}

function isConfiguredPlatformAdminEmail(email) {
  const configured = configuredPlatformAdminEmail();
  return Boolean(configured && String(email || '').trim().toLowerCase() === configured);
}

router.post('/login', wrap(async (req, res) => {
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
  const isPlatformAdmin = isConfiguredPlatformAdminEmail(user.email);
  const session = await createDashboardSession(user);
  res.json({ ...session, user: { id: user.id, email: user.email, displayName: user.display_name, isPlatformAdmin } });
}));

router.post('/logout', wrap(async (req, res) => {
  const header = String(req.headers.authorization || '');
  if (header.startsWith('Bearer ')) await revokeDashboardSession(header.slice(7));
  res.json({ ok: true });
}));

router.get('/me', wrap(async (req, res) => {
  let payload;
  try { payload = await bearerPayload(req); } catch (err) { return res.status(401).json({ error: 'Invalid or expired token' }); }
  if (!payload) return res.status(401).json({ error: 'Missing bearer token' });

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
  });
}));


router.post('/reset-password', wrap(async (req, res) => {
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
  try { payload = await bearerPayload(req); } catch (err) { return res.status(401).json({ error: 'Invalid or expired token' }); }
  if (!payload) return res.status(401).json({ error: 'Missing bearer token' });
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
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
  passwordBuckets.delete(String(payload.userId)+':'+clientIp(req));
  res.json({ ok: true, signInRequired: true });
}));

module.exports = router;
