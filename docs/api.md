# RentSketch API Reference

Base URL (production): `https://rentsketch-api-production.up.railway.app`

All request/response bodies are JSON. All tenant-scoped routes are prefixed
with `/api/tenants/:slug`, where `:slug` is the rental company's tenant slug
(e.g. `friendly`).

## Authentication

Staff (business dashboard) authentication is a bearer JWT. Customers never
authenticate - saving a design and submitting a quote request are anonymous.

```
POST /api/auth/login
Body: { "email": "...", "password": "..." }
Response: { "token": "...", "user": { "id", "email", "displayName" } }
```

```
GET /api/auth/me
Header: Authorization: Bearer <token>
Response: { "user": {...}, "tenants": [{ "slug", "name", "role" }, ...] }
```

Send the token on every staff request as `Authorization: Bearer <token>`.

## Public tenant config

```
GET /api/tenants/:slug
```

Returns only public-safe branding fields (no billing, no internal IDs, no
embed/webhook secrets): id, slug, name, logoUrl, contactEmail, phone,
website, tagline, primaryColor, secondaryColor, showPrices, poweredByEnabled.

## Products (catalog)

```
GET  /api/tenants/:slug/products                (public - designer reads this)
POST /api/tenants/:slug/products                (staff only)
PATCH  /api/tenants/:slug/products/:id           (staff only)
DELETE /api/tenants/:slug/products/:id           (staff only - soft delete)
```

Product fields: category, externalId, name, sku, pricePerDay, priceType,
widthFt, lengthFt, capacity, photoUrl, active, sortOrder. externalId matches
the id used in the designer's bundled catalog (e.g. pole-20x40) so a company
can override name/price for an existing designer item without waiting on a
deploy. Products without a matching externalId are stored and returned by
the API, but will not yet render inside the 2D/3D designer until a future
visual-mapping feature ships - see docs/friendly-production.md for the
current scope of this limitation.

## Designs

```
POST /api/tenants/:slug/designs      (public - anonymous, no login required)
GET  /api/tenants/:slug/designs      (staff only - last 50, for the dashboard)
```

POST body: scene, eventType, guestCount, estimateTotal, anonymousSessionId,
schemaVersion. scene is required.

## Quote Requests

```
POST /api/tenants/:slug/quote-requests             (public)
GET  /api/tenants/:slug/quote-requests             (staff only)
PATCH /api/tenants/:slug/quote-requests/:id         (staff only)
```

POST creates a real persisted row (not just an email) and, if the tenant has
a webhook configured, fires quote_request.created (see docs/webhooks.md).
customerName and customerEmail are required. PATCH accepts status and notes,
where status is one of new, contacted, quoted, booked, declined.

## Tenant admin / branding

```
GET   /api/tenants/:slug/admin      (staff only - full record incl. embedKey,
                                      allowedOrigins, webhookUrl, subscription)
PATCH /api/tenants/:slug            (staff only - update branding/settings)
```

PATCH accepts any subset of: name, logoUrl, contactEmail, phone, website,
tagline, primaryColor, secondaryColor, showPrices, poweredByEnabled,
allowedOrigins, webhookUrl, webhookSecret.

## Errors

Every error response is `{ "error": "human readable message" }` with an
appropriate HTTP status (400 validation, 401 unauthenticated, 403
unauthorized-for-this-tenant, 404 not found, 500 unexpected).

## Not yet built

Stripe billing endpoints, CSV product import, and a master visual-mapping
API are not part of this API yet. See the root INTEGRATION_HANDOFF.md and
docs/friendly-production.md for current scope and known limitations.
