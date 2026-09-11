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
<script src="https://rentsketch.com/embed/v1.js" data-tenant="YOUR_SLUG" data-embed-key="YOUR_EMBED_KEY" defer></script>
```

Optional attributes on the same script tag. data-target sets the id of a different container element, default rentsketch-embed. data-height sets a fixed height in px, default is responsive and auto-resizing. data-mode="button" renders a "Design Your Event" button that opens the designer in a modal overlay instead of rendering inline. data-label sets the button text when using data-mode="button".

## Where to find YOUR_SLUG and YOUR_EMBED_KEY

Both are shown on the Install page of your RentSketch business dashboard, at https://rentsketch.com/dashboard/#/install, after you log in. The embed key is a public identifier only. It is safe to include in your site's front-end code and is not a secret credential.

## Allowed domains

On the same Install page you can list the domains allowed to embed your designer (e.g. www.yourdomain.com). This is a light-weight safeguard against casual unauthorized embedding, not a substitute for the embed key itself. RentSketch does not rely solely on the Referer header for this, since it can be absent or spoofed. Allowed domains are an additional layer, not the only one.

## Events

If you use the loader script, the iframe element it creates dispatches DOM CustomEvents you can listen for:

```
document.getElementById('rentsketch-embed').querySelector('iframe').addEventListener('rentsketch:quoteRequested', function (e) { /* e.detail has the raw postMessage payload */ });
```

Event names are rentsketch:ready, rentsketch:designSaved, and rentsketch:quoteRequested. If you build your own iframe by hand (Option 1) you can listen for the underlying postMessage events directly on window instead. Always check that event.origin === 'https://rentsketch.com' before trusting a message.

## Mobile

The iframe is responsive by default (width: 100%) and the designer itself is built to work at phone widths. Set a sensible min-height on your container so the designer does not render too short before it resizes.

## What NOT to do

Do not copy any RentSketch source files (designer/, js/, script.js, the server/ folder, etc) into your own repository. If you find yourself needing to do that to make the embed work, something in this document is wrong. That is a RentSketch bug, not something to work around on your side.
