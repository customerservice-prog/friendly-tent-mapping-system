# Dashboard MFA operations

Authenticator MFA is optional. Deploying migration `021_account_security.sql`
does not enroll an account, change a password, or require a factor for an
unenrolled account. Enrollment belongs to the signed-in account holder.

## Configuration and key handling

Set `MFA_ENCRYPTION_KEY` to a separate cryptographically random 32-byte key,
encoded as exactly 64 hexadecimal characters. Store it in the production
secret manager and retain a protected backup. Do not commit or log it.

The backend derives separate encryption and recovery-hashing keys with HKDF.
TOTP secrets use AES-256-GCM with a fresh nonce and the account ID as
authenticated additional data. Recovery codes are 128-bit random values,
stored only as purpose-separated keyed hashes. Raw recovery codes are returned
only once after enrollment or regeneration, never by the status endpoint.

JWT signing-key rotation is independent of this key. Changing
`MFA_ENCRYPTION_KEY` without a data migration makes existing authenticator
secrets and recovery hashes unusable. There is no automated key-rotation
migration in this release. Keep the prior key available for a controlled
re-encryption/recovery-code migration before rotating it. Missing or malformed
production keys make MFA cryptographic operations fail closed with a generic
service-unavailable message; ordinary unenrolled sign-in continues to work.

## Account flow

Authenticated enrollment requires the current password. The user adds the
manual secret to an authenticator and proves possession with a current code
before activation. Pending setup expires after ten minutes. Activation shows
ten recovery codes and revokes all dashboard sessions, including the current
session. The user should save the recovery codes and sign in again. The setup
code was consumed; wait for the next 30-second code or use a recovery code.

An enrolled account receives a five-minute opaque challenge after a correct
password. This challenge is not a dashboard token and cannot access protected
APIs. Verification accepts a current authenticator code or one unused recovery
code. The challenge, factor consumption, and dashboard-session creation are
committed together under the account row lock. Failed session creation rolls
back factor consumption so a transient database error does not burn a code.

Each challenge permits five code attempts. Failed factor or security-setting
password checks are also counted across challenges in Postgres: ten failures
within fifteen minutes lock security-code attempts for fifteen minutes. TOTP
accepts one 30-second step of clock skew in each direction, but a successful
counter cannot be reused across login or account-security operations.

Removing MFA or regenerating recovery codes requires both the current password
and a fresh factor/recovery code. Either operation revokes all sessions and
pending sign-in challenges. Regeneration invalidates all prior recovery codes.
Replacing an authenticator requires removing the existing factor first.

Password change/reset invalidates all sessions, MFA login challenges, and
pending enrollment, but preserves enabled MFA. Password recovery therefore
does not bypass the second factor. Losing both the authenticator and every
recovery code has no automated factor-removal fallback in this release.

## Verification and limits

Run `node tests/dashboard-mfa-api.cjs` from the repository root after installing
test dependencies. It checks RFC 6238 vectors, authenticated encryption,
dedicated-key behavior, replay/concurrent consumption, account attempt limits,
password binding, rollback, and the actual login/MFA/JWT/HttpOnly-cookie flow.
All fixtures use isolated local database records.

TOTP is not phishing-resistant. Passkeys and a separately reviewed lost-factor
support process remain possible follow-up work. No single test suite is a
claim that the entire application has no security risks.

Primary implementation references:

- https://www.rfc-editor.org/rfc/rfc6238
- https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
