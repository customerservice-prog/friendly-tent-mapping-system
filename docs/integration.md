# RentSketch Integration Overview

This is the top-level map of RentSketch's integration documentation. Read this first, then follow the link that matches what you are trying to do.

## Architecture in one paragraph

RentSketch is its own application: a hosted 2D/3D event designer, a multi-tenant API (tenants, products, designs, quote requests), and a business dashboard, all served from rentsketch.com and rentsketch-api-production.up.railway.app. A rental company's own website (for example friendlypartyrental.com) never runs RentSketch's code. It links to or embeds RentSketch's hosted designer, using a tenant slug and, for embedding, a public embed key. See docs/friendly-production.md for exactly what is real today versus planned.

## If you are integrating a rental company's website

Read docs/embed.md for the iframe and loader-script options, then docs/tenant-setup.md to find or create the tenant slug and embed key. Do not copy any RentSketch source file into the company's repository - see the "What NOT to do" section of docs/embed.md.

## If you are building or extending the RentSketch API

Read docs/api.md for every route, docs/webhooks.md for outbound events, and docs/friendly-production.md for current known limitations before assuming a feature is live.

## If you are onboarding a new tenant (rental company)

Read docs/tenant-setup.md.

## If you are the other Claude session working on friendlypartyrental.com

Read the root INTEGRATION_HANDOFF.md first. It is written specifically for that job and links back into this docs/ folder for detail.

## Production URLs

Static frontend (marketing site, demo, hosted designer, dashboard, embed loader): https://rentsketch.com
API: https://rentsketch-api-production.up.railway.app
Friendly Party Rental tenant slug: friendly
