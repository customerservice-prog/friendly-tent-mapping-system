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
// Protected breathing room kept around the dance floor's outer edge so no
// other furniture is allowed to sit directly against it. This is what makes
// the dance floor behave like one first-class event zone instead of a loose
// pile of tiles other objects can crowd right up to.
const DANCE_FLOOR_CLEARANCE_FT = 2.0;

function conflict(type, severity, objectIds, message) {
  return { type: type, severity: severity, objectIds: objectIds, message: message };
}

// The dance floor is stored internally as many small 3x3 tiles (see
// js/data/danceFloor.js), but for every layout/collision decision it must be
// treated as ONE logical rectangular zone -- never as unrelated individual
// tiles that other furniture can slip between or overlap. This merges every
// object of kind 'danceFloor' into a single bounding rectangle plus the list
// of tile ids it represents.
export function mergeDanceFloorZone(objects) {
  var tiles = (objects || []).filter(function (o) { return o.kind === 'danceFloor'; });
  if (!tiles.length) return null;
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  tiles.forEach(function (t) {
    var r = rectFromObject(t);
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.depth);
  });
  return {
    id: 'danceFloorZone',
    kind: 'danceFloor',
    x: minX,
    y: minY,
    width: maxX - minX,
    depth: maxY - minY,
    memberIds: tiles.map(function (t) { return t.id; }),
  };
}

export function checkCenterPoleConflicts(objects, tent) {
  var results = [];
  var poles = (tent && tent.centerPoles) || [];
  objects.forEach(function (obj) {
    var rect = rectFromObject(obj);
    poles.forEach(function (pole) {
      var circle = { x: pole.x, y: pole.y, radius: POLE_RADIUS_FT };
      if (circleIntersectsRect(circle, rect)) {
        results.push(conflict(CONFLICT_TYPES.HARD_CONFLICT, SEVERITY.ERROR, [obj.id], 'This item overlaps a tent center pole. Move it to clear the pole line.'));
      }
    });
  });
  return results;
}

// Generic pairwise overlap check for everything except the dance floor.
// Dance-floor-vs-other-object overlap is handled exclusively by
// checkDanceFloorConflicts against the merged zone rectangle below, and
// individual dance tiles never conflict with each other -- they are one
// object, not many.
export function checkObjectOverlaps(objects) {
  var results = [];
  var candidates = objects.filter(function (o) { return o.kind !== 'danceFloor'; });
  for (var i = 0; i < candidates.length; i++) {
    for (var j = i + 1; j < candidates.length; j++) {
      var a = rectFromObject(candidates[i]);
      var b = rectFromObject(candidates[j]);
      if (rectsOverlap(a, b)) {
        results.push(conflict(CONFLICT_TYPES.OBJECT_OVERLAP, SEVERITY.WARNING, [candidates[i].id, candidates[j].id], 'These two items overlap and need to be spaced apart.'));
      }
    }
  }
  return results;
}

export function checkChairClearance(objects) {
  var results = [];
  var chairGroups = objects.filter(function (o) { return o.kind === 'tableGroup'; });
  for (var i = 0; i < chairGroups.length; i++) {
    for (var j = i + 1; j < chairGroups.length; j++) {
      var a = expandRect(rectFromObject(chairGroups[i]), CHAIR_CLEARANCE_FT);
      var b = rectFromObject(chairGroups[j]);
      if (rectsOverlap(a, b)) {
        results.push(conflict(CONFLICT_TYPES.CHAIR_CLEARANCE, SEVERITY.WARNING, [chairGroups[i].id, chairGroups[j].id], 'Chairs at these tables are seated back-to-back with little walking room. Consider adding spacing.'));
      }
    }
  }
  return results;
}

export function checkTentEdgeConflicts(objects, tent) {
  var results = [];
  if (!tent) return results;
  var tentRect = { x: 0, y: 0, width: tent.widthFt, depth: tent.lengthFt };
  objects.forEach(function (obj) {
    var rect = rectFromObject(obj);
    if (!rectContains(tentRect, rect)) {
      results.push(conflict(CONFLICT_TYPES.TENT_EDGE_CONFLICT, SEVERITY.ERROR, [obj.id], 'This item extends beyond the tent boundary.'));
    }
  });
  return results;
}

export function checkAisleConflicts(objects, aisles) {
  var results = [];
  (aisles || []).forEach(function (aisle) {
    objects.forEach(function (obj) {
      var rect = rectFromObject(obj);
      if (rectsOverlap(rect, aisle)) {
        results.push(conflict(CONFLICT_TYPES.AISLE_CONFLICT, SEVERITY.WARNING, [obj.id], 'This item intrudes into a reserved aisle or walkway.'));
      }
    });
  });
  return results;
}

// Checks every non-dance-floor object against the single merged dance floor
// zone (expanded by a protected clearance) rather than against one arbitrary
// tile. This is what lets the dance floor act as a first-class zone: nothing
// -- not even a chair's edge -- should sit inside its protected perimeter.
export function checkDanceFloorConflicts(objects, danceFloorZone) {
  var results = [];
  if (!danceFloorZone) return results;
  var protectedZone = expandRect(rectFromObject(danceFloorZone), DANCE_FLOOR_CLEARANCE_FT);
  var memberIds = danceFloorZone.memberIds || [];
  objects.forEach(function (obj) {
    if (memberIds.indexOf(obj.id) !== -1) return;
    var rect = rectFromObject(obj);
    if (rectsOverlap(rect, protectedZone)) {
      results.push(conflict(CONFLICT_TYPES.DANCE_FLOOR_CONFLICT, SEVERITY.WARNING, [obj.id], 'This item is too close to the dance floor. Leave clear space around it for guests to move.'));
    }
  });
  return results;
}

export function checkServiceConflicts(objects, guestCount) {
  var results = [];
  var buffet = objects.find(function (o) { return o.kind === 'buffet'; });
  if (buffet) {
    var rect = rectFromObject(buffet);
    var area = rect.width * rect.depth;
    var recommendedArea = Math.ceil((guestCount || 1) / 50) * 60;
    if (area < recommendedArea) {
      results.push(conflict(CONFLICT_TYPES.SERVICE_CONFLICT, SEVERITY.INFO, [buffet.id], 'The buffet area may be tight for this guest count. ' + ((window.ACTIVE_TENANT && window.ACTIVE_TENANT.name) || 'Friendly Party Rental') + ' can help plan additional service space.'));
    }
  }
  return results;
}

export function runAllChecks(layoutState, tent, guestCount) {
  var objects = layoutState.objects || [];
  var aisles = layoutState.aisles || [];
  var danceFloorZone = mergeDanceFloorZone(objects);
  var all = [];
  all = all.concat(checkCenterPoleConflicts(objects, tent));
  all = all.concat(checkTentEdgeConflicts(objects, tent));
  all = all.concat(checkObjectOverlaps(objects));
  all = all.concat(checkChairClearance(objects));
  all = all.concat(checkAisleConflicts(objects, aisles));
  all = all.concat(checkDanceFloorConflicts(objects, danceFloorZone));
  all = all.concat(checkServiceConflicts(objects, guestCount));
  return all;
}
