// Friendly Event Designer - v1 client-side logic
// Pricing below reflects Friendly Party Rental's published per-day pricing
// (see FRIENDLY-EVENT-DESIGNER.md, section 7). Update here if prices change.

import { createLayoutStore } from './js/core/layoutStore.js';
import { runAllChecks } from './js/core/collision.js';
import { LINENS, optionsForTable } from './js/data/linens.js';
import { LIGHTING_OPTIONS, tentLightingPriceFor } from './js/data/lighting.js';
import { DANCE_SECTION, DANCE_FLOOR_SIZES, sectionsForSize } from './js/data/danceFloor.js';
import { PACKAGES } from './js/data/packages.js';

const NL = String.fromCharCode(10);

const TENTS = [
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
const bay = 10;
const count = Math.max(1, Math.round(lengthFt / bay) - 1);
const poles = [];
for (let i = 1; i <= count; i++) {
poles.push({ x: widthFt / 2, y: (lengthFt / (count + 1)) * i });
}
return poles;
}
TENTS.forEach(function (t) {
t.centerPoles = computeCenterPoles(t.type, t.widthFt, t.lengthFt);
});

const TABLES = [
{ id: 'round-5ft', name: "5' Round Table", shape: 'round', diameterFt: 5, seatsDefault: 8, pricePerDay: 15.00 },
{ id: 'banquet-6ft', name: "6' Banquet Table", shape: 'rect', widthFt: 6, depthFt: 2.5, seatsDefault: 6, pricePerDay: 13.00 },
{ id: 'banquet-8ft', name: "8' Banquet Table", shape: 'rect', widthFt: 8, depthFt: 2.5, seatsDefault: 8, pricePerDay: 14.00 },
{ id: 'cocktail', name: "Cocktail Table", shape: 'round', diameterFt: 2.5, seatsDefault: 0, pricePerDay: 12.00 },
];

const CHAIRS = [
{ id: 'plastic-white', name: 'White Plastic Folding Chair', pricePerDay: 2.50 },
{ id: 'resin-white', name: 'White Resin Folding Chair', pricePerDay: 4.75 },
{ id: 'chiavari-gold', name: 'Gold Chiavari Chair', pricePerDay: 11.99 },
{ id: 'chiavari-white', name: 'White Chiavari Chair', pricePerDay: 11.99 },
{ id: 'chiavari-mahogany', name: 'Mahogany Chiavari Chair', pricePerDay: 12.00 },
];

const state = {
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
};

let nextItemNum = 1;
function newItemId() { return 'item-' + (nextItemNum++); }

const store = createLayoutStore({ tentId: state.tentId, objects: [], zones: [], aisles: [] });

function byId(arr, id) { return arr.find(function (a) { return a.id === id; }); }
function $(id) { return document.getElementById(id); }

function showStep(id) {
document.querySelectorAll('.step').forEach(function (el) { el.classList.remove('active'); });
$(id).classList.add('active');
}

function money(n) { return '$' + n.toFixed(2); }

function danceFloorSizeFt() {
if (state.danceFloorSizeId === 'custom') return state.customDanceFloorFt || 18;
const sz = byId(DANCE_FLOOR_SIZES, state.danceFloorSizeId);
return sz ? sz.ft : 18;
}
function useRecommendedLayout() {
store.reset({ tentId: state.tentId, objects: [], zones: [], aisles: [] });
state.selectedId = null;
const tablesNeeded = Math.ceil(state.guestCount / 8);
for (let i = 0; i < tablesNeeded; i++) { addTable('round-5ft', state.chairId, null); }
if (state.needDance) {
setDanceFloorCount(sectionsForSize(danceFloorSizeFt()));
}
enterDesigner();
}

function customizeFromScratch() {
store.reset({ tentId: state.tentId, objects: [], zones: [], aisles: [] });
state.selectedId = null;
enterDesigner();
}

function enterDesigner() {
populateTentSelect();
populateChairSelect();
populateLightingSelect();
populateDanceFloorSizeSelect();
showStep('step-designer');
mount3D();
refreshAll();
}
function populateTentSelect() {
const sel = $('tentSelect');
sel.innerHTML = '';
TENTS.forEach(function (t) {
const opt = document.createElement('option');
opt.value = t.id;
opt.textContent = t.name + ' (' + t.widthFt + 'x' + t.lengthFt + ') - ' + money(t.pricePerDay) + '/day';
if (t.id === state.tentId) opt.selected = true;
sel.appendChild(opt);
});
}
$('tentSelect').addEventListener('change', function () {
state.tentId = this.value;
populateLightingSelect();
refreshAll();
});

function populateChairSelect() {
const sel = $('chairSelect');
sel.innerHTML = '';
CHAIRS.forEach(function (c) {
const opt = document.createElement('option');
opt.value = c.id;
opt.textContent = c.name + ' - ' + money(c.pricePerDay) + '/day';
if (c.id === state.chairId) opt.selected = true;
sel.appendChild(opt);
});
}
$('chairSelect').addEventListener('change', function () { state.chairId = this.value; });

function populateLightingSelect() {
const sel = $('lightingSelect');
const tent = byId(TENTS, state.tentId);
sel.innerHTML = '';
LIGHTING_OPTIONS.forEach(function (l) {
const opt = document.createElement('option');
opt.value = l.id;
const price = l.dynamic ? tentLightingPriceFor(tent) : l.pricePerDay;
opt.textContent = l.name + (price ? (' - ' + money(price) + '/day') : '');
if (l.id === state.lightingId) opt.selected = true;
sel.appendChild(opt);
});
}
$('lightingSelect').addEventListener('change', function () {
state.lightingId = this.value;
refreshAll();
});

function populateDanceFloorSizeSelect() {
const sel = $('danceFloorSizeSelect');
sel.innerHTML = '';
DANCE_FLOOR_SIZES.forEach(function (sz) {
const opt = document.createElement('option');
opt.value = sz.id;
opt.textContent = sz.ft + 'x' + sz.ft + ' ft (' + sectionsForSize(sz.ft) + ' sections)';
if (sz.id === state.danceFloorSizeId) opt.selected = true;
sel.appendChild(opt);
});
if (state.danceFloorSizeId === 'custom') {
const opt = document.createElement('option');
opt.value = 'custom';
opt.textContent = 'Custom (' + (state.customDanceFloorFt || 18) + 'x' + (state.customDanceFloorFt || 18) + ' ft)';
opt.selected = true;
sel.appendChild(opt);
}
}
$('danceFloorSizeSelect').addEventListener('change', function () { state.danceFloorSizeId = this.value; });
$('setDanceFloorSize').addEventListener('click', function () {
setDanceFloorToSize(danceFloorSizeFt());
refreshAll();
});
(function buildTableButtons() {
const wrap = $('tableButtons');
TABLES.forEach(function (t) {
const row = document.createElement('div');
row.className = 'table-add-row';
const btn = document.createElement('button');
btn.className = 'btn-secondary small';
btn.textContent = '+ Add ' + t.name;
const linenSel = document.createElement('select');
linenSel.className = 'linen-select';
const noneOpt = document.createElement('option');
noneOpt.value = '';
noneOpt.textContent = 'No linen';
linenSel.appendChild(noneOpt);
optionsForTable(t.id).forEach(function (l) {
const opt = document.createElement('option');
opt.value = l.id;
opt.textContent = l.name + ' - ' + money(l.pricePerDay) + '/day';
linenSel.appendChild(opt);
});
btn.addEventListener('click', function () { addTable(t.id, state.chairId, linenSel.value || null); });
row.appendChild(btn);
row.appendChild(linenSel);
wrap.appendChild(row);
});
})();

$('addDanceFloor').addEventListener('click', function () { addDanceFloor(); });

function nextGridPosition(index, tent, cellFt) {
const spacing = cellFt;
const cols = Math.max(1, Math.floor((tent.widthFt - 4) / spacing));
const col = index % cols;
const row = Math.floor(index / cols);
return { x: 3 + col * spacing, y: 3 + row * spacing };
}

function addTable(tableId, chairId, linenId) {
const tent = byId(TENTS, state.tentId);
const tableDef = byId(TABLES, tableId);
const tableCount = store.getState().objects.filter(function (i) { return i.kind === 'table'; }).length;
const pos = nextGridPosition(tableCount, tent, (tableDef.shape === 'round' ? tableDef.diameterFt : Math.max(tableDef.widthFt, tableDef.depthFt)) + 3.5);
const item = {
id: newItemId(),
kind: 'table',
tableId: tableId,
shape: tableDef.shape,
widthFt: tableDef.shape === 'round' ? tableDef.diameterFt : tableDef.widthFt,
depthFt: tableDef.shape === 'round' ? tableDef.diameterFt : tableDef.depthFt,
x: pos.x,
y: pos.y,
seatCount: tableDef.seatsDefault,
chairId: chairId,
linenId: linenId || null,
};
store.addObject(item);
}

function layoutDanceFloorPositions(tent, totalCount) {
const spacing = DANCE_SECTION.ft;
const maxPerSide = Math.max(1, Math.floor((Math.min(tent.widthFt, tent.lengthFt) - 4) / spacing));
const perSide = Math.min(maxPerSide, Math.max(1, Math.ceil(Math.sqrt(totalCount))));
const blockFt = perSide * spacing;
const originX = Math.max(2, tent.widthFt - 2 - blockFt);
const originY = Math.max(2, tent.lengthFt - 2 - blockFt);
const positions = [];
for (let i = 0; i < totalCount; i++) {
const col = i % perSide;
const row = Math.floor(i / perSide);
positions.push({ x: originX + col * spacing, y: originY + row * spacing });
}
return positions;
}

function removeAllDanceFloors() {
const ids = store.getState().objects.filter(function (i) { return i.kind === 'dance'; }).map(function (i) { return i.id; });
ids.forEach(function (id) { store.removeObject(id); });
}

function setDanceFloorCount(totalCount) {
const tent = byId(TENTS, state.tentId);
removeAllDanceFloors();
const positions = layoutDanceFloorPositions(tent, totalCount);
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

function addDanceFloor() {
const current = store.getState().objects.filter(function (i) { return i.kind === 'dance'; }).length;
setDanceFloorCount(current + 1);
}

function setDanceFloorToSize(ft) {
setDanceFloorCount(sectionsForSize(ft));
}

function removeSelected() {
if (state.selectedId == null) return;
store.removeObject(state.selectedId);
state.selectedId = null;
refreshAll();
}
$('removeSelected').addEventListener('click', removeSelected);

$('btnUndo').addEventListener('click', function () { store.undo(); });
$('btnRedo').addEventListener('click', function () { store.redo(); });
store.subscribe(function () { refreshAll(); });

function forCollision(objects) {
return objects.map(function (o) {
let kind = o.kind;
if (kind === 'table') kind = 'tableGroup';
else if (kind === 'dance') kind = 'danceFloor';
return Object.assign({}, o, { kind: kind });
});
}

function getConflicts() {
const tent = byId(TENTS, state.tentId);
const objects = store.getState().objects;
return runAllChecks({ objects: forCollision(objects), aisles: [] }, tent, state.guestCount);
}

function conflictSeverityByItemId(conflicts) {
const map = {};
const rank = { info: 1, warning: 2, error: 3 };
conflicts.forEach(function (c) {
c.objectIds.forEach(function (id) {
if (!map[id] || rank[c.severity] > rank[map[id]]) map[id] = c.severity;
});
});
return map;
}
let view3dMod = null;
let view3dPendingSnapshot = null;

function build3DSnapshot(conflicts) {
const tent = byId(TENTS, state.tentId);
return {
tent: tent,
objects: store.getState().objects,
lightingOn: !!(state.lightingId && state.lightingId !== 'lighting-none'),
selectedId: state.selectedId,
severityMap: conflictSeverityByItemId(conflicts || []),
};
}

function handle3DSelect(itemId) {
state.selectedId = itemId;
refreshAll();
}

function handle3DMove(itemId, x, y) {
store.updateObject(itemId, { x: x, y: y });
}

function mount3D() {
if (view3dMod) return;
import('./js/ui/view3d.js').then(function (mod) {
view3dMod = mod;
const snapshot = view3dPendingSnapshot || build3DSnapshot(getConflicts());
view3dPendingSnapshot = null;
mod.mount($('canvas'), snapshot, { onSelect: handle3DSelect, onMove: handle3DMove });
});
}

function render3D(conflicts) {
const snapshot = build3DSnapshot(conflicts);
if (view3dMod) {
view3dMod.update(snapshot);
} else {
view3dPendingSnapshot = snapshot;
}
}

$('view3dDayNight').addEventListener('click', function () {
if (!view3dMod) return;
const night = view3dMod.toggleDayNight();
this.textContent = night ? 'Switch to Day' : 'Switch to Night';
});

function refreshAll() {
const conflicts = getConflicts();
render3D(conflicts);
renderSelectedPanel();
renderCapacityCheck();
renderLayoutWarnings(conflicts);
renderPricing();
updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
$('btnUndo').disabled = !store.canUndo();
$('btnRedo').disabled = !store.canRedo();
}

function renderSelectedPanel() {
const panel = $('selectedItemPanel');
const removeBtn = $('removeSelected');
const item = store.getState().objects.find(function (i) { return i.id === state.selectedId; });
if (!item) {
panel.textContent = 'Click an item on the layout to select it.';
removeBtn.disabled = true;
return;
}
removeBtn.disabled = false;
if (item.kind === 'dance') {
panel.innerHTML = '<strong>Dance Floor Section</strong><br>' + DANCE_SECTION.ft + 'x' + DANCE_SECTION.ft + ' ft';
} else {
const tableDef = byId(TABLES, item.tableId);
const chairDef = byId(CHAIRS, item.chairId);
const linenDef = item.linenId ? byId(LINENS, item.linenId) : null;
panel.innerHTML = '<strong>' + tableDef.name + '</strong><br>' +
(item.seatCount > 0 ? (item.seatCount + ' seats &mdash; ' + chairDef.name) : 'No seating (cocktail)') +
(linenDef ? ('<br>Linen: ' + linenDef.name) : '');
}
}

function renderCapacityCheck() {
const tent = byId(TENTS, state.tentId);
const objects = store.getState().objects;
const totalSeats = objects.reduce(function (sum, i) { return sum + (i.seatCount || 0); }, 0);
const tableCount = objects.filter(function (i) { return i.kind === 'table'; }).length;

let html = '<div>Guests: <strong>' + state.guestCount + '</strong></div>';
html += '<div>Seats provided: <strong>' + totalSeats + '</strong> (' + tableCount + ' tables)</div>';
html += '<div>Tent: <strong>' + tent.name + '</strong> (fits up to ' + tent.maxGuests.dining + ' dining)</div>';

if (totalSeats < state.guestCount) {
html += '<div class="status-warn">&#9888; Not enough seats yet for your guest count.</div>';
} else if (state.guestCount > tent.maxGuests.dining) {
html += '<div class="status-warn">&#9888; This tent may be too small for ' + state.guestCount + ' guests dining. Consider a larger tent.</div>';
} else {
html += '<div class="status-ok">&#10003; Looks good so far.</div>';
}
$('capacityCheck').innerHTML = html;
}

function renderLayoutWarnings(conflicts) {
const box = $('layoutWarnings');
if (!conflicts || conflicts.length === 0) {
box.innerHTML = '<div class="no-warnings">&#10003; No layout conflicts detected.</div>';
return;
}
const seen = {};
const rows = [];
conflicts.forEach(function (c) {
const key = c.type + '|' + c.message;
if (seen[key]) return;
seen[key] = true;
rows.push('<div class="warning-item severity-' + c.severity + '">' + c.message + '</div>');
});
box.innerHTML = '<div class="warning-list">' + rows.join('') + '</div>';
}
function computeLineItems() {
const tent = byId(TENTS, state.tentId);
const objects = store.getState().objects;
const lines = [{ label: tent.name + ' (tent)', qty: 1, amount: tent.pricePerDay }];

const tableCounts = {};
const chairCounts = {};
const linenCounts = {};
let danceCount = 0;

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
const t = byId(TABLES, tid);
lines.push({ label: t.name, qty: tableCounts[tid], amount: t.pricePerDay * tableCounts[tid] });
});
Object.keys(chairCounts).forEach(function (cid) {
const c = byId(CHAIRS, cid);
lines.push({ label: c.name, qty: chairCounts[cid], amount: c.pricePerDay * chairCounts[cid] });
});
Object.keys(linenCounts).forEach(function (lid) {
const l = byId(LINENS, lid);
lines.push({ label: l.name, qty: linenCounts[lid], amount: l.pricePerDay * linenCounts[lid] });
});
if (danceCount > 0) {
lines.push({ label: DANCE_SECTION.name, qty: danceCount, amount: DANCE_SECTION.pricePerDay * danceCount });
}
if (state.lightingId && state.lightingId !== 'lighting-none') {
const lightOpt = byId(LIGHTING_OPTIONS, state.lightingId);
const price = lightOpt.dynamic ? tentLightingPriceFor(tent) : lightOpt.pricePerDay;
if (price) {
lines.push({ label: lightOpt.name, qty: 1, amount: price });
}
}
return lines;
}

function renderPricing() {
const lines = computeLineItems();
const list = $('priceList');
list.innerHTML = lines.map(function (l) {
return '<div class="row"><span>' + l.label + ' x' + l.qty + '</span><span>' + money(l.amount) + '</span></div>';
}).join('');
const total = lines.reduce(function (sum, l) { return sum + l.amount; }, 0);
$('priceTotal').innerHTML = '<span>Estimated Total / day</span><span>' + money(total) + '</span>';
}
$('btnBackToRecommend').addEventListener('click', function () { showStep('step-recommend'); });
$('btnToReview').addEventListener('click', function () {
const tent = byId(TENTS, state.tentId);
const lines = computeLineItems();
const total = lines.reduce(function (sum, l) { return sum + l.amount; }, 0);
const pkg = state.matchedPackageId ? byId(PACKAGES, state.matchedPackageId) : null;

let html = '<p><strong>Event:</strong> ' + state.eventType + ' &middot; ' + state.guestCount + ' guests &middot; ' + state.spaceType + '</p>';
if (pkg) {
html += '<div class="package-match-note">This setup is similar to our <strong>' + pkg.name + '</strong> package (' + money(pkg.price) + '/day flat, up to ' + pkg.maxGuests + ' guests). Ask Friendly Party Rental about bundled package pricing.</div>';
}
html += '<p><strong>Tent:</strong> ' + tent.name + '</p><ul>';
lines.forEach(function (l) {
html += '<li>' + l.label + ' x' + l.qty + ' &mdash; ' + money(l.amount) + '</li>';
});
html += '</ul><p><strong>Estimated Total: ' + money(total) + ' / day</strong></p>';
$('reviewSummary').innerHTML = html;

const subject = encodeURIComponent('Quote Request: ' + state.eventType + ' for ' + state.guestCount + ' guests');
let body = 'Event type: ' + state.eventType + NL + 'Guests: ' + state.guestCount + NL + 'Location type: ' + state.spaceType + NL + 'Tent: ' + tent.name + NL;
if (pkg) {
body += 'Possible package match: ' + pkg.name + ' (' + money(pkg.price) + '/day, up to ' + pkg.maxGuests + ' guests)' + NL;
}
body += NL + 'Items:' + NL;
lines.forEach(function (l) { body += '- ' + l.label + ' x' + l.qty + ' (' + money(l.amount) + ')' + NL; });
body += NL + 'Estimated Total: ' + money(total) + ' / day' + NL;
$('btnEmailQuote').addEventListener('click', function () {
const name = $('customerName').value;
const email = $('customerEmail').value;
const date = $('customerDate').value;
const fullBody = encodeURIComponent('Name: ' + name + NL + 'Email: ' + email + NL + 'Requested Date: ' + date + NL + NL + body);
this.href = 'mailto:customerservice@friendlypartyrental.com?subject=' + subject + '&body=' + fullBody;
});

showStep('step-review');
});

$('btnBackToDesigner').addEventListener('click', function () { showStep('step-designer'); });

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
