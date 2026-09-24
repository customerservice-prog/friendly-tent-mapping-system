import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORLD_UNITS,
  layoutPointToWorld,
  worldPointToLayout,
  objectCenterWorld,
  objectGroundFootprint,
  worldDistance,
} from '../js/core/world-space.js';
import {
  calibrateScaleFromReference,
  calibrateScaleFromWorldReference,
  measureImagePoints,
  measureGroundPoints,
  formatFeetInches,
} from '../js/core/measurement.js';
import {
  convexPolygonsIntersect,
  polygonInsidePolygon,
  polygonDistance,
  tentPlacementFootprints,
  evaluateTentFit,
  evaluateRentalFit,
} from '../js/core/site-fit.js';

test('world-space contract round-trips layout feet without changing scale', () => {
  const site = { widthFt: 70, lengthFt: 90 };
  assert.equal(WORLD_UNITS, 'ft');
  for (const p of [
    { x: 0, y: 0, heightFt: 0 },
    { x: 35, y: 45, heightFt: 5.5 },
    { x: 70, y: 90, heightFt: 12 },
    { x: 11.25, y: 72.75, heightFt: 1.5 },
  ]) {
    const world = layoutPointToWorld(p, site);
    const restored = worldPointToLayout(world, site);
    assert.ok(Math.abs(restored.x - p.x) < 1e-9);
    assert.ok(Math.abs(restored.y - p.y) < 1e-9);
    assert.ok(Math.abs(restored.heightFt - p.heightFt) < 1e-9);
  }
  const tent = { x: 18, y: 31, widthFt: 20, depthFt: 30, heightFt: 15 };
  const center = objectCenterWorld(tent, site);
  assert.deepEqual(center, { x: -7, y: 7.5, z: 1 });
});

test('measurement calibration converts image pixels to real feet and inches', () => {
  const calibration = calibrateScaleFromReference({ x: 100, y: 200 }, { x: 500, y: 200 }, 20);
  assert.equal(calibration.valid, true);
  assert.equal(calibration.pixelsPerFoot, 20);
  assert.equal(calibration.feetPerPixel, 0.05);
  const m = measureImagePoints({ x: 0, y: 0 }, { x: 275, y: 0 }, calibration);
  assert.equal(m.feet, 13.75);
  assert.equal(m.formatted, '13 ft 9 in');
  assert.equal(formatFeetInches(27 + 4 / 12), '27 ft 4 in');
  assert.equal(formatFeetInches(20), '20 ft');
});

test('measurement can be calibrated from a known pair of world coordinates', () => {
  const worldA = { x: -8, y: 0, z: 2 };
  const worldB = { x: 8, y: 0, z: 2 };
  assert.equal(worldDistance(worldA, worldB), 16);
  const calibration = calibrateScaleFromWorldReference({ x: 10, y: 20 }, { x: 330, y: 20 }, worldA, worldB);
  assert.equal(calibration.knownFeet, 16);
  assert.equal(calibration.pixelsPerFoot, 20);
  assert.equal(measureGroundPoints({ x: 0, y: 0 }, { x: 3, y: 4 }).formatted, '5 ft');
});

test('rotated exact rental footprints use SAT collision rather than axis-aligned boxes', () => {
  const a = objectGroundFootprint({ x: 10, y: 10, widthFt: 20, depthFt: 10, rotationDeg: 45 });
  const b = objectGroundFootprint({ x: 23, y: 16, widthFt: 5, depthFt: 5, rotationDeg: 0 });
  const c = objectGroundFootprint({ x: 40, y: 40, widthFt: 5, depthFt: 5, rotationDeg: 0 });
  assert.equal(convexPolygonsIntersect(a, b), true);
  assert.equal(convexPolygonsIntersect(a, c), false);
  assert.ok(polygonDistance(a, c) > 0);
});

test('20x30 pole tent fit distinguishes exact footprint, install clearance, and hard obstacle', () => {
  const site = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 70 }, { x: 0, y: 70 }];
  const tent = { id: 'pole-20x30', type: 'pole', widthFt: 20, lengthFt: 30, installationClearanceFt: 5 };
  const centerFit = evaluateTentFit({ tent, placement: { x: 20, y: 20 }, usablePolygon: site, obstacles: [], surfaceType: 'grass' });
  assert.equal(centerFit.status, 'fits');
  assert.equal(centerFit.color, 'green');
  assert.equal(centerFit.clearanceFt, 5);

  const tightEdge = evaluateTentFit({ tent, placement: { x: 2, y: 20 }, usablePolygon: site, obstacles: [], surfaceType: 'grass' });
  assert.equal(tightEdge.status, 'close');
  assert.ok(tightEdge.reasons.some(r => r.code === 'installation_clearance_tight'));

  const house = { id: 'house', type: 'house', x: 29, y: 28, widthFt: 18, depthFt: 18, rotationDeg: 0 };
  const blocked = evaluateTentFit({ tent, placement: { x: 20, y: 20 }, usablePolygon: site, obstacles: [house], surfaceType: 'grass' });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.color, 'red');
  assert.ok(blocked.collisions.some(c => c.id === 'house'));
});

test('pole tent on concrete is blocked even when geometric footprint fits', () => {
  const site = [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 80 }, { x: 0, y: 80 }];
  const tent = { type: 'pole', widthFt: 20, lengthFt: 20, installationClearanceFt: 5 };
  const result = evaluateTentFit({ tent, placement: { x: 30, y: 30 }, usablePolygon: site, surfaceType: 'concrete' });
  assert.equal(result.status, 'blocked');
  assert.ok(result.reasons.some(r => r.code === 'surface_incompatible'));
});

test('frame tent can rotate and still fit when its exact clearance stays inside the property', () => {
  const site = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  const tent = { type: 'frame', widthFt: 20, lengthFt: 30, installationClearanceFt: 2 };
  const footprints = tentPlacementFootprints(tent, { x: 40, y: 35, rotationDeg: 35 });
  assert.equal(polygonInsidePolygon(footprints.clearanceFootprint, site), true);
  const result = evaluateTentFit({ tent, placement: { x: 40, y: 35, rotationDeg: 35 }, usablePolygon: site, surfaceType: 'concrete' });
  assert.equal(result.status, 'fits');
});

test('rental fit reports close for preferred clearance and blocked for actual collision', () => {
  const site = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }];
  const table = { id: 'table', x: 1, y: 10, widthFt: 5, depthFt: 5, rotationDeg: 0 };
  const close = evaluateRentalFit({ item: table, usablePolygon: site, obstacles: [], clearanceFt: 2 });
  assert.equal(close.status, 'close');
  const tree = { id: 'tree', type: 'tree', x: 3, y: 11, widthFt: 4, depthFt: 4 };
  const blocked = evaluateRentalFit({ item: table, usablePolygon: site, obstacles: [tree], clearanceFt: 1 });
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.reasons.some(r => r.code === 'obstacle_collision'));
});
