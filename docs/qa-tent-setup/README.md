# Detailed tent setup walkthrough

The customer walkthrough uses the selected tent dimensions and center-pole positions. It is an illustrated sequence, not a site-specific installation plan. The film's 74–92 second runtime is playback pacing, not estimated installation time.

- Pole: measured footprint, anchors, ground cloth, top, loose straps, four corners, individual center lifts, cloth withdrawal, upright centers, remaining sides, tensioning, optional selected walls, walk-around.
- Frame: parts, low roof assembly, protected top, first whole-side lift, opposite-side lift, anchors/ballast, tension, optional selected walls, walk-around.
- Popup: expanding folding frame, top, telescoping legs, anchors and checks.
- Pause, 0.5/1/1.5/2× speed, seek bar, previous/next chapters, replay, detail/overview camera and transparent-top inspection.
- Reduced motion starts paused. Leaving 3D, changing the scene, exporting, closing, replaying and destruction clean up the temporary rig and restore the actual event. Playback never writes rental objects or prices.
- Four articulated crew members share primitive geometry; anchors, poles, frame members and straps use instancing. No external model downloads were added.

Sequence references reviewed:

- https://gettent.com/product_images/pdf/C04Z30X60-30-x-60-classic-pole-tent-sectional-manual.pdf
- https://gettent.com/product_images/pdf/C07Y20X20-20-x-20-master-series-frame-tent-1-pc-manual.pdf
- User's visual reference: https://www.youtube.com/watch?v=s6HhJ6egTdo

Validation:

- `node --experimental-vm-modules --test tests/tent-setup3d.test.mjs`: continuous deformation, constant pole/beam lengths, deterministic seeking, fixed corners, 12 size/style combinations, resource isolation and wall geometry.
- `RENTSKETCH_SETUP_ONLY=1 node --experimental-vm-modules tests/scene-interaction.cjs`: controller pause, chapters, reverse playback, cancellation, completion and disposal.
- `node --experimental-vm-modules tests/pole-tent-setup.cjs`: preserved existing pole renderer's regression coverage.
- Chromium WebGL inspection using isolated public-catalog fixtures: desktop pole/frame animation, transparent top, phone controls and 2D exit. No page errors or horizontal overflow.
- Existing `direct-entry.cjs` and `designer-dom-smoke.cjs` failures also reproduce on unchanged production commit 4f6e108 (entry wizard expectation and review copy respectively); these are outside this change.
