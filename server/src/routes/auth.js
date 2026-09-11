const express = require('express');
const db = require('../db');
const { verifyPassword, signToken, verifyToken } = require('../auth');

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

// GET /api/auth/me
// Used by the business dashboard right after login (and on every page
// reload) to find out WHICH tenant(s) this user belongs to and what role
// they hold, without the dashboard ever hardcoding a tenant slug. This is
// what lets the same dashboard code work for Friendly, "Sample Event
// Rentals", or any future tenant - the tenant is discovered from the
// logged-in user's memberships, never assumed.
router.get('/me', async (req, res) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });

             let payload;
    try {
          payload = verifyToken(token);
    } catch (err) {
          return res.status(401).json({ error: 'Invalid or expired token' });
    }

             const memberships = await db.query(
                   `SELECT t.slug, t.name, tm.role FROM tenant_memberships tm
                        JOIN tenants t ON t.id = tm.tenant_id
                             WHERE tm.user_id = $1
                                  ORDER BY t.name`,
                   [payload.userId]
                 );

             res.json({
                   user: { id: payload.userId, email: payload.email, isPlatformAdmin: Boolean(payload.isPlatformAdmin) },
                   tenants: memberships.rows,
             });
});

module.exports = router;
