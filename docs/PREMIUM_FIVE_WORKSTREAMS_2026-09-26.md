# RentSketch: five-workstream product release

Baseline: production `f3de0af`, photo-camera release #164. Scope authorized by the owner: implement all five next-build priorities. This document records acceptance criteria and evidence, not a claim of completion before verification.

## 1. Item selection and mobile workspace

Selecting a specific catalog product must either place that product or carry it into a compatible attachment workflow. It must retain its product identity through editing, review, saving and reopening. A linen/tabletop selection must explain which table it needs, preserve the selection while choosing that table, and apply the selected variant. Unknown prices and dimensions remain explicit. Existing paid/edit and read-only permissions still apply.

Mobile must give the layout a useful working area, preserve photo projection through viewport changes, keep controls reachable, and avoid horizontal overflow at 320 and 390 pixels. A screenshot alone is not proof of successful placement.

## 2. Rental assets and motion

Hero models should use actual Friendly catalog images as visual references. Model identity, asset version, reference provenance, dimensions and fidelity are separate fields. Missing manufacturer or staff measurements must not become confirmed dimensions merely because a model looks better.

Operating equipment may animate: fan rotors, foam emission, fountain flow and supported machine operations. Stationary stanchions, closed coolers, trash cans, distribution boxes and unattended games should remain stationary. Motion must not alter the authoritative planning footprint or saved transform. Verify reduced-motion and pause behavior as well as finite geometry and render cost.

## 3. Photo composition

Customers can trace foreground regions in the actual source photograph and save them as editable masks. In the original photo viewpoint those regions must hide rental pixels consistently through resizing, zoom, save/reopen and export. They are manually defined image regions, not reconstructed depth or installation obstacles. Replacing the photograph resets its masks; restoring a version restores the matching photo and composition.

Light and shadow controls should change the rental rendering without changing catalog dimensions or claiming to infer the actual sun. All composition controls need reset, persistence and permission guards. The neutral 3D model must not treat photo masks as physical geometry.

## 4. Projects, revisions, sharing and staff use

Every write carries an expected revision. Concurrent updates must fail safely with a recoverable local copy and explicit choices. No silent last-writer overwrite and no automatic retry that replaces another device's scene.

Named checkpoints are immutable and restoring one creates a new current revision. Alternatives inherit the original design's actual access entitlement; copying cannot create paid access. Checkpoints and copies retain referenced photographs. Autosave must not create unbounded full-scene history rows.

Share links have explicit expiry and revocation. Shared viewers remain read-only and cannot obtain ownership/session capabilities. Staff access remains tenant-scoped and uses the existing cookie/CSRF protections. Site notes and crew exports must distinguish confirmed measurements from estimates and exclude internal-only information from public shares.

## 5. Scan evidence and validation

Reconstruction work should be cancellable and run away from interactive editing when a worker is available. Observed depth evidence must remain distinct from interpolation or hole filling.

A separate physical distance, not used to calibrate the scan, can check supported reconstructed points. Report the predicted distance, supplied measurement, error and evidence limits. Insufficient coverage, unsupported points and inconsistent geometry fail visibly. Changes to capture inputs invalidate previous check results. Passing one distance check does not validate the entire venue, recover unseen surfaces or establish survey accuracy.

## Release evidence

Implementation is complete across all five workstreams. Focused core/API/DOM checks and actual Chromium visual journeys passed, including exact product selection, nine revised equipment meshes, foreground occlusion with unchanged camera calibration, private sharing, conflict recovery, and independent scan evidence rejection. Actual capture examples and provenance are in [qa-premium-five](qa-premium-five/README.md).

Integration uncovered and fixed the free-checkout draft regression, root-entitlement renewal/recovery for alternatives, retained checkpoint photos, delayed-save followup, structured contact redaction, and printing before an optional photo decoded. The release adds regression gates for these behaviors instead of relying on screenshots alone.

Deployment requires additive migration `022_design_projects.sql`. The existing Railway API pre-deploy command runs the migration runner before starting the new API; existing designs begin at revision 1. Old clients receive an actionable 428 response rather than silently overwriting newer work. Checkpoints are limited to 50 per design, alternatives to 20 per project, and retained photo storage to 128 files / 256 MiB per project family.

Final local integration passed: `npm --prefix tests test` (156 core tests plus the full legacy/API/DOM chains), `test:event-pass` with the new premium gates, marketing checks, production Caddy routing/header checks, and actual Chromium Photo/Space Scan, composition, contextual picker and Projects journeys. The Photo/Space Scan journey explicitly verified real module-worker execution, unresolved yaw, unverified dimensions, placement/save/reopen, Measure and Walk.

Publication gates are GitHub CI on the committed tree, both Railway deployments, byte-for-byte deployed frontend asset checks, and read-only production authentication/source-boundary checks. Those results must be checked after publication; local tests do not substitute for them.

Real-device performance and unmeasured product dimensions remain limitations. Single-photo masks are manual image edits, not 3D depth. Scan tests establish known-geometry behavior but do not establish real-property field accuracy; full structure-from-motion and surveyed reconstruction remain future work. See [scan validation evidence](SCAN_VALIDATION_2026-09-26.md).
