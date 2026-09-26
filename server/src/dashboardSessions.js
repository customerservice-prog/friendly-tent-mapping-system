const crypto = require('crypto');
const db = require('./db');
const { signToken, verifyToken } = require('./auth');

const IDLE_TIMEOUT_SECONDS = 30 * 60;
const ABSOLUTE_TIMEOUT_SECONDS = 8 * 60 * 60;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function signInRequired(message) { const error = new Error(message); error.status = 401; return error; }

async function createDashboardSession(user, suppliedClient) {
  const client = suppliedClient || await db.pool.connect();
  try {
    if (!suppliedClient) await client.query('BEGIN');
    const account = (await client.query('SELECT id,password_hash FROM users WHERE id=$1 FOR UPDATE', [user.id])).rows[0];
    if (!account || (user.password_hash && account.password_hash !== user.password_hash)) throw signInRequired('Account credentials changed. Please sign in again.');
    // This second statement runs after acquiring the user lock shared with MFA
    // enrollment, so a concurrent enrollment cannot mint a password-only session.
    const mfa = await client.query('SELECT user_id FROM dashboard_mfa WHERE user_id=$1 AND enabled_at IS NOT NULL', [user.id]);
    if (mfa.rows[0] && user.mfa_verified !== true) throw signInRequired('Two-step verification is required. Please sign in again.');
    const sid = crypto.randomBytes(32).toString('base64url');
    const result = await client.query(
      "INSERT INTO dashboard_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now() + interval '8 hours') RETURNING expires_at",
      [digest(sid), user.id]
    );
    const token = signToken({ kind: 'dashboard_session', sessionVersion: 2, userId: user.id, sid }, { expiresIn: ABSOLUTE_TIMEOUT_SECONDS });
    if (!suppliedClient) await client.query('COMMIT');
    return { token, session: { expiresAt: result.rows[0].expires_at, idleTimeoutSeconds: IDLE_TIMEOUT_SECONDS } };
  } catch (error) {
    if (!suppliedClient) await client.query('ROLLBACK');
    throw error;
  } finally { if (!suppliedClient) client.release(); }
}

async function verifyDashboardToken(token, options = {}) {
  const payload = verifyToken(token);
  if (payload.kind !== 'dashboard_session' || payload.sessionVersion !== 2 || typeof payload.userId !== 'string' ||
      typeof payload.sid !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(payload.sid)) {
    throw new Error('Dashboard sign-in required');
  }
  const result = await db.query(
    `${options.touch === false ? 'SELECT user_id FROM dashboard_sessions' : 'UPDATE dashboard_sessions SET last_seen_at=now()'}
     WHERE token_hash=$1 AND user_id=$2 AND revoked_at IS NULL
       AND expires_at>now() AND last_seen_at>now() - interval '30 minutes'
     ${options.touch === false ? '' : 'RETURNING user_id'}`,
    [digest(payload.sid), payload.userId]
  );
  if (!result.rows[0]) throw new Error('Dashboard session expired');
  return payload;
}

async function revokeDashboardSession(token) {
  let payload;
  try { payload = verifyToken(token); } catch (_) { return; }
  if (payload.kind !== 'dashboard_session' || typeof payload.sid !== 'string') return;
  await db.query('UPDATE dashboard_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE token_hash=$1 AND user_id=$2', [digest(payload.sid), payload.userId]);
}

async function revokeUserDashboardSessions(userId, client = db) {
  await client.query('UPDATE dashboard_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [userId]);
}

module.exports = { createDashboardSession, verifyDashboardToken, revokeDashboardSession, revokeUserDashboardSessions };
