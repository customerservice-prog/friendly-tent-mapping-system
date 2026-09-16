const db = require('./db');
const { hashPassword } = require('./auth');

async function bootstrapPlatformAdmin() {
  const email = String(process.env.PLATFORM_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.PLATFORM_ADMIN_PASSWORD || '');
  const displayName = String(process.env.PLATFORM_ADMIN_NAME || 'Platform Administrator').trim();

  if (!email || !password) {
    console.warn('[bootstrap] PLATFORM_ADMIN_EMAIL/PASSWORD not set; skipping platform admin bootstrap.');
    return;
  }
  if (password.length < 12) throw new Error('[bootstrap] PLATFORM_ADMIN_PASSWORD must be at least 12 characters.');

  const passwordHash = await hashPassword(password);
  await db.query(
    `INSERT INTO users (email, password_hash, display_name, is_platform_admin)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), users.display_name),
       is_platform_admin = true`,
    [email, passwordHash, displayName]
  );
  console.log(`[bootstrap] Platform admin ensured for ${email}.`);
}

module.exports = bootstrapPlatformAdmin;
