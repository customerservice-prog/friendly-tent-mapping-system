// RentSketch shared 2D geometry helpers.
// Objects are represented by an axis-aligned bounding box for collision and
// containment. For rotated rectangles the AABB is calculated from the actual
// footprint so 90-degree tables/floors no longer collide using stale dimensions.

function number(v, fallback) { v = Number(v); return Number.isFinite(v) ? v : fallback; }

export function rectFromObject(obj) {
  const w = number(obj.widthFt, number(obj.footprintFt, 0));
  const d = number(obj.depthFt, number(obj.lengthFt, number(obj.footprintFt, 0)));
  if(obj.footprintOriented===true||['accessory','inflatable'].includes(obj.kind))return {x:number(obj.x,0),y:number(obj.y,0),width:w,depth:d};
  const angle = number(obj.rotationDeg, number(obj.rotation, 0)) * Math.PI / 180;
  const c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
  const width = w * c + d * s;
  const depth = w * s + d * c;
  // Scene objects historically store x/y as the top-left corner. Preserve that
  // contract while expanding around the original footprint centre.
  const cx = number(obj.x, 0) + w / 2;
  const cy = number(obj.y, 0) + d / 2;
  return { x: cx - width / 2, y: cy - depth / 2, width, depth };
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
