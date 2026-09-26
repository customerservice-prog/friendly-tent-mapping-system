# Space Scan: independent distance checks and local worker pipeline

The shipped solver remains an **estimated, limited-view depth preview**. It is not full structure-from-motion, a surveyed property, or a validated venue. It does not recover full camera pose, lens distortion, unseen surfaces, or installation suitability. No external reconstruction service is configured or implied.

For video, the sampled frames omit the start/end of the clip; their baseline uses a time-fraction estimate of the entered total camera travel. Nonuniform motion outside the sampled interval can still bias scale. The capture panel states this explicitly, and the independent check can expose the resulting disagreement. A full trajectory solution is not claimed.

## What changed

- The temporal middle video frame can lie off-center on the physical camera path. Tracked image motion now divides the **total entered camera travel** across the whole path rather than independently forcing each half to 50%. Three-image jobs can also use this asymmetric tracked path.
- Vertical registration remains, but the prior far-field horizontal subtraction was removed: it confused finite distant-object parallax with camera yaw and biased real depths. Yaw remains explicitly unresolved.
- Depth beyond the supported range is rejected, rather than clipped into a false near/far plane.
- Observed samples, bilateral agreement, disparity, support count, and untouched measurement vertices remain separate from filled and smoothed display geometry. Interpolated display surfaces cannot support a passing distance check.
- Capture overlap now compensates for bounded image translation before correlation. Raw same-pixel correlation incorrectly rejected textured images with the required sideways parallax.
- The actual pure solver and multi-reference fusion run in a module worker. Obsolete jobs terminate on abort. A one-result cache reuses geometry for measurement-only edits; render transforms copy cached vertices. Browsers without module-worker support use a smaller main-thread preview and report that execution mode. That fallback can cancel before/after computation, but cannot interrupt synchronous computation mid-solve.

## Independent measurement flow

1. Capture overlapping views and enter measured total camera travel (the scale input).
2. On the center photo, mark two distinct, textured, fixed points at least 3 ft apart.
3. Enter their separately measured direct distance. This **held-out** distance is never passed into the reconstruction job or used to tune scale, poses, or geometry.
4. Recompute a prediction from the unsmoothed observed triangles under A and B. Missing, interpolated, one-sided, ambiguous, low-disparity, or depth-discontinuous triangles are rejected. Endpoints are never snapped across holes.
5. Require usable capture quality, adequate tracked pose evidence, at least 20% observed grid coverage, and at least 15% bilateral grid coverage. Then compare the prediction with the physical measurement.

`valid` means **only this segment is within tolerance**, currently 5% or 0.25 ft, whichever is larger. `failed` means its residual exceeds that tolerance. `insufficient` means the check lacks evidence and cannot establish agreement. A pass always retains `metric:false`, `siteDimensionsVerified:false`, and `mayClaimMetricAccuracy:false`.

The panel displays the prediction, measured value, residual, tolerance, observed grid coverage, bilateral agreement, capture score, and pose qualification. Coverage describes the sampled grid, not every pixel or every part of the property. Full camera pose is still unresolved even when it supports this limited check.

Saved check inputs contain only endpoints, distance, and center-image identity. Saved validation/accuracy flags are ignored. A changed center image invalidates endpoints. Baseline, camera parameters, site depth range, source images, and calibration changes trigger a fresh geometry job/verdict; changing the held-out measurement only recomputes the verdict. Current renderer callbacks replace stale runtime reports.

## Verification and limits

`node --test tests/scan-validation.test.mjs tests/scan-worker.test.mjs tests/scan-motion.test.mjs tests/stereo-reconstruction.test.mjs tests/venue-scan-video.test.mjs` exercises known planar and varying-depth synthetic geometry, an independent bad measurement, weak pose, unsupported triangles, changed capture/calibration, invalid metadata, capture guidance, true worker-thread parity, cancellation, and fallback behavior. The existing venue-photo renderer regression also passed.

No independently surveyed real-property capture dataset is present in this repository. These tests establish implementation behavior and synthetic geometry consistency, **not field accuracy or product-wide metric validation**. Before claiming accurate property reconstruction, collect representative phone captures with independently surveyed checkpoints spanning different depths, surfaces and image regions; evaluate held-out residuals and coverage; establish supported capture conditions and failure rates. A production SfM/photogrammetry pipeline with calibrated camera poses remains separate future work.
