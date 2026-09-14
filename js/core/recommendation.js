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
    return { level: 'warning', message: 'This tent type typically requires staking. On this surface, ballast or a frame tent may be required — ' + ((typeof window !== 'undefined' && window.ACTIVE_TENANT && window.ACTIVE_TENANT.name) || 'Friendly Party Rental') + ' will verify final installation requirements.' };
  }
  if (surfaceType === 'notSure' || !surfaceType) {
    return { level: 'info', message: 'Installation method will be confirmed by ' + ((typeof window !== 'undefined' && window.ACTIVE_TENANT && window.ACTIVE_TENANT.name) || 'Friendly Party Rental') + ' based on your exact surface.' };
  }
  return { level: 'info', message: tent.surfaceNotes };
}

function eligibleTentsForActiveTenant() {
  var tenant = (typeof window !== 'undefined') ? window.ACTIVE_TENANT : null;
  var isRealTenant = tenant && tenant.slug && tenant.slug !== 'friendly' && tenant.slug !== 'generic';
  if (isRealTenant && Array.isArray(tenant.tents)) {
    // Tenant-exclusive catalog: recommend from what THIS tenant actually
    // sells (already resolved against the master visual library by
    // designer/index.html), not from RentSketch's generic 16-tent demo
    // catalog, which could recommend a tent ID this tenant does not sell.
    return tenant.tents.map(function (t) {
      var dining = (t.maxGuests && t.maxGuests.dining) || 0;
      var cocktail = (t.maxGuests && t.maxGuests.cocktail) || dining;
      return Object.assign({}, t, {
        active: true,
        capacity: t.capacity || { diningRounds: dining, ceremonyRows: dining, cocktail: cocktail },
        surfaceNotes: t.surfaceNotes || ('Installation surface requirements will be confirmed by ' + (tenant.name || 'your rental company') + '.'),
      });
    });
  }
  return TENTS.filter(function (t) { return t.active; });
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
  const eligible = eligibleTentsForActiveTenant().slice().sort(function (a, b) { return a.capacity[capacityKey] - b.capacity[capacityKey]; });

  // Area-per-guest math alone can under-estimate space needs for narrow tents:
  // a 20ft-wide tent can only ever fit ONE column of round dining tables no
  // matter how long it is, so it can silently run out of room and force
  // tables to overlap or spill past the tent edge. Cross-check the tent's
  // real grid capacity (matching the designer's actual table placement
  // logic) before recommending a dining-table tent, so 'Use This Layout'
  // never starts a customer off with an overlapping/out-of-bounds layout.
  const ROUND_TABLE_SEATS = 8;
    const ROUND_TABLE_CELL_FT = 10.7; // 5ft round table + safe chair clearance (matches script.js tableCellSize)
  const GRID_START_MARGIN_FT = 3; // matches script.js's real startMarginDefault (was a mismatched 4ft placeholder)
  const GRID_TABLE_FOOTPRINT_FT = Math.max(0, ROUND_TABLE_CELL_FT - 3.5); // matches script.js's real per-table footprint used in computeBalancedGridPositions
  function diningRoundsGridCapacity(tent, features, danceFloorSizeId, customDanceFloorFt) {
    var usableLengthFt = tent.lengthFt;
    // A requested dance floor is reserved out of the tent before dining tables
    // are placed (see script.js useRecommendedLayout), so a tent that looks
    // big enough for dining tables ALONE can still be too small once the
    // dance floor's footprint is carved out of it. Approximate that reserved
    // depth here so this capacity check matches what the designer will
    // actually be able to fit.
    if (features && features.indexOf('danceFloor') !== -1) {
      var danceSideFt = Math.sqrt(danceFloorSqft(danceFloorSizeId, customDanceFloorFt));
      usableLengthFt = Math.max(GRID_START_MARGIN_FT, tent.lengthFt - danceSideFt - 3);
    }
    // Matches script.js's real computeBalancedGridPositions/chooseCols math:
    // the first table sits right at the margin, so one more column/row fits
    // than a plain division suggests (the trailing '+ 1'), and it's the
    // table's true footprint (not the full cell spacing) that has to clear
    // the margin. The old, cruder formula under-counted real capacity and
    // wrongly disqualified perfectly viable, cheaper tents.
    const cols = Math.max(1, Math.floor((tent.widthFt - GRID_START_MARGIN_FT - GRID_TABLE_FOOTPRINT_FT) / ROUND_TABLE_CELL_FT) + 1);
    const rows = Math.max(1, Math.floor((usableLengthFt - GRID_START_MARGIN_FT - GRID_TABLE_FOOTPRINT_FT) / ROUND_TABLE_CELL_FT) + 1);
    return cols * rows * ROUND_TABLE_SEATS;
  }
  const roundTableSeatsNeeded = Math.ceil(guestCount / ROUND_TABLE_SEATS) * ROUND_TABLE_SEATS;

  let recommendedIndex = -1;
  const viableTents = [];
  for (let i = 0; i < eligible.length; i++) {
    const areaFits = eligible[i].capacity[capacityKey] >= requiredUnits;
    const gridFits = capacityKey !== 'diningRounds' || diningRoundsGridCapacity(eligible[i], features, input.danceFloorSizeId, input.customDanceFloorFt) >= roundTableSeatsNeeded;
    if (areaFits && gridFits) { viableTents.push(eligible[i]); }
  }
  // Recommend the CHEAPEST tent that actually fits, instead of just the
  // first (smallest-capacity) one that fits. Real-world tent pricing isn't
  // always monotonic with size -- e.g. a 40x40 pole tent can cost far more
  // per day than a larger 30x60 pole tent -- so picking purely by ascending
  // capacity could (and did) recommend a tent that cost hundreds of dollars
  // more than an equally- or better-fitting tent sitting right next to it.
  if (viableTents.length > 0) {
    const cheapestViable = viableTents.slice().sort(function (a, b) {
      // Tenants that haven't uploaded a price show pricePerDay: null - treat
      // those as "unknown/most expensive" for ranking purposes rather than
      // letting a null vs. number comparison behave unpredictably.
      const aPrice = (a.pricePerDay === null || a.pricePerDay === undefined) ? Infinity : a.pricePerDay;
      const bPrice = (b.pricePerDay === null || b.pricePerDay === undefined) ? Infinity : b.pricePerDay;
      if (aPrice !== bPrice) return aPrice - bPrice;
      return a.capacity[capacityKey] - b.capacity[capacityKey];
    })[0];
    recommendedIndex = eligible.indexOf(cheapestViable);
  }
  const result = { requiredUnits: requiredUnits, capacityKey: capacityKey, guestCount: guestCount, extraGuestUnits: extraGuestUnits, recommended: null, tighter: null, moreSpacious: null, warnings: [] };
  if (recommendedIndex === -1) {
    const largest = eligible[eligible.length - 1];
    result.warnings.push({ level: 'error', message: 'No single tent in current inventory comfortably fits this event. ' + ((typeof window !== 'undefined' && window.ACTIVE_TENANT && window.ACTIVE_TENANT.name) || 'Friendly Party Rental') + ' staff will help plan a multi-tent or custom layout.' });
    if (largest) result.moreSpacious = { tent: largest, note: surfaceWarning(largest, surfaceType) };
    return result;
  }

const recommendedTent = eligible[recommendedIndex];
  result.recommended = { tent: recommendedTent, note: surfaceWarning(recommendedTent, surfaceType) };
  if (recommendedIndex > 0) {
    const smaller = eligible[recommendedIndex - 1];
    if (smaller.capacity[capacityKey] >= guestCount * 0.9) {
      const smallerIsViable = viableTents.indexOf(smaller) !== -1;
      result.tighter = {
        tent: smaller,
        note: surfaceWarning(smaller, surfaceType),
        caution: smallerIsViable ? undefined : 'May fit with reduced comfort and fewer feature areas than requested.',
      };
    }
  }
  if (recommendedIndex < eligible.length - 1) {
    const bigger = eligible[recommendedIndex + 1];
    result.moreSpacious = {
      tent: bigger,
      note: surfaceWarning(bigger, surfaceType),
      benefit: bigger.pricePerDay > recommendedTent.pricePerDay ? 'More comfortable circulation and room to grow the layout.' : 'More comfortable circulation and room to grow the layout, and it costs the same or less than the recommended tent.',
    };
  }
  return result;
}

export const SEATING_STYLE_OPTIONS = SEATING_STYLES;
