// Friendly Party Rental — Tenant configuration.
//
// This is the first step toward RentSketch's multi-tenant architecture:
// a single object describing "which rental company is this" (branding,
// contact info, and its product catalogs), so the designer can eventually
// be pointed at a different tenant instead of having Friendly hard-coded
// throughout script.js. For now this also removes the old duplicate
// TENTS array that used to live inline in script.js.
import { CHAIRS } from './chairs.js';
import { TABLES } from './tables.js';
export { CHAIRS, TABLES };

export const TENTS = [
{ id: 'pole-20x20', type: 'pole', name: "20x20 Pole Tent", widthFt: 20, lengthFt: 20, pricePerDay: 250, maxGuests: { dining: 33, cocktail: 66 } },
{ id: 'pole-20x30', type: 'pole', name: "20x30 Pole Tent", widthFt: 20, lengthFt: 30, pricePerDay: 350, maxGuests: { dining: 50, cocktail: 100 } },
{ id: 'pole-20x40', type: 'pole', name: "20x40 Pole Tent", widthFt: 20, lengthFt: 40, pricePerDay: 450, maxGuests: { dining: 66, cocktail: 133 } },
{ id: 'pole-30x30', type: 'pole', name: "30x30 Pole Tent", widthFt: 30, lengthFt: 30, pricePerDay: 575, maxGuests: { dining: 75, cocktail: 150 } },
{ id: 'pole-30x45', type: 'pole', name: "30x45 Pole Tent", widthFt: 30, lengthFt: 45, pricePerDay: 700, maxGuests: { dining: 112, cocktail: 225 } },
{ id: 'pole-30x60', type: 'pole', name: "30x60 Pole Tent", widthFt: 30, lengthFt: 60, pricePerDay: 850, maxGuests: { dining: 150, cocktail: 300 } },
{ id: 'pole-40x40', type: 'pole', name: "40x40 Pole Tent", widthFt: 40, lengthFt: 40, pricePerDay: 1500, maxGuests: { dining: 133, cocktail: 266 } },
{ id: 'pole-40x60', type: 'pole', name: "40x60 Pole Tent", widthFt: 40, lengthFt: 60, pricePerDay: 850, maxGuests: { dining: 200, cocktail: 400 } },
{ id: 'pole-40x80', type: 'pole', name: "40x80 Pole Tent", widthFt: 40, lengthFt: 80, pricePerDay: 1850, maxGuests: { dining: 266, cocktail: 533 } },
{ id: 'pole-40x100', type: 'pole', name: "40x100 Pole Tent", widthFt: 40, lengthFt: 100, pricePerDay: 1950, maxGuests: { dining: 333, cocktail: 666 } },
{ id: 'frame-20x20', type: 'frame', name: "20x20 Frame Tent", widthFt: 20, lengthFt: 20, pricePerDay: 400, maxGuests: { dining: 33, cocktail: 66 } },
{ id: 'frame-20x30', type: 'frame', name: "20x30 Frame Tent", widthFt: 20, lengthFt: 30, pricePerDay: 475, maxGuests: { dining: 50, cocktail: 100 } },
{ id: 'frame-20x40', type: 'frame', name: "20x40 Frame Tent", widthFt: 20, lengthFt: 40, pricePerDay: 550, maxGuests: { dining: 66, cocktail: 133 } },
{ id: 'frame-30x40', type: 'frame', name: "30x40 Frame Tent", widthFt: 30, lengthFt: 40, pricePerDay: 700, maxGuests: { dining: 100, cocktail: 200 } },
{ id: 'canopy-10x10', type: 'canopy', name: "10x10 Pop-Up Canopy", widthFt: 10, lengthFt: 10, pricePerDay: 100, maxGuests: { dining: 8, cocktail: 16 } },
{ id: 'canopy-10x20', type: 'canopy', name: "10x20 Pop-Up Canopy", widthFt: 10, lengthFt: 20, pricePerDay: 175, maxGuests: { dining: 16, cocktail: 33 } },
];

export const FRIENDLY_TENANT = {
  id: 'friendly',
  slug: 'friendly',
  name: 'Friendly Party Rental',
  logo: 'logo.png',
  contactEmail: 'customerservice@friendlypartyrental.com',
  colors: {
    primary: '#2f7a3c',
    primaryDark: '#22592c',
    primaryTint: '#eef7ee',
    secondary: '#f7f3ea',
  },
  tents: TENTS,
  tables: TABLES,
  chairs: CHAIRS,
};

// --- Extended tenant branding fields (additive; does not change existing behavior) ---
Object.assign(FRIENDLY_TENANT, {
  tagline: 'Plan your tent, tables, and chairs for your event with Friendly Party Rental',
  phone: '315-884-1498',
  shortName: 'Friendly',
  showPackages: true,
});

// Generic, tenant-neutral RentSketch branding. Used when the designer is
// accessed without a specific rental-company tenant context (e.g. the public
// RentSketch demo and marketing site), so Friendly Party Rental's brand name
// and package suggestions never leak into a generic visitor's experience.
// NOTE: this still uses the same underlying product/pricing data as Friendly
// today since there is not yet a separate master/generic catalog - only the
// branding, contact info and package-suggestion behavior are neutral.
export const GENERIC_TENANT = {
  id: 'generic',
  slug: 'generic',
  name: 'RentSketch',
  shortName: 'RentSketch',
  logo: 'logo.png',
  contactEmail: '',
  phone: '',
  tagline: 'Plan tents, tables, chairs, dance floors and more in a real-scale event layout.',
  showPackages: false,
  colors: {
    primary: '#2f6fed',
    primaryDark: '#1f4fbf',
    primaryTint: '#eaf1ff',
    secondary: '#0b1b3a',
  },
  tents: TENTS,
  tables: TABLES,
  chairs: CHAIRS,
};

export function getTenant(slug) {
  return slug === 'generic' ? GENERIC_TENANT : FRIENDLY_TENANT;
}
