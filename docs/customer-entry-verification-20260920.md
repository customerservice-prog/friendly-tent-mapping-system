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

The browser has WebGL disabled. Live checks used the automatic 2D recovery or the explicit 2D mobile entry. Renderer/controller tests use real geometry with a stub renderer; they do not verify GPU shading or appearance. CSS phone viewports do not emulate physical phone touch hardware.

The browser/workspace environment disconnected after the tent matrix. The final 2D crop fix had passed the bounded-size tests but has not been visually rechecked after deployment. Post-fix live generic/demo entry and Friendly's mobile homepage/navigation still need browser checks. A successful deployment does not clear those remaining checks.
