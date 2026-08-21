// Friendly Party Rental — Dance floor & stage inventory data
// Real names and per-day prices pulled from friendlypartyrental.com (Aug 2026).

export const DANCE_SECTION = { id: 'dance-3x3', name: '3x3 Dance Floor Section', pricePerDay: 35.00, ft: 3 };

// Customer-facing size presets. Section counts are calculated automatically
// so customers never need to think in terms of 3x3 sections themselves.
export const DANCE_FLOOR_SIZES = [
  { id: '12x12', ft: 12 },
  { id: '15x15', ft: 15 },
  { id: '18x18', ft: 18 },
  { id: '21x21', ft: 21 },
  { id: '24x24', ft: 24 },
  ];

export function sectionsForSize(sizeFt) {
    const perSide = Math.ceil(sizeFt / DANCE_SECTION.ft);
    return perSide * perSide;
}

export function priceForSize(sizeFt) {
    return sectionsForSize(sizeFt) * DANCE_SECTION.pricePerDay;
}

export const STAGE_SECTION = { id: 'stage-section', name: 'Stage Section', pricePerDay: 125.00 };
export const STAGE_RAMP = { id: 'stage-ramp', name: 'Stage Ramp', pricePerDay: 50.00 };
export const STAGE_STAIR = { id: 'stage-stair', name: 'Stage Stair', pricePerDay: 55.00 };
export const STAGE_SKIRT = { id: 'stage-skirt', name: "8ft x 31in Stage Skirt", pricePerDay: 25.00 };
