// Friendly Party Rental — Collision & conflict detection for the layout planner
// Produces typed, severity-ranked conflicts rather than a single boolean.
// Center pole overlaps are treated as hard errors; other spacing issues
// are warnings or informational notes for staff/customer review.

import { rectFromObject, rectsOverlap, rectContains, expandRect, circleIntersectsRect } from './geometry.js';

export const CONFLICT_TYPES = {
  HARD_CONFLICT: 'hardConflict',
  OBJECT_OVERLAP: 'objectOverlap',
  CHAIR_CLEARANCE: 'chairClearance',
  AISLE_CONFLICT: 'aisleConflict',
  TENT_EDGE_CONFLICT: 'tentEdgeConflict',
  DANCE_FLOOR_CONFLICT: 'danceFloorConflict',
  SERVICE_CONFLICT: 'serviceConflict',
};

export const SEVERITY = { ERROR: 'error', WARNING: 'warning', INFO: 'info' };

const POLE_RADIUS_FT = 0.75;
const CHAIR_CLEARANCE_FT = 1.0;

function conflict(type, severity, objectIds, message) {
  return { type: type, severity: severity, objectIds: objectIds, message: message };
}

export function checkCenterPoleConflicts(objects, tent) {
  const results = [];
  const poles = (tent && tent.centerPoles) || [];
  objects.forEach(function (obj) {
    const rect = rectFromObject(obj);
    poles.forEach(function (pole) {
      const circle = { x: pole.x, y: pole.y, radius: POLE_RADIUS_FT };
      if (circleIntersectsRect(circle, rect)) {
        results.push(conflict(CONFLICT_TYPES.HARD_CONFLICT, SEVERITY.ERROR, [obj.id], 'This item overlaps a tent center pole. Move it to clear the pole line.'));
      }
    });
  });
  return results;
}

export function checkObjectOverlaps(objects) {
  const results = [];
  for (let i = 0; i < objects.length; i++) {
    for (let j = i + 1; j < objects.length; j++) {
      const a = rectFromObject(objects[i]);
      const b = rectFromObject(objects[j]);
      if (rectsOverlap(a, b)) {
        results.push(conflict(CONFLICT_TYPES.OBJECT_OVERLAP, SEVERITY.WARNING, [objects[i].id, objects[j].id], 'These two items overlap and need to be spaced apart.'));
      }
    }
  }
  return results;
}

export function checkChairClearance(objects) {
  const results = [];
  const chairGroups = objects.filter(function (o) { return o.kind === 'tableGroup'; });
  for (let i = 0; i < chairGroups.length; i++) {
    for (let j = i + 1; j < chairGroups.length; j++) {
      const a = expandRect(rectFromObject(chairGroups[i]), CHAIR_CLEARANCE_FT);
      const b = rectFromObject(chairGroups[j]);
      if (rectsOverlap(a, b)) {
        results.push(conflict(CONFLICT_TYPES.CHAIR_CLEARANCE, SEVERITY.WARNING, [chairGroups[i].id, chairGroups[j].id], 'Chairs at these tables are seated back-to-back with little walking room. Consider adding spacing.'));
      }
    }
  }
  return results;
}

export function checkTentEdgeConflicts(objects, tent) {
  const results = [];
  if (!tent) return results;
  const tentRect = { x: 0, y: 0, width: tent.widthFt, depth: tent.lengthFt };
  objects.forEach(function (obj) {
    const rect = rectFromObject(obj);
    if (!rectContains(tentRect, rect)) {
      results.push(conflict(CONFLICT_TYPES.TENT_EDGE_CONFLICT, SEVERITY.ERROR, [obj.id], 'This item extends beyond the tent boundary.'));
    }
  });
  return results;
}

export function checkAisleConflicts(objects, aisles) {
  const results = [];
  (aisles || []).forEach(function (aisle) {
    objects.forEach(function (obj) {
      const rect = rectFromObject(obj);
      if (rectsOverlap(rect, aisle)) {
        results.push(conflict(CONFLICT_TYPES.AISLE_CONFLICT, SEVERITY.WARNING, [obj.id], 'This item intrudes into a reserved aisle or walkway.'));
      }
    });
  });
  return results;
}

export function checkDanceFloorConflicts(objects, danceFloorZone) {
  const results = [];
  if (!danceFloorZone) return results;
  objects.forEach(function (obj) {
    if (obj.id === danceFloorZone.id) return;
    const rect = rectFromObject(obj);
    if (rectsOverlap(rect, danceFloorZone)) {
      results.push(conflict(CONFLICT_TYPES.DANCE_FLOOR_CONFLICT, SEVERITY.WARNING, [obj.id], 'This item overlaps the dance floor area.'));
    }
  });
  return results;
}

export function checkServiceConflicts(objects, guestCount) {
  const results = [];
  const buffet = objects.find(function (o) { return o.kind === 'buffet'; });
  if (buffet) {
    const rect = rectFromObject(buffet);
    const area = rect.width * rect.depth;
    const recommendedArea = Math.ceil((guestCount || 1) / 50) * 60;
    if (area < recommendedArea) {
      results.push(conflict(CONFLICT_TYPES.SERVICE_CONFLICT, SEVERITY.INFO, [buffet.id], 'The buffet area may be tight for this guest count. ' + ((window.ACTIVE_TENANT && window.ACTIVE_TENANT.name) || 'Friendly Party Rental') + ' can help plan additional service space.'));
    }
  }
  return results;
}

export function runAllChecks(layoutState, tent, guestCount) {
  const objects = layoutState.objects || [];
  const aisles = layoutState.aisles || [];
  const danceFloorZone = objects.find(function (o) { return o.kind === 'danceFloor'; });
  let all = [];
  all = all.concat(checkCenterPoleConflicts(objects, tent));
  all = all.concat(checkTentEdgeConflicts(objects, tent));
  all = all.concat(checkObjectOverlaps(objects));
  all = all.concat(checkChairClearance(objects));
  all = all.concat(checkAisleConflicts(objects, aisles));
  all = all.concat(checkDanceFloorConflicts(objects, danceFloorZone));
  all = all.concat(checkServiceConflicts(objects, guestCount));
  return all;
}
