// RentSketch shared structural helpers for visually accurate rental tents.
// These values drive the planning renderer only; field installation must follow
// the manufacturer's engineering/manual and site conditions.

export const HARD_SURFACES = ['concrete', 'asphalt', 'deck'];

// Pole-tent crowns follow the actual sectional bay rhythm rather than scaling a
// generic canopy. 20/30-ft Friendly pole tents use ~20-ft longitudinal bays;
// 40-ft-wide tents use crowns 20 ft in from each end and every 20 ft between.
export function computeCenterPoles(type, widthFt, lengthFt) {
  if (type !== 'pole') return [];
  const poles = [];
  if (widthFt >= 40 && lengthFt >= 40) {
    for (let y = 20; y <= lengthFt - 20 + 0.01; y += 20) poles.push({ x: widthFt / 2, y });
    return poles.length ? poles : [{ x: widthFt / 2, y: lengthFt / 2 }];
  }
  const count = Math.max(1, Math.round(lengthFt / 20));
  const bay = lengthFt / count;
  for (let i = 0; i < count; i++) poles.push({ x: widthFt / 2, y: bay * (i + 0.5) });
  return poles;
}

// Side-pole / frame-leg stations. Corners are included once and intermediate
// stations follow a 10-ft rental-tent rhythm so the rendered perimeter matches
// the physical tent instead of inventing evenly scaled supports.
export function computePerimeterStations(widthFt, lengthFt, spacingFt = 10) {
  const out = [], seen = new Set();
  const add = (x, y) => { const k = `${x.toFixed(3)}:${y.toFixed(3)}`; if (!seen.has(k)) { seen.add(k); out.push({ x, y }); } };
  for (let x = 0; x <= widthFt + 0.01; x += spacingFt) { add(Math.min(x, widthFt), 0); add(Math.min(x, widthFt), lengthFt); }
  for (let y = 0; y <= lengthFt + 0.01; y += spacingFt) { add(0, Math.min(y, lengthFt)); add(widthFt, Math.min(y, lengthFt)); }
  return out;
}

// Renderer dimensions in feet. Keeping these centralized lets every tenant
// override a model later without rewriting the 3D engine.
export function structuralProfile(type, widthFt, lengthFt) {
  const pole = type === 'pole';
  const eaveHeightFt = 7;
  const peakRiseFt = pole ? (widthFt <= 20 ? 7.5 : widthFt < 30 ? 8.5 : 10.5) : Math.max(4, widthFt * 0.24);
  return {
    eaveHeightFt,
    peakHeightFt: eaveHeightFt + peakRiseFt,
    perimeterSpacingFt: 10,
    sidePoleDiameterFt: pole ? 0.12 : 0.10,
    centerPoleDiameterFt: pole ? 0.16 : 0,
    valanceDropFt: 0.55,
    roofSeamSpacingFt: 10,
    stakeClearanceFt: pole ? 5 : 2,
    hasCenterPoles: pole,
    frameRafters: !pole,
    widthFt,
    lengthFt,
  };
}

export function installationClearanceFt(type) {
  return type === 'pole' ? 5 : 2;
}

export function resolveAnchoringMethod(tentType, surfaceType) {
  if (!surfaceType || surfaceType === 'notSure') return null;
  return HARD_SURFACES.indexOf(surfaceType) !== -1 ? 'ballast' : 'stake';
}
