# Account security follow-up — September 26, 2026

## Released behavior

Dashboard credentials now stay in a host-only, Secure, HttpOnly, SameSite=Strict cookie. Browser responses contain only non-authenticating session metadata. Browser storage is used only for cross-tab notices, not bearer tokens or authenticator secrets. Staff requests use the same-origin `/staff-api` proxy; customer preview, paid access and order ownership retain their existing independent authorization. Earlier JavaScript-readable dashboard tokens are rejected through a new session-version claim.

Cookie-authenticated requests enforce the exact dashboard origin and reject cross-site fetch metadata. Mutations additionally require the session's CSRF header. Sign-in and signup require a custom dashboard header and valid origin before issuing a cookie. Reading session metadata does not extend server idle expiry; actual user activity sends a protected heartbeat. The existing thirty-minute idle and eight-hour maximum limits remain. Logout revokes the server session without deleting a cookie in a late response, which prevents an old logout from erasing a newer cross-tab sign-in.

**Account security** is available from the business and platform dashboards. It provides password changes, active-session listing and revocation, and optional authenticator-based two-step verification. Setup requires the current password and a valid authenticator code before activation. Ten recovery codes are shown once, with local copy/download controls. Each is usable once. Codes, setup secrets and password inputs are cleared from the page on cancellation, session changes and page exit. No production account is enrolled automatically.

MFA-enabled sign-in issues no authenticated session until the second factor succeeds. Challenges expire after five minutes and allow at most five attempts; account-level failures are limited persistently. TOTP steps cannot be replayed, recovery codes are consumed atomically, and failed session creation rolls factor consumption back. Enabling/disabling MFA or replacing recovery codes revokes existing sessions. Password reset preserves MFA and invalidates pending login challenges. MFA secrets use authenticated encryption and a dedicated server key; recovery codes are stored as keyed hashes. See `server/docs/dashboard-mfa.md` for key backup and recovery procedures.

The proxy supplies client-IP metadata only through an authenticated server-to-server hop over verified HTTPS. A dedicated proxy key grants no user access and is never returned to browsers. Forged or malformed proxy metadata falls back to the existing trusted edge/socket identity. Custom security headers are redacted from Caddy access logs.

Real Caddy testing discovered that path normalization could bypass a URL-only source-file deny rule. Dot segments are now rejected before routing, and backend/documentation/test directories are also hidden by filesystem path. Staff proxy paths cannot fall through into static serving. The CI regression checks raw and encoded traversal, method/body/query forwarding, cookies, protected responses, header overwriting and log redaction using a loopback fixture API.

## Verification and scope

- Real JWT/PGlite/API tests cover cookie attributes, absence of JSON bearer credentials, CSRF/origin checks, old-token rejection, session ownership/revocation and idle behavior.
- MFA tests include RFC vectors, encrypted-secret binding/tamper checks, one-use factors, persisted limits, actual password-reset behavior and the complete password → second factor → signed cookie → protected API → logout path.
- Dashboard lifecycle and browser tests exercise explicit sign-in, MFA forms, cross-tab logout, late replies, password form clearing and desktop/mobile dashboards.
- Staff designer tests use the new cookie transport for actual photo saves/uploads; public customer requests omit cookies. The photo journey retains tent dragging, outside-tent placement, save/reload, scan and measurement behavior.
- Account security UI tests use isolated fixtures. No live user password, MFA enrollment, recovery code, payment or customer record is changed by verification.

Deployment requires migration `021_account_security.sql` and the separately configured `MFA_ENCRYPTION_KEY` and `DASHBOARD_PROXY_KEY`. The dedicated MFA key must be retained with database backups; changing it requires re-encrypting factors and handling recovery hashes. JWT signing-key rotation does not change this encryption key.

This remains a targeted security review. Login rate-limit maps remain per-process, while second-factor attempts are database-backed. Shared password-login rate limiting is still needed before multiple API replicas. Independent penetration testing and ongoing vulnerability monitoring remain appropriate operational follow-up work.
