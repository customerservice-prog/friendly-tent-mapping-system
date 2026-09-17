const { verifyToken } = require('../auth');
const db = require('../db');

const ROLE_LEVEL = { viewer: 10, staff: 20, admin: 30, owner: 40, platform_admin: 100 };

function configuredPlatformAdminEmail() {
  return String(process.env.PLATFORM_ADMIN_EMAIL || '').trim().toLowerCase();
}

async function isConfiguredPlatformAdmin(payload) {
  if (!payload || !payload.userId) return false;
  const configuredEmail = configuredPlatformAdminEmail();
  if (!configuredEmail) return false;
  const result = await db.query('SELECT email FROM users WHERE id = $1', [payload.userId]);
  const user = result.rows[0];
  return Boolean(user && String(user.email || '').trim().toLowerCase() === configuredEmail);
}

async function resolveTenantAuth(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return { status: 401, error: 'Missing bearer token' };
  const payload = verifyToken(token);
  const platformAdmin = await isConfiguredPlatformAdmin(payload);
  const tenantResult = await db.query('SELECT * FROM tenants WHERE slug = $1', [req.params.slug]);
  const tenant = tenantResult.rows[0];
  if (!tenant) return { status: 404, error: 'Tenant not found' };

  let role = 'platform_admin';
  if (!platformAdmin) {
    const membership = await db.query(
      'SELECT role FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2',
      [tenant.id, payload.userId]
    );
    if (!membership.rows[0]) return { status: 403, error: 'You do not have access to this tenant' };
    role = String(membership.rows[0].role || 'viewer').toLowerCase();
    if (tenant.subscription_status === 'trialing' && tenant.trial_ends_at && new Date(tenant.trial_ends_at) < new Date()) {
      return { status: 402, error: 'Your free trial has ended. Please upgrade your plan to continue.', trialEndsAt: tenant.trial_ends_at };
    }
  }
  return { payload, platformAdmin, tenant, role };
}

async function requireTenantAccess(req, res, next) {
  try {
    const auth = await resolveTenantAuth(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error, trialEndsAt: auth.trialEndsAt });
    req.tenant = auth.tenant;
    req.user = { ...auth.payload, isPlatformAdmin: auth.platformAdmin, tenantRole: auth.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireTenantRole(minimumRole) {
  const minimum = ROLE_LEVEL[minimumRole];
  if (!minimum) throw new Error('Unknown minimum tenant role: ' + minimumRole);
  return async function (req, res, next) {
    try {
      const auth = await resolveTenantAuth(req);
      if (auth.error) return res.status(auth.status).json({ error: auth.error, trialEndsAt: auth.trialEndsAt });
      if ((ROLE_LEVEL[auth.role] || 0) < minimum) {
        return res.status(403).json({ error: minimumRole + ' access or higher is required' });
      }
      req.tenant = auth.tenant;
      req.user = { ...auth.payload, isPlatformAdmin: auth.platformAdmin, tenantRole: auth.role };
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

async function requirePlatformAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });
    const payload = verifyToken(token);
    const platformAdmin = await isConfiguredPlatformAdmin(payload);
    if (!platformAdmin) return res.status(403).json({ error: 'Platform admin access required' });
    req.user = { ...payload, isPlatformAdmin: true, tenantRole: 'platform_admin' };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireTenantAccess, requireTenantRole, requirePlatformAdmin, isConfiguredPlatformAdmin, ROLE_LEVEL };
