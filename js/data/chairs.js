// Friendly Party Rental — Chair inventory data
// Real names and per-day prices pulled from friendlypartyrental.com (Aug 2026).
//
// Visual asset registry: each chair also carries the metadata needed to
// render it consistently across the option card (catalog photo), the 2D
// top-down plan (silhouette + colors + real footprint), and the 3D view
// (same silhouette + colors + backHeightFt). This keeps one definition of
// "what a White Resin Folding Chair looks like" instead of separate
// hardcoded switch statements in each renderer. Seat/back dimensions below
// are estimated from the reference product photo plus standard rental-chair
// sizing (not a scraped spec sheet) and are meant for visual proportion,
// not as certified measurements.

export const CHAIR_CATEGORIES = {
  STANDARD: 'standard',
  CHIAVARI: 'chiavari',
  SPECIALTY: 'specialty',
};

// Silhouette families used by js/ui/plan2d.js (2D icon) and js/ui/view3d.js
// (3D geometry builder). Each family has its own distinct shape logic.
export const CHAIR_SILHOUETTES = {
  FOLDING: 'folding',
  RESIN: 'resin',
  CHIAVARI: 'chiavari',
  THRONE: 'throne',
};

function buildChair(id, name, category, pricePerDay, opts) {
  opts = opts || {};
  const seatWidthFt = opts.seatWidthFt || opts.footprintFt || 1.5;
  const seatDepthFt = opts.seatDepthFt || opts.footprintFt || 1.5;
  return {
    id: id,
    name: name,
    category: category,
    pricePerDay: pricePerDay,
    footprintFt: opts.footprintFt || 1.6,
    isThrone: !!opts.isThrone,
    active: true,
    silhouette: opts.silhouette || CHAIR_SILHOUETTES.FOLDING,
    frameColor: opts.frameColor || '#f2f1ec',
    accentColor: opts.accentColor || opts.frameColor || '#f2f1ec',
    seatWidthFt: seatWidthFt,
    seatDepthFt: seatDepthFt,
    backHeightFt: opts.backHeightFt || 2.6,
    catalogImage: opts.catalogImage || null,
  };
}

export const CHAIRS = [
  buildChair('plastic-white', 'White Plastic Folding Chair', CHAIR_CATEGORIES.STANDARD, 2.50, {
    silhouette: CHAIR_SILHOUETTES.FOLDING,
    frameColor: '#f2f1ec',
    seatWidthFt: 1.5, seatDepthFt: 1.5, backHeightFt: 2.6,
    catalogImage: 'white-plastic-folding-chair',
  }),
  buildChair('resin-white', 'White Resin Folding Chair', CHAIR_CATEGORIES.STANDARD, 4.75, {
    silhouette: CHAIR_SILHOUETTES.RESIN,
    frameColor: '#f1e8d5',
    seatWidthFt: 1.55, seatDepthFt: 1.6, backHeightFt: 2.75,
    catalogImage: 'white-resin-folding-chair',
  }),
  buildChair('chiavari-gold', 'Gold Chiavari Chair', CHAIR_CATEGORIES.CHIAVARI, 11.99, {
    silhouette: CHAIR_SILHOUETTES.CHIAVARI,
    frameColor: '#d4af37', accentColor: '#fbf6e8',
    seatWidthFt: 1.3, seatDepthFt: 1.4, backHeightFt: 3.0,
    catalogImage: 'gold-chiavari-chair',
  }),
  buildChair('chiavari-white', 'White Chiavari Chair', CHAIR_CATEGORIES.CHIAVARI, 11.99, {
    silhouette: CHAIR_SILHOUETTES.CHIAVARI,
    frameColor: '#f5f0e6', accentColor: '#fbf6e8',
    seatWidthFt: 1.3, seatDepthFt: 1.4, backHeightFt: 3.0,
    catalogImage: 'white-chiavari-chair',
  }),
  buildChair('chiavari-mahogany', 'Mahogany Chiavari Chair', CHAIR_CATEGORIES.CHIAVARI, 12.00, {
    silhouette: CHAIR_SILHOUETTES.CHIAVARI,
    frameColor: '#5a3320', accentColor: '#f3e6d8',
    seatWidthFt: 1.3, seatDepthFt: 1.4, backHeightFt: 3.0,
    catalogImage: 'mahogany-chiavari-chair',
  }),
  buildChair('throne-king', 'King Throne Chair', CHAIR_CATEGORIES.SPECIALTY, 120.00, {
    footprintFt: 2.5, isThrone: true,
    silhouette: CHAIR_SILHOUETTES.THRONE,
    frameColor: '#d4af37', accentColor: '#7a1020',
    seatWidthFt: 2.6, seatDepthFt: 2.4, backHeightFt: 4.4,
    catalogImage: 'king-throne-chair',
  }),
  buildChair('throne-queen-tiffany', 'Queen Tiffany Throne Chair', CHAIR_CATEGORIES.SPECIALTY, 125.00, {
    footprintFt: 2.5, isThrone: true,
    silhouette: CHAIR_SILHOUETTES.THRONE,
    frameColor: '#d4af37', accentColor: '#f7f5f0',
    seatWidthFt: 2.5, seatDepthFt: 2.3, backHeightFt: 4.6,
    catalogImage: 'queen-tiffany-throne-chair',
  }),
];

export function byId(id) {
  return CHAIRS.find(function (c) { return c.id === id; });
}
