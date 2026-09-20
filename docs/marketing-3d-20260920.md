# RentSketch automatic 3D homepage update

Scope: rentsketch.com public marketing pages and their shared read-only demo.

- 3D is the initial server-rendered state. The interactive scene loads automatically near the viewport after the initial paint, without a start click.
- A 1440×1000 model image and a 720×500 mobile image appear immediately and remain if WebGL cannot initialize. The page does not silently revert to 2D.
- The new eye-level reception camera is opt-in for the marketing demo. Existing designer cameras keep their original framing.
- Image geometry and the interactive example share `js/data/marketing-reception.js`: a 40×60 pole tent, eight 5-foot round tables, 64 chairs, a 12×12 dance floor, bistro lights and the renderer's decorative table styling.
- Model images are rendered offline from production Three.js geometry with Mitsuba. They are not browser screenshots and do not prove GPU rendering. The exporter retains model shapes, placements and sizes; lighting and material shading are simplified for clear artwork.
- The homepage now explains supported equipment, the business workflow, access options, a worked layout example, and planning use cases. Its title, description and software structured data describe the product without invented reviews or ranking claims.
- Search Console account access remains pending the specific authorization requested in the preceding turn. No Google account/property changes are included.

Verification before deployment: marketing metadata/internal-link checks; automatic 3D state and fallback tests; customer-experience regression; tent entry and camera-fit tests. The managed browser previously reported WebGL disabled, so live visual verification covers the static model image, view controls, 2D fallback and responsive layout, not GPU appearance.

Rebuild assets:

```sh
NODE_PATH=tests/node_modules node --experimental-vm-modules scripts/export-marketing-scene.cjs
python scripts/render-marketing-poster.py
python scripts/build-social.py
python scripts/build-marketing.py
npm --prefix tests run test:marketing
```

The poster renderer requires Mitsuba 3.9.1, NumPy and Pillow. These are offline build dependencies only and are not loaded by visitors or required by the deployed website.
