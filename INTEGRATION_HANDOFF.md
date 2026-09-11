# INTEGRATION HANDOFF: Friendly Party Rental x RentSketch

This file is written for a coding agent (or engineer) whose job is ONLY to connect friendlypartyrental.com to RentSketch's already-built, already-hosted platform. You should need this file, the docs/ folder it links to, and nothing else from this repository.

## The one rule that matters most

Do not copy RentSketch source code into the Friendly repository. Do not create a folder like /friendly-rentsketch/ inside Friendly. Do not make Friendly's site responsible for running any part of RentSketch's designer, scene engine, or Three.js code. If completing this integration seems to require editing RentSketch internals, stop - that means something here is incomplete, not that you should work around it by copying code.

## Architecture summary

RentSketch is a separate, already-live application. It owns the 2D/3D designer, the product catalog rendering, the auto-layout and Event Check logic, saved designs, quote requests, tenant settings, and the business dashboard. Friendly's own website owns its own marketing pages, its own catalog/SEO content, and a link or embed pointing at RentSketch's hosted designer. Full detail: docs/integration.md.

## Production facts you need

Static frontend base URL: https://rentsketch.com
API base URL: https://rentsketch-api-production.up.railway.app
Friendly's tenant slug: friendly
Hosted designer URL for Friendly: https://rentsketch.com/designer/?tenant=friendly
Business dashboard (for Friendly staff to log in, manage products/branding/requests): https://rentsketch.com/dashboard/

## Recommended integration method

Use the iframe embed described in docs/embed.md, Option 1, pointed at the hosted designer URL above. This is the lowest-risk, most reliable option for day one. Example:

```
<iframe src="https://rentsketch.com/designer/?tenant=friendly&embed=1" style="width:100%;height:820px;border:0" title="Event Designer"></iframe>
```

If Friendly's site prefers a "Design Your Event" button that opens a modal instead of an inline iframe, use the loader script method in docs/embed.md, Option 2, with data-mode="button".

## Embed key

Friendly's public embed key is stored on the tenants row (embed_key column) and is returned by GET /api/tenants/friendly/admin (staff-only) or shown on the Install page of the business dashboard after logging in as Friendly staff. It is a public identifier, safe to put in front-end code, not a secret.

## Allowed domains

Add friendlypartyrental.com (and www.friendlypartyrental.com if used) to Friendly's allowed origins from the dashboard's Install page before relying on domain restriction as a safeguard. This does not block the iframe from working if skipped - it is an additional layer, not a hard requirement - see docs/embed.md.

## Events you can listen for

rentsketch.ready, rentsketch.resize, rentsketch.designSaved, and rentsketch.quoteRequested are posted via postMessage from the iframe (or as CustomEvents if using the loader script). See docs/embed.md, "Events" for exact usage and the required event.origin check.

## What happens when a customer requests a quote

The designer posts directly to RentSketch's API (POST /api/tenants/friendly/quote-requests) and creates a real database row - this does not depend on Friendly's website or email at all. Friendly staff see it by logging into https://rentsketch.com/dashboard/ and opening Requests. If Friendly wants requests pushed into their own systems too, configure a webhook - see docs/webhooks.md. There is no email notification yet - see docs/friendly-production.md.

## How Friendly staff access their data

They log in at https://rentsketch.com/dashboard/ with an email/password created for them as a RentSketch user with a tenant_memberships row on the friendly tenant. See docs/tenant-setup.md for how that account is created if one does not exist yet - this repository's platform admin creates it, Friendly's own repository does not need to.

## Testing steps

Load https://rentsketch.com/designer/?tenant=friendly&embed=1 directly in a browser and confirm it renders with Friendly's branding and no RentSketch marketing chrome. Embed it on a real or local test page using the iframe snippet above and confirm it renders inside that page. Complete a full design and submit a quote request from inside the embedded iframe, then confirm it appears in the RentSketch dashboard's Requests page for the friendly tenant. Confirm the page still works if the embedding page is narrower (mobile width).

## Acceptance test

If you can complete the testing steps above using only an iframe or the loader script, plus values from this file and docs/embed.md, without opening any RentSketch source file to make it work, the integration is complete. If you needed to edit anything under designer/, js/, script.js, or server/ in the RentSketch repository to make Friendly's site work, stop and report that as a RentSketch gap rather than working around it in Friendly's repository.

## Current known limitations (read before promising features)

See docs/friendly-production.md for the full list. In short: no self-service signup, no email notifications, no Stripe billing, role permissions not finely enforced, and only products with a matching external_id render inside the 2D/3D designer today.
