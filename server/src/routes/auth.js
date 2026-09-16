const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword, signToken, verifyToken } = require('../auth');

const router = express.Router();

function bearerPayload(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  return verifyToken(token);
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const normalizedEmail = String(email).trim().toLowerCase();
  const result = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
  const user = result.rows[0];
  if (!user) {
    console.warn(`[auth] Login rejected: user not found for ${normalizedEmail}.`);
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const ok = await verifyPassword(String(password), user.password_hash);
  if (!ok) {
    // Never log the password or hash. Length is enough to detect common
    // whitespace/truncation/config mismatches without exposing credentials.
    console.warn(`[auth] Login rejected: password mismatch for ${normalizedEmail}; submittedLength=${String(password).length}; hashPresent=${Boolean(user.password_hash)}.`);
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  console.log(`[auth] Login accepted for ${normalizedEmail}; platformAdmin=${Boolean(user.is_platform_admin)}.`);
  const token = signToken({ userId: user.id, email: user.email, isPlatformAdmin: user.is_platform_admin });
  res.json({ token, user: { id: user.id, email: user.email, displayName: user.display_name, isPlatformAdmin: Boolean(user.is_platform_admin) } });
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  let payload;
  try { payload = bearerPayload(req); } catch (err) { return res.status(401).json({ error: 'Invalid or expired token' }); }
  if (!payload) return res.status(401).json({ error: 'Missing bearer token' });

  const memberships = await db.query(
    `SELECT t.slug, t.name, tm.role FROM tenant_memberships tm
     JOIN tenants t ON t.id = tm.tenant_id
     WHERE tm.user_id = $1 ORDER BY t.name`,
    [payload.userId]
  );

  res.json({
    user: { id: payload.userId, email: payload.email, isPlatformAdmin: Boolean(payload.isPlatformAdmin) },
    tenants: memberships.rows,
  });
});

// POST /api/auth/change-password
router.post('/change-password', async (req, res) => {
  let payload;
  try { payload = bearerPayload(req); } catch (err) { return res.status(401).json({ error: 'Invalid or expired token' }); }
  if (!payload) return res.status(401).json({ error: 'Missing bearer token' });

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password are required' });
  if (String(newPassword).length < 12) return res.status(400).json({ error: 'New password must be at least 12 characters' });
  if (currentPassword === newPassword) return res.status(400).json({ error: 'New password must be different' });

  const result = await db.query('SELECT id, password_hash FROM users WHERE id = $1', [payload.userId]);
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: 'Account not found' });
  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

  const newHash = await hashPassword(newPassword);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
  res.json({ ok: true });
});

module.exports = router;
