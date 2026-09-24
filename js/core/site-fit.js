// RentSketch exact site-fit engine.
// Operates in feet on the ground plane and supports rotated rectangular rental
// footprints, arbitrary usable-site polygons, obstacles, and installation
// clearance. Rendering/camera code should consume these results rather than
// re-implementing fit rules.

import { objectGroundFootprint } from './world-space.js';

const EPS = 1e-7;
const HARD_SURFACES = new Set(['concrete', 'asphalt', 'deck']);

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function dot(a, b) { return a.x * b.x + a.y * b.y; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
function length(v) { return Math.hypot(v.x, v.y); }
function normalize(v) {
  const m = length(v);
  return m > EPS ? { x: v.x / m, y: v.y / m } : { x: 0, y: 0 };
}
function perpendicular(v) { return { x: -v.y, y: v.x }; }

function polygonAxes(poly) {
  const axes = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const axis = normalize(perpendicular(sub(b, a)));
    if (length(axis) > EPS) axes.push(axis);
  }
  return axes;
}

function project(poly, axis) {
  let min = Infinity, max = -Infinity;
  for (const p of poly) {
    const v = dot(p, axis);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return { min, max };
}

export function convexPolygonsIntersect(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 3 || b.length < 3) return false;
  const axes = polygonAxes(a).concat(polygonAxes(b));
  for (const axis of axes) {
    const pa = project(a, axis), pb = project(b, axis);
    if (pa.max < pb.min - EPS || pb.max < pa.min - EPS) return false;
  }
  return true;
}

export function pointInPolygon(point, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  const x = finite(point?.x), y = finite(point?.y);
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    const ax = finite(a?.x), ay = finite(a?.y), bx = finite(b?.x), by = finite(b?.y);
    const minX = Math.min(ax, bx) - EPS, maxX = Math.max(ax, bx) + EPS;
    const minY = Math.min(ay, by) - EPS, maxY = Math.max(ay, by) + EPS;
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (Math.abs(cross) <= EPS && x >= minX && x <= maxX && y >= minY && y <= maxY) return true;
    const intersect = ((ay > y) !== (by > y)) &&
      (x < (bx - ax) * (y - ay) / ((by - ay) || EPS) + ax);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function polygonInsidePolygon(inner, outer) {
  if (!Array.isArray(inner) || inner.length < 3 || !Array.isArray(outer) || outer.length < 3) return false;
  if (!inner.every(p => pointInPolygon(p, outer))) return false;
  // Sample edge midpoints too so concave usable-site polygons cannot swallow
  // a rectangle whose vertices are inside but whose edge exits the site.
  for (let i = 0; i < inner.length; i++) {
    const a = inner[i], b = inner[(i + 1) % inner.length];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (!pointInPolygon(mid, outer)) return false;
  }
  return true;
}

function pointSegmentDistance(p, a, b) {
  const ab = sub(b, a), ap = sub(p, a), denom = dot(ab, ab);
  if (denom <= EPS) return length(ap);
  const t = Math.max(0, Math.min(1, dot(ap, ab) / denom));
  const q = { x: a.x + ab.x * t, y: a.y + ab.y * t };
  return length(sub(p, q));
}

function segmentDistance(a, b, c, d) {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  );
}

function orientation(a, b, c) {
  return Math.sign((b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y));
}

function onSegment(a, b, p) {
  return p.x <= Math.max(a.x, b.x) + EPS && p.x >= Math.min(a.x, b.x) - EPS &&
    p.y <= Math.max(a.y, b.y) + EPS && p.y >= Math.min(a.y, b.y) - EPS;
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c), o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a), o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, b, c)) return true;
  if (o2 === 0 && onSegment(a, b, d)) return true;
  if (o3 === 0 && onSegment(c, d, a)) return true;
  if (o4 === 0 && onSegment(c, d, b)) return true;
  return false;
}

export function polygonDistance(a, b) {
  if (convexPolygonsIntersect(a, b) || a.some(p => pointInPolygon(p, b)) || b.some(p => pointInPolygon(p, a))) return 0;
  let min = Infinity;
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i], a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j], b2 = b[(j + 1) % b.length];
      min = Math.min(min, segmentDistance(a1, a2, b1, b2));
    }
  }
  return Number.isFinite(min) ? min : null;
}

function polygonForEntity(entity, clearanceFt = 0) {
  if (Array.isArray(entity?.polygon) && entity.polygon.length >= 3) return entity.polygon.map(p => ({ x: finite(p.x), y: finite(p.y) }));
  return objectGroundFootprint(entity, clearanceFt);
}

function collisionList(footprint, obstacles) {
  const hits = [];
  for (const obstacle of obstacles || []) {
    const polygon = polygonForEntity(obstacle);
    if (convexPolygonsIntersect(footprint, polygon) || footprint.some(p => pointInPolygon(p, polygon)) || polygon.some(p => pointInPolygon(p, footprint))) {
      hits.push({ id: obstacle.id || null, type: obstacle.type || obstacle.kind || 'obstacle', polygon });
    }
  }
  return hits;
}

function reason(code, message, severity = 'warning', ids = []) {
  return { code, message, severity, objectIds: ids.filter(Boolean) };
}

export function tentPlacementFootprints(tent, placement = {}) {
  const base = {
    id: tent?.id || 'tent',
    x: finite(placement.x),
    y: finite(placement.y),
    widthFt: Math.max(0.01, finite(tent?.widthFt, 1)),
    depthFt: Math.max(0.01, finite(tent?.lengthFt, 1)),
    rotationDeg: finite(placement.rotationDeg),
  };
  const clearanceFt = Math.max(0, finite(tent?.installationClearanceFt));
  return {
    base,
    clearanceFt,
    footprint: objectGroundFootprint(base),
    clearanceFootprint: objectGroundFootprint(base, clearanceFt),
  };
}

export function evaluateTentFit({
  tent,
  placement = {},
  usablePolygon = null,
  obstacles = [],
  surfaceType = 'notSure',
} = {}) {
  const f = tentPlacementFootprints(tent, placement);
  const reasons = [];
  const baseInside = usablePolygon ? polygonInsidePolygon(f.footprint, usablePolygon) : true;
  const clearanceInside = usablePolygon ? polygonInsidePolygon(f.clearanceFootprint, usablePolygon) : true;
  const hardHits = collisionList(f.footprint, obstacles);
  const clearanceHits = collisionList(f.clearanceFootprint, obstacles)
    .filter(hit => !hardHits.some(h => h.id && h.id === hit.id));
  const poleHardSurface = tent?.type === 'pole' && HARD_SURFACES.has(surfaceType);

  if (!baseInside) reasons.push(reason('outside_usable_area', 'The tent footprint extends outside the usable property area.', 'error'));
  if (hardHits.length) reasons.push(reason('obstacle_collision', 'The tent footprint overlaps a mapped obstacle.', 'error', hardHits.map(h => h.id)));
  if (poleHardSurface) reasons.push(reason('surface_incompatible', 'This pole tent needs a suitable staking surface or a different installation plan.', 'error'));
  if (baseInside && !clearanceInside) reasons.push(reason('installation_clearance_tight', 'The tent itself fits, but the required installation clearance does not fully fit.', 'warning'));
  if (clearanceHits.length) reasons.push(reason('clearance_obstacle', 'An obstacle is inside the tent installation clearance area.', 'warning', clearanceHits.map(h => h.id)));

  const blocked = !baseInside || hardHits.length > 0 || poleHardSurface;
  const close = !blocked && (!clearanceInside || clearanceHits.length > 0);
  const status = blocked ? 'blocked' : close ? 'close' : 'fits';

  return {
    status,
    color: status === 'fits' ? 'green' : status === 'close' ? 'yellow' : 'red',
    clearanceFt: f.clearanceFt,
    footprint: f.footprint,
    clearanceFootprint: f.clearanceFootprint,
    baseInside,
    clearanceInside,
    collisions: hardHits,
    clearanceCollisions: clearanceHits,
    reasons,
  };
}

export function evaluateRentalFit({
  item,
  usablePolygon = null,
  obstacles = [],
  clearanceFt = 0,
} = {}) {
  const footprint = polygonForEntity(item);
  const protectedFootprint = polygonForEntity(item, Math.max(0, finite(clearanceFt)));
  const inside = usablePolygon ? polygonInsidePolygon(footprint, usablePolygon) : true;
  const protectedInside = usablePolygon ? polygonInsidePolygon(protectedFootprint, usablePolygon) : true;
  const hardHits = collisionList(footprint, obstacles);
  const clearanceHits = collisionList(protectedFootprint, obstacles)
    .filter(hit => !hardHits.some(h => h.id && h.id === hit.id));
  const blocked = !inside || hardHits.length > 0;
  const close = !blocked && (!protectedInside || clearanceHits.length > 0);
  const status = blocked ? 'blocked' : close ? 'close' : 'fits';
  return {
    status,
    color: status === 'fits' ? 'green' : status === 'close' ? 'yellow' : 'red',
    footprint,
    protectedFootprint,
    collisions: hardHits,
    clearanceCollisions: clearanceHits,
    reasons: [
      ...(!inside ? [reason('outside_usable_area', 'This rental extends outside the usable property area.', 'error')] : []),
      ...(hardHits.length ? [reason('obstacle_collision', 'This rental overlaps a mapped obstacle.', 'error', hardHits.map(h => h.id))] : []),
      ...(inside && !protectedInside ? [reason('clearance_tight', 'The rental fits, but its preferred clearance is tight.', 'warning')] : []),
      ...(clearanceHits.length ? [reason('clearance_obstacle', 'An obstacle is inside the preferred clearance around this rental.', 'warning', clearanceHits.map(h => h.id))] : []),
    ],
  };
}
