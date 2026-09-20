# Inflatable product entry — 2026-09-20

## Scope

The existing preview controller, layout store, 2D/3D views, autosave and review
now support outdoor inflatable layouts with `tentId: null`. No tent is rendered
or billed unless the customer explicitly adds one. Friendly's matching product
pages open this flow through their existing RentSketch modal.

The public Friendly catalog supplied these 11 individual products:

- Crayon Bounce House
- Pink Inflatable Bounce House
- Patriotic Red White and Blue Bounce House
- Wedding White Bounce House
- Rainbow Castle Bounce House
- Fire Truck Water Slide Bounce House
- Pirate Ship Slide Combo Bounce House
- Tidal Wave Inflatable Water Slide
- Fire Red Marble Inflatable Water Slide
- 18ft Purple Tropical Marble Double Bay Waterslide
- 22ft Tropical Lava Wave Marble Waterslide

Product IDs, names, photos and prices come from the tenant catalog. The fixture
records the public product data checked on this date. The 11 visual profiles
were informed by the product photos; they are illustrative models, not measured
manufacturer models. Friendly currently supplies no footprint measurements for
these products. The UI labels that limitation. Bundled packages are excluded.

## Verification performed before publication

- Complete frontend test suite, including the existing 51 tent entry cases.
- All 11 inflatables launched by product ID, exact slug and name: 33 entries.
- Preview-to-designer continuity, outdoor state, rotation within the initial
  planning area, duplication, undo/redo, save/resume, table placement, review
  quantities/prices, cancelled placement and invalid product ID handling.
- A second tenant with its own inflatable, measured footprint and price, and no
  tents; generic embed readiness and retry preserve that tenant and product.
- Real Three.js geometry for every model at phone and desktop aspect ratios,
  including 90-degree rotation, camera bounds, no tent mesh, changing child
  positions and the people visibility control. Renderer is stubbed for this
  check; it does not prove GPU appearance or performance.
- Offline SVG projections inspected for castle, double-lane slide and pirate
  combo geometry. These do not reproduce WebGL shading or texture transparency.
- Actual Friendly React product pages rendered with isolated catalog data for
  all 11 buttons. The actual CTA and launcher were exercised in a DOM harness:
  product identity, ready-message filtering and the 2D retry all passed.
- Actual save-route validation exercised against an isolated database stub:
  outdoor scenes save/update successfully; invalid scene types remain rejected.

No production quote requests, feedback records or test saved designs were
created. Live browser interaction was unavailable during this pass. Actual GPU
appearance, touch gestures and phone performance still require live visual QA.

## Reproduction

Install the dependencies in `tests/`, then run `npm test` there. The inflatable
entry, scene interaction, embed integration and outdoor save checks are included
in that command. `tests/responsive-preview.html` also offers the 11 product
previews for subsequent manual checks at supported viewport sizes.
