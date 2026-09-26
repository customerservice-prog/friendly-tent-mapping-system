# Photo workspace and canopy rebuild — September 26, 2026

This addendum updates the [premium rebuild plan](PREMIUM_REBUILD_2026-09-25.md) after reviewing the customer's screenshot against the implementation. It does not replace the [world coordinate contract](world-spatial-contract.md) or imply that the whole product is premium or complete. The correction has local browser and regression evidence below. CI and production deployment remain release gates; this document does not claim they have completed.

## Why the screenshot still looked wrong

The screenshot showed a small, elevated-looking tent against a real backyard, a gray molded roof, distracting sample people, and controls covering much of the photograph. These were several connected problems:

- **An arbitrary camera and site reference.** `photo-geometry.js` initialized a generic quadrilateral against a nominal planning area. Its recovered perspective could imply an elevated camera even though the photograph was taken near standing height. A consistent projection is not necessarily the correct camera or measured scale. Resizing the tent to look better would hide this error and corrupt planning dimensions.
- **A cone on a flat sheet.** `view3d.js` calculated the pole canopy from an elliptical radius clipped at one. Large corner areas therefore remained flat at eave height. Glossy, warm fabric and scene lighting further weakened the resemblance to tensioned white vinyl.
- **Reversed face interpretation.** The custom photo projection reflects the renderer's handedness. Three r160 only accounts for reflected object matrices when choosing front-face winding, so the photograph camera could cull the wrong surfaces and reverse two-sided fabric lighting. A scoped renderer adapter now corrects photo-camera draws, while leaving shadow cameras, the background image and ordinary 3D rendering unchanged.
- **Photo composition presented as free 3D.** A locked photo composition appeared under the same 3D tab used for navigation. The interface did not make the difference between one photographed viewpoint and a navigable layout model sufficiently clear.
- **Fragmented coordinates.** Tent-local furniture, independent photo placement, the larger site, calibration and fit checks had separate adapters. Agreeing visually in one view did not prove agreement in print, another view or a restored design.
- **Busy presentation.** Calibration, scene, fit and placement controls competed with the preview. Illustrative guests added apparent activity without improving the accuracy of the scene.

## Changes in this branch

The photo camera now uses an explicit eye-height starting estimate, with a reference rectangle and a measured-ground setup flow. The initial pose remains an assumption. Entering a measurement and aligning image corners are separate requirements; automatic defaults must not earn a confirmed-fit status. Existing manually calibrated records are preserved; only previous automatic guesses receive the revised starting estimate.

The workspace separates **Photo View**, which keeps the source viewpoint, from an orbitable **3D layout model**. Calibration becomes a focused editing state with clearer scale status and fewer competing controls. Photo-specific lighting uses a neutral fill to reduce the previous olive cast. Actual browser captures cover a real reference property photograph at desktop, 390px and 320px widths.

The 2D site plan and neutral 3D model now use the same photo-world rental and tent transforms. Existing saved tent-local data is preserved through adapters. Rotating a photo-placed rectangular rental changes its world angle without swapping its model dimensions; duplication offsets its world placement. Collapsed, crossed or negligible reference rectangles cannot produce a confirmed fit. Quick Print awaits the prepared review image, including its estimated-scale caption. Collision checks now use the same visible world positions, rotated footprints and transformed tent poles. Tent moves and obstacle edits share the rental undo timeline. Resizing the photo recreates its GPU texture when necessary, preventing torn mobile backgrounds.

Tent rendering now lives in `js/ui/tent3d.js`, backed by the pure `js/core/tent-canopy.js` surface model. Rectangular tensile panels reach every perimeter edge; fabric remains connected between multiple crowns. Frame roofs taper to their end eaves. Neutral rough vinyl, a thin valance and subtle seams replace the plastic-like material and thick edge treatment. Product footprints, configured crown locations and structural heights remain unchanged. These are improved illustrative meshes, not manufacturer-certified installation geometry.

## Tent evidence already obtained

Eight tests in `tests/tent-canopy.test.mjs` verify support heights, perimeter continuity, raised interior corners and connecting fabric across multiple crowns. `tests/tent-mesh.cjs` exercises production Three.js geometry: finite vertices, exact footprint bounds, material settings, render budgets, animation stage tags, ballast and window sidewalls.

An actual Chromium/WebGL comparison used identical cameras and production lights for both versions. A 20 × 20 pole tent dropped from 60 to 8 draw calls; the frame version dropped from 68 to 8. Triangle counts increased modestly to about 7,000. Scene-environment, photo-renderer and interaction regressions also passed locally. These results do not establish live deployment, real-phone performance or photographic accuracy; see the earlier [verification limits](PREMIUM_REBUILD_VERIFICATION.md).

## Remaining realism requirements

Premium results still require reviewed assets for actual rental SKUs, measured dimensions, calibrated lighting, convincing ground contact and explicit occlusion masks or observed geometry. Photo alignment cannot recover hidden property surfaces. A true scan pipeline still needs optimized camera poses, coverage reporting and an independent scale measurement withheld from calibration. Unknown surfaces and unvalidated measurements must remain labeled. The next acceptance gate is a coherent customer journey with credible real-photo evidence, not another accuracy claim inferred from a screenshot.

## Combined local evidence

The complete local npm suite passed before final integration; focused final runs then passed 30 geometry, calibration, collision, history and projection tests plus the photo-mode and site-plan DOM checks. Actual Chromium/WebGL customer checks cover tent-roof dragging, independent table dragging, yard placement, save/reopen, all three views, measured-reference entry, scan, measurement and walking controls. Reviewed screenshots are in [qa-photo-camera](qa-photo-camera/README.md). The test photograph's dimensions are illustrative inputs, not certified measurements.

The release workflow now runs the actual photo browser journey alongside existing security, customer-flow and scan gates. Remaining release checks are green CI on the exact published tree and production asset/deployment verification.
