// Friendly Party Rental — Chair inventory data
// Real names and per-day prices pulled from friendlypartyrental.com (Aug 2026).

export const CHAIR_CATEGORIES = {
    STANDARD: 'standard',
        CHIAVARI: 'chiavari',
        SPECIALTY: 'specialty',
      };

function buildChair(id, name, category, pricePerDay, opts) {
    opts = opts || {};
  return {
        id: id,
        name: name,
        category: category,
        pricePerDay: pricePerDay,
        footprintFt: opts.footprintFt || 1.6,
        isThrone: !!opts.isThrone,
        active: true,
    };
}

export const CHAIRS = [
  buildChair('plastic-white', 'White Plastic Folding Chair', CHAIR_CATEGORIES.STANDARD, 2.50),
  buildChair('resin-white', 'White Resin Folding Chair', CHAIR_CATEGORIES.STANDARD, 4.75),
  buildChair('chiavari-gold', 'Gold Chiavari Chair', CHAIR_CATEGORIES.CHIAVARI, 11.99),
  buildChair('chiavari-white', 'White Chiavari Chair', CHAIR_CATEGORIES.CHIAVARI, 11.99),
  buildChair('chiavari-mahogany', 'Mahogany Chiavari Chair', CHAIR_CATEGORIES.CHIAVARI, 12.00),
  buildChair('throne-king', 'King Throne Chair', CHAIR_CATEGORIES.SPECIALTY, 120.00, { footprintFt: 2.5, isThrone: true }),
  buildChair('throne-queen-tiffany', 'Queen Tiffany Throne Chair', CHAIR_CATEGORIES.SPECIALTY, 125.00, { footprintFt: 2.5, isThrone: true }),
];

export function byId(id) {
  return CHAIRS.find(function (c) { return c.id === id; });
}
