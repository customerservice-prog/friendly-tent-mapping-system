// RentSketch shared structural helpers for visually accurate rental tents.
// Planning/visualization data only. Field installation follows manufacturer engineering.

export const HARD_SURFACES = ['concrete', 'asphalt', 'deck'];

// Friendly pole-tent crown locations are explicit where inventory is known.
// Coordinates are measured from the upper-left footprint corner in feet.
// This avoids the old generic length/20 formula creating incorrect peaks.
const FRIENDLY_POLE_CROWNS = {
  '20x20': [{x:10,y:10}],
  '20x30': [{x:10,y:15}],
  '20x40': [{x:10,y:10},{x:10,y:30}],
  '30x30': [{x:15,y:15}],
  '30x45': [{x:15,y:11.25},{x:15,y:33.75}],
  '30x60': [{x:15,y:10},{x:15,y:30},{x:15,y:50}],
  '40x40': [{x:20,y:20}],
  '40x60': [{x:20,y:10},{x:20,y:30},{x:20,y:50}],
  '40x80': [{x:20,y:10},{x:20,y:30},{x:20,y:50},{x:20,y:70}],
  '40x100': [{x:20,y:10},{x:20,y:30},{x:20,y:50},{x:20,y:70},{x:20,y:90}],
};

export function computeCenterPoles(type, widthFt, lengthFt) {
  if (type !== 'pole') return [];
  const key = `${Number(widthFt)}x${Number(lengthFt)}`;
  if (FRIENDLY_POLE_CROWNS[key]) return FRIENDLY_POLE_CROWNS[key].map(p => ({...p}));
  // Safe visual fallback for tenant sizes that do not yet have an explicit model.
  const x = widthFt / 2;
  if (lengthFt <= 30) return [{x,y:lengthFt/2}];
  const count = Math.max(1, Math.ceil(lengthFt / 20));
  const bay = lengthFt / count;
  return Array.from({length:count},(_,i)=>({x,y:bay*(i+.5)}));
}

export function computePerimeterStations(widthFt, lengthFt, spacingFt = 10) {
  const out = [], seen = new Set();
  const add = (x, y) => { const k = `${x.toFixed(3)}:${y.toFixed(3)}`; if (!seen.has(k)) { seen.add(k); out.push({ x, y }); } };
  for (let x = 0; x <= widthFt + 0.01; x += spacingFt) { add(Math.min(x, widthFt), 0); add(Math.min(x, widthFt), lengthFt); }
  for (let y = 0; y <= lengthFt + 0.01; y += spacingFt) { add(0, Math.min(y, lengthFt)); add(widthFt, Math.min(y, lengthFt)); }
  return out;
}

// Sidewall segments are independently addressable so a customer can close only
// the sides they need. 10-ft segments map naturally to Friendly perimeter bays.
export function computeSidewallSegments(widthFt, lengthFt, segmentFt = 10) {
  const out=[];
  const side=(name,len)=>{ for(let start=0;start<len-.01;start+=segmentFt) out.push({id:`${name}-${start}`,side:name,startFt:start,lengthFt:Math.min(segmentFt,len-start),enabled:false}); };
  side('front',widthFt); side('right',lengthFt); side('back',widthFt); side('left',lengthFt);
  return out;
}

// Perimeter lighting hugs the eave. Bistro lighting intentionally crosses the
// interior and adds more parallel strands as tents get larger.
export function computeLightingLayout(widthFt, lengthFt) {
  const perimeter = [
    {from:{x:0,y:0},to:{x:widthFt,y:0}},
    {from:{x:widthFt,y:0},to:{x:widthFt,y:lengthFt}},
    {from:{x:widthFt,y:lengthFt},to:{x:0,y:lengthFt}},
    {from:{x:0,y:lengthFt},to:{x:0,y:0}},
  ];
  // Runs span the width; longitudinal spacing keeps large tents visually full.
  const desiredSpacing = widthFt >= 40 ? 10 : 12;
  const runCount = Math.max(2, Math.ceil(lengthFt / desiredSpacing));
  const bistro=[];
  for(let i=0;i<runCount;i++){
    const y=lengthFt*(i+.5)/runCount;
    bistro.push({from:{x:0,y},to:{x:widthFt,y}});
  }
  return {perimeter,bistro};
}

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
    sidewallSegments: computeSidewallSegments(widthFt,lengthFt),
    lighting: computeLightingLayout(widthFt,lengthFt),
    widthFt,
    lengthFt,
  };
}

export function installationClearanceFt(type) { return type === 'pole' ? 5 : 2; }
export function resolveAnchoringMethod(tentType, surfaceType) {
  if (!surfaceType || surfaceType === 'notSure') return null;
  if(tentType==='pole' && HARD_SURFACES.includes(surfaceType))return null;
  return HARD_SURFACES.indexOf(surfaceType) !== -1 ? 'ballast' : 'stake';
}
