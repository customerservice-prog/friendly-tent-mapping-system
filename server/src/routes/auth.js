const express = require('express');
const db = require('../db');
const { verifyPassword, signToken } = require('../auth');

const router = express.Router();

// POST /api/auth/login  { email, password }
// Returns a JWT the frontend stores and sends as `Authorization: Bearer <token>`
// on every subsequent staff/tenant-scoped request. This is the ONLY way a
// staff dashboard authenticates - customers submitting a quote request never
// need an account or a token (see routes/quoteRequests.js).
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const result = await db.query('SELECT * FROM users WHERE email = $1', [String(email).toLowerCase()]);
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  const token = signToken({ userId: user.id, email: user.email, isPlatformAdmin: user.is_platform_admin });
  res.json({ token, user: { id: user.id, email: user.email, displayName: user.display_name } });
});

module.exports = router;
