// Friendly Party Rental — Lighting inventory data
// Real names and per-day prices pulled from friendlypartyrental.com (Aug 2026).

// Tent lighting is priced by tent footprint size, keyed as "WIDTHxLENGTH".
export const TENT_LIGHTING_PRICE_BY_SIZE = {
    '20x20': 100.00,
    '20x30': 125.00,
    '20x40': 150.00,
    '30x30': 125.00,
    '30x45': 175.00,
    '30x60': 200.00,
    '40x40': 225.00,
    '40x60': 250.00,
    '40x80': 300.00,
    '40x100': 350.00,
};

export function tentLightingPriceFor(tent) {
    const key = tent.widthFt + 'x' + tent.lengthFt;
    return TENT_LIGHTING_PRICE_BY_SIZE[key] != null ? TENT_LIGHTING_PRICE_BY_SIZE[key] : null;
}

export const LIGHTING_OPTIONS = [
  { id: 'lighting-none', name: 'None', pricePerDay: 0, dynamic: false },
  { id: 'lighting-tent', name: 'Tent Lighting (sized to your tent)', pricePerDay: null, dynamic: true },
  { id: 'lighting-bistro', name: 'Bistro String Lights', pricePerDay: 125.00, dynamic: false },
  { id: 'lighting-uplighting-12', name: 'Uplighting Package (12 Lights)', pricePerDay: 225.00, dynamic: false },
  { id: 'lighting-uplight-single', name: 'Wireless LED Uplight (each)', pricePerDay: 25.00, dynamic: false },
  { id: 'lighting-chandelier', name: 'Battery-Operated Crystal Chandelier', pricePerDay: 99.00, dynamic: false },
  { id: 'lighting-custom-300', name: 'Custom Lighting — 300ft', pricePerDay: 200.00, dynamic: false },
  ];

export function byId(id) {
    return LIGHTING_OPTIONS.find(function (l) { return l.id === id; });
}
