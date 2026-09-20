# Embedding RentSketch on Your Website

Day one, use the iframe embed. It is reliable, requires no build step, and
works on any site (static HTML, WordPress, Shopify, Squarespace, etc).

## Option 1: Iframe (recommended for day one)

```
<iframe src="https://rentsketch.com/designer/?tenant=YOUR_SLUG&embed=1" style="width:100%;height:820px;border:0" title="Event Designer"></iframe>
```

Replace YOUR_SLUG with your tenant slug (e.g. friendly). That is it: no RentSketch source code, no build tools, no dependency on our JavaScript engine living inside your site.

## Option 2: Loader script (embed/v1.js)

A small, versioned, dependency-free loader that renders the iframe for you and forwards a few useful events. Backwards compatible: future updates to how RentSketch renders will not require you to change this snippet.

```
<div id="rentsketch-embed"></div>
<script src="https://rentsketch.com/embed/v1.js?v=20260919-integration" data-tenant="YOUR_SLUG" data-embed-key="YOUR_EMBED_KEY" defer></script>
```

Optional attributes on the same script tag. data-target sets the id of a different container element, default rentsketch-embed. data-height sets a fixed height in px, default is responsive and auto-resizing. data-mode="button" renders a "Design Your Event" button that opens the designer in a modal overlay instead of rendering inline. data-label sets the button text when using data-mode="button".

## Exact product preview from a product page

Use the same hosted designer for every rental company. Pass that company's
RentSketch tenant slug, public embed key, and **RentSketch product ID** from its
catalog. A storefront's own item ID is not a RentSketch product ID.

```html
<div id="rentsketch-product"></div>
<script src="https://rentsketch.com/embed/v1.js?v=20260919-integration"
  data-tenant="YOUR_SLUG"
  data-embed-key="YOUR_EMBED_KEY"
  data-target="rentsketch-product"
  data-mode="button"
  data-product-id="YOUR_RENTSKETCH_PRODUCT_ID"
  data-tent-name="20×20 Pole Tent"
  data-label="See This Tent in a Layout"
  defer></script>
```

`data-tent-name` supplies a loading label; the live product name replaces it.
An explicit product ID is authoritative: an unknown ID shows an error instead
of silently selecting another tent. For older storefront integrations,
`data-tent-slug` supports exact catalog slug matching. Use `data-view="2d"` to
start with the plan. 3D is the default for product previews.

Product previews show the tent before the existing Early Access acknowledgment.
**Design My Event** retains that same tent and scene. The loader bounds loading
at 25 seconds and offers Retry, 2D, and Full Screen while preserving the product.
It does not copy the renderer or store a second scene in the host website.

When using multiple embeds, give each one a unique `data-target`. Events bubble
to that container, including for the button/modal mode. Check both the source
iframe and origin when implementing your own message listener; also check the
tenant and requested product before treating a preview as ready.

The iframe URL equivalent is:

```text
https://rentsketch.com/designer/?tenant=YOUR_SLUG&embed=1&focus=tent&autoplace=1&view=3d&productId=YOUR_RENTSKETCH_PRODUCT_ID&v=20260919-integration
```

## Bounce houses and waterslides

Use the same loader with `data-product-type="inflatable"`. Product identity and
pricing still come from the selected tenant's live catalog:

```html
<div id="rentsketch-inflatable"></div>
<script src="https://rentsketch.com/embed/v1.js?v=20260920-inflatables-1"
  data-tenant="YOUR_SLUG"
  data-embed-key="YOUR_EMBED_KEY"
  data-target="rentsketch-inflatable"
  data-mode="button"
  data-product-type="inflatable"
  data-product-id="YOUR_RENTSKETCH_PRODUCT_ID"
  data-product-name="Your Bounce House"
  data-label="See This Bounce House in a Layout"
  defer></script>
```

For storefronts using exact catalog slugs, use `data-product-slug` instead of
`data-product-id`. The iframe equivalent uses `focus=inflatable`, `autoplace=1`,
and `productId` (or `productSlug`). An explicit ID never falls back to a different
product. The ready message uses `mode: "inflatable-preview"` and `tentId: null`.

The preview starts outdoors with the selected inflatable and no tent. Continue
with **Design My Event** to add seating and other rentals. Children are decorative
animations, excluded from quantities and pricing. Model dimensions are marked
illustrative unless the tenant provides both `width_ft` and `length_ft`; confirm
installation space with the rental company. Optional model height is read from
`metadata.heightFt`. Package products are not treated as individual inflatables.

## Where to find YOUR_SLUG and YOUR_EMBED_KEY

Both are shown on the Install page of your RentSketch business dashboard, at https://rentsketch.com/dashboard/#/install, after you log in. The embed key is a public identifier only. It is safe to include in your site's front-end code and is not a secret credential.

## Allowed domains

On the same Install page you can list the domains allowed to embed your designer (e.g. www.yourdomain.com). This is a light-weight safeguard against casual unauthorized embedding, not a substitute for the embed key itself. RentSketch does not rely solely on the Referer header for this, since it can be absent or spoofed. Allowed domains are an additional layer, not the only one.

## Events

If you use the loader script, the iframe element it creates dispatches DOM CustomEvents you can listen for:

```
document.getElementById('rentsketch-embed').querySelector('iframe').addEventListener('rentsketch:quoteRequested', function (e) { /* e.detail has the raw postMessage payload */ });
```

Event names are rentsketch:ready, rentsketch:error, rentsketch:designSaved, and rentsketch:quoteRequested. Product readiness includes mode=tent-preview, tenant, productId, tentId and renderer (webgl or 2d). Generic readiness is emitted after the catalog and questionnaire are usable. If you build your own iframe by hand (Option 1) you can listen for the underlying postMessage events directly on window instead. Always check that event.origin === 'https://rentsketch.com' before trusting a message.

## Mobile

The iframe is responsive by default (width: 100%) and the designer itself is built to work at phone widths. Set a sensible min-height on your container so the designer does not render too short before it resizes.

## What NOT to do

Do not copy any RentSketch source files (designer/, js/, script.js, the server/ folder, etc) into your own repository. If you find yourself needing to do that to make the embed work, something in this document is wrong. That is a RentSketch bug, not something to work around on your side.
