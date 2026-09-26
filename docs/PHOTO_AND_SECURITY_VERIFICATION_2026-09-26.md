# Photo placement and dashboard security — 2026-09-26

## Findings and changes

The signed-out production platform URL redirected to the login form. The reported automatic dashboard entry was remembered authentication: a seven-day local bearer token, automatic login-page redirection, no server session revocation, and no idle timeout. That behavior was inappropriate for shared computers even though anonymous dashboard API access remained protected.

Dashboard authentication now uses server-recorded sessions with a random hashed session identifier, eight-hour absolute expiry and thirty-minute idle expiry. The server looks up current account and tenant permissions; it does not trust privilege claims in the token. Old tokens are rejected. Opening the explicit login route or bare dashboard entry clears the remembered session. Logout revokes the server session and immediately clears private UI across tabs. Password changes, resets and bootstrap password replacement revoke all sessions. Racing password changes cannot issue sessions from an obsolete password hash. Responses from a previous session cannot render private data into a new session or invalidate its token.

Dashboard HTML and API responses prohibit storage. Dashboard pages reject framing and use a same-origin-only script CSP; account/reset scripts were extracted from inline HTML. The customer designer remains embeddable. Session tokens remain in bounded local storage for the existing cross-tab staff designer workflow; this is not an HttpOnly-cookie migration.

Additional confirmed fixes:

- The unused legacy deposit-checkout endpoint accepted a customer-controlled estimate as the payment amount. It now returns 410. Normal Event Pass and booking flows retain their separate endpoints. Legacy webhook fulfillment validates the recorded checkout, tenant, paid payment mode, currency and exact positive amount, with entitlement and idempotency updates in one transaction.
- Outbound webhooks resolve and pin public destination addresses, reject private/mixed DNS answers and redirects, and bound DNS/request time, body, headers and response size. Original-hostname TLS verification remains enabled.
- Rate-limit keys reject arbitrary forwarded IP chains. Railway's documented single original-client-IP header is used only in its marked runtime; other environments use the socket address. Account-specific login limits also remain in force.
- Production dependencies now have a reproducible lockfile. The release-time production dependency audit reported zero known vulnerabilities; this is a point-in-time result.

The photo preview previously used inconsistent 2D/3D projection and framing, did not let the main tent be dragged correctly, and offered an interior camera movement that a flat image cannot support. It now shares one ground-plane projection, image framing and tent/furnishing transform. The tent and individual rentals can be dragged, rentals can be placed outside the tent, and placement persists through save/reload. The toolbar has readable active states, an Adjust photo action and smaller empty-state controls. Mobile Help no longer covers the view switcher. Fit status stays neutral until manual calibration and boundary tracing.

## Verification

- Real signed-out production platform navigation redirects to login. Cloud-browser WebGL was unavailable; this session's GPU/customer interaction checks therefore used isolated local Chromium with synthetic venue images and mocked access APIs, not a real customer purchase or production admin session.
- Chromium photo journey: upload, tent drag, table placement beyond tent bounds, save/reload with exact placement restoration, calibration, obstacle tracing, scan preview, walk and measurement controls.
- Three camera ground positions match Photo View within 0.01 pixels at desktop, wide and mobile viewport sizes. Cancelled drag and rotated attached furniture regressions are covered.
- Desktop/mobile platform console browser journey and eighteen dashboard session DOM cases pass, including cross-tab login/logout, idle/absolute expiry, stale responses and clearing account fields.
- Real JWT/PGlite session tests cover revocation, expiry, password/reset races, bootstrap replacement, purpose isolation and current authorization. Event Pass, paid-order, tenant, sharing and photo-save regressions are included in the release test gate.
- Legacy payment, webhook SSRF and spoofed forwarded-IP regressions are included in the release gate.
- Caddy 2.10.2 accepts the configuration. Serving the actual files verifies dashboard no-store, strict CSP and frame denial while retaining designer embedding.

## Deliberate limits and next security work

This is a targeted code and flow audit, not a certification that every possible vulnerability has been eliminated. Production authentication testing did not access a user's account, change a password, send messages or make payments. Rate-limit state is still per process; shared rate limiting is needed before horizontal scaling. The Railway edge's documented IP-header contract was not independently penetration-tested. Administrator MFA, a same-origin backend-for-frontend with HttpOnly sessions, centralized security alerts and an independent penetration test remain appropriate follow-up work.

A single venue photograph supports placement from its known viewpoint. Ground correspondence does not establish real scale, focal length, accurate object heights, hidden geometry or a navigable reconstruction. Dimensions and fit require measured calibration and installer review. More convincing navigation requires validated multi-view reconstruction or a metric scan with explicit quality checks; it must not be represented by moving a flat photograph or inventing unseen property geometry.
