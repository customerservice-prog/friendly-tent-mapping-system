// Friendly Party Rental — Shared 2D geometry helpers for the layout planner
// Simple axis-aligned rectangle math. Rotation is not yet supported —
// this is a foundation layer for the collision system.

export function rectFromObject(obj) {
  const w = obj.widthFt || obj.footprintFt || 0;
  const d = obj.depthFt || obj.footprintFt || 0;
  return { x: obj.x || 0, y: obj.y || 0, width: w, depth: d };
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.depth && a.y + a.depth > b.y;
}

export function rectContains(outer, inner) {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.depth <= outer.y + outer.depth;
}

export function expandRect(rect, margin) {
  return { x: rect.x - margin, y: rect.y - margin, width: rect.width + margin * 2, depth: rect.depth + margin * 2 };
}

export function distance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

export function circleIntersectsRect(circle, rect) {
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.depth));
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return (dx * dx + dy * dy) <= circle.radius * circle.radius;
}

export function rectCenter(rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.depth / 2 };
}
