# Table Studio and overhead plan — 2026-09-20

The existing table detail dialog now offers a focused 3D view and an overhead
view. It uses the same table/chair/linen geometry as the event designer. The
existing layout store remains authoritative. There is no new backend service.

## Customer entry

- In Tables, **Style a table first** opens a draft containing one table, without
  a tent or other event objects. Nothing is billed or saved to the event until
  **Place in My Event** is confirmed through the existing placement flow.
- Select an existing table and choose **Style This Table · Close-up** to edit
  that same stored table. Closing returns to its event; changes support undo.
- The preview remains visible while controls scroll on a phone. Drag/orbit,
  pinch/scroll zoom, Fit table, and an explicit Overhead view are available.
- Failed, lost or stalled WebGL falls back to the overhead view. Loading has a
  12-second limit. Closing disposes the focused renderer. The main scene pauses
  its animation/render loop while the table dialog is open.

## Catalog and rental accounting

Friendly's checked live catalog supplies 50 tabletop products: plates, chargers,
glasses, cutlery, napkins, runners, centerpieces, table numbers, serving ware,
chafers, pitchers, dispensers and related table accessories. The fixture records
those public products and the linen catalog. Their actual product IDs and prices
are carried into the existing review/quote summary.

Place settings can follow seat counts or use a manual quantity. Serving pieces
have independent quantities. Runners and napkins coexist with the tablecloth.
Satin/sequin and other compatible imported cloth sizes supplement the existing
linen models. Duplication includes all attached rentals; deleting a table removes
its attached quantities. Legacy table decoration data is preserved. Decorative
party styling does not draw extra plates over explicitly configured tabletops.

Another tenant receives only its own catalog and prices. The generic RentSketch
designer offers clearly labeled sample styles without product IDs or prices.
Models are illustrative; actual catalog photos and names identify rental items.
Color previews and dimensions require rental-company confirmation where the
catalog does not provide those details. The preview is not a table loading or
physical fit certification for serving equipment.

## 2D changes

The plan has a quiet paper/lawn surface, external dimensions, an optional 5-foot
grid, fit/zoom controls, scrollable zoomed layouts, softer furniture shadows, and
selected tabletop illustrations. The original placement and drag coordinates are
preserved. Shared overhead chair artwork now rotates without clipped corners.

## Verification

- Full existing suite: tent/inflatable entry, 2D placement, editing, undo/redo,
  saved layout behavior, tenant isolation and mocked quote integration.
- Actual Table Studio DOM actions: draft isolation; cancel and place; per-seat
  vs manual quantities; accessories with linens; fallback; save/resume;
  duplicate/delete; exact IDs, quantities and prices in review; 2D grid/zoom.
- Real Three.js geometry for all 50 tabletop products, finite vertices, batched
  geometry, camera fit at portrait/desktop/landscape preview sizes, removal and
  resource cleanup. WebGL renderer is stubbed for automated geometry checks.
- Offline renders of the actual round and banquet overhead SVG artwork were
  visually inspected, and a clipped diagonal-chair issue was corrected.

Live browser access was unavailable. These checks do not verify actual GPU
appearance, rendered mobile CSS or touch behavior on real hardware. No live quote
requests, feedback records or test saved designs were submitted.

Run `npm test` from `tests/` after installing its dependencies.
