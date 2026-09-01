// Friendly Party Rental — Multi-factor tent recommendation engine
// Takes real event intake answers and suggests RECOMMENDED / TIGHTER / MORE SPACIOUS tents.
// This produces planning guidance only — Friendly Party Rental staff confirm final installation.

import { TENTS } from '../data/tents.js';
import { DANCE_FLOOR_SIZES } from '../data/danceFloor.js';

const SEATING_STYLES = { DINING: 'dining', CEREMONY: 'ceremony', COCKTAIL: 'cocktail', MIXED: 'mixed', NOT_SURE: 'notSure' };

const SQFT_PER_GUEST_BY_KEY = { diningRounds: 12, ceremonyRows: 8, cocktail: 6, diningWithDance: 15 };
function capacityKeyForStyle(seatingStyle) {
  if (seatingStyle === SEATING_STYLES.CEREMONY) return 'ceremonyRows';
  if (seatingStyle === SEATING_STYLES.COCKTAIL) return 'cocktail';
  return 'diningRounds';
}

function danceFloorSqft(danceFloorSizeId, customFt) {
  if (danceFloorSizeId === 'custom' && customFt) return customFt * customFt;
  const preset = DANCE_FLOOR_SIZES.find(function (d) { return d.id === danceFloorSizeId; });
  if (preset) return preset.ft * preset.ft;
  return 18 * 18;
}

function featureAreaSqft(features, guestCount, danceFloorSizeId, customDanceFt) {
  features = features || [];
  let sqft = 0;
  if (features.indexOf('danceFloor') !== -1) sqft += danceFloorSqft(danceFloorSizeId, customDanceFt);
  if (features.indexOf('dj') !== -1) sqft += 100;
  if (features.indexOf('band') !== -1) sqft += 200;
  if (features.indexOf('buffet') !== -1) sqft += Math.ceil(guestCount / 50) * 60;
  if (features.indexOf('bar') !== -1) sqft += 80;
  if (features.indexOf('stage') !== -1) sqft += 150;
  if (features.indexOf('lounge') !== -1) sqft += 150;
  if (features.indexOf('cakeTable') !== -1) sqft += 30;
  if (features.indexOf('giftTable') !== -1) sqft += 30;
  if (features.indexOf('photoBooth') !== -1) sqft += 60;
  if (features.indexOf('catering') !== -1) sqft += 100;
  if (features.indexOf('cocktailTables') !== -1) sqft += 60;
  return sqft;
}

function surfaceWarning(tent, surfaceType) {
  const hardSurfaces = ['asphalt', 'concrete', 'deck', 'indoor'];
  if (tent.type === 'pole' && hardSurfaces.indexOf(surfaceType) !== -1) {
    return { level: 'warning', message: 'This tent type typically requires staking. On this surface, ballast or a frame tent may be required — Friendly Party Rental will verify final installation requirements.' };
  }
  if (surfaceType === 'notSure' || !surfaceType) {
    return { level: 'info', message: 'Installation method will be confirmed by Friendly Party Rental based on your exact surface.' };
  }
  return { level: 'info', message: tent.surfaceNotes };
}

export function recommendTents(input) {
  const guestCount = Math.max(1, Number(input.guestCount) || 1);
  const seatingStyle = input.seatingStyle || SEATING_STYLES.NOT_SURE;
  const features = input.features || [];
  const surfaceType = input.surfaceType || 'notSure';
  const capacityKey = capacityKeyForStyle(seatingStyle);
  const sqftPerGuest = SQFT_PER_GUEST_BY_KEY[capacityKey];
  const extraSqft = featureAreaSqft(features, guestCount, input.danceFloorSizeId, input.customDanceFloorFt);
  const extraGuestUnits = Math.ceil(extraSqft / sqftPerGuest);
  const requiredUnits = guestCount + extraGuestUnits;
  const eligible = TENTS.filter(function (t) { return t.active; }).slice().sort(function (a, b) { return a.capacity[capacityKey] - b.capacity[capacityKey]; });

  // Area-per-guest math alone can under-estimate space needs for narrow tents:
  // a 20ft-wide tent can only ever fit ONE column of round dining tables no
  // matter how long it is, so it can silently run out of room and force
  // tables to overlap or spill past the tent edge. Cross-check the tent's
  // real grid capacity (matching the designer's actual table placement
  // logic) before recommending a dining-table tent, so 'Use This Layout'
  // never starts a customer off with an overlapping/out-of-bounds layout.
  const ROUND_TABLE_SEATS = 8;
  const ROUND_TABLE_CELL_FT = 8.5; // 5ft round table + safe chair clearance
  const GRID_MARGIN_FT = 4; // matches the designer's real placement margin
  function diningRoundsGridCapacity(tent) {
    const cols = Math.max(1, Math.floor((tent.widthFt - GRID_MARGIN_FT) / ROUND_TABLE_CELL_FT));
    const rows = Math.max(1, Math.floor((tent.lengthFt - GRID_MARGIN_FT) / ROUND_TABLE_CELL_FT));
    return cols * rows * ROUND_TABLE_SEATS;
  }
  const roundTableSeatsNeeded = Math.ceil(guestCount / ROUND_TABLE_SEATS) * ROUND_TABLE_SEATS;

  let recommendedIndex = -1;
  for (let i = 0; i < eligible.length; i++) {
    const areaFits = eligible[i].capacity[capacityKey] >= requiredUnits;
    const gridFits = capacityKey !== 'diningRounds' || diningRoundsGridCapacity(eligible[i]) >= roundTableSeatsNeeded;
    if (areaFits && gridFits) { recommendedIndex = i; break; }
  }
  const result = { requiredUnits: requiredUnits, capacityKey: capacityKey, guestCount: guestCount, extraGuestUnits: extraGuestUnits, recommended: null, tighter: null, moreSpacious: null, warnings: [] };
  if (recommendedIndex === -1) {
    const largest = eligible[eligible.length - 1];
    result.warnings.push({ level: 'error', message: 'No single tent in current inventory comfortably fits this event. Friendly Party Rental staff will help plan a multi-tent or custom layout.' });
    if (largest) result.moreSpacious = { tent: largest, note: surfaceWarning(largest, surfaceType) };
    return result;
  }

const recommendedTent = eligible[recommendedIndex];
  result.recommended = { tent: recommendedTent, note: surfaceWarning(recommendedTent, surfaceType) };
  if (recommendedIndex > 0) {
    const smaller = eligible[recommendedIndex - 1];
    if (smaller.capacity[capacityKey] >= guestCount * 0.9) {
      result.tighter = { tent: smaller, note: surfaceWarning(smaller, surfaceType), caution: 'May fit with reduced comfort and fewer feature areas than requested.' };
    }
  }
  if (recommendedIndex < eligible.length - 1) {
    const bigger = eligible[recommendedIndex + 1];
    result.moreSpacious = { tent: bigger, note: surfaceWarning(bigger, surfaceType), benefit: 'More comfortable circulation and room to grow the layout.' };
  }
  return result;
}

export const SEATING_STYLE_OPTIONS = SEATING_STYLES;
