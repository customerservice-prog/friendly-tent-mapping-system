const { verifyToken } = require('../auth');
const db = require('../db');

// Verifies the bearer token AND that the authenticated user actually has a
// membership on the tenant referenced in the URL (req.params.slug - see
// routes/quoteRequests.js, which mounts on '/:slug'). This enforces
// AUTHORIZATION (can this user touch THIS tenant's data), not just
// AUTHENTICATION (who are you) - every tenant-scoped staff route uses this
// so one rental company can never read another rental company's records.
async function requireTenantAccess(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });

    const payload = verifyToken(token);
    const tenantSlug = req.params.slug;

    const tenantResult = await db.query('SELECT * FROM tenants WHERE slug = $1', [tenantSlug]);
    const tenant = tenantResult.rows[0];
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    if (!payload.isPlatformAdmin) {
      const membership = await db.query(
        'SELECT * FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2',
        [tenant.id, payload.userId]
      );
      if (!membership.rows[0]) return res.status(403).json({ error: 'You do not have access to this tenant' });
    }

    req.tenant = tenant;
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireTenantAccess };
