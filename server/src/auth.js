// Password hashing + JWT helpers shared by the auth route and the
// tenant-access middleware.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// This repository is PUBLIC, so a hardcoded fallback secret here is not a
// harmless "dev convenience" - it is a published, world-readable
// credential. If this fallback were ever silently used in production,
// anyone could forge a JWT (including isPlatformAdmin: true) and read or
// write ANY tenant's data. Refuse to start under NODE_ENV=production
// without a real secret; only allow the insecure default for local dev.
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('[auth] JWT_SECRET must be set in production. Refusing to start with the public default secret.');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
if (!process.env.JWT_SECRET) {
  // eslint-disable-next-line no-console
  console.warn('[auth] JWT_SECRET is not set. Using an insecure development default - set a real secret before deploying.');
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signToken(payload, options) {
  return jwt.sign(payload, JWT_SECRET, Object.assign({ expiresIn: '7d' }, options));
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
