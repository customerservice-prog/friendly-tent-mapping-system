// RentSketch measurement helpers.
// No renderer dependency: these functions work in Photo View, 2D Plan, 3D,
// printable layouts, and future reconstructed property meshes.

import { groundDistance, worldDistance } from './world-space.js';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function imageDistance(a, b) {
  return Math.hypot(finite(b?.x) - finite(a?.x), finite(b?.y) - finite(a?.y));
}

export function calibrateScaleFromReference(pixelA, pixelB, knownFeet) {
  const pixels = imageDistance(pixelA, pixelB);
  const feet = finite(knownFeet);
  if (!(pixels > 0) || !(feet > 0)) {
    return {
      valid: false,
      pixels,
      knownFeet: feet,
      pixelsPerFoot: null,
      feetPerPixel: null,
    };
  }
  return {
    valid: true,
    pixels,
    knownFeet: feet,
    pixelsPerFoot: pixels / feet,
    feetPerPixel: feet / pixels,
  };
}

export function calibrateScaleFromWorldReference(pixelA, pixelB, worldA, worldB) {
  return calibrateScaleFromReference(pixelA, pixelB, worldDistance(worldA, worldB));
}

export function pixelsToFeet(pixels, calibration) {
  if (!calibration?.valid || !(calibration.feetPerPixel > 0)) return null;
  return finite(pixels) * calibration.feetPerPixel;
}

export function feetToPixels(feet, calibration) {
  if (!calibration?.valid || !(calibration.pixelsPerFoot > 0)) return null;
  return finite(feet) * calibration.pixelsPerFoot;
}

export function measureImagePoints(pixelA, pixelB, calibration) {
  const pixels = imageDistance(pixelA, pixelB);
  const feet = pixelsToFeet(pixels, calibration);
  return { pixels, feet, formatted: feet == null ? null : formatFeetInches(feet) };
}

export function measureGroundPoints(a, b) {
  const feet = groundDistance(a, b);
  return { feet, formatted: formatFeetInches(feet) };
}

export function measureWorldPoints(a, b) {
  const feet = worldDistance(a, b);
  return { feet, formatted: formatFeetInches(feet) };
}

export function formatFeetInches(feet, nearestInch = 1) {
  let value = Math.max(0, finite(feet));
  const step = Math.max(1, Math.round(finite(nearestInch, 1)));
  let totalInches = Math.round((value * 12) / step) * step;
  let wholeFeet = Math.floor(totalInches / 12);
  let inches = totalInches - wholeFeet * 12;
  if (inches >= 12) {
    wholeFeet += Math.floor(inches / 12);
    inches %= 12;
  }
  return wholeFeet + ' ft' + (inches ? ' ' + inches + ' in' : '');
}

export function buildMeasurement({
  id,
  label,
  pointA,
  pointB,
  mode = 'ground',
  calibration = null,
} = {}) {
  let result;
  if (mode === 'image') result = measureImagePoints(pointA, pointB, calibration);
  else if (mode === 'world') result = measureWorldPoints(pointA, pointB);
  else result = measureGroundPoints(pointA, pointB);
  return {
    id: id || 'measurement-' + Date.now().toString(36),
    label: label || 'Measurement',
    mode,
    pointA: pointA ? { ...pointA } : null,
    pointB: pointB ? { ...pointB } : null,
    feet: result.feet ?? null,
    formatted: result.formatted ?? null,
  };
}
