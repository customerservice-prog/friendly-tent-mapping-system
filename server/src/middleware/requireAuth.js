const { verifyToken } = require('../auth');
const db = require('../db');

function configuredPlatformAdminEmail() {
  return String(process.env.PLATFORM_ADMIN_EMAIL || '').trim().toLowerCase();
}

// PLATFORM_ADMIN_EMAIL is the source of truth for the single RentSketch
// super-admin identity. The database flag is still maintained for backwards
// compatibility, but authorization does not depend on a stale JWT flag.
async function isConfiguredPlatformAdmin(payload) {
  if (!payload || !payload.userId) return false;
  const configuredEmail = configuredPlatformAdminEmail();
  if (!configuredEmail) return false;

  const result = await db.query(
    'SELECT email FROM users WHERE id = $1',
    [payload.userId]
  );
  const user = result.rows[0];
  return Boolean(user && String(user.email || '').trim().toLowerCase() === configuredEmail);
}

async function requireTenantAccess(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });

    const payload = verifyToken(token);
    const platformAdmin = await isConfiguredPlatformAdmin(payload);
    const tenantSlug = req.params.slug;

    const tenantResult = await db.query('SELECT * FROM tenants WHERE slug = $1', [tenantSlug]);
    const tenant = tenantResult.rows[0];
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    if (!platformAdmin) {
      const membership = await db.query(
        'SELECT * FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2',
        [tenant.id, payload.userId]
      );
      if (!membership.rows[0]) return res.status(403).json({ error: 'You do not have access to this tenant' });
    }

    if (!platformAdmin && tenant.subscription_status === 'trialing' && tenant.trial_ends_at && new Date(tenant.trial_ends_at) < new Date()) {
      return res.status(402).json({ error: 'Your free trial has ended. Please upgrade your plan to continue.', trialEndsAt: tenant.trial_ends_at });
    }

    req.tenant = tenant;
    req.user = { ...payload, isPlatformAdmin: platformAdmin };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function requirePlatformAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });

    const payload = verifyToken(token);
    const platformAdmin = await isConfiguredPlatformAdmin(payload);
    if (!platformAdmin) return res.status(403).json({ error: 'Platform admin access required' });

    req.user = { ...payload, isPlatformAdmin: true };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireTenantAccess, requirePlatformAdmin, isConfiguredPlatformAdmin };
