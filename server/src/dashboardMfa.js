const crypto = require('crypto');
const db = require('./db');
const { verifyPassword } = require('./auth');
const { revokeUserDashboardSessions } = require('./dashboardSessions');

const ISSUER = 'RentSketch';
const STEP_SECONDS = 30;
const CHALLENGE_ATTEMPTS = 5;
const ACCOUNT_ATTEMPTS = 10;
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

class MfaError extends Error {
  constructor(status, message, commit = false) { super(message); this.status = status; this.commit = commit; }
}

function key(purpose) {
  const configured = process.env.MFA_ENCRYPTION_KEY;
  if ((configured && !/^[a-fA-F0-9]{64}$/.test(configured)) || (!configured && process.env.NODE_ENV === 'production')) {
    throw new MfaError(503, 'Authenticator security is temporarily unavailable. Please contact RentSketch support.');
  }
  // Dedicated production key keeps signing-key rotation from making an
  // enrolled authenticator unreadable. Never log or return this key.
  const secret = configured ? Buffer.from(configured, 'hex') : (process.env.JWT_SECRET || 'dev-secret-change-me');
  return Buffer.from(crypto.hkdfSync('sha256', secret, 'rentsketch.dashboard.mfa.v1', purpose, 32));
}
function encodeBase32(bytes) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { result += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
function decodeBase32(secret) {
  if (typeof secret !== 'string' || !/^[A-Z2-7]+$/.test(secret)) throw new Error('Invalid authenticator secret');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0; const bytes = [];
  for (const letter of secret) {
    value = (value << 5) | alphabet.indexOf(letter); bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}
// RFC 4226 dynamic truncation / RFC 6238. SHA-1, six digits, 30 seconds are
// provisioned explicitly for mainstream authenticator compatibility.
function totp(secret, unixSeconds = Date.now() / 1000, digits = 6, algorithm = 'sha1') {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(unixSeconds / STEP_SECONDS)));
  const mac = crypto.createHmac(algorithm, decodeBase32(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits)).toString().padStart(digits, '0');
}
function matchingStep(secret, code, lastUsedStep = -1, unixSeconds = Date.now() / 1000) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) return null;
  const supplied = Buffer.from(code.trim());
  const current = Math.floor(unixSeconds / STEP_SECONDS);
  // ± one step tolerates device clock skew. A successful counter cannot be
  // used again, even on another challenge or security-settings operation.
  let match = null;
  for (const offset of [-1, 0, 1]) {
    const step = current + offset;
    if (step < 0) continue;
    const same = crypto.timingSafeEqual(supplied, Buffer.from(totp(secret, step * STEP_SECONDS)));
    if (same && step > Number(lastUsedStep)) match = step;
  }
  return match;
}
function encryptSecret(userId, secret) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key('totp-encryption'), nonce);
  cipher.setAAD(Buffer.from('rentsketch-mfa:' + userId));
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}
function decryptSecret(userId, value) {
  const [version, nonce, tag, encrypted, extra] = String(value || '').split('.');
  if (version !== 'v1' || !nonce || !tag || !encrypted || extra) throw new Error('Invalid encrypted authenticator secret');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key('totp-encryption'), Buffer.from(nonce, 'base64url'));
  decipher.setAAD(Buffer.from('rentsketch-mfa:' + userId));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}
function recoveryHash(userId, code) {
  const normalized = typeof code === 'string' ? code.toUpperCase().replace(/[\s-]/g, '') : '';
  if (!/^[A-F0-9]{32}$/.test(normalized)) return null;
  return crypto.createHmac('sha256', key('recovery-code-hashing')).update(userId + ':' + normalized).digest('hex');
}

async function transaction(work) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query(error instanceof MfaError && error.commit ? 'COMMIT' : 'ROLLBACK');
    throw error;
  } finally { client.release(); }
}

// All MFA writers lock the user before MFA/challenge rows. Session creation
// and password replacement use that same lock, closing enrollment/login races.
async function lockAccount(client, userId) {
  const result = await client.query('SELECT id,email,password_hash,display_name FROM users WHERE id=$1 FOR UPDATE', [userId]);
  if (!result.rows[0]) throw new MfaError(401, 'Sign in again to continue.');
  await client.query('INSERT INTO dashboard_mfa(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING', [userId]);
  const mfa = await client.query('SELECT *,clock_timestamp() AS server_now FROM dashboard_mfa WHERE user_id=$1 FOR UPDATE', [userId]);
  return { user: result.rows[0], mfa: mfa.rows[0] };
}
function checkLimit(mfa) {
  if (mfa.locked_until && new Date(mfa.locked_until) > new Date(mfa.server_now)) {
    throw new MfaError(429, 'Too many security-code attempts. Wait 15 minutes and try again.');
  }
}
async function failAttempt(client, userId, message = 'The security code is invalid or already used. Try a new code.') {
  await client.query(`UPDATE dashboard_mfa SET
    failed_attempts=CASE WHEN attempt_window_start <= now()-interval '15 minutes' THEN 1 ELSE failed_attempts+1 END,
    locked_until=CASE WHEN attempt_window_start > now()-interval '15 minutes' AND failed_attempts+1 >= $2 THEN now()+interval '15 minutes' ELSE NULL END,
    attempt_window_start=CASE WHEN attempt_window_start <= now()-interval '15 minutes' THEN now() ELSE attempt_window_start END
    WHERE user_id=$1`, [userId, ACCOUNT_ATTEMPTS]);
  throw new MfaError(400, message, true);
}
async function passwordCheck(client, user, mfa, password) {
  checkLimit(mfa);
  if (typeof password !== 'string' || !password || password.length > 256 || !await verifyPassword(password, user.password_hash)) {
    await failAttempt(client, user.id, 'Current password is incorrect.');
  }
}
async function consumeFactor(client, user, mfa, code) {
  if (!mfa.enabled_at) throw new MfaError(409, 'Authenticator security is not enabled.');
  const step = matchingStep(decryptSecret(user.id, mfa.secret_ciphertext), code, mfa.last_used_step, new Date(mfa.server_now).getTime() / 1000);
  if (step !== null) {
    await client.query('UPDATE dashboard_mfa SET last_used_step=$2 WHERE user_id=$1', [user.id, step]);
    return;
  }
  const hash = recoveryHash(user.id, code);
  if (hash) {
    const used = await client.query('UPDATE dashboard_mfa_recovery SET used_at=now() WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL RETURNING code_hash', [user.id, hash]);
    if (used.rows[0]) return;
  }
  await failAttempt(client, user.id);
}
async function resetFailures(client, userId) {
  await client.query('UPDATE dashboard_mfa SET failed_attempts=0,locked_until=NULL,attempt_window_start=now() WHERE user_id=$1', [userId]);
}
async function replaceRecoveryCodes(client, userId) {
  const codes = Array.from({ length: 10 }, () => crypto.randomBytes(16).toString('hex').toUpperCase().match(/.{8}/g).join('-'));
  await client.query('DELETE FROM dashboard_mfa_recovery WHERE user_id=$1', [userId]);
  for (const code of codes) await client.query('INSERT INTO dashboard_mfa_recovery(user_id,code_hash) VALUES($1,$2)', [userId, recoveryHash(userId, code)]);
  return codes;
}
async function invalidateMfaChallenges(userId, client = db) {
  await client.query('UPDATE dashboard_mfa_challenges SET consumed_at=COALESCE(consumed_at,now()) WHERE user_id=$1 AND consumed_at IS NULL', [userId]);
  await client.query('UPDATE dashboard_mfa SET pending_ciphertext=NULL,pending_expires_at=NULL,pending_credential_hash=NULL WHERE user_id=$1', [userId]);
}
async function securityChanged(client, userId) {
  await invalidateMfaChallenges(userId, client);
  await revokeUserDashboardSessions(userId, client);
  await resetFailures(client, userId);
}

async function getMfaStatus(userId) {
  const result = await db.query(`SELECT enabled_at,pending_expires_at,
    (SELECT count(*)::int FROM dashboard_mfa_recovery WHERE user_id=$1 AND used_at IS NULL) AS remaining
    FROM dashboard_mfa WHERE user_id=$1`, [userId]);
  const row = result.rows[0];
  return { enabled: Boolean(row?.enabled_at), enabledAt: row?.enabled_at || null,
    recoveryCodesRemaining: row?.enabled_at ? row.remaining : 0,
    pendingEnrollment: Boolean(row?.pending_expires_at && new Date(row.pending_expires_at) > new Date()) };
}
async function startEnrollment(userId, currentPassword) {
  return transaction(async client => {
    const { user, mfa } = await lockAccount(client, userId);
    await passwordCheck(client, user, mfa, currentPassword);
    if (mfa.enabled_at) throw new MfaError(409, 'An authenticator is already enabled. Remove it with a current code before replacing it.');
    const secret = encodeBase32(crypto.randomBytes(20));
    const saved = await client.query(`UPDATE dashboard_mfa SET pending_ciphertext=$2,
      pending_expires_at=now()+interval '10 minutes',pending_credential_hash=$3 WHERE user_id=$1 RETURNING pending_expires_at`,
    [userId, encryptSecret(userId, secret), sha256(user.password_hash)]);
    return { secret, otpauthUri: `otpauth://totp/${encodeURIComponent(ISSUER + ':' + user.email)}?secret=${secret}&issuer=${ISSUER}&algorithm=SHA1&digits=6&period=30`, expiresAt: saved.rows[0].pending_expires_at };
  });
}
async function confirmEnrollment(userId, currentPassword, code) {
  return transaction(async client => {
    const { user, mfa } = await lockAccount(client, userId);
    await passwordCheck(client, user, mfa, currentPassword);
    if (mfa.enabled_at) throw new MfaError(409, 'An authenticator is already enabled.');
    if (!mfa.pending_ciphertext || new Date(mfa.pending_expires_at) <= new Date(mfa.server_now) || mfa.pending_credential_hash !== sha256(user.password_hash)) {
      throw new MfaError(400, 'Authenticator setup expired. Start setup again.');
    }
    const step = matchingStep(decryptSecret(userId, mfa.pending_ciphertext), code, -1, new Date(mfa.server_now).getTime() / 1000);
    if (step === null) await failAttempt(client, userId);
    await client.query('UPDATE dashboard_mfa SET secret_ciphertext=pending_ciphertext,enabled_at=now(),last_used_step=$2 WHERE user_id=$1', [userId, step]);
    const recoveryCodes = await replaceRecoveryCodes(client, userId);
    await securityChanged(client, userId);
    return { enabled: true, recoveryCodes, signInRequired: true };
  });
}
async function changeMfa(userId, currentPassword, code, action) {
  if (!['disable', 'recovery-codes'].includes(action)) throw new Error('Unknown MFA action');
  return transaction(async client => {
    const { user, mfa } = await lockAccount(client, userId);
    await passwordCheck(client, user, mfa, currentPassword);
    await consumeFactor(client, user, mfa, code);
    let recoveryCodes;
    if (action === 'disable') {
      await client.query('UPDATE dashboard_mfa SET secret_ciphertext=NULL,enabled_at=NULL,last_used_step=-1 WHERE user_id=$1', [userId]);
      await client.query('DELETE FROM dashboard_mfa_recovery WHERE user_id=$1', [userId]);
    } else recoveryCodes = await replaceRecoveryCodes(client, userId);
    await securityChanged(client, userId);
    return { enabled: action !== 'disable', ...(recoveryCodes ? { recoveryCodes } : {}), signInRequired: true };
  });
}

// Called only after password verification. Opaque challenge tokens are never
// dashboard credentials; only a hash and password-version binding are stored.
async function createMfaLoginChallenge(verifiedUser) {
  return transaction(async client => {
    const { user, mfa } = await lockAccount(client, verifiedUser.id);
    if (user.password_hash !== verifiedUser.password_hash) throw new MfaError(401, 'Account credentials changed. Sign in again.');
    if (!mfa.enabled_at) return null;
    checkLimit(mfa);
    const token = crypto.randomBytes(32).toString('base64url');
    await client.query("DELETE FROM dashboard_mfa_challenges WHERE user_id=$1 AND (expires_at<=now() OR consumed_at IS NOT NULL)", [user.id]);
    const saved = await client.query(`INSERT INTO dashboard_mfa_challenges(token_hash,user_id,credential_hash,expires_at)
      VALUES($1,$2,$3,now()+interval '5 minutes') RETURNING expires_at`, [sha256(token), user.id, sha256(user.password_hash)]);
    return { mfaRequired: true, challengeToken: token, expiresAt: saved.rows[0].expires_at };
  });
}
async function completeMfaLogin(challengeToken, code, issueSession) {
  if (typeof challengeToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(challengeToken)) throw new MfaError(401, 'Sign-in expired. Enter your email and password again.');
  return transaction(async client => {
    const initial = await client.query('SELECT user_id FROM dashboard_mfa_challenges WHERE token_hash=$1', [sha256(challengeToken)]);
    if (!initial.rows[0]) throw new MfaError(401, 'Sign-in expired. Enter your email and password again.');
    const { user, mfa } = await lockAccount(client, initial.rows[0].user_id);
    checkLimit(mfa);
    const result = await client.query('SELECT * FROM dashboard_mfa_challenges WHERE token_hash=$1 FOR UPDATE', [sha256(challengeToken)]);
    const challenge = result.rows[0];
    if (!challenge || challenge.consumed_at || new Date(challenge.expires_at) <= new Date(mfa.server_now) ||
        challenge.attempts >= CHALLENGE_ATTEMPTS || challenge.credential_hash !== sha256(user.password_hash) || !mfa.enabled_at) {
      throw new MfaError(401, 'Sign-in expired. Enter your email and password again.');
    }
    await client.query('UPDATE dashboard_mfa_challenges SET attempts=attempts+1 WHERE token_hash=$1', [sha256(challengeToken)]);
    await consumeFactor(client, user, mfa, code);
    await client.query('UPDATE dashboard_mfa_challenges SET consumed_at=now() WHERE token_hash=$1', [sha256(challengeToken)]);
    await resetFailures(client, user.id);
    const session = await issueSession({ ...user, mfa_verified: true }, client);
    return { user, session };
  });
}

module.exports = { getMfaStatus, startEnrollment, confirmEnrollment, changeMfa,
  createMfaLoginChallenge, completeMfaLogin, invalidateMfaChallenges,
  totp, matchingStep, encodeBase32, decodeBase32, encryptSecret, decryptSecret, MfaError };
