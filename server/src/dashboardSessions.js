const crypto = require('crypto');
const db = require('./db');
const { signToken, verifyToken } = require('./auth');

const IDLE_TIMEOUT_SECONDS = 30 * 60;
const ABSOLUTE_TIMEOUT_SECONDS = 8 * 60 * 60;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

async function createDashboardSession(user, client = db) {
  const sid = crypto.randomBytes(32).toString('base64url');
  // Matching the verified hash prevents a racing password reset from creating
  // a new session from credentials that have just been replaced.
  const result = await client.query(
    `WITH account AS (
       SELECT id FROM users WHERE id=$2 AND ($3::text IS NULL OR password_hash=$3) FOR UPDATE
     )
     INSERT INTO dashboard_sessions(token_hash,user_id,expires_at)
     SELECT $1,id,now() + interval '8 hours' FROM account RETURNING expires_at`,
    [digest(sid), user.id, user.password_hash || null]
  );
  if (!result.rows[0]) throw new Error('Account credentials changed. Please sign in again.');
  const token = signToken({ kind: 'dashboard_session', userId: user.id, sid }, { expiresIn: ABSOLUTE_TIMEOUT_SECONDS });
  return { token, session: { expiresAt: result.rows[0].expires_at, idleTimeoutSeconds: IDLE_TIMEOUT_SECONDS } };
}

async function verifyDashboardToken(token) {
  const payload = verifyToken(token);
  if (payload.kind !== 'dashboard_session' || typeof payload.userId !== 'string' ||
      typeof payload.sid !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(payload.sid)) {
    throw new Error('Dashboard sign-in required');
  }
  const result = await db.query(
    `UPDATE dashboard_sessions SET last_seen_at=now()
     WHERE token_hash=$1 AND user_id=$2 AND revoked_at IS NULL
       AND expires_at>now() AND last_seen_at>now() - interval '30 minutes'
     RETURNING user_id`,
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
