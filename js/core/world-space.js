// RentSketch world-space contract.
// Units are feet. Layout-space uses x/y on the ground plane from a site's
// front-left corner. Three.js world-space uses x/z centered on the site and y
// as elevation. Keeping this conversion in one module prevents camera/rendering
// work from silently changing rental dimensions or placement.

export const WORLD_UNITS = 'ft';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeSite(site) {
  return {
    widthFt: Math.max(0.01, finite(site?.widthFt, 1)),
    lengthFt: Math.max(0.01, finite(site?.lengthFt, 1)),
  };
}

export function normalizeWorldPoint(point) {
  return {
    x: finite(point?.x),
    y: finite(point?.y),
    z: finite(point?.z),
  };
}

export function layoutPointToWorld(point, site) {
  const s = normalizeSite(site);
  return {
    x: finite(point?.x) - s.widthFt / 2,
    y: finite(point?.heightFt ?? point?.elevationFt ?? point?.worldY),
    z: finite(point?.y) - s.lengthFt / 2,
  };
}

export function worldPointToLayout(point, site) {
  const s = normalizeSite(site);
  const p = normalizeWorldPoint(point);
  return {
    x: p.x + s.widthFt / 2,
    y: p.z + s.lengthFt / 2,
    heightFt: p.y,
  };
}

export function objectCenterLayout(object) {
  return {
    x: finite(object?.x) + Math.max(0, finite(object?.widthFt)) / 2,
    y: finite(object?.y) + Math.max(0, finite(object?.depthFt ?? object?.lengthFt)) / 2,
    heightFt: finite(object?.heightFt) / 2,
  };
}

export function objectCenterWorld(object, site) {
  return layoutPointToWorld(objectCenterLayout(object), site);
}

export function rotateGroundPoint(point, angleDeg, origin = { x: 0, y: 0 }) {
  const a = finite(angleDeg) * Math.PI / 180;
  const c = Math.cos(a), s = Math.sin(a);
  const dx = finite(point?.x) - finite(origin?.x);
  const dy = finite(point?.y) - finite(origin?.y);
  return {
    x: finite(origin?.x) + dx * c - dy * s,
    y: finite(origin?.y) + dx * s + dy * c,
  };
}

// New equipment/accessory/inflatable saves retain model dimensions separately
// from their oriented layout box. Older accessories and inflatables stored a box swapped at each 90°
// turn. Recover that local size without changing unflagged legacy object kinds.
// Resolve this before overriding rotation with an independent photo placement.
export function objectLocalDimensions(object) {
  const width = Math.max(0.01, finite(object?.widthFt));
  const depth = Math.max(0.01, finite(object?.depthFt ?? object?.lengthFt));
  const oriented = object?.footprintOriented === true || ['accessory','inflatable'].includes(object?.kind);
  const quarterTurn = Math.abs(Math.abs(finite(object?.rotationDeg) % 180) - 90) < 1e-7;
  return {
    widthFt: finite(object?.modelWidthFt) > 0 ? Number(object.modelWidthFt) : oriented && quarterTurn ? depth : width,
    depthFt: finite(object?.modelDepthFt) > 0 ? Number(object.modelDepthFt) : oriented && quarterTurn ? width : depth,
  };
}

export function objectGroundFootprint(object, clearanceFt = 0) {
  const local = objectLocalDimensions(object);
  const width = local.widthFt + Math.max(0, finite(clearanceFt)) * 2;
  const depth = local.depthFt + Math.max(0, finite(clearanceFt)) * 2;
  const center = objectCenterLayout(object);
  const halfW = width / 2, halfD = depth / 2;
  const corners = [
    { x: center.x - halfW, y: center.y - halfD },
    { x: center.x + halfW, y: center.y - halfD },
    { x: center.x + halfW, y: center.y + halfD },
    { x: center.x - halfW, y: center.y + halfD },
  ];
  const rotation = finite(object?.rotationDeg);
  return rotation ? corners.map(p => rotateGroundPoint(p, rotation, center)) : corners;
}

export function groundPolygonToWorld(points, site, heightFt = 0) {
  return (points || []).map(point => layoutPointToWorld({
    x: point.x,
    y: point.y,
    heightFt,
  }, site));
}

export function worldDistance(a, b) {
  const p = normalizeWorldPoint(a), q = normalizeWorldPoint(b);
  return Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
}

export function groundDistance(a, b) {
  return Math.hypot(finite(b?.x) - finite(a?.x), finite(b?.y) - finite(a?.y));
}
