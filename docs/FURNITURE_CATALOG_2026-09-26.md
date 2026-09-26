# Furniture catalog completion — September 26, 2026

This release closes three catalog gaps observed after PR #166. They were present in the live rental catalog but classified as `other`, with no visual model or source footprint dimensions. They therefore appeared as generic floor equipment instead of usable furniture.

## Source evidence and modeling limits

| Rental | Public product evidence | Planning representation |
| --- | --- | --- |
| [6ft Plastic Folding Table](https://www.friendlypartyrental.com/items/6ft-plastic-folding-table) | Named six-foot length, rectangular white plastic top, folding metal supports; six to eight seats described | Existing six-foot table model, corrected SKU-variant material lookup and folding detail. Depth, height and clearance remain estimates. |
| [Cross-Back Farmhouse Chair](https://www.friendlypartyrental.com/items/cross-back-farmhouse-chair) | Wood finish, crossed back rails, curved crest and under-seat supports visible in official photo | Dedicated natural-wood cross-back model and overhead symbol. No measured dimensions supplied; the complete profile is illustrative. |
| [Sweetheart Table (60in Half-Round)](https://www.friendlypartyrental.com/items/sweetheart-table-60in-half-round) | Named 60-inch half-round top, wood surface, metal edge and folding supports | Dedicated half-round model with two chairs along the straight edge. Five-foot span follows the product name; 2.5-foot depth is inferred from the half-round shape, not independently measured. Height and clearance are estimates. |

Product photos remain the first picker image. Generated model thumbnails are explicitly labeled illustrations. Reference photos used by isolated browser tests come from the rental company's public `/api/item-image/<slug>` endpoints; they do not imply manufacturer-certified geometry.

## Changes

- Table Studio had invalid unquoted CSS attribute selectors for `3d`; browsers discarded the visibility rules and hid the rendered canvas. Quoted selectors restore the actual 3D close-up, with visible-canvas browser assertions.

- Browser verification exposed an ordinary 3D startup failure: saved scenes use `backgroundPhoto:null`, but calibration code dereferenced it as an object. Null-safe calibration now permits 3D startup without a venue photo and after photo removal; the regression test covers the actual null value.

- Conservative client inference repairs these supported furniture families even before the next catalog sync. Explicit visual mappings remain authoritative; bundles, cushions, covers and services are excluded from automatic furniture inference.
- Friendly catalog sync classifies and maps the same products, and the administrative visual library lists the new models.
- Product-specific names, prices and catalog identities remain distinct when several rentals share a physical model. These three source prices are read from the live catalog, not introduced as new hardcoded renderer prices.
- The sweetheart table keeps canonical model dimensions separately from its rotated footprint. Placement and inspector rotation preserve its straight edge and seating direction across save/reload, 2D and 3D.
- Linen compatibility resolves a table's physical model independently of the SKU suffix. A six-foot plastic table variant receives its supported linen choices without changing the ordered product. No new linen-fit claim is made for the half-round table.

## Verification

- All 174 core unit cases pass.
- Full `npm --prefix tests run test:event-pass` gate passes, including the expanded premium, photo, persistence, ownership, revision, session and MFA regressions.
- Focused geometry tests validate the open cross-back, half-round bounds, metal rim, two same-side seats, SKU-specific plastic materials, tabletop transforms and finite geometry. Existing table-detail and table-studio-render checks pass.
- Actual Chromium runs the production Friendly hydration against isolated APIs, with the three original miscategorized source rows. Tables and chairs appear in their correct categories without duplicate generic entries.
- At 1440, 390 and 320 pixels: product-photo cards fit, picker controls work, and the actual 3D table close-up is visible without horizontal overflow.
- Placement and inspector rotation cover 0/90/180/270 degrees. The browser compares rendered 2D chair markers with actual Three.js chair-instance matrices.
- Real local PATCH/save/reload preserves table placements, rotations, chair selection, seat counts and exact quote identities. The fixture totals one $13 plastic table, one $35 sweetheart table and seven $14 chairs: $146.
- `qa-furniture-catalog/` contains curated actual browser captures and structured results. GitHub Actions retains the complete screenshot matrix. Reference catalog photos are offline test thumbnails; the yard shown in the 3D fixture is the product's generic illustrative environment, not a reconstructed customer property. All payment, project and catalog APIs in browser QA are isolated; no live purchase or customer write occurs.

## Remaining limits

This release completes these three observed furniture gaps. It does not certify every catalog asset, add measured site geometry, or change the Event Pass policy. Single-photo placement remains camera-matched, and Space Scan remains an estimated reconstruction subject to capture and measurement checks. Existing saved generic equipment is preserved; the application does not silently replace historical placements or alter their saved dimensions.
