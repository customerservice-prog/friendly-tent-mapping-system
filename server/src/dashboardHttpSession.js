const crypto = require('crypto');
const { verifyToken } = require('./auth');

const COOKIE_NAME = '__Host-rentsketch_dashboard';
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
function denied(message) { const error = new Error(message); error.status = 403; return error; }
function trustedOrigin() { return new URL(process.env.APP_URL || 'https://rentsketch.com').origin; }

function requireDashboardOrigin(req) {
  const origin = req.headers.origin;
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') throw denied('Open the dashboard directly on RentSketch.');
  if (origin) {
    if (origin !== trustedOrigin()) throw denied('Dashboard origin not allowed');
  } else if (site !== 'same-origin') {
    throw denied('A same-origin dashboard request is required');
  }
}

function requireDashboardBootstrap(req) {
  requireDashboardOrigin(req);
  if (req.headers['x-rentsketch-client'] !== 'dashboard') throw denied('Open the RentSketch sign-in page to continue.');
}

function publicDashboardSession(token) {
  const payload = verifyToken(token);
  if (payload.kind !== 'dashboard_session' || payload.sessionVersion !== 2 || typeof payload.sid !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(payload.sid)) throw denied('Invalid dashboard session');
  return {
    id: crypto.createHash('sha256').update(payload.sid).digest('hex'),
    // A one-way, purpose-bound derivative: disclosing CSRF metadata never
    // reveals the bearer secret in the HttpOnly cookie.
    csrfToken: crypto.createHmac('sha256', payload.sid).update('rentsketch-dashboard-csrf-v1').digest('base64url'),
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    idleTimeoutSeconds: 1800,
  };
}

function getDashboardToken(req) {
  const cookies = String(req.headers.cookie || '').split(';').map(value => value.trim()).filter(value => value.startsWith(COOKIE_NAME + '='));
  if (cookies.length > 1) throw denied('Ambiguous dashboard cookie');
  if (cookies.length) {
    requireDashboardOrigin(req);
    const token = cookies[0].slice(COOKIE_NAME.length + 1);
    if (!READ_METHODS.has(String(req.method || 'GET').toUpperCase())) {
      let expected;
      try { expected = publicDashboardSession(token).csrfToken; } catch (error) { error.status = 401; throw error; }
      const supplied = req.headers['x-rentsketch-csrf'];
      if (typeof supplied !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(supplied) ||
          !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw denied('Your security session changed. Refresh and try again.');
    }
    return token;
  }
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return null;
  // Retain explicit non-browser API compatibility. Browser sessions must use
  // the protected cookie, and an Authorization header cannot bypass CSRF.
  if (req.headers.origin || req.headers['sec-fetch-site']) throw denied('Browser dashboard requests require a secure session cookie');
  return header.slice(7);
}

function sendDashboardSession(req, res, user, issued) {
  res.cookie(COOKIE_NAME, issued.token, { httpOnly: true, secure: true, sameSite: 'strict', path: '/' });
  res.setHeader('Cache-Control', 'no-store');
  return res.json({
    user: {
      id: user.id, email: user.email, displayName: user.display_name,
      isPlatformAdmin: Boolean(process.env.PLATFORM_ADMIN_EMAIL && String(user.email || '').trim().toLowerCase() === String(process.env.PLATFORM_ADMIN_EMAIL).trim().toLowerCase()),
    },
    session: publicDashboardSession(issued.token),
    ...(issued.tenant ? { tenant: issued.tenant } : {}),
  });
}

module.exports = { COOKIE_NAME, getDashboardToken, publicDashboardSession, requireDashboardBootstrap, sendDashboardSession };
