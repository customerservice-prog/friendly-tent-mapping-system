# Customer flow and saved-plan reliability — September 26, 2026

This release follows the five-workstream rebuild in PR #165. It addresses defects observed in the deployed free-customer flow and reproduced against the production UI modules. It does not claim a new surveyed reconstruction engine or complete manufacturer-verified assets.

## Observed problems and changes

| Problem | Result in this release |
| --- | --- |
| Free preview's Projects panel called it a shared design and claimed device saving | Distinct preview, shared, expired, restoring and ended-staff-session states; actions open the existing access/recovery flow. No new purchase is submitted. |
| Reopening a paid event could replace pending offline changes with its cloud scene | Verified resume checks the exact tenant, project and owner before recovering the device copy. Matching revisions can sync; divergent or unknown revisions pause for an explicit conflict choice. Expired access preserves pending recovery without enabling editing. Equal legacy/cloud scenes can resume normally. |
| Device storage failure still produced a saved message | Local recovery is reported only after storage succeeds. Failure asks the customer to keep the tab open. Conflict markers and pending state persist across reloads. |
| Project forms replaced focused DOM after saving | Focus and scroll stay in the dialog after redraw; Escape and focus trapping continue to work. |
| Many rental cards showed the same generic cube | Existing product photos remain first. Recognizable renderer thumbnails and category symbols fill gaps; illustrations are labeled. Broken photos fall back independently to models, then symbols. |
| Phone photo handles shrank with the image | Calibration and foreground handles have 44 CSS-pixel hit areas, compact corner labels, nearest-point selection, offset-preserving touch drag and keyboard nudging. Outline toolbar height remains stable during dragging. |
| Concurrent scan uploads overwrote earlier viewpoints | Manual viewpoints merge into current state at completion. Newer same-role selections win. Clear, replacement, project restore, identity and access changes discard stale responses. Failed video batches clean unused uploads. Applied photos remain available for recovery if cloud saving fails. |
| Delayed cleanup could inherit another staff identity | Photo operations pin their initiating identity across readiness and transport awaits. The session manager rejects a changed identity before sending a request. |
| Saved inflatables lost identity or changed geometry when catalog data changed | New placements retain SKU, name, external ID, profile, model dimensions and provenance. 2D/3D, overlap checks, walking and guest rigs use saved dimensions. Review retains a removed SKU while requiring current pricing confirmation. |
| Inflatable guests accelerated over time | Activity uses the renderer's absolute animation clock instead of repeatedly accumulating it as a frame delta. |

## Verification

- Core unit suite: 163 passing cases, including stored inflatable identity and rotated footprint consistency.
- Production mesh checks: saved inflatable size/profile after catalog changes/removal; frame-sequence-independent animation.
- Isolated API/DOM gates: Event Pass, private photos, revision conflicts, owner/tenant boundaries, staff sessions/MFA, project versions/shares, offline recovery and scan checks.
- Deferred-response tests exercise actual production upload coordination: concurrent roles, replacement ordering, clear/remove/restore, identity changes, partial video failures and save failures.
- The real session manager and photo functions are tested across both asynchronous identity-change boundaries.
- Chromium: Projects, picker and photo controls at 320/390/1440px; touch dragging, keyboard focus, no horizontal overflow, image failure fallback and source-coordinate registration.
- Full browser photo journey: upload, camera-matched placement, move the tent/rentals, save/reopen, then estimated multi-view scan, Measure and Walk.
- Added recovery, media, stored-inflatable and photo-request regression tests to the release gates. Added mobile photo-controls and media browser checks to GitHub Actions.

The images in `qa-customer-refinement/` are actual Chromium captures of production components with isolated catalogs, APIs and synthetic photo fixtures. They demonstrate interaction and layout; they are not evidence of realistic reconstruction from a customer's venue photograph. No live customer data, purchases, emails or catalog writes were used in QA.

## Remaining product work

- Three observed source catalog rows still need proper family mappings and/or dedicated furniture renderers: 6ft Plastic Folding Table, Cross-Back Farmhouse Chair and Sweetheart Table. Their missing source dimensions are not replaced with invented measurements. Catalog configuration and physical asset verification remain separate work.
- Single-photo mode stays camera-matched. Multi-view preview remains an estimate with confidence and independent measurement checks; it is not surveyed geometry or a general-purpose photogrammetry service.
- Premium item accuracy still depends on confirmed manufacturer dimensions, operating clearances, product photography and authored models. Distinct picker illustrations do not imply those measurements are verified.
- Old inflatable saves that never retained a profile cannot recreate a deleted historical model. New saves retain the necessary profile.
- Canceling a UI operation rejects its stale result and remaining work; already-issued HTTP uploads run to completion or their timeout. Safe cleanup is skipped after identity changes rather than issuing a deletion under another user.
- This is a targeted security and reliability release, not a claim that every possible security risk has been eliminated.
