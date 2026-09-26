# RentSketch premium rebuild: diagnosis, target architecture and delivery plan

Owner: Friendly Party Rental. Audit baseline: `2b35cd6` on the main branch, September 25, 2026. This report distinguishes source findings, changes made in this branch, and work still required. This branch is a foundation release, not a claim that photorealistic reconstruction is complete.

## Diagnosis grounded in the code

The problem is architectural fragmentation plus asset quality. The application started as a tent-floor planner. Its original product spec explicitly excluded 3D, collision, staff workflows and AI reconstruction. Later features were added to that foundation without fully replacing its assumptions.

| Verified finding | Product consequence | Corrective direction |
| --- | --- | --- |
| `script.js` hid the inflatable rail when a tent was selected and rejected inflatable placement unless the layout had no tent. | A normal backyard party could not contain both its tent and bounce house. | Separate the venue planning area from the tent footprint. |
| `js/data/catalog.js` skipped unmapped products and previously selected only one non-tent product per visual model. | Inventory disappeared; different products sharing a shape lost their separate selection/quote identity. | Separate product identity from model identity; disclose incomplete mappings. |
| `view3d.js` rendered only tables, inflatables, chairs and dance floors. `eventSummary.js` had no generic equipment line items. | Adding a sidebar alone would leave accessories invisible or missing from the quote. | One item contract throughout picker, 2D, 3D, persistence and quoting. |
| Accessory motion had no integrated renderer path. Inflatable mesh rotation was applied by both its internal group and the scene. | Static equipment and inconsistent placement previews. | One visual motion interface and one owner for orientation. |
| The scan renderer uses 128–176-pixel working images, assumed camera intrinsics and approximate camera offsets. Video sample positions derive from elapsed capture time. | Sparse/noisy geometry, wrong depth and ghosting when a real handheld camera rotates or changes speed. More surface patches do not solve camera pose errors. | Calibrated multi-view reconstruction with pose optimization and independent scale validation. |
| UI copy called the result the “actual yard” and a “metric venue.” Single-photo context code could invent rear structures/vegetation. | Appearance could imply factual geometry the system did not observe. | Separate photo evidence, depth estimates, traced geometry and validated measured data. |
| `script.js` coordinates store state, UI state, photo placement and many independent preview adapters. Photo placements can differ from floor-plan coordinates. | More opportunities for save, undo and 2D/3D differences as features grow. | A versioned world document with adapters, commands and migration tests. |

The old spec is not the current target. Neither additional buttons nor a blanket framework rewrite will deliver the requested result. The application needs complete inventory coverage, stable spatial semantics, an asset production standard and truthful reconstruction evidence.

## Integration with the concurrent rental-library update

While this branch was being prepared, main advanced to `67a92cb` (PR #145) with another rental/accessory implementation. This branch reconciles that update rather than replacing it. The customer sees one searchable All rentals browser. Existing saved `accessory` items retain their rendering, inspector, motion and review paths alongside the new `equipment` format. Specialized accessory profiles can replace an otherwise generic footprint without creating a second card for the same product. Supplies and tabletop selections remain outside floor placement. Shared product IDs drive placed counts across both saved formats.

The combined version also preserves the new walk obstacles and inflatable animation. Quarter-turn accessory dimensions are normalized once so saved orientation, visual geometry and planning footprints agree. The two internal item formats remain a migration concern for the planned unified world document; this release explicitly supports both.

## Live catalog reconciliation

A read-only check of the Friendly tenant product endpoint returned 245 catalog records: 149 are categorized as `other`. The Foam Party Machine is active, but it has no assigned visual model and lives in `other`. That directly explains why it existed in the business inventory but did not appear as usable equipment.

The revised resolver routes 29 tent/table/chair selections, 11 inflatables and 50 tabletop selections through their existing detailed planners. Additional physical equipment uses dedicated profiles or explicitly approximate footprints. Legacy seed rows must not reappear as duplicate accessories. Consumables, service upgrades and packages must not become large fake objects. Photo booth duration/attendant variants retain separate product identity while sharing a physical preview. These checks uncovered and corrected several problems that a generic demo catalog would not reveal.

## The premium target

A customer opens their exact rental or saved event. The main workspace presents **Rentals**, **My layout**, **Venue**, and **Review**, with a spacious canvas. They can place a tent, arrange dining underneath, put a bounce house beside it, add concessions/power, then walk through the same layout. The camera, selections and proportions stay consistent. The product exposes uncertainty without making customers understand computer vision.

The visual direction should be quiet and architectural: neutral surfaces, a restrained green accent, crisp labels, large real product photographs, and enough canvas area to judge scale. Never use a beautiful but incorrect product image as a stand-in. Missing photography gets an explicit neutral placeholder. The current procedural accessory models are illustrative coverage, not the final asset standard.

### Customer journey

1. **Start / resume:** existing order access, rental-specific preview or a new event. Show the latest saved layout, alternatives and save status. Keep paid/edit permissions separate from the renderer.
2. **Set the venue:** choose a measured blank site, upload one photo for camera matching, or capture overlapping views. Give each mode a plain description and a sample of the expected result.
3. **Arrange:** searchable complete inventory, category filters, visible quantities, tap-to-place and drag placement, snap/grid toggle, rotate, duplicate, multi-select, align and undo. A tent is one object within the site rather than the entire world.
4. **Style:** contextual table/chair/linen compatibility; lighting matches the chosen tent dimensions; solid/window sidewalls attach to supported tent bays. Distinguish rentable selections from optional decorative preview details.
5. **Experience:** top-down planning, orbit, eye-height walking, day/night. Motion is subtle and optional. Walk is constrained to captured/defined space; unknown property is not invented.
6. **Review:** inventory and quantities, unconfirmed prices, measured versus approximate dimensions, unresolved fit checks, event date and delivery context. Submit the complete design; never silently omit unsupported selections from booking.
7. **Save / share / print:** visible saving/saved/offline states; named revisions and alternative layouts; revocable read-only links; printable dimensioned plan plus item list and an optional beauty view. Preserve the same document across devices.

### Staff and admin journey

The catalog needs a readiness queue, not just a dropdown for a visual ID. Each product should show: product photo, physical dimensions and source, model fidelity, footprint, operating clearance, price source, availability source, compatible attachments, power/water requirements, and last review. Staff should be able to compare the actual product photo and its 3D model at the same angle.

Staff open a customer layout in the same editor, propose an alternative, record site measurements, and mark unresolved installation checks. A crew sheet should show placement dimensions, access paths, anchoring zones, utilities and the exact rental list. No generated fit indicator constitutes engineering or site approval.

### Mobile

Use one bottom sheet at a time; thumb-sized placement/rotate/confirm controls; persistent 2D/3D switch; pinch must never place an object. Keep search text and scroll position when categories change. Collapse scene controls during placement. Fit the whole scene after adding an exterior inflatable, then allow focus on the selected rental. Preview photographic assets while optimized geometry loads. Reduce particles and resolution before sacrificing touch responsiveness.

## Architecture

| Layer | Responsibility | Essential contract |
| --- | --- | --- |
| Tenant catalog | Product/SKU, photos, price, availability and variants | Stable product ID independent of visual model ID; explicit unresolved records |
| Asset registry | Versioned GLB geometry, material sets, thumbnails, LODs and motion | Native dimensions, origin, forward axis, bounds, license/source, fidelity and asset version |
| World document | Venue, rentals, attachments, cameras, lighting, revisions | Stable item IDs; explicit units; one authoritative transform per item; migrations |
| Command/store layer | Place, move, rotate, attach, duplicate and bulk actions | Atomic undo/redo, permission checks, no transient animation state persisted |
| Planning engine | Footprints, clearances, pathways and utility zones | Catalog dimensions kept separate from manufacturer operating/installation clearances |
| Venue pipeline | Photo matching, capture ingestion, reconstruction and evidence | Scale source, pose quality, captured coverage, unknown surfaces and independent error checks |
| Render adapters | 2D, 3D, print and export | Consume the same world document; never mutate its dimensions for aesthetics |
| Asset/scan workers | Heavy processing away from the UI thread | Cancellable jobs, progress, retry, memory budgets, input/version hashes |
| Persistence | Projects, named alternatives, revisions, shared access | Revision checks against concurrent edits; durable referenced assets; revocation and retention |

Use feet consistently for the existing planner, but make the unit explicit in every import/export boundary. A future meter-based engine migration must be versioned and tested rather than done implicitly. Animation transforms sit below placement transforms. A chair can sway visually without changing its measured footprint. A tabletop accessory belongs to its parent table; a sidewall belongs to a tent bay; cables and service zones are separate planning objects.

### Photo and scan modes: do not conflate them

| Mode | What it can honestly deliver | What it cannot claim |
| --- | --- | --- |
| Single-photo match | A convincing composition from the original calibrated camera; user-marked ground plane/known distances; optional traced obstacles | Unseen sides, true 360° geometry, or validated dimensions from a single unknown photograph |
| Browser depth preview | A rough local multi-view visualization with quality checks and explicit assumptions | Survey accuracy, guaranteed dimensions, or reliable occlusion around every object |
| Measured site model | Explicit dimensions, traced buildings/fences, manually entered obstacles and slopes | Appearance of unphotographed surfaces without artist input |
| Validated scan | Optimized camera poses, reconstructed observed surfaces, measured scale and reported validation residuals | Ground truth where capture coverage is absent |

A known distance helps scale only after geometry/camera assumptions are constrained. A garage door size by itself does not solve arbitrary camera pose, depth or a sloping yard. Generated unseen scenery may be offered as an illustrative presentation layer, clearly separate from captured geometry and all fit calculations.

For the real scan implementation, use guided overlapping photos or video keyframes, blur/exposure/overlap checks, feature matching, camera pose recovery, bundle adjustment, dense reconstruction and a clean mesh. Preserve image/camera provenance. Apply a measured baseline or control points, and check a separate measurement withheld from calibration. Show the residual and coverage before enabling measurement-led planning. Keep holes visibly unknown. COLMAP provides a self-hostable SfM/MVS pipeline; using it does not require buying a third-party inference API. It does require compute, job management and realistic processing time.

Gaussian splats can improve the visual layer for captured scenes, but they are not a substitute for a collision/measurement mesh. Keep exact rental geometry independent of the venue appearance layer. Do not expose unrestricted walk through unsupported views merely because a render can fill the pixels.

### Assets and motion

Create a hero asset set from the actual stock: the most-used pole/frame tents, white folding/resin/Chiavari/throne chairs, 5 ft round/banquet/cocktail/fill-and-chill tables, major inflatables and the foam machine. Capture proportions, seams, support tubes, inflation details and realistic material roughness. Use PBR texture sets with correct color spaces, reasonable texel density, LODs and compact delivery formats. A thumbnail, 2D symbol and 3D object must refer to the same SKU/variant.

Motion profiles: fan rotor, foam emitter with bounded lifetime/pool, small inflatable deformation with anchored base, slide water flow, fountain flow, optional guests with locomotion/contact constraints, weather outside covered areas and subtle light variation. No exaggerated whole-object bobbing, frantic flashing or disconnected people. Pause hidden scenes, honor reduced motion, limit update frequency, and keep interactive editing responsive. Product animations should not require guests to be enabled.

### Performance and resilience targets (targets, not measured claims)

- Test a typical 50-guest backyard and a large 200-guest setup on actual target phones and desktops.
- Aim for at least 30 fps during mobile orbit/placement and 60 fps on a suitable desktop; record frame-time percentiles and scene complexity.
- Instance repeated chairs/particles; share materials and geometry; bound shadow lights; avoid rebuilding every mesh after one object moves.
- Load the selected rental and a useful scene first; load optional detail afterward. Provide asset load/error/retry states and 2D fallback.
- Handle WebGL context loss, large image uploads, interrupted scans, cancellation and out-of-memory cases without losing the layout.
- Keep the main UI thread free of dense reconstruction; inspect and budget memory, draw calls, textures and triangles.

## Implementation phases and release gates

| Phase | Deliverable | Acceptance gate | Status in this branch |
| --- | --- | --- | --- |
| 1: inventory foundation | Complete searchable catalog, generic physical-item path, mixed tent/inflatable area, identity preserved through review | No active physical rental silently lost; add/edit/undo/save/reopen/review tests; unknowns remain labeled | Implemented foundation; live catalog read confirmed; unknown models remain disclosed |
| 2: asset and scene quality | Approved real-SKU hero models, calibrated materials, coherent shadows, camera presets | Side-by-side actual-product comparison, actual-device visual review, loading/error states | Procedural accessory coverage added; hero asset production remains |
| 3: motion | Unified lifecycle, fan/foam/fountain/inflatable/light behavior, reduced motion | Motion never changes placement; hidden scenes pause; bounded particle use; real-device frame-time check | Initial accessory motion integrated; advanced guests and production budgets remain |
| 4: venue accuracy | Honest photo match, guided captures, calibrated self-hosted reconstruction, validated scale | Reject duplicate/poor captures; independent measurements and observed coverage determine confidence | Claims corrected, duplicate/low-information checks added, invented structures removed; full reconstruction replacement remains |
| 5: planning UX | One world transform model, selection/grouping/align, utility/clearance layers, mobile sheet system | Same placements in 2D/3D/print, multi-tent support, rotations and site geometry validated | Mixed-layout foundation added; full world-document migration remains |
| 6: staff and delivery | Catalog readiness, comparison viewer, staff alternatives, revision history, crew sheets | Tenant permissions, cross-device resume, share revocation, concurrent-save and export tests | Readiness wording corrected; full admin workflow remains |
| 7: launch hardening | Production data audit, measured performance, device/accessibility QA, monitored rollout | Visual approval, zero item/price identity loss, recoverable saves, verified deployment and rollback | Not released by this report |

## What was actually built in this branch

- An All rentals browser with category chips, search, product images/fallbacks, dimensions, placed quantities and explicit approximate/planning-model labels.
- Accessory data profiles for foam, fans, coolers, generators/distribution, speakers, podiums, stanchions, carpet, trash cans, concessions, games, photo booths, stages and fill/chill.
- Generic physical product fallback, distinct catalog variant identity, accessory 2D/3D selection, placement/editing, saved identity and complete summary lines.
- A mixed outdoor planning extent retaining the selected tent, with a visible tent footprint and inflatable-vs-tent conflict warning.
- Procedural accessory models and visual-only fan/foam/fountain motion; subtle inflatable/light motion integrated with existing scene motion and reduced-motion controls.
- A fix for double-applied inflatable orientation at the scene boundary.
- Duplicate-frame/low-texture/exposure checks before depth reconstruction, explicit unverified scan provenance, corrected photo claims and removal of fabricated rear structures/vegetation.
- Focused regression tests covering catalog identity, unresolved prices, persistence, mixed placement, capture checks and model construction.

This is not yet the final premium product. No production-grade asset library, validated self-hosted scan service, full multi-tent world model, advanced guest system, real-time availability integration or redesigned staff workflow is claimed complete. Existing print/share APIs are preserved, but live end-to-end server saving/sharing and real booking fulfillment must be validated before release.

## Technical references

- COLMAP tutorial: https://colmap.github.io/tutorial — camera recovery and sparse/dense reconstruction stages; overlapping capture requirements.
- COLMAP camera models: https://colmap.github.io/cameras.html — intrinsics and distortion model choice.
- Three.js optimization: https://threejs.org/manual/pages/optimize-lots-of-objects.html — merging/instancing approaches for repeated scene content.
- Three.js shadows: https://threejs.org/manual/pages/shadows.html — shadow-map rendering cost.
- Three.js color management: https://threejs.org/manual/pages/color-management.html — consistent texture and renderer color spaces.
