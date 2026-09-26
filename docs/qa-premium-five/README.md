# Actual application evidence

These are captures of this release running in Chromium with isolated test data. The equipment comparisons render previous and revised production models with the same camera, dimensions and lighting alongside actual Friendly catalog product reference photos. Physical SKU dimensions remain unverified.

The foreground preview uses a public-domain photograph by Yinan Chen, [Gfp-house-on-a-nice-lawn](https://commons.wikimedia.org/wiki/File:Gfp-house-on-a-nice-lawn.jpg). The shrub outline was manually traced in the source photo; this is camera-matched compositing, not geometry recovered from one image. The test pass expiry in the header is fixture data. No customer yard or private design is included.

The Projects capture is a real mobile-width browser render backed by an isolated revision-aware API fixture. API ownership and sharing are separately exercised by the real Express/PGlite tests.

- `foam-machine-comparison.png`: catalog reference, previous model, revised model.
- `stanchion-comparison.png`: correct black retractable single-post form.
- `photo-foreground-preview.png`: restored source shrub pixels occluding the rental.
- `exact-linen-mobile.png`: selected SKU carried into a compatible table chooser at 320 px.
- `projects-mobile.png`: named versions and alternatives at 390 px.

Browser fixtures test widths of 1440, 390 and 320 pixels. Software-rendered Chromium does not establish performance on every physical phone. Scan geometry tests use known synthetic scenes and do not establish surveyed field accuracy.
