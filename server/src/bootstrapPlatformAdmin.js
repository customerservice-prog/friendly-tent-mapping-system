const db = require('./db');
const { hashPassword } = require('./auth');

async function bootstrapPlatformAdmin() {
  const email = String(process.env.PLATFORM_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.PLATFORM_ADMIN_PASSWORD || '');
  const displayName = String(process.env.PLATFORM_ADMIN_NAME || 'Platform Administrator').trim();
  const forceReset = String(process.env.PLATFORM_ADMIN_BOOTSTRAP_RESET || '').toLowerCase() === 'true';

  if (!email || !password) {
    console.warn('[bootstrap] PLATFORM_ADMIN_EMAIL/PASSWORD not set; skipping platform admin bootstrap.');
    return;
  }
  if (password.length < 12) throw new Error('[bootstrap] PLATFORM_ADMIN_PASSWORD must be at least 12 characters.');

  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (!existing.rows[0]) {
    const passwordHash = await hashPassword(password);
    await db.query(
      'INSERT INTO users (email, password_hash, display_name, is_platform_admin) VALUES ($1, $2, $3, true)',
      [email, passwordHash, displayName]
    );
    console.log(`[bootstrap] Platform admin created for ${email}.`);
    return;
  }

  if (forceReset) {
    const passwordHash = await hashPassword(password);
    await db.query(
      'UPDATE users SET password_hash = $1, display_name = COALESCE(NULLIF($2, \'\'), display_name), is_platform_admin = true WHERE email = $3',
      [passwordHash, displayName, email]
    );
    console.log(`[bootstrap] Platform admin password reset for ${email}.`);
  } else {
    await db.query('UPDATE users SET is_platform_admin = true WHERE email = $1', [email]);
    console.log(`[bootstrap] Platform admin privilege ensured for ${email}; password left unchanged.`);
  }
}

module.exports = bootstrapPlatformAdmin;
