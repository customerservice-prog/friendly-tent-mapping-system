# Tenant Setup

A "tenant" is one rental company. Every tenant is a real row in the tenants table, created the same way regardless of who the company is. Friendly Party Rental is tenant #1, but nothing in the application code special-cases it.

## Creating a tenant today (platform-admin path)

Self-service signup (a company creating its own account) is not built yet - see docs/friendly-production.md for what is deferred. Today a platform admin creates a tenant directly in the database: an INSERT into tenants with a unique slug and name, an INSERT into users for the owner's login (email plus a bcrypt password hash), and an INSERT into tenant_memberships linking that user to that tenant with role owner. After migration 002, embed_key is backfilled automatically for any tenant missing one.

## What a new tenant gets immediately

As soon as the three rows above exist, the tenant can log into the business dashboard at https://rentsketch.com/dashboard/ with their email and password, see their (empty) Overview, add products from the Products page, edit branding (logo, colors, tagline, contact info) from the Branding page, and get their hosted designer URL and embed code from the Install page. None of this requires a code change or a deploy.

## Hosted designer URL for a tenant

```
https://rentsketch.com/designer/?tenant=YOUR_SLUG
```

If YOUR_SLUG is friendly or generic, the designer uses its bundled catalog data (tents/tables/chairs geometry) with that tenant's branding, then overlays any name/price changes made from the dashboard. Any other slug uses the same neutral catalog as a starting point and loads that tenant's real branding and product overrides from the API - see docs/friendly-production.md, "known limitation: visual mapping" for what this does and does not cover yet.

## Roles

tenant_memberships.role is one of owner, admin, staff, or viewer. Only enforcement of "is this user allowed to touch this tenant at all" is implemented today (requireTenantAccess). Fine-grained permission differences between owner/admin/staff/viewer are not yet enforced - see docs/friendly-production.md.

## Platform admin

A user with is_platform_admin = true on their users row can access any tenant's staff-only routes without a tenant_memberships row. This is intended for the RentSketch operator only, not for rental company staff.
