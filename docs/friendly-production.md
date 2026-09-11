# Friendly Party Rental in Production: Current State and Known Limitations

This document is the honest, current-state companion to docs/tenant-setup.md, docs/embed.md, docs/api.md, and the root INTEGRATION_HANDOFF.md. It exists so nobody (including a future engineer, a future Claude session, or the business owner) overclaims what is actually live.

## What is real and live today

A real Postgres-backed multi-tenant backend at https://rentsketch-api-production.up.railway.app, with tenants, users, tenant_memberships, products, designs, and quote_requests as real tables, not JS config files. Friendly Party Rental exists as tenant slug friendly, a real row, created the same way any other tenant would be. The public designer at https://rentsketch.com/designer/ reads Friendly's branding from the live API and overlays live product name/price changes onto the bundled catalog. The "Request a Quote" flow creates a real quote_requests row via POST /api/tenants/friendly/quote-requests, not just a mailto: link. A business dashboard at https://rentsketch.com/dashboard/ lets a logged-in Friendly staff member view quote requests, edit products, edit branding, and get embed code from the Install page. An embed loader (embed/v1.js) and iframe option exist for installing the designer on friendlypartyrental.com without copying any RentSketch source into that repository.

## Known limitation: visual mapping

Tents, tables, and chairs keep their real geometry (dimensions, shapes, seat counts, silhouettes) from the bundled JS files in js/data/, not from the database, because that data does not exist in the products table schema. The live overlay only changes name and price for products whose external_id matches an existing bundled catalog id. A brand-new product added from the dashboard with no matching external_id is stored and returned by the API, but will not render inside the 2D/3D designer yet. This is intentional: building a full visual-mapping system (letting any new product pick a rendering shape) was explicitly out of scope for this pass, to avoid risking the working scene engine. Treat "add a product" on the dashboard as "add pricing/catalog metadata" today, not yet "add a fully new visual item," until a visual-mapping feature is built and documented here as live.

## Known limitation: roles

tenant_memberships.role (owner/admin/staff/viewer) is stored but not yet enforced beyond "does this user have any membership on this tenant." Every staff member currently has equal access to every staff-only route on their tenant.

## Known limitation: billing

Stripe is not integrated. tenants.subscription_plan and subscription_status exist as real columns and Friendly is stored as an internal/comped tenant so it is never blocked by billing, but there is no self-serve checkout, no webhook-driven plan changes, and no enforcement of plan limits anywhere in the code yet.

## Known limitation: email

Quote request confirmation emails to customers and staff notification emails are not implemented. The only current notification path for a rental company is logging into the dashboard's Requests page, or configuring a webhook (see docs/webhooks.md).

## Known limitation: signup

There is no self-service "create your own RentSketch account" flow yet. New tenants are created by a platform admin directly in the database - see docs/tenant-setup.md.

## Do not overclaim

Do not describe this system as "real-time inventory availability," "fully role-based access control," or "billing-ready" - none of those are true yet. It is accurate to describe it as: a real multi-tenant backend, a real persisted quote request pipeline, a real (if basic) business dashboard, and a real, documented embed path that does not require copying RentSketch source code into another repository.
