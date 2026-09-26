const db = require('./db');
const { hashPassword, verifyPassword } = require('./auth');
const { revokeUserDashboardSessions } = require('./dashboardSessions');

async function verifyWrittenPassword(email, password) {
  const check = await db.query('SELECT id, password_hash, is_platform_admin FROM users WHERE email = $1', [email]);
  const user = check.rows[0];
  if (!user) throw new Error(`[bootstrap] Verification failed: admin row missing for ${email}.`);
  const matches = await verifyPassword(password, user.password_hash);
  if (!matches) throw new Error(`[bootstrap] Verification failed: written password hash does not match bootstrap password for ${email}.`);
  if (!user.is_platform_admin) throw new Error(`[bootstrap] Verification failed: ${email} is not marked as platform admin.`);
  console.log(`[bootstrap] Verified admin credentials in database for ${email}; passwordLength=${password.length}.`);
}

async function bootstrapPlatformAdmin() {
  const email = String(process.env.PLATFORM_ADMIN_EMAIL || '').trim().toLowerCase();
  // Railway variables are sometimes pasted with accidental leading/trailing whitespace.
  // The login form sends the visible password, so normalize the bootstrap secret too.
  const password = String(process.env.PLATFORM_ADMIN_PASSWORD || '').trim();
  const displayName = String(process.env.PLATFORM_ADMIN_NAME || 'Platform Administrator').trim();
  const forceReset = String(process.env.PLATFORM_ADMIN_BOOTSTRAP_RESET || '').trim().toLowerCase() === 'true';

  if (!email || !password) {
    console.warn('[bootstrap] PLATFORM_ADMIN_EMAIL/PASSWORD not set; skipping platform admin bootstrap.');
    return;
  }
  if (password.length < 12) throw new Error('[bootstrap] PLATFORM_ADMIN_PASSWORD must be at least 12 characters after trimming whitespace.');

  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (!existing.rows[0]) {
    const passwordHash = await hashPassword(password);
    await db.query(
      'INSERT INTO users (email, password_hash, display_name, is_platform_admin) VALUES ($1, $2, $3, true)',
      [email, passwordHash, displayName]
    );
    await verifyWrittenPassword(email, password);
    console.log(`[bootstrap] Platform admin created for ${email}.`);
    return;
  }

  if (forceReset) {
    const passwordHash = await hashPassword(password);
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE users SET password_hash = $1, display_name = COALESCE(NULLIF($2, \'\'), display_name), is_platform_admin = true WHERE email = $3',
        [passwordHash, displayName, email]
      );
      await revokeUserDashboardSessions(existing.rows[0].id, client);
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
    await verifyWrittenPassword(email, password);
    console.log(`[bootstrap] Platform admin password reset for ${email}.`);
  } else {
    await db.query('UPDATE users SET is_platform_admin = true WHERE email = $1', [email]);
    console.log(`[bootstrap] Platform admin privilege ensured for ${email}; password left unchanged.`);
  }
}

module.exports = bootstrapPlatformAdmin;
