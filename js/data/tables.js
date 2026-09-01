// Friendly Party Rental — Table inventory data
// Real sizes and per-day prices pulled from friendlypartyrental.com (Aug 2026).
// clearanceFt is a RECOMMENDED PLANNING CLEARANCE (table + chairs + a little
// circulation room), not a code-required or engineering figure.

export const TABLE_CATEGORIES = {
    ROUND: 'round',
    BANQUET: 'banquet',
    COCKTAIL: 'cocktail',
    SERVICE: 'service',
};

function buildTable(opts) {
    const footprintFt = opts.shape === 'round'
          ? { w: opts.diameterFt, h: opts.diameterFt }
      : { w: opts.widthFt, h: opts.depthFt };
    const pad = opts.clearancePadFt != null ? opts.clearancePadFt : 3.5;
    const clearanceFt = { w: footprintFt.w + pad, h: footprintFt.h + pad };
    return {
          id: opts.id,
          name: opts.name,
          shape: opts.shape,
          diameterFt: opts.diameterFt || null,
          widthFt: opts.widthFt || null,
          depthFt: opts.depthFt || null,
          seatsOptions: opts.seatsOptions,
          seatsDefault: opts.seatsDefault,
          pricePerDay: opts.pricePerDay,
          category: opts.category,
          footprintFt: footprintFt,
          clearanceFt: clearanceFt,
          clearanceNote: 'Recommended planning clearance for chairs and circulation — not a code-required measurement.',
          description: opts.description || '',
          // Visual silhouette used by the 2D plan and 3D view renderers so each real
          // Friendly Party Rental table type gets its own recognizable representation
          // instead of a generic round/rect shape.
          silhouette: opts.silhouette || 'dining-round',
          active: true,
    };
}

export const TABLES = [
    buildTable({ id: 'round-5ft', name: "5' Round Table", shape: 'round', diameterFt: 5, seatsOptions: [6, 8, 10], seatsDefault: 8, pricePerDay: 15.00, category: TABLE_CATEGORIES.ROUND, silhouette: 'dining-round' }),
    buildTable({ id: 'banquet-6ft', name: "6' Banquet Table", shape: 'rect', widthFt: 6, depthFt: 2.5, seatsOptions: [6, 8], seatsDefault: 6, pricePerDay: 13.00, category: TABLE_CATEGORIES.BANQUET, silhouette: 'banquet-rect' }),
    buildTable({ id: 'banquet-8ft', name: "8' Banquet Table", shape: 'rect', widthFt: 8, depthFt: 2.5, seatsOptions: [8, 10], seatsDefault: 8, pricePerDay: 14.00, category: TABLE_CATEGORIES.BANQUET, silhouette: 'banquet-rect' }),
    buildTable({ id: 'cocktail', name: 'Cocktail Table', shape: 'round', diameterFt: 2.5, seatsOptions: [0], seatsDefault: 0, pricePerDay: 12.00, category: TABLE_CATEGORIES.COCKTAIL, clearancePadFt: 2.5, description: 'Standing/mingling height table.', silhouette: 'cocktail-pedestal' }),
    buildTable({ id: 'fill-chill-4ft', name: "4' Fill & Chill Table", shape: 'rect', widthFt: 4, depthFt: 2, seatsOptions: [0], seatsDefault: 0, pricePerDay: 40.00, category: TABLE_CATEGORIES.SERVICE, clearancePadFt: 2, description: 'Beverage/cooler service table with a built-in fillable ice basin for drink stations.', silhouette: 'fillchill-tub' }),
  ];

export function byId(id) {
    return TABLES.find(function (t) { return t.id === id; });
}
