const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword, signToken, verifyToken } = require('../auth');

const router = express.Router();
const loginBuckets = new Map();
const passwordBuckets = new Map();
function clientIp(req){return(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').toString().split(',')[0].trim();}
function limited(map,key,max,windowMs){const now=Date.now();let b=map.get(key);if(!b||now-b.start>windowMs)b={start:now,count:0};b.count++;map.set(key,b);return b.count>max;}
function clearLogin(email,ip){loginBuckets.delete('account:'+email);loginBuckets.delete('pair:'+email+':'+ip);}

function bearerPayload(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  return verifyToken(token);
}

function configuredPlatformAdminEmail() {
  return String(process.env.PLATFORM_ADMIN_EMAIL || '').trim().toLowerCase();
}

function isConfiguredPlatformAdminEmail(email) {
  const configured = configuredPlatformAdminEmail();
  return Boolean(configured && String(email || '').trim().toLowerCase() === configured);
}

router.post('/login', async (req, res) => {
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
  const token = signToken({ userId: user.id, email: user.email, isPlatformAdmin });
  res.json({ token, user: { id: user.id, email: user.email, displayName: user.display_name, isPlatformAdmin } });
});

router.get('/me', async (req, res) => {
  let payload;
  try { payload = bearerPayload(req); } catch (err) { return res.status(401).json({ error: 'Invalid or expired token' }); }
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
});

router.post('/change-password', async (req, res) => {
  let payload;
  try { payload = bearerPayload(req); } catch (err) { return res.status(401).json({ error: 'Invalid or expired token' }); }
  if (!payload) return res.status(401).json({ error: 'Missing bearer token' });
  if(limited(passwordBuckets,String(payload.userId)+':'+clientIp(req),10,60*60*1000))return res.status(429).json({error:'Too many password-change attempts. Please wait and try again.'});
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword!=='string'||typeof newPassword!=='string'||!currentPassword||!newPassword) return res.status(400).json({ error: 'Current and new password are required' });
  if(currentPassword.length>256||newPassword.length>256)return res.status(400).json({error:'Password is too long'});
  if (newPassword.length < 12) return res.status(400).json({ error: 'New password must be at least 12 characters' });
  if (currentPassword === newPassword) return res.status(400).json({ error: 'New password must be different' });
  const result = await db.query('SELECT id, password_hash FROM users WHERE id = $1', [payload.userId]);
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: 'Account not found' });
  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });
  const newHash = await hashPassword(newPassword);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
  passwordBuckets.delete(String(payload.userId)+':'+clientIp(req));
  res.json({ ok: true });
});

module.exports = router;
