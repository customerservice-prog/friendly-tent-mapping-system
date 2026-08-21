// Friendly Party Rental — Package inventory data
// Real package names, prices, and guest counts pulled from friendlypartyrental.com (Aug 2026). Confirm exact contents with staff.

export const PACKAGE_CATEGORIES = { WEDDING: 'wedding', GRADUATION: 'graduation', CORPORATE: 'corporate', BACKYARD: 'backyard' };

function buildPackage(id, name, price, maxGuests, category, includes) {
return { id: id, name: name, price: price, maxGuests: maxGuests, category: category, includes: includes, active: true };
}

export const PACKAGES = [];
PACKAGES.push(buildPackage('pkg-backyard-elopement', 'Backyard Elopement', 345.00, 30, PACKAGE_CATEGORIES.WEDDING, ['1 Pop-Up Tent (10x20)', 'Up to 4 Folding Tables', 'Up to 30 White Folding Chairs', 'White Table Linens', 'Setup & Breakdown']));
PACKAGES.push(buildPackage('pkg-classic-ceremony', 'Classic Ceremony', 520.00, 50, PACKAGE_CATEGORIES.WEDDING, ['1 Pole Tent (20x20)', 'Up to 6 Folding Tables', 'Up to 50 White Folding Chairs', 'White Table Linens', 'Basic Centerpiece Accents', 'Setup & Breakdown']));
PACKAGES.push(buildPackage('pkg-garden-reception', 'Garden Reception', 2380.00, 80, PACKAGE_CATEGORIES.WEDDING, ['Pole Tent (20x40)', 'Up to 10 Round Banquet Tables', 'Up to 100 Chiavari Chairs', 'Premium Table Linens', 'Centerpiece Accents & Decor', 'Portable Dance Floor', 'String Lights or Uplighting', 'Setup & Breakdown']));
PACKAGES.push(buildPackage('pkg-luxury-estate', 'Luxury Estate', 5165.00, 150, PACKAGE_CATEGORIES.WEDDING, ['Large Pole Tent (40x60)', 'Up to 16 Round Banquet Tables', 'Up to 150 Gold or White Chiavari Chairs', 'Luxury Satin Table Linens', 'Chair Sashes & Decor Package', 'Full Portable Dance Floor', 'Uplighting & Bistro String Lights', 'Cocktail Tables with Highboy Covers', 'Setup & Breakdown']));
PACKAGES.push(buildPackage('pkg-all-inclusive-premium', 'All-Inclusive Premium', 6925.00, 200, PACKAGE_CATEGORIES.WEDDING, ['Premium Pole Tent (40x80)', 'Up to 20 Round Banquet Tables', 'Up to 200 Gold or White Chiavari Chairs', 'Luxury Specialty Linens & Overlays', 'Cloth Napkins, Chair Sashes & Full Decor Package', 'Large Portable Dance Floor', 'Full Uplighting Package & Bistro String Lights', 'Cocktail Tables with Highboy Covers', 'Portable Photo Booth', 'Generator if needed', 'Setup & Breakdown']));
PACKAGES.push(buildPackage('pkg-grad-small', 'Graduation Party Package - Small', 665.00, 64, PACKAGE_CATEGORIES.GRADUATION, ['Seats 64']));
PACKAGES.push(buildPackage('pkg-grad-large', 'Graduation Party Package - Large', 875.00, 100, PACKAGE_CATEGORIES.GRADUATION, ['Seats 100']));
PACKAGES.push(buildPackage('pkg-corporate', 'Corporate Event Package', 800.00, null, PACKAGE_CATEGORIES.CORPORATE, []));
PACKAGES.push(buildPackage('pkg-backyard-bbq', 'Backyard BBQ Party Package', 415.00, null, PACKAGE_CATEGORIES.BACKYARD, []));

export function byId(id) {
return PACKAGES.find(function (p) { return p.id === id; });
}

export function suggestPackage(category, guestCount) {
const candidates = PACKAGES.filter(function (p) { return p.category === category && p.maxGuests != null && p.maxGuests >= guestCount; });
if (!candidates.length) return null;
return candidates.reduce(function (best, p) { return p.maxGuests < best.maxGuests ? p : best; });
}
