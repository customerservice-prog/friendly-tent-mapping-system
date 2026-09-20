# Customer entry verification — 20 September 2026

Scope: RentSketch customer entry and Friendly Party Rental's tent product → preview → designer → review flow. No live quote or feedback submissions were made.

## Results

- All 17 imported Friendly tent product pages returned HTTP 200 and included the layout CTA.
- All 17 actual Friendly product buttons were opened in the live browser. Each proceeded through a furnished party setup, Design My Event and Review & Quote.
- All 17 product flows were also exercised in a 320 × 640 CSS viewport using tests/responsive-preview.html. Each exact tent reached review with seating and rental quantities.
- Friendly's desktop homepage Design My Event button and navigation → Design Your Event → Start Designing My Event opened the hosted designer.
- The deployed source for commit 5695239 matched the repository for all eight checked application entry/rendering files.
- Automated: 51 exact preview cases (17 imported tents × product ID, slug, name), correct dimensions/type/product/price in review, party continuity and undo/redo.
- Automated: 16 model sizes × phone/desktop camera dimensions, real Three geometry with a renderer stub, scene options and gesture/resource checks.
- Automated: direct, generic and demo entry starts without a rental-catalog request or Friendly seed prices. Demo has furniture; generic review offers sharing instead of a quote to an unconnected rental provider.
- The full existing frontend test suite passed. After discovering mobile clipping, the 51-case suite passed again with actual 2D stage-size bounds.

## Post-deployment follow-up

Verified against application commit `18abbf43420fadb09a27340e59a3612425d12db9` on 20 September 2026.

| Check | Result and evidence |
| --- | --- |
| Final 40 × 100 mobile crop fix | Live pass at a 320 × 640 CSS viewport. Screenshot inspected: the whole tent and all five center poles are visible. The floor plan measures 137.1875 × 343 pixels inside the 320 × 375.421875-pixel preview; all four edges fit. |
| Direct RentSketch entry | Live pass at 320 pixels wide. The 20 × 20 tent is immediately visible with zero tables/seats and “Confirm pricing,” without the Friendly $250 seed price. |
| Generic party setup → review | Live pass. “Try a Party Setup” adds 16 seats and three tables; “Review & Share” opens review with the tent, two dining tables, a cocktail table, chairs, linens and four dance-floor sections. All seven rental lines say “Confirm pricing.” Sharing/export controls are visible and the quote-request CTA is absent. Exports were not exercised. |
| Friendly homepage and landing-page destinations | Live HTTP/source pass. Both pages return 200. The homepage “Design My Event” link and all three landing-page CTAs use `https://rentsketch.com/designer/?tenant=friendly&embed=1&v=20260919-integration`. Navigation links to `/design-your-event`. This does not verify opening the mobile menu or clicking its links. |
| Final production source | All seven retrieved files return 200 and match repository bytes: `index.html`, `demo/index.html`, `designer/index.html`, `script.js`, `js/ui/customer-entry.js`, `js/ui/tent-preview-entry.js`, and `js/ui/plan2d.js`. |
| Railway frontend | Deployment `c43bb8ae-1941-4de3-b1d9-6c6fb30a31fb` reports SUCCESS for application commit `18abbf4`. This is deployment evidence only. |

The demo was selected in the responsive fixture, but the browser disconnected before its rendered result could be inspected. It is not counted as a live pass. Its redirect and furnished-entry behavior remain covered by the previously passing source/automated checks.

## Fixed during this pass

1. Imported 40 × 100 Pole Tent did not open from Friendly because its visual mapping was missing. Supported tent dimensions/type can now resolve the existing model without changing the requested product's identity.
2. Misting and standard 10 × 10 canopies shared a model, causing a product to disappear. Distinct imported tent products retain distinct selectable identities; old seed cards remain deduplicated.
3. A 10 × 10 party starter could return no seating because the optional dance floor consumed the space. Seating now takes priority when both cannot fit.
4. Larger party starters now scale up to twelve dining tables using the existing placement machinery.
5. Large 3D previews could exceed the old orbit zoom-out limit. The limit now accommodates the fitted camera.
6. Generic RentSketch entry could initially show Friendly's seed price. Generic data is unpriced before entry and does not depend on the rental catalog.
7. The demo entry now opens a furnished layout. Homepage copy no longer advertises a mandatory six-step questionnaire.
8. 2D imposed a four-pixel-per-foot minimum, clipping a 40 × 100 tent in a 320-pixel phone preview. The plan now uses the actual available canvas scale.

## Tent coverage

- 10 x 20 EZ Pop Up Canopy Tent
- 40 x 100 Pole Tent
- 30x40 Classic Frame Tent
- 20x20 Pole Tent
- 40 x 40 Pole Tent
- 20x30 Pole Tent
- 40x60 Pole Tent
- Tent Misting 10x10 Pop Up Tent
- 40 x 80 Pole Tent
- 30 x 45 Pole Tent
- 30 x 60 Pole Tent
- 20 x 30 Frame Tent
- 20x40 Pole Tent
- 10 x 10 EZ Pop Up Canopy Tent
- 30 x 30 Pole Tent
- 20 x 20 Frame Tent
- 20 x 40 Frame Tent

## Remaining verification limits

The earlier browser had WebGL disabled. Live tent checks used the automatic 2D recovery or the explicit 2D mobile entry. Renderer/controller tests use real geometry with a stub renderer; they do not verify GPU shading or appearance. The replacement browser disconnected before WebGL could be checked again. CSS phone viewports do not emulate physical phone touch hardware.

The final crop fix and generic direct entry have now passed live checks, as recorded above. The remaining browser checks are the post-fix demo, RentSketch's mobile homepage entry buttons, and Friendly's mobile homepage/menu/landing-page interactions. The browser connection continued to time out after reconnection attempts, so these remain open. A successful deployment or a correct link destination does not clear them.
