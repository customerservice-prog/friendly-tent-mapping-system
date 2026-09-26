# Foundation release verification

Original audit baseline: `2b35cd6`. Integrated main: `67a92cb` (PR #145). Branch: `codex/rentsketch-inventory-motion-foundation`.

## Verified

- All 79 Node unit tests passed, including new distinct-product identity, equipment persistence/review, unknown-price booking block, rotated equipment footprint and capture-quality cases.
- Footprint regressions passed: legacy rotated accessory saves and current equipment saves agree across collision, fit and walk; photo angle overrides retain local model dimensions.
- Merge regression tests passed: duplicate products stay one picker card, dedicated accessory profiles replace generic footprints, supplies/tabletop stay out of floor placement, saved quantities and missing-catalog identities survive.
- Existing designer DOM flow passed: exact tent preview, table/chair/linen edits, placement, undo/redo and itemized review.
- New inventory DOM flow passed: search for foam, place, rotate, duplicate, undo/redo, reopen serialized design, add inflatable while retaining tent, review both items.
- Existing equipment-editing regression passed.
- 3D controller tests passed with real Three.js geometry and a stub renderer; all 11 inflatable profiles and all new accessory profiles construct finite geometry. Meshes expose the correct selectable item ID; motion does not mutate placement.
- Full Chromium photo flow passed: file uploads/compression, three-view preview with unverified metadata, photo drag/calibration, saved scene, fit panel, Measure and Walk. Updated the previous metric-accuracy assertion to require explicit uncertainty; scan controls also disclose unverified dimensions.
- Photo renderer tests passed with updated assertions: a single photo is camera matched, fabricated vegetation/structures are absent, and estimated scan provenance remains unverified.
- Real Chromium tests passed at 1440×940 and 390×844 with a local server and isolated edit entitlement: search, place, undo, mixed scene, actual WebGL mount, review and no document horizontal overflow. No page JavaScript exceptions occurred. Updated screenshots were visually inspected.
- Read-only Friendly production product API returned 245 records, including the active Foam Party Machine without a visual mapping. The resolver was checked against that response; no production catalog writes were performed.
- `git diff --check` and dashboard syntax check passed.

## Boundaries

Browser tests use local code, generic planning profiles and a mocked editing entitlement. They deliberately do not exercise real customer payment, live save/share writes, quote submission, booking or availability. GPU rendering uses software Chromium; this is not proof of real-phone performance. Capture checks reject some unusable inputs but do not validate scan dimensions or camera poses. Procedural models remain illustrative. The full scan-service and professional asset pipeline remain roadmap work.

No production deployment is verified by this report. Review the code and screenshots, then perform a controlled deployment and live tenant smoke test before treating the branch as released.

## Commands

```sh
node --test tests/*.test.mjs
node --experimental-vm-modules tests/designer-dom-smoke.cjs
node --experimental-vm-modules tests/premium-inventory-dom.cjs
node --experimental-vm-modules tests/equipment-editing.cjs
node --experimental-vm-modules tests/scene-interaction.cjs
node --experimental-vm-modules tests/venue-photo-render.cjs
node tests/premium-browser.cjs
```

The browser test requires Playwright and Chromium. Set `RENTSKETCH_CHROMIUM` if using a non-default Chromium executable. Tests use local assets for Three.js and do not make production API writes.
