# Saved projects, checkpoints and sharing

Apply `022_design_projects.sql` before deploying this API. It is additive and
safe to rerun. Existing designs start at revision 1; existing signed share
links remain usable until they expire or their owner explicitly revokes them.
The migration does not grant access, copy entitlements, or change scenes.

## Project API

The same routes are available under `/api/tenants/:slug/designs` and
`/api/consumer/designs`. Consumer routes are restricted to NULL/generic-tenant
designs. Tenant routes are always scoped to the requested company.

Customers authenticate using `X-RentSketch-Session`, or
`anonymousSessionId` in a JSON request body. Authorized owner/admin/staff
accounts can operate on their company's customer designs through the normal
HttpOnly dashboard cookie and CSRF transport. Generic-company membership does
not give access to NULL-tenant consumer designs. Platform access requires the
current configured platform administrator identity.

- `POST /`: create a draft with `scene` and an owning browser session.
- `GET /:id`: retrieve the current design and integer `revision`.
- `PATCH /:id`: save `scene` and/or project metadata, with `expectedRevision`.
- `GET /:id/revisions`: list named checkpoints without their private contents.
- `POST /:id/revisions`: save a named checkpoint using `name` and
  `expectedRevision`; this does not increment the working revision.
- `POST /:id/revisions/:revisionId/restore`: restore a checkpoint using
  `expectedRevision`; the working revision increases by one.
- `GET /:id/alternatives`: list the original design and its alternatives.
- `POST /:id/alternatives`: create an alternative with `name`,
  `expectedRevision`, and optional unsaved `scene`. The original is unchanged.

Detail/write responses include `id`, `tenant`, `revision`, `scene`,
`projectName`, `siteNotes`, `updatedAt` and `accessDesignId`. Staff responses
also include `crewNotes` and `staffAccess: true`. New project detail responses
never disclose the customer's browser ownership capability.

Names are limited to 120 characters, site notes to 4,000 and crew notes to
8,000. Crew notes are only readable/writable by staff. Customer checkpoint
restores preserve the current staff notes. Scene JSON is limited to 192 KiB
and 500 entries in each objects/zones/aisles array.

## Concurrency and retention

Every save requires the revision last observed by that client. Missing
`expectedRevision` returns HTTP 428 with `revision_required`; a stale revision
returns HTTP 409 with `revision_conflict` and `currentRevision`. Old clients
cannot silently overwrite a newer design. A conflict must be resolved by
loading the saved version or explicitly retaining local work as an alternative.

Autosaves increment a counter and replace only the working scene. They do not
create an unbounded snapshot history. Named checkpoints are immutable and
limited to 50 per design; the server returns `checkpoint_limit` when full.
Projects permit 20 alternatives including the original. No named checkpoint
is silently deleted to make space. Restore/copy and revision checks are
transactional and serialized by project/design row locks.

An alternative inherits its original project's live entitlement and current
owner capability. Expiration, revocation and booking-owner changes therefore
apply across the family. No additional payment or entitlement is created.
Renewal uses `accessDesignId`; checkout directly against a copy returns HTTP
409 `project_root_checkout` with the original design ID.

Photos referenced by any current design or named checkpoint in the company
are retained during deletion and automatic cleanup, including scan-frame
URLs and alternative scenes. A retained deletion returns `{ok:true,
retained:true}`. Uploads lock the project root and enforce a shared limit of
128 photos and 256 MiB across alternatives. Limit errors return HTTP 413
`project_photo_limit`. Unreferenced older captures are cleaned up; referenced
assets are never silently removed to satisfy a quota.

## Read-only sharing

- `POST /:id/share` accepts `expiresInDays` of 1, 7, 30 or 180 (default 30),
  returning `id`, `url`, `expiresAt` and `expiresInDays`.
- `GET /:id/shares` lists share metadata and `legacySharesEnabled`.
- `DELETE /:id/shares/:shareId` revokes one link immediately.
- `POST /:id/shares/revoke-legacy` invalidates every pre-project signed link
  for that design. It does not revoke new individually managed links.

New links use random capabilities with only their SHA-256 hashes stored in
the database. At most 20 links may be active per design. Inactive history is
bounded during link creation. Tokens travel in the URL fragment and are
redeemed with `POST /api/tenants/:slug/shared-design/restore`, including the
generic slug for NULL-tenant designs. A link shows the current saved layout.

Shared responses include layout geometry, photo composition, scan data, venue
photos and site notes. They omit owner credentials, recovery/payment links,
private crew notes, customer identity and structured contact/address/ZIP
fields, including nested fields in the scene. Event name/date remain visible.
Users should treat site notes and venue photos as content they are sharing;
free-form prose is not automatically classified for personal information.
Share capabilities cannot edit, copy, restore checkpoints or list history.

Run `node tests/design-projects-api.cjs` for isolated Postgres/HTTP coverage of
concurrent saves, authorization/CSRF, restoration/rollback, inheritance,
ownership rotation, sharing/redaction and concurrent photo quotas. Existing
Event Pass, sharing and outdoor-save suites also exercise the new contract.
