// Friendly Event Designer - v2 client-side logic
// Customer-facing designer: contextual drawers, visual cards, a 2D-first
// canvas, a contextual inspector, actionable Event Check feedback, and a
// persistent status bar. Pricing reflects Friendly Party Rental's published
// per-day pricing (see FRIENDLY-EVENT-DESIGNER.md, section 7).

import { createLayoutStore } from './js/core/layoutStore.js';
import { runAllChecks } from './js/core/collision.js';
import { LINENS, optionsForTable } from './js/data/linens.js';
import { LIGHTING_OPTIONS, tentLightingPriceFor } from './js/data/lighting.js';
import { DANCE_SECTION, DANCE_FLOOR_SIZES, sectionsForSize, priceForSize } from './js/data/danceFloor.js';
import { PACKAGES } from './js/data/packages.js';
import * as plan2dMod from './js/ui/plan2d.js';
import { byId as chairVisualById } from './js/data/chairs.js';

var NL = String.fromCharCode(10);

var TENTS = [
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

function computeCenterPoles(type, widthFt, lengthFt) {
if (type !== 'pole') return [];
var bay = 10;
var count = Math.max(1, Math.round(lengthFt / bay) - 1);
var poles = [];
for (var i = 1; i <= count; i++) {
poles.push({ x: widthFt / 2, y: (lengthFt / (count + 1)) * i });
}
return poles;
}
TENTS.forEach(function (t) {
t.centerPoles = computeCenterPoles(t.type, t.widthFt, t.lengthFt);
});

var TABLES = [
{ id: 'round-5ft', name: "5' Round Table", shape: 'round', diameterFt: 5, seatsDefault: 8, pricePerDay: 15.00 },
{ id: 'banquet-6ft', name: "6' Banquet Table", shape: 'rect', widthFt: 6, depthFt: 2.5, seatsDefault: 6, pricePerDay: 13.00 },
{ id: 'banquet-8ft', name: "8' Banquet Table", shape: 'rect', widthFt: 8, depthFt: 2.5, seatsDefault: 8, pricePerDay: 14.00 },
{ id: 'cocktail', name: "Cocktail Table", shape: 'round', diameterFt: 2.5, seatsDefault: 0, pricePerDay: 12.00 },
{ id: 'fill-chill-4ft', name: "4' Fill & Chill Table", shape: 'rect', widthFt: 4, depthFt: 2, seatsDefault: 0, pricePerDay: 40.00 },
];

var CHAIRS = [
{ id: 'plastic-white', name: 'White Plastic Folding Chair', pricePerDay: 2.50 },
{ id: 'resin-white', name: 'White Resin Folding Chair', pricePerDay: 4.75 },
{ id: 'chiavari-gold', name: 'Gold Chiavari Chair', pricePerDay: 11.99 },
{ id: 'chiavari-white', name: 'White Chiavari Chair', pricePerDay: 11.99 },
{ id: 'chiavari-mahogany', name: 'Mahogany Chiavari Chair', pricePerDay: 12.00 },
{ id: 'throne-king', name: 'King Throne Chair', pricePerDay: 120.00 },
{ id: 'throne-queen-tiffany', name: 'Queen Tiffany Throne Chair', pricePerDay: 125.00 },
];

var state = {
eventType: 'wedding',
guestCount: 50,
spaceType: 'backyard',
needDance: false,
danceFloorSizeId: '18x18',
customDanceFloorFt: null,
matchedPackageId: null,
tentId: 'pole-20x40',
chairId: 'plastic-white',
lightingId: 'lighting-none',
selectedId: null,
viewMode: 'plan',
activeDrawer: null,
lastTableConfig: null,
eventCheckOpen: false,
estimateOpen: false,
};

var nextItemNum = 1;
function newItemId() { return 'item-' + (nextItemNum++); }

var store = createLayoutStore({ tentId: state.tentId, objects: [], zones: [], aisles: [] });
var tableDraft = null;

function byId(arr, id) { return arr.find(function (a) { return a.id === id; }); }
function $(id) { return document.getElementById(id); }

function showStep(id) {
document.querySelectorAll('.step').forEach(function (el) { el.classList.remove('active'); });
$(id).classList.add('active');
}

function money(n) { return '$' + n.toFixed(2); }

function danceFloorSizeFt() {
if (state.danceFloorSizeId === 'custom') return state.customDanceFloorFt || 18;
var sz = byId(DANCE_FLOOR_SIZES, state.danceFloorSizeId);
return sz ? sz.ft : 18;
}

function recommendDanceFloorFt() {
var g = state.guestCount;
if (g <= 30) return 12;
if (g <= 60) return 15;
if (g <= 100) return 18;
if (g <= 150) return 21;
return 24;
}

function validateLighting() {
var tent = byId(TENTS, state.tentId);
var opt = byId(LIGHTING_OPTIONS, state.lightingId);
if (opt && opt.dynamic && tentLightingPriceFor(tent) == null) state.lightingId = 'lighting-none';
}

function useRecommendedLayout() {
store.reset({ tentId: state.tentId, objects: [], zones: [], aisles: [] });
state.selectedId = null;
state.lastTableConfig = null;
var tablesNeeded = Math.ceil(state.guestCount / 8);
for (var i = 0; i < tablesNeeded; i++) { addTable('round-5ft', state.chairId, null); }
if (tablesNeeded > 0) state.lastTableConfig = { tableId: 'round-5ft', chairId: state.chairId, seatCount: 8, linenId: null };
if (state.needDance) {
setDanceFloorCount(sectionsForSize(danceFloorSizeFt()));
}
enterDesigner();
}

function customizeFromScratch() {
store.reset({ tentId: state.tentId, objects: [], zones: [], aisles: [] });
state.selectedId = null;
state.lastTableConfig = null;
enterDesigner();
}

function enterDesigner() {
document.body.classList.add('designer-active');
state.viewMode = 'plan';
state.selectedId = null;
state.activeDrawer = null;
state.eventCheckOpen = false;
state.estimateOpen = false;
validateLighting();
showStep('step-designer');
closeDrawer();
mountPlan();
setViewMode('plan');
refreshAll();
}

function selectTent(tentId) {
state.tentId = tentId;
validateLighting();
refreshAll();
}

function nextGridPosition(index, tent, cellFt) {
var spacing = cellFt;
var cols = Math.max(1, Math.floor((tent.widthFt - 4) / spacing));
var col = index % cols;
var row = Math.floor(index / cols);
// Always use the full, collision-safe spacing for every row. Previously this
// compressed row spacing once the tent ran out of vertical room, which could
// shrink the gap between tables below their real footprint and cause tables
// (and their chairs) to visually overlap. It is better to allow a layout to
// extend slightly beyond the drawn tent outline than to render overlapping
// furniture, so we never compress spacing below the safe value.
var x = 3 + col * spacing;
var y = 3 + row * spacing;
var footprint = Math.max(0, spacing - 3.5);
var poles = (tent && tent.centerPoles) || [];
if (poles.length) {
var poleX = poles[0].x;
var clearance = 1.25;
if (x - clearance < poleX && poleX < x + footprint + clearance) {
x = poleX + clearance + 0.01;
}
}
return { x: x, y: y };
}

function tableCellSize(tableDef, chairId) {
var base = tableDef.shape === 'round' ? tableDef.diameterFt : Math.max(tableDef.widthFt, tableDef.depthFt);
var chair = chairVisualById(chairId) || {};
var chairSpan = Math.max(chair.seatWidthFt || 1.5, chair.seatDepthFt || 1.5);
// Radial clearance for the chair itself (matches js/ui/plan2d.js's
// buildChairDots anchor offset: tableRadius + chairSpan/2 + 0.35, plus the
// chair's own outward half-depth) so a table's chairs never reach past the
// midpoint between it and its neighbor, plus a walking aisle between the
// backs of chairs at adjacent tables. This keeps every chair style --
// including much larger throne chairs -- from visually overlapping.
var chairClearance = chairSpan + 0.35;
var aisleFt = 2;
return base + 2 * chairClearance + aisleFt;
}

function addTableCustom(tableId, chairId, seatCount, linenId) {
var tent = byId(TENTS, state.tentId);
var tableDef = byId(TABLES, tableId);
var tableCount = store.getState().objects.filter(function (i) { return i.kind === 'table'; }).length;
var pos = nextGridPosition(tableCount, tent, tableCellSize(tableDef, chairId));
var item = {
id: newItemId(),
kind: 'table',
tableId: tableId,
shape: tableDef.shape,
widthFt: tableDef.shape === 'round' ? tableDef.diameterFt : tableDef.widthFt,
depthFt: tableDef.shape === 'round' ? tableDef.diameterFt : tableDef.depthFt,
x: pos.x,
y: pos.y,
seatCount: seatCount,
chairId: chairId,
linenId: linenId || null,
};
store.addObject(item);
return item.id;
}

function addTable(tableId, chairId, linenId) {
var tableDef = byId(TABLES, tableId);
addTableCustom(tableId, chairId, tableDef.seatsDefault, linenId);
}

function ensureTableDraft() {
if (!tableDraft) {
var t = TABLES[0];
tableDraft = { tableId: t.id, chairId: state.chairId, seatCount: t.seatsDefault, linenId: null };
}
return tableDraft;
}

function addTableFromDraft() {
var tableDef = byId(TABLES, tableDraft.tableId);
var seatCount = tableDef.seatsDefault > 0 ? tableDraft.seatCount : 0;
var newId = addTableCustom(tableDraft.tableId, tableDraft.chairId, seatCount, tableDraft.linenId);
state.lastTableConfig = { tableId: tableDraft.tableId, chairId: tableDraft.chairId, seatCount: seatCount, linenId: tableDraft.linenId };
return newId;
}

function addTableFromConfig(cfg, n) {
if (!cfg) return;
for (var i = 0; i < n; i++) { addTableCustom(cfg.tableId, cfg.chairId, cfg.seatCount, cfg.linenId); }
}

function layoutDanceFloorPositions(tent, totalCount) {
var spacing = DANCE_SECTION.ft;
var maxPerSide = Math.max(1, Math.floor((Math.min(tent.widthFt, tent.lengthFt) - 4) / spacing));
var perSide = Math.min(maxPerSide, Math.max(1, Math.ceil(Math.sqrt(totalCount))));
var blockFt = perSide * spacing;
var originY = Math.max(2, tent.lengthFt - 2 - blockFt);
var rightX = Math.max(2, tent.widthFt - 2 - blockFt);
var leftX = 2;
var poles = (tent && tent.centerPoles) || [];
var clearance = 1.25;
function poleHits(ox) {
return poles.filter(function (p) {
return ox - clearance < p.x && p.x < ox + blockFt + clearance && p.y >= originY - clearance && p.y <= originY + blockFt + clearance;
}).length;
}
var originX = poles.length && poleHits(leftX) < poleHits(rightX) ? leftX : rightX;
var positions = [];
for (var i = 0; i < totalCount; i++) {
var col = i % perSide;
var row = Math.floor(i / perSide);
positions.push({ x: originX + col * spacing, y: originY + row * spacing });
}
return positions;
}

function removeAllDanceFloors() {
var ids = store.getState().objects.filter(function (i) { return i.kind === 'dance'; }).map(function (i) { return i.id; });
ids.forEach(function (id) { store.removeObject(id); });
}

function setDanceFloorCount(totalCount) {
var tent = byId(TENTS, state.tentId);
removeAllDanceFloors();
var positions = layoutDanceFloorPositions(tent, totalCount);
positions.forEach(function (pos) {
store.addObject({
id: newItemId(),
kind: 'dance',
widthFt: DANCE_SECTION.ft,
depthFt: DANCE_SECTION.ft,
x: pos.x,
y: pos.y,
});
});
}

function setDanceFloorToSize(ft) {
setDanceFloorCount(sectionsForSize(ft));
}

function forCollision(objects) {
return objects.map(function (o) {
var kind = o.kind;
if (kind === 'table') kind = 'tableGroup';
else if (kind === 'dance') kind = 'danceFloor';
return Object.assign({}, o, { kind: kind });
});
}

function getConflicts() {
var tent = byId(TENTS, state.tentId);
var objects = store.getState().objects;
return runAllChecks({ objects: forCollision(objects), aisles: [] }, tent, state.guestCount);
}

function conflictSeverityByItemId(conflicts) {
var map = {};
var rank = { info: 1, warning: 2, error: 3 };
conflicts.forEach(function (c) {
c.objectIds.forEach(function (id) {
if (!map[id] || rank[c.severity] > rank[map[id]]) map[id] = c.severity;
});
});
return map;
}

var view3dMod = null;
var view3dPendingSnapshot = null;
var planMounted = false;

function buildSnapshot(conflicts) {
var tent = byId(TENTS, state.tentId);
return {
tent: tent,
objects: store.getState().objects,
lightingOn: !!(state.lightingId && state.lightingId !== 'lighting-none'),
lightingId: state.lightingId,
selectedId: state.selectedId,
severityMap: conflictSeverityByItemId(conflicts || []),
};
}

function handleSelect(itemId) {
state.selectedId = itemId;
refreshAll();
}

function handleMove(itemId, x, y) {
store.updateObject(itemId, { x: x, y: y });
}

function mountPlan() {
if (planMounted) return;
planMounted = true;
plan2dMod.mount($('plan2d'), buildSnapshot(getConflicts()), { onSelect: handleSelect, onMove: handleMove });
}

function mount3D() {
if (view3dMod) return;
import('./js/ui/view3d.js').then(function (mod) {
view3dMod = mod;
var snapshot = view3dPendingSnapshot || buildSnapshot(getConflicts());
view3dPendingSnapshot = null;
mod.mount($('canvas'), snapshot, { onSelect: handleSelect, onMove: handleMove });
});
}

function renderViews(conflicts) {
var snapshot = buildSnapshot(conflicts);
if (planMounted) plan2dMod.update(snapshot);
if (view3dMod) {
view3dMod.update(snapshot);
} else if (state.viewMode === '3d') {
view3dPendingSnapshot = snapshot;
}
}

function setViewMode(mode) {
state.viewMode = mode;
$('viewModePlan').classList.toggle('active', mode === 'plan');
$('viewModePlan').setAttribute('aria-selected', mode === 'plan' ? 'true' : 'false');
$('viewMode3d').classList.toggle('active', mode === '3d');
$('viewMode3d').setAttribute('aria-selected', mode === '3d' ? 'true' : 'false');
$('plan2d').style.display = mode === 'plan' ? 'flex' : 'none';
$('canvas').style.display = mode === '3d' ? 'block' : 'none';
$('view3dDayNight').style.display = mode === '3d' ? '' : 'none';
$('canvasHint').textContent = mode === '3d' ? 'Drag to rotate • Scroll to zoom' : 'Click or drag items to arrange your layout';
if (mode === '3d') mount3D();
}

// Real product photos, sourced from Friendly Party Rental's own live catalog
// (friendlypartyrental.com) so option cards show the actual rental item instead
// of a generic icon.
var ITEM_PHOTOS = {
'plastic-white': 'white-plastic-folding-chair',
'resin-white': 'white-resin-folding-chair',
'chiavari-gold': 'gold-chiavari-chair',
'chiavari-white': 'white-chiavari-chair',
'chiavari-mahogany': 'mahogany-chiavari-chair',
'throne-king': 'king-throne-chair',
'throne-queen-tiffany': 'queen-tiffany-throne-chair',
'round-5ft': '5ft-round-table',
'banquet-6ft': '6ft-plastic-folding-table',
'banquet-8ft': '8ft-banquet-table',
'cocktail': 'cocktail-table',
'fill-chill-4ft': '4ft-fill-and-chill-table',
};

function itemIconHtml(id, fallbackEmoji) {
var slug = ITEM_PHOTOS[id];
if (!slug) return '<span class="item-card-icon">' + fallbackEmoji + '</span>';
var url = 'https://www.friendlypartyrental.com/api/item-image/' + slug;
return '<span class="item-card-photo-wrap"><img class="item-card-photo" src="' + url + '" alt="" loading="lazy" data-fallback="' + fallbackEmoji + '"></span>';
}

function attachPhotoFallback(container) {
container.querySelectorAll('.item-card-photo').forEach(function (img) {
img.addEventListener('error', function () {
var wrap = img.closest('.item-card-photo-wrap');
if (wrap) wrap.outerHTML = '<span class="item-card-icon">' + (img.dataset.fallback || '') + '</span>';
});
});
}

function tableIcon(t) {
return t.shape === 'round' ? '●' : '▬';
}

function titleForDrawer(kind) {
if (kind === 'tent') return 'Tent';
if (kind === 'tables') return 'Tables & Chairs';
if (kind === 'dance') return 'Dance Floor';
if (kind === 'lighting') return 'Lighting';
return '';
}

function openDrawer(kind) {
state.activeDrawer = kind;
if (kind === 'tables' && tableDraft) tableDraft.activeItemId = null;
document.querySelectorAll('.rail-btn').forEach(function (b) {
b.classList.toggle('active', b.dataset.drawer === kind);
});
$('drawerBackdrop').hidden = false;
$('drawer').hidden = false;
$('drawerTitle').textContent = titleForDrawer(kind);
renderDrawerBody(kind);
}

function closeDrawer() {
state.activeDrawer = null;
document.querySelectorAll('.rail-btn').forEach(function (b) { b.classList.remove('active'); });
$('drawerBackdrop').hidden = true;
$('drawer').hidden = true;
}

function renderDrawerBody(kind) {
var body = $('drawerBody');
if (kind === 'tent') body.innerHTML = buildTentDrawerHtml();
else if (kind === 'tables') body.innerHTML = buildTablesDrawerHtml();
else if (kind === 'dance') body.innerHTML = buildDanceDrawerHtml();
else if (kind === 'lighting') body.innerHTML = buildLightingDrawerHtml();
attachPhotoFallback(body);
}

function buildTentDrawerHtml() {
var html = '';
var groups = [['pole', 'Pole Tents'], ['frame', 'Frame Tents'], ['canopy', 'Pop-Up Canopies']];
groups.forEach(function (g) {
var list = TENTS.filter(function (t) { return t.type === g[0]; });
if (!list.length) return;
html += '<div class="drawer-section-title">' + g[1] + '</div>';
html += '<div class="item-card-grid">';
list.forEach(function (t) {
var sel = t.id === state.tentId;
html += '<button type="button" class="item-card' + (sel ? ' selected' : '') + '" data-role="tent-card" data-id="' + t.id + '">';
if (sel) html += '<span class="item-card-check">&#10003;</span>';
html += '<span class="item-card-icon">&#9974;</span>';
html += '<span class="item-card-name">' + t.name + '</span>';
html += '<span class="tent-card-meta">' + t.widthFt + '&times;' + t.lengthFt + ' ft &middot; seats ' + t.maxGuests.dining + '</span>';
html += '<span class="item-card-price">' + money(t.pricePerDay) + '/day</span>';
html += '</button>';
});
html += '</div>';
});
return html;
}

function buildTablesDrawerHtml() {
ensureTableDraft();
var html = '';
if (state.lastTableConfig) {
var cfg = state.lastTableConfig;
var cfgTable = byId(TABLES, cfg.tableId);
var cfgChair = cfg.chairId ? byId(CHAIRS, cfg.chairId) : null;
var cfgLinen = cfg.linenId ? byId(LINENS, cfg.linenId) : null;
html += '<div class="drawer-section-title">Quick Add</div>';
html += '<div class="quick-add-card">';
html += '<div class="quick-add-card-info">';
html += '<div class="quick-add-card-title">Same as Last: ' + cfgTable.name + '</div>';
html += '<div class="quick-add-card-meta">' + (cfg.seatCount > 0 ? (cfg.seatCount + ' seats &middot; ' + cfgChair.name) : 'No seating') + (cfgLinen ? (' &middot; ' + cfgLinen.name) : '') + '</div>';
html += '<div class="quick-add-actions">';
html += '<button type="button" class="btn-secondary small" data-role="quick-add" data-count="1">+1</button>';
html += '<button type="button" class="btn-secondary small" data-role="quick-add" data-count="5">+5</button>';
html += '<button type="button" class="btn-secondary small" data-role="quick-add" data-count="10">+10</button>';
html += '</div>';
html += '</div>';
html += '</div>';
}
html += '<div class="drawer-section-title">Choose a Table</div>';
html += '<div class="item-card-grid">';
TABLES.forEach(function (t) {
var sel = t.id === tableDraft.tableId;
html += '<button type="button" class="item-card' + (sel ? ' selected' : '') + '" data-role="table-card" data-id="' + t.id + '">';
if (sel) html += '<span class="item-card-check">&#10003;</span>';
html += itemIconHtml(t.id, tableIcon(t));
html += '<span class="item-card-name">' + t.name + '</span>';
html += '<span class="item-card-desc">' + (t.seatsDefault > 0 ? ('Seats ' + t.seatsDefault) : 'No seating') + '</span>';
html += '<span class="item-card-price">' + money(t.pricePerDay) + '/day</span>';
html += '</button>';
});
html += '</div>';

var tableDef = byId(TABLES, tableDraft.tableId);
if (tableDef.seatsDefault > 0) {
html += '<div class="drawer-section-title">Choose Chairs</div>';
html += '<div class="item-card-grid">';
CHAIRS.forEach(function (c) {
var sel = c.id === tableDraft.chairId;
html += '<button type="button" class="item-card' + (sel ? ' selected' : '') + '" data-role="chair-card" data-id="' + c.id + '">';
if (sel) html += '<span class="item-card-check">&#10003;</span>';
html += itemIconHtml(c.id, '&#128186;');
html += '<span class="item-card-name">' + c.name + '</span>';
html += '<span class="item-card-price">' + money(c.pricePerDay) + '/day</span>';
html += '</button>';
});
html += '</div>';

html += '<div class="drawer-section-title">Number of Seats</div>';
html += '<div class="qty-stepper">';
html += '<button type="button" data-role="seat-minus">&minus;</button>';
html += '<span>' + tableDraft.seatCount + '</span>';
html += '<button type="button" data-role="seat-plus">+</button>';
html += '</div>';
} else {
html += '<div class="no-seat-note">This table does not include seating.</div>';
}

var linenOptions = optionsForTable(tableDraft.tableId);
if (linenOptions.length) {
html += '<div class="drawer-section-title">Linen</div>';
html += '<div class="item-card-grid">';
var noneSel = !tableDraft.linenId;
html += '<button type="button" class="item-card' + (noneSel ? ' selected' : '') + '" data-role="linen-card" data-id="">';
if (noneSel) html += '<span class="item-card-check">&#10003;</span>';
html += '<span class="item-card-name">No Linen</span>';
html += '</button>';
linenOptions.forEach(function (l) {
var sel = l.id === tableDraft.linenId;
html += '<button type="button" class="item-card' + (sel ? ' selected' : '') + '" data-role="linen-card" data-id="' + l.id + '">';
if (sel) html += '<span class="item-card-check">&#10003;</span>';
html += '<span class="item-card-name">' + l.name + '</span>';
html += '<span class="item-card-price">' + money(l.pricePerDay) + '/day</span>';
html += '</button>';
});
html += '</div>';
}

html += '<button type="button" class="btn-primary drawer-add-btn" data-role="add-table">+ Add Another ' + tableDef.name + '</button>';
return html;
}

function buildDanceDrawerHtml() {
var html = '';
var danceObjs = store.getState().objects.filter(function (i) { return i.kind === 'dance'; });
if (danceObjs.length) {
var perSide = Math.round(Math.sqrt(danceObjs.length));
var ftSide = perSide * DANCE_SECTION.ft;
html += '<div class="drawer-summary-row"><span>Current: ' + ftSide + '&times;' + ftSide + ' ft dance floor</span></div>';
html += '<button type="button" class="btn-danger small" data-role="remove-dance">Remove Dance Floor</button>';
}
html += '<div class="drawer-section-title">Choose a Size</div>';
html += '<div class="item-card-grid">';
DANCE_FLOOR_SIZES.forEach(function (sz) {
var sel = state.danceFloorSizeId === sz.id;
html += '<button type="button" class="item-card' + (sel ? ' selected' : '') + '" data-role="dance-size-card" data-ft="' + sz.ft + '" data-preset-id="' + sz.id + '">';
if (sel) html += '<span class="item-card-check">&#10003;</span>';
html += '<span class="item-card-icon">&#9835;</span>';
html += '<span class="item-card-name">' + sz.ft + '&times;' + sz.ft + ' ft</span>';
html += '<span class="item-card-price">' + money(priceForSize(sz.ft)) + '/day</span>';
html += '</button>';
});
html += '</div>';
html += '<button type="button" class="btn-secondary" data-role="dance-recommend">Recommend a Size for Me</button>';
return html;
}

function buildLightingDrawerHtml() {
var html = '';
var tent = byId(TENTS, state.tentId);
html += '<div class="item-card-grid">';
LIGHTING_OPTIONS.forEach(function (l) {
if (l.dynamic && tentLightingPriceFor(tent) == null) return;
var price = l.dynamic ? tentLightingPriceFor(tent) : l.pricePerDay;
var sel = l.id === state.lightingId;
html += '<button type="button" class="item-card' + (sel ? ' selected' : '') + '" data-role="lighting-card" data-id="' + l.id + '">';
if (sel) html += '<span class="item-card-check">&#10003;</span>';
html += '<span class="item-card-icon">&#128161;</span>';
html += '<span class="item-card-name">' + l.name + '</span>';
if (price) html += '<span class="item-card-price">' + money(price) + '/day</span>';
html += '</button>';
});
html += '</div>';
return html;
}

function renderInspector() {
var panel = $('inspectorPanel');
var item = store.getState().objects.find(function (i) { return i.id === state.selectedId; });
if (!item) {
panel.hidden = true;
panel.innerHTML = '';
return;
}
panel.hidden = false;
var html = '<button type="button" class="btn-tertiary inspector-close" data-role="inspector-close">Close</button>';
if (item.kind === 'dance') {
html += '<h3 class="inspector-title">Dance Floor Section</h3>';
html += '<p class="inspector-subtitle">' + DANCE_SECTION.ft + '&times;' + DANCE_SECTION.ft + ' ft section</p>';
html += '<div class="inspector-actions">';
html += '<button type="button" class="btn-secondary" data-role="insp-duplicate" data-id="' + item.id + '" data-count="1">Duplicate</button>';
html += '<button type="button" class="btn-danger" data-role="insp-delete" data-id="' + item.id + '">Delete Section</button>';
html += '<button type="button" class="btn-danger" data-role="remove-dance">Remove Entire Dance Floor</button>';
html += '</div>';
} else {
var tableDef = byId(TABLES, item.tableId);
var chairDef = item.chairId ? byId(CHAIRS, item.chairId) : null;
var linenDef = item.linenId ? byId(LINENS, item.linenId) : null;
html += '<h3 class="inspector-title">' + tableDef.name + '</h3>';
html += '<p class="inspector-subtitle">' + (item.seatCount > 0 ? (item.seatCount + ' seats &middot; ' + chairDef.name) : 'No seating (cocktail)') + '</p>';
if (linenDef) html += '<div class="inspector-row"><span>Linen</span><span>' + linenDef.name + '</span></div>';

if (item.seatCount > 0) {
html += '<div class="drawer-section-title">Change Chairs</div>';
html += '<div class="item-card-grid">';
CHAIRS.forEach(function (c) {
var sel = c.id === item.chairId;
html += '<button type="button" class="item-card small' + (sel ? ' selected' : '') + '" data-role="insp-set-chair" data-id="' + item.id + '" data-chair="' + c.id + '">';
if (sel) html += '<span class="item-card-check">&#10003;</span>';
html += '<span class="item-card-name">' + c.name + '</span>';
html += '</button>';
});
html += '</div>';
}

var linenOptions = optionsForTable(item.tableId);
if (linenOptions.length) {
html += '<div class="drawer-section-title">Change Linen</div>';
html += '<div class="item-card-grid">';
var noneSel = !item.linenId;
html += '<button type="button" class="item-card small' + (noneSel ? ' selected' : '') + '" data-role="insp-set-linen" data-id="' + item.id + '" data-linen="">';
if (noneSel) html += '<span class="item-card-check">&#10003;</span>';
html += '<span class="item-card-name">No Linen</span></button>';
linenOptions.forEach(function (l) {
var sel = l.id === item.linenId;
html += '<button type="button" class="item-card small' + (sel ? ' selected' : '') + '" data-role="insp-set-linen" data-id="' + item.id + '" data-linen="' + l.id + '">';
if (sel) html += '<span class="item-card-check">&#10003;</span>';
html += '<span class="item-card-name">' + l.name + '</span></button>';
});
html += '</div>';
}

html += '<div class="inspector-actions">';
html += '<button type="button" class="btn-secondary" data-role="insp-duplicate" data-id="' + item.id + '" data-count="1">Duplicate</button>';
html += '<button type="button" class="btn-secondary" data-role="insp-duplicate" data-id="' + item.id + '" data-count="5">Duplicate &times;5</button>';
html += '<button type="button" class="btn-secondary" data-role="insp-duplicate" data-id="' + item.id + '" data-count="10">Duplicate &times;10</button>';
html += '<button type="button" class="btn-danger" data-role="insp-delete" data-id="' + item.id + '">Delete</button>';
html += '</div>';
}
panel.innerHTML = html;
}

function renderStatusBar(conflicts) {
var tent = byId(TENTS, state.tentId);
var objects = store.getState().objects;
var totalSeats = objects.reduce(function (s, i) { return s + (i.seatCount || 0); }, 0);
var errorCount = 0, warnCount = 0;
conflicts.forEach(function (c) {
if (c.severity === 'error') errorCount++;
else if (c.severity === 'warning') warnCount++;
});
var seatsOk = totalSeats >= state.guestCount;
var flagClass, flagText;
var shortfall = state.guestCount - totalSeats;
if (errorCount > 0) {
flagClass = 'warn';
flagText = '⚠ ' + errorCount + (errorCount === 1 ? ' issue' : ' issues') + ' to fix';
} else if (!seatsOk) {
flagClass = 'warn';
flagText = '⚠ Add ' + shortfall + ' more seat' + (shortfall === 1 ? '' : 's');
} else if (warnCount > 0) {
flagClass = 'warn';
flagText = '⚠ ' + warnCount + ' to review';
} else {
flagClass = 'ok';
flagText = '✓ Layout Ready';
}

var lines = computeLineItems();
var total = lines.reduce(function (s, l) { return s + l.amount; }, 0);

var html = '';
html += '<div class="status-pill-group" data-role="open-event-check">';
html += '<span class="status-item">' + state.guestCount + ' Guests</span>';
html += '<span class="status-item"><strong>' + totalSeats + '</strong>/' + state.guestCount + ' Seats</span>';
html += '<span class="status-item hide-mobile">' + tent.name + '</span>';
html += '<span class="status-flag ' + flagClass + '">' + flagText + '</span>';
html += '</div>';
html += '<div class="status-estimate" data-role="open-estimate">';
html += '<span>' + money(total) + ' <span class="muted">/day</span></span>';
html += '<span class="muted">View Estimate &rsaquo;</span>';
html += '</div>';
$('statusBar').innerHTML = html;
}

function renderEmptyState() {
var objects = store.getState().objects;
var overlay = $('emptyStateOverlay');
if (objects.length > 0) {
overlay.hidden = true;
overlay.innerHTML = '';
return;
}
overlay.hidden = false;
var recTables = Math.max(1, Math.ceil(state.guestCount / 8));
var recSeats = recTables * 8;
var html = '';
html += '<h3>Let\'s Add Your Seating</h3>';
html += '<p>Start with a layout sized for your event, then customize anything.</p>';
html += '<div class="empty-state-recommend"><strong>' + recTables + ' &times; 5\' Round Tables</strong> &mdash; ' + recSeats + ' chairs</div>';
html += '<div class="empty-state-actions">';
html += '<button type="button" class="btn-primary" data-role="empty-add-recommended" data-count="' + recTables + '">Add Recommended Seating</button>';
html += '<button type="button" class="btn-tertiary" data-role="empty-choose-own">Choose Something Else</button>';
html += '</div>';
overlay.innerHTML = html;
}

function renderEventCheckFlyout(conflicts) {
var flyout = $('eventCheckFlyout');
if (!state.eventCheckOpen) {
flyout.hidden = true;
return;
}
flyout.hidden = false;
var objects = store.getState().objects;
var tent = byId(TENTS, state.tentId);
var totalSeats = objects.reduce(function (s, i) { return s + (i.seatCount || 0); }, 0);
var html = '<button type="button" class="flyout-close" data-role="close-event-check">&#10005;</button>';
html += '<h3>Event Check</h3>';
if (!objects.length) {
html += '<div class="checklist-item"><span class="checklist-mark done">&#10003;</span> Tent selected &mdash; ' + tent.name + '</div>';
html += '<div class="checklist-item"><span class="checklist-mark warn">!</span> Add seating for your guests</div>';
html += '<div class="checklist-item"><span class="checklist-mark pending">&#9675;</span> Dance floor (optional)</div>';
html += '<div class="checklist-item"><span class="checklist-mark pending">&#9675;</span> Lighting (optional)</div>';
} else {
var shown = false;
if (totalSeats < state.guestCount) {
shown = true;
var shortfall = state.guestCount - totalSeats;
html += '<div class="action-banner">';
html += '<div class="action-banner-title">You still need ' + shortfall + ' more seat' + (shortfall === 1 ? '' : 's') + '</div>';
html += '<p>Add more tables or increase seats per table to fit all your guests.</p>';
html += '<button type="button" class="btn-secondary small" data-role="cta-add-seating">Add Seating</button>';
html += '</div>';
}
var seen = {};
conflicts.forEach(function (c) {
var key = c.type + '|' + c.message;
if (seen[key]) return;
seen[key] = true;
shown = true;
html += '<div class="action-banner">';
html += '<div class="action-banner-title">' + (c.severity === 'error' ? 'Needs Attention' : 'Heads Up') + '</div>';
html += '<p>' + c.message + '</p>';
html += '</div>';
});
if (!shown) {
html += '<div class="action-banner ok-banner"><div class="action-banner-title">Looks Great</div><p>No layout issues detected. You are ready to review your event.</p></div>';
}
}
flyout.innerHTML = html;
}

function renderEstimateFlyout() {
var flyout = $('estimateFlyout');
if (!state.estimateOpen) {
flyout.hidden = true;
return;
}
flyout.hidden = false;
var lines = computeLineItems();
var total = lines.reduce(function (s, l) { return s + l.amount; }, 0);
var html = '<button type="button" class="flyout-close" data-role="close-estimate">&#10005;</button>';
html += '<h3>Estimate</h3>';
lines.forEach(function (l) {
html += '<div class="inspector-row"><span>' + l.label + ' &times;' + l.qty + '</span><span>' + money(l.amount) + '</span></div>';
});
html += '<div class="inspector-row"><span><strong>Total / day</strong></span><span><strong>' + money(total) + '</strong></span></div>';
html += '<button type="button" class="btn-primary drawer-add-btn" data-role="cta-review">Review Event</button>';
flyout.innerHTML = html;
}

function computeLineItems() {
var tent = byId(TENTS, state.tentId);
var objects = store.getState().objects;
var lines = [{ label: tent.name + ' (tent)', qty: 1, amount: tent.pricePerDay }];

var tableCounts = {};
var chairCounts = {};
var linenCounts = {};
var danceCount = 0;

objects.forEach(function (item) {
if (item.kind === 'table') {
tableCounts[item.tableId] = (tableCounts[item.tableId] || 0) + 1;
if (item.seatCount > 0) {
chairCounts[item.chairId] = (chairCounts[item.chairId] || 0) + item.seatCount;
}
if (item.linenId) {
linenCounts[item.linenId] = (linenCounts[item.linenId] || 0) + 1;
}
} else if (item.kind === 'dance') {
danceCount++;
}
});

Object.keys(tableCounts).forEach(function (tid) {
var t = byId(TABLES, tid);
lines.push({ label: t.name, qty: tableCounts[tid], amount: t.pricePerDay * tableCounts[tid] });
});
Object.keys(chairCounts).forEach(function (cid) {
var c = byId(CHAIRS, cid);
lines.push({ label: c.name, qty: chairCounts[cid], amount: c.pricePerDay * chairCounts[cid] });
});
Object.keys(linenCounts).forEach(function (lid) {
var l = byId(LINENS, lid);
lines.push({ label: l.name, qty: linenCounts[lid], amount: l.pricePerDay * linenCounts[lid] });
});
if (danceCount > 0) {
var dPerSide = Math.round(Math.sqrt(danceCount));
var dFt = dPerSide * DANCE_SECTION.ft;
lines.push({ label: 'Dance Floor (' + dFt + 'x' + dFt + ' ft)', qty: 1, amount: DANCE_SECTION.pricePerDay * danceCount });
}
if (state.lightingId && state.lightingId !== 'lighting-none') {
var lightOpt = byId(LIGHTING_OPTIONS, state.lightingId);
var price = lightOpt.dynamic ? tentLightingPriceFor(tent) : lightOpt.pricePerDay;
if (price) {
lines.push({ label: lightOpt.name, qty: 1, amount: price });
}
}
return lines;
}

function updateUndoRedoButtons() {
$('btnUndo').disabled = !store.canUndo();
$('btnRedo').disabled = !store.canRedo();
}

function eventTypeLabel(id) {
if (!id) return 'Your Event';
var s = id.replace(/([A-Z])/g, ' $1');
return s.charAt(0).toUpperCase() + s.slice(1);
}

function renderToolbarEventInfo() {
$('toolbarEventTitle').textContent = eventTypeLabel(state.eventType) + ' · ' + state.guestCount + ' Guests';
var tent = byId(TENTS, state.tentId);
$('toolbarEventMeta').textContent = tent.name;
}

function updateToolbarCta() {
var objects = store.getState().objects;
var totalSeats = objects.reduce(function (s, i) { return s + (i.seatCount || 0); }, 0);
var btn = $('btnToReview');
btn.textContent = totalSeats < state.guestCount ? 'Add Seating' : 'Review Event';
}

function refreshAll() {
var conflicts = getConflicts();
renderViews(conflicts);
renderInspector();
renderStatusBar(conflicts);
renderEmptyState();
renderEventCheckFlyout(conflicts);
renderEstimateFlyout();
updateUndoRedoButtons();
updateToolbarCta();
renderToolbarEventInfo();
if (state.activeDrawer) renderDrawerBody(state.activeDrawer);
}

function goToReview() {
var tent = byId(TENTS, state.tentId);
var lines = computeLineItems();
var total = lines.reduce(function (sum, l) { return sum + l.amount; }, 0);
var pkg = state.matchedPackageId ? byId(PACKAGES, state.matchedPackageId) : null;

var html = '<p><strong>Event:</strong> ' + state.eventType + ' &middot; ' + state.guestCount + ' guests &middot; ' + state.spaceType + '</p>';
if (pkg) {
html += '<div class="package-match-note">This setup is similar to our <strong>' + pkg.name + '</strong> package (' + money(pkg.price) + '/day flat, up to ' + pkg.maxGuests + ' guests). Ask Friendly Party Rental about bundled package pricing.</div>';
}
html += '<p><strong>Tent:</strong> ' + tent.name + '</p><ul>';
lines.forEach(function (l) {
html += '<li>' + l.label + ' x' + l.qty + ' &mdash; ' + money(l.amount) + '</li>';
});
html += '</ul><p><strong>Estimated Total: ' + money(total) + ' / day</strong></p>';
$('reviewSummary').innerHTML = html;

var subject = encodeURIComponent('Quote Request: ' + state.eventType + ' for ' + state.guestCount + ' guests');
var body = 'Event type: ' + state.eventType + NL + 'Guests: ' + state.guestCount + NL + 'Location type: ' + state.spaceType + NL + 'Tent: ' + tent.name + NL;
if (pkg) {
body += 'Possible package match: ' + pkg.name + ' (' + money(pkg.price) + '/day, up to ' + pkg.maxGuests + ' guests)' + NL;
}
body += NL + 'Items:' + NL;
lines.forEach(function (l) { body += '- ' + l.label + ' x' + l.qty + ' (' + money(l.amount) + ')' + NL; });
body += NL + 'Estimated Total: ' + money(total) + ' / day' + NL;

$('btnEmailQuote').onclick = function () {
var name = $('customerName').value;
var email = $('customerEmail').value;
var date = $('customerDate').value;
var fullBody = encodeURIComponent('Name: ' + name + NL + 'Email: ' + email + NL + 'Requested Date: ' + date + NL + NL + body);
this.href = 'mailto:customerservice@friendlypartyrental.com?subject=' + subject + '&body=' + fullBody;
};

document.body.classList.remove('designer-active');
showStep('step-review');
}

document.querySelectorAll('.rail-btn').forEach(function (btn) {
btn.addEventListener('click', function () {
var kind = btn.dataset.drawer;
if (state.activeDrawer === kind) { closeDrawer(); } else { openDrawer(kind); }
});
});
$('drawerClose').addEventListener('click', closeDrawer);
$('drawerBackdrop').addEventListener('click', closeDrawer);

$('drawerBody').addEventListener('click', function (e) {
var el = e.target.closest('[data-role]');
if (!el) return;
var role = el.dataset.role;
if (role === 'tent-card') { selectTent(el.dataset.id); }
else if (role === 'table-card') {
var newTableDef = byId(TABLES, el.dataset.id);
tableDraft.tableId = el.dataset.id;
tableDraft.seatCount = newTableDef.seatsDefault;
tableDraft.linenId = null;
if (tableDraft.activeItemId && store.getState().objects.some(function (i) { return i.id === tableDraft.activeItemId; })) {
store.updateObject(tableDraft.activeItemId, {
tableId: newTableDef.id,
shape: newTableDef.shape,
widthFt: newTableDef.shape === 'round' ? newTableDef.diameterFt : newTableDef.widthFt,
depthFt: newTableDef.shape === 'round' ? newTableDef.diameterFt : newTableDef.depthFt,
seatCount: tableDraft.seatCount,
linenId: null,
});
state.selectedId = tableDraft.activeItemId;
} else {
tableDraft.activeItemId = addTableFromDraft();
state.selectedId = tableDraft.activeItemId;
}
renderDrawerBody('tables');
}
else if (role === 'chair-card') { tableDraft.chairId = el.dataset.id; if (tableDraft.activeItemId) store.updateObject(tableDraft.activeItemId, { chairId: tableDraft.chairId }); renderDrawerBody('tables'); }
else if (role === 'linen-card') { tableDraft.linenId = el.dataset.id || null; if (tableDraft.activeItemId) store.updateObject(tableDraft.activeItemId, { linenId: tableDraft.linenId }); renderDrawerBody('tables'); }
else if (role === 'seat-minus') { tableDraft.seatCount = Math.max(0, tableDraft.seatCount - 1); if (tableDraft.activeItemId) store.updateObject(tableDraft.activeItemId, { seatCount: tableDraft.seatCount }); renderDrawerBody('tables'); }
else if (role === 'seat-plus') { tableDraft.seatCount = Math.min(16, tableDraft.seatCount + 1); if (tableDraft.activeItemId) store.updateObject(tableDraft.activeItemId, { seatCount: tableDraft.seatCount }); renderDrawerBody('tables'); }
else if (role === 'add-table') { tableDraft.activeItemId = addTableFromDraft(); state.selectedId = tableDraft.activeItemId; }
else if (role === 'quick-add') { addTableFromConfig(state.lastTableConfig, parseInt(el.dataset.count, 10)); }
else if (role === 'dance-size-card') {
var ft = parseInt(el.dataset.ft, 10);
setDanceFloorToSize(ft);
state.danceFloorSizeId = el.dataset.presetId || 'custom';
state.customDanceFloorFt = el.dataset.presetId ? null : ft;
refreshAll();
}
else if (role === 'dance-recommend') {
var recFt = recommendDanceFloorFt();
setDanceFloorToSize(recFt);
var preset = byId(DANCE_FLOOR_SIZES, DANCE_FLOOR_SIZES.filter(function (s) { return s.ft === recFt; }).map(function (s) { return s.id; })[0]);
state.danceFloorSizeId = preset ? preset.id : 'custom';
state.customDanceFloorFt = preset ? null : recFt;
refreshAll();
}
else if (role === 'remove-dance') { removeAllDanceFloors(); refreshAll(); }
else if (role === 'lighting-card') { state.lightingId = el.dataset.id; refreshAll(); }
});

$('inspectorPanel').addEventListener('click', function (e) {
var el = e.target.closest('[data-role]');
if (!el) return;
var role = el.dataset.role;
if (role === 'inspector-close') { state.selectedId = null; refreshAll(); }
else if (role === 'insp-duplicate') { store.duplicateObject(el.dataset.id, parseInt(el.dataset.count, 10), { x: 2, y: 2 }); }
else if (role === 'insp-delete') { store.removeObject(el.dataset.id); state.selectedId = null; }
else if (role === 'insp-set-chair') { store.updateObject(el.dataset.id, { chairId: el.dataset.chair }); }
else if (role === 'insp-set-linen') { store.updateObject(el.dataset.id, { linenId: el.dataset.linen || null }); }
else if (role === 'remove-dance') { removeAllDanceFloors(); state.selectedId = null; }
});

$('statusBar').addEventListener('click', function (e) {
var el = e.target.closest('[data-role]');
if (!el) return;
if (el.dataset.role === 'open-event-check') { state.eventCheckOpen = !state.eventCheckOpen; state.estimateOpen = false; refreshAll(); }
else if (el.dataset.role === 'open-estimate') { state.estimateOpen = !state.estimateOpen; state.eventCheckOpen = false; refreshAll(); }
});

$('eventCheckFlyout').addEventListener('click', function (e) {
var el = e.target.closest('[data-role]');
if (!el) return;
if (el.dataset.role === 'close-event-check') { state.eventCheckOpen = false; refreshAll(); }
else if (el.dataset.role === 'cta-add-seating') { state.eventCheckOpen = false; openDrawer('tables'); }
});

$('estimateFlyout').addEventListener('click', function (e) {
var el = e.target.closest('[data-role]');
if (!el) return;
if (el.dataset.role === 'close-estimate') { state.estimateOpen = false; refreshAll(); }
else if (el.dataset.role === 'cta-review') { state.estimateOpen = false; goToReview(); }
});

$('emptyStateOverlay').addEventListener('click', function (e) {
var el = e.target.closest('[data-role]');
if (!el) return;
if (el.dataset.role === 'empty-add-recommended') {
var count = parseInt(el.dataset.count, 10) || 1;
for (var i = 0; i < count; i++) { addTable('round-5ft', state.chairId, null); }
state.lastTableConfig = { tableId: 'round-5ft', chairId: state.chairId, seatCount: 8, linenId: null };
refreshAll();
} else if (el.dataset.role === 'empty-choose-own') {
openDrawer('tables');
}
});

$('viewModePlan').addEventListener('click', function () { setViewMode('plan'); });
$('viewMode3d').addEventListener('click', function () { setViewMode('3d'); });
$('view3dDayNight').addEventListener('click', function () {
if (!view3dMod) return;
var night = view3dMod.toggleDayNight();
this.textContent = night ? 'Day' : 'Night';
});

$('btnUndo').addEventListener('click', function () { store.undo(); });
$('btnRedo').addEventListener('click', function () { store.redo(); });
store.subscribe(function () { refreshAll(); });

document.addEventListener('keydown', function (e) {
if (e.key !== 'Delete' && e.key !== 'Backspace') return;
var tag = (document.activeElement && document.activeElement.tagName) || '';
if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
if (!state.selectedId) return;
store.removeObject(state.selectedId);
state.selectedId = null;
});

$('btnBackToRecommend').addEventListener('click', function () {
document.body.classList.remove('designer-active');
showStep('step-recommend');
});

$('btnToReview').addEventListener('click', function () {
var objects = store.getState().objects;
var totalSeats = objects.reduce(function (s, i) { return s + (i.seatCount || 0); }, 0);
if (totalSeats < state.guestCount) { openDrawer('tables'); return; }
goToReview();
});

$('btnBackToDesigner').addEventListener('click', function () {
document.body.classList.add('designer-active');
showStep('step-designer');
});

function buildPlanText() {
var tent = byId(TENTS, state.tentId);
var lines = computeLineItems();
var total = lines.reduce(function (sum, l) { return sum + l.amount; }, 0);
var text = 'Friendly Event Designer - My Event Plan' + NL;
text += '========================================' + NL + NL;
text += 'Event type: ' + state.eventType + NL;
text += 'Guests: ' + state.guestCount + NL;
text += 'Location type: ' + state.spaceType + NL;
text += 'Tent: ' + (tent ? tent.name : 'N/A') + NL + NL;
text += 'Items:' + NL;
lines.forEach(function (l) {
text += '- ' + l.label + ' x' + l.qty + ' - ' + money(l.amount) + NL;
});
text += NL + 'Estimated Total: ' + money(total) + ' / day' + NL;
return text;
}

$('btnPrint').addEventListener('click', function () {
window.print();
});

$('btnDownload').addEventListener('click', function () {
var text = buildPlanText();
var blob = new Blob([text], { type: 'text/plain' });
var url = URL.createObjectURL(blob);
var a = document.createElement('a');
a.href = url;
a.download = 'friendly-event-plan.txt';
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
});

$('btnShare').addEventListener('click', function () {
var text = buildPlanText();
var shareBtn = $('btnShare');
var original = shareBtn.textContent;
if (navigator.share) {
navigator.share({ title: 'My Friendly Event Plan', text: text }).catch(function () {});
} else if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(function () {
shareBtn.textContent = 'Copied!';
setTimeout(function () { shareBtn.textContent = original; }, 1500);
});
}
});

window.FriendlyBridge = {
state: state,
TENTS: TENTS,
TABLES: TABLES,
CHAIRS: CHAIRS,
PACKAGES: PACKAGES,
byId: byId,
showStep: showStep,
enterDesigner: enterDesigner,
useRecommendedLayout: useRecommendedLayout,
customizeFromScratch: customizeFromScratch,
};
