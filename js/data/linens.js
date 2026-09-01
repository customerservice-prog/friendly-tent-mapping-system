// Friendly Party Rental — Linen inventory data (curated subset)
// Real product names/prices pulled from friendlypartyrental.com (Aug 2026).
// The live site offers ~36 colors per style; this is a curated common subset.
// The full color list can be requested from staff when booking.

export const LINEN_COLORS = [
    'White', 'Ivory', 'Champagne', 'Gold', 'Black', 'Silver',
    'Navy Blue', 'Royal Blue', 'Dusty Blue', 'Burgundy', 'Red',
    'Blush', 'Dusty Rose', 'Pink', 'Purple', 'Sage Green', 'Hunter Emerald Green',
  ];

function buildLinen(id, name, fitsTableIds, pricePerDay, colors) {
    return {
          id: id,
          name: name,
          fitsTableIds: fitsTableIds,
          pricePerDay: pricePerDay,
          colors: colors || LINEN_COLORS,
          active: true,
    };
}

export const LINENS = [
    buildLinen('linen-round-90', '90" Round Tablecloth', ['round-5ft'], 17.00),
    buildLinen('linen-round-108', '108" Round Tablecloth', ['round-5ft'], 18.00),
    buildLinen('linen-spandex-6ft', 'Spandex 6ft Table Linen', ['banquet-6ft'], 18.00, ['Black', 'White']),
    buildLinen('linen-spandex-8ft', 'Black Spandex 8ft Table Linen', ['banquet-8ft'], 20.00, ['Black', 'White']),
    buildLinen('linen-banquet-54x120', '54x120 Banquet Tablecloth', ['banquet-6ft'], 16.00),
    buildLinen('linen-banquet-72x120', '72x120 Banquet Tablecloth', ['banquet-8ft'], 18.00),
    buildLinen('linen-cocktail-cover', 'Cocktail Table Cover', ['cocktail'], 12.00, ['White', 'Black', 'Gold', 'Ivory', 'Navy Blue', 'Burgundy']),
    buildLinen('linen-runner-9ft', '9ft Table Runner', ['round-5ft', 'banquet-6ft', 'banquet-8ft'], 4.00),
    buildLinen('linen-napkins', 'Matching Napkins (each)', ['round-5ft', 'banquet-6ft', 'banquet-8ft', 'cocktail'], 2.00),
    buildLinen('linen-chair-cover', 'Spandex Chair Cover (each)', [], 2.00),
  ];

export function optionsForTable(tableId) {
    return LINENS.filter(function (l) { return l.fitsTableIds.indexOf(tableId) !== -1; });
}

export function byId(id) {
    return LINENS.find(function (l) { return l.id === id; });
}

export const LINEN_VISUALS = {
  'linen-round-90': 'skirt-round',
  'linen-round-108': 'skirt-round',
  'linen-spandex-6ft': 'skirt-rect',
  'linen-spandex-8ft': 'skirt-rect',
  'linen-banquet-54x120': 'skirt-rect',
  'linen-banquet-72x120': 'skirt-rect',
  'linen-cocktail-cover': 'skirt-round',
  'linen-runner-9ft': 'runner',
};

export function linenVisual(linenId) {
  return LINEN_VISUALS[linenId] || null;
}
