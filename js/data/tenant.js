// Friendly Party Rental — Tenant configuration.
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

function cloneCatalog(list) { return list.map(function (item) { return JSON.parse(JSON.stringify(item)); }); }
function stripPricing(list) { return list.map(function (item) { item.pricePerDay = null; return item; }); }

export const FRIENDLY_TENANT = {
  id: 'friendly', slug: 'friendly', name: 'Friendly Party Rental', logo: 'logo.png',
  contactEmail: 'customerservice@friendlypartyrental.com',
  colors: { primary: '#2f7a3c', primaryDark: '#22592c', primaryTint: '#eef7ee', secondary: '#f7f3ea' },
  tents: cloneCatalog(TENTS), tables: cloneCatalog(TABLES), chairs: cloneCatalog(CHAIRS),
};
Object.assign(FRIENDLY_TENANT, { tagline: 'Plan your tent, tables, and chairs for your event with Friendly Party Rental', phone: '315-884-1498', shortName: 'Friendly', showPackages: true });

export const GENERIC_TENANT = {
  id: 'generic', slug: 'generic', name: 'RentSketch', shortName: 'RentSketch', logo: 'logo.png', contactEmail: '', phone: '',
  tagline: 'Plan tents, tables, chairs, dance floors and more in a real-scale event layout.', showPackages: false,
  colors: { primary: '#2f6fed', primaryDark: '#1f4fbf', primaryTint: '#eaf1ff', secondary: '#0b1b3a' },
  tents: stripPricing(cloneCatalog(TENTS)), tables: stripPricing(cloneCatalog(TABLES)), chairs: stripPricing(cloneCatalog(CHAIRS)),
};

export function getTenant(slug) { return slug === 'friendly' ? FRIENDLY_TENANT : GENERIC_TENANT; }

// Product-page tent deep links are PREVIEWS, not event/package builders.
// They must show exactly the clicked tent by itself in 3D. Seating prompts,
// guest shortfall warnings and inherited wizard state are deliberately removed.
(function bootTentDeepLink() {
  if (typeof window === 'undefined') return;
  var q = new URLSearchParams(window.location.search);
  if (q.get('view') !== '3d' || q.get('focus') !== 'tent' || q.get('autoplace') !== '1') return;
  var requestedName = q.get('tent') || '';
  var requestedSlug = q.get('tentSlug') || '';
  if (!requestedName && !requestedSlug) return;
  window.__RENTSKETCH_TENT_PREVIEW__ = true;

  // Preview-specific presentation. The normal designer remains unchanged for
  // packages and for customers who intentionally build a full event layout.
  var style = document.createElement('style');
  style.id = 'tentPreviewModeStyles';
  style.textContent = [
    '#emptyStateOverlay{display:none!important}',
    '#statusBar .status-pill-group .status-item:first-child{display:none!important}',
    '#statusBar .status-pill-group .status-item:nth-child(2){display:none!important}',
    '#statusBar .status-pill-group .status-flag{display:none!important}',
    '#btnToReview{display:none!important}',
    '#tryTheseCard{display:none!important}'
  ].join('');
  document.head.appendChild(style);

  function norm(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function dims(v) { var m = String(v || '').toLowerCase().match(/(10|20|30|40)\s*[x×-]\s*(10|20|30|40|45|60|80|100)/); return m ? (m[1] + 'x' + m[2]) : ''; }
  var wantedType = /frame/i.test(requestedName + ' ' + requestedSlug) ? 'frame' : (/pop|canopy/i.test(requestedName + ' ' + requestedSlug) ? 'canopy' : (/pole/i.test(requestedName + ' ' + requestedSlug) ? 'pole' : ''));
  var wantedDims = dims(requestedName) || dims(requestedSlug);
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    var b = window.FriendlyBridge;
    if (!b || !b.state || !b.TENTS || !b.enterDesigner) { if (tries > 120) clearInterval(timer); return; }
    var exact = b.TENTS.find(function (t) { return norm(t.name) === norm(requestedName) || norm(t.id) === norm(requestedSlug); });
    var match = exact || b.TENTS.find(function (t) { return (!wantedDims || (t.widthFt + 'x' + t.lengthFt) === wantedDims) && (!wantedType || t.type === wantedType); });
    if (!match) { if (tries > 120) clearInterval(timer); return; }
    clearInterval(timer);

    // Kill stale event-wizard assumptions before the blank tent is rendered.
    b.state.tentId = match.id;
    b.state.guestCount = 0;
    b.state.matchedPackageId = null;
    b.state.eventType = '';
    b.state.eventCheckOpen = false;
    b.customizeFromScratch();

    // Keep the preview title clean even if a prior wizard session had Wedding/50.
    var titleTimer = setInterval(function () {
      var title = document.getElementById('toolbarEventTitle');
      var meta = document.getElementById('toolbarEventMeta');
      if (title) title.textContent = match.name + ' · 3D Preview';
      if (meta) meta.textContent = 'Tent only — rotate and zoom to explore';
    }, 250);
    setTimeout(function () { clearInterval(titleTimer); }, 6000);

    setTimeout(function () {
      var three = document.getElementById('viewMode3d');
      if (three) three.click();
    }, 80);
  }, 50);
})();
