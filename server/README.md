# RentSketch Server (Foundation)

This is the first real backend for RentSketch. It exists so tenants,
products, designs, and quote requests can be **real persisted records**
instead of hardcoded JavaScript files and `mailto:` links.

## Status

This code has been written but **not run or deployed yet**. It was authored
through a browser-only tool with no code execution environment, so treat it
as a reviewed-but-untested starting point, not a verified production
service. Before deploying, install dependencies locally and smoke-test each
route against a real database.

## What this replaces

- `js/data/tenant.js` hardcoded `FRIENDLY_TENANT` / `GENERIC_TENANT` objects
  become real rows in a `tenants` table (plus `products` rows for tents,
  tables, and chairs).
- The `mailto:` quote request link in `script.js` becomes a real
  `POST /api/tenants/:slug/quote-requests`, stored in a `quote_requests`
  table a rental company can actually log in and read.
- The in-memory-only layout store gets an optional
  `POST /api/tenants/:slug/designs` so a layout can be saved server-side
  and referenced from a quote request.

## Requirements

For the current optional authenticator implementation and key configuration,
see [Dashboard MFA operations](docs/dashboard-mfa.md).

- Node.js 18+
- A Postgres database (any host works: Render, Railway, Supabase, Neon, or
  your own server). This was intentionally kept to plain `pg` (no ORM) so
  it is easy to read and swap later.

## Setup

```bash
cd server
npm install
cp .env.example .env   # then fill in DATABASE_URL and JWT_SECRET
psql "$DATABASE_URL" -f schema.sql
npm run seed:friendly   # loads Friendly Party Rental as the first real tenant
npm start
```

The server listens on `PORT` (default 4000) and exposes:

- `GET /health`
- `POST /api/auth/login`
- `GET /api/tenants/:slug` (public branding lookup)
- `GET /api/tenants/:slug/products` (public catalog)
- `POST /api/tenants/:slug/designs` (public, saves a layout snapshot)
- `POST /api/tenants/:slug/quote-requests` (public, customer submits a request)
- `GET /api/tenants/:slug/quote-requests` (staff-only, requires login + tenant membership)
- `PATCH /api/tenants/:slug/quote-requests/:id` (staff-only, update status/notes)

## Deploying

Any Node host works (Render, Railway, Fly.io, a plain VPS, etc.). You will
need to create that hosting account and the Postgres database yourself -
this repository cannot provision either of those for you. Once deployed,
set `ALLOWED_ORIGINS` to the real frontend origins (rentsketch.com, the
GitHub Pages URL, and eventually each tenant's own domain) and point the
frontend's `window.RENTSKETCH_API_URL` (see `script.js`) at the deployed
URL.

## Not built yet (see /docs/ROADMAP.md in the repo root)

- Stripe billing / subscriptions (schema has placeholder tables only)
- Signup / self-service onboarding for a second tenant
- CSV product import
- Master visual library / visual mapping UI
- Platform admin
