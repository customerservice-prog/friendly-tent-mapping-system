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

    // Block access once a trial has expired. We ONLY enforce this when
    // trial_ends_at is explicitly set and in the past, and never for
    // platform admins - tenants with no trial_ends_at (e.g. pre-existing
    // tenants onboarded before trials existed, like Friendly) are never
    // blocked by this check, so this can never lock out an existing customer.
    if (!payload.isPlatformAdmin && tenant.subscription_status === 'trialing' && tenant.trial_ends_at && new Date(tenant.trial_ends_at) < new Date()) {
      return res.status(402).json({ error: 'Your free trial has ended. Please upgrade your plan to continue.', trialEndsAt: tenant.trial_ends_at });
    }

    req.tenant = tenant;
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireTenantAccess };
