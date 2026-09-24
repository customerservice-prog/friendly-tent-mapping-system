# RentSketch world / measurement / fit contract

This foundation is renderer-independent. A reconstructed customer property can be
approximate visually, but rental dimensions and placement remain exact in feet.

## Coordinate contract

- **Layout ground plane:** `x/y` in feet from the site's front-left corner.
- **Three.js world:** `x/z` centered on the site, `y` is elevation in feet.
- Use `js/core/world-space.js` for every conversion. Do not duplicate the math
  in Photo View, 2D Plan, or 3D View.

Example:

```js
import { layoutPointToWorld, worldPointToLayout } from './js/core/world-space.js';

const world = layoutPointToWorld({x: 35, y: 45, heightFt: 5.5}, {widthFt: 70, lengthFt: 90});
// { x: 0, y: 5.5, z: 0 }
```

## Measurement contract

`js/core/measurement.js` supports:
- one-known-distance image calibration,
- world-to-image scale calibration,
- image, ground, and 3D measurements,
- consistent feet/inches formatting.

A future Photo Setup flow can ask the customer to tap two known points and enter
one real measurement. The resulting scale record can be saved with the
reconstructed property.

## Property reconstruction → fit engine

The reconstruction pipeline should eventually output:

```js
const usablePolygon = [
  {x: 0, y: 0},
  {x: 70, y: 0},
  {x: 70, y: 90},
  {x: 0, y: 90},
];

const obstacles = [
  {id:'house', type:'house', x:12, y:62, widthFt:40, depthFt:22, rotationDeg:0},
  {id:'tree-1', type:'tree', x:55, y:32, widthFt:5, depthFt:5},
];
```

Then evaluate exact rental geometry:

```js
import { evaluateTentFit } from './js/core/site-fit.js';

const result = evaluateTentFit({
  tent,
  placement: {x:18, y:24, rotationDeg:12},
  usablePolygon,
  obstacles,
  surfaceType:'grass',
});
```

Result:

- `fits / green` — tent + required installation clearance fit.
- `close / yellow` — tent fits, but installation/preferred clearance is tight.
- `blocked / red` — actual footprint is outside the site, collides with an
  obstacle, or the configured surface/anchoring combination is incompatible.

The fit engine uses rotated convex footprint math rather than axis-aligned
bounding boxes.

## Important separation

**Customer world**
- approximate house/fence/tree/terrain reconstruction,
- appearance and lighting can be best-effort.

**Rental world**
- exact catalog dimensions,
- exact world coordinates,
- exact installation-clearance checks.

Camera movement must never mutate world placement coordinates.
