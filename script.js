// Friendly Event Designer - v1 client-side logic
// Pricing below reflects Friendly Party Rental's published per-day pricing
// (see FRIENDLY-EVENT-DESIGNER.md, section 7). Update here if prices change.

import { createLayoutStore } from './js/core/layoutStore.js';
import { runAllChecks } from './js/core/collision.js';

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

const DANCE_SECTION = { id: 'dance-3x3', name: '3x3 Dance Floor Section', pricePerDay: 35.00, ft: 3 };

const state = {
eventType: 'wedding',
guestCount: 50,
spaceType: 'backyard',
needDance: false,
tentId: 'pole-20x40',
chairId: 'plastic-white',
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

function useRecommendedLayout() {
store.reset({ tentId: state.tentId, objects: [], zones: [], aisles: [] });
state.selectedId = null;
const tablesNeeded = Math.ceil(state.guestCount / 8);
for (let i = 0; i < tablesNeeded; i++) { addTable('round-5ft', state.chairId); }
if (state.needDance) {
addDanceFloor(); addDanceFloor(); addDanceFloor(); addDanceFloor();
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
showStep('step-designer');
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

(function buildTableButtons() {
const wrap = $('tableButtons');
TABLES.forEach(function (t) {
const btn = document.createElement('button');
btn.className = 'btn-secondary small';
btn.textContent = '+ Add ' + t.name;
btn.addEventListener('click', function () { addTable(t.id, state.chairId); });
wrap.appendChild(btn);
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

function addTable(tableId, chairId) {
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
};
store.addObject(item);
}

function addDanceFloor() {
const tent = byId(TENTS, state.tentId);
const count = store.getState().objects.filter(function (i) { return i.kind === 'dance'; }).length;
const cols = Math.max(1, Math.floor(tent.widthFt / DANCE_SECTION.ft));
const col = count % cols;
const row = Math.floor(count / cols);
const item = {
id: newItemId(),
kind: 'dance',
widthFt: DANCE_SECTION.ft,
depthFt: DANCE_SECTION.ft,
x: tent.widthFt - (col + 1) * DANCE_SECTION.ft - 2,
y: tent.lengthFt - (row + 1) * DANCE_SECTION.ft - 2,
};
store.addObject(item);
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

let canvasGeom = { scale: 1, offX: 0, offY: 0 };
window.addEventListener('resize', function () { if (document.getElementById('step-designer').classList.contains('active')) { refreshAll(); } });

function refreshAll() {
const conflicts = getConflicts();
renderCanvas(conflicts);
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

function renderCanvas(conflicts) {
const canvas = $('canvas');
canvas.innerHTML = '';
const tent = byId(TENTS, state.tentId);
const cw = canvas.clientWidth || 640;
const ch = canvas.clientHeight || 480;
const pad = 20;
const scale = Math.min((cw - pad * 2) / tent.widthFt, (ch - pad * 2) / tent.lengthFt);
const tentPxW = tent.widthFt * scale;
const tentPxH = tent.lengthFt * scale;
const offX = (cw - tentPxW) / 2;
const offY = (ch - tentPxH) / 2;
canvasGeom = { scale: scale, offX: offX, offY: offY };

const outline = document.createElement('div');
outline.className = 'tent-outline';
outline.style.left = offX + 'px';
outline.style.top = offY + 'px';
outline.style.width = tentPxW + 'px';
outline.style.height = tentPxH + 'px';
canvas.appendChild(outline);

const severityMap = conflictSeverityByItemId(conflicts || []);
store.getState().objects.forEach(function (item) { renderItem(canvas, item, severityMap[item.id]); });
}

function renderItem(canvas, item, severity) {
const g = canvasGeom;
const div = document.createElement('div');
div.className = 'item ' + (item.kind === 'dance' ? 'dance' : (item.shape === 'round' ? 'round' : 'rect'));
if (item.id === state.selectedId) div.classList.add('selected');
if (severity === 'error') div.classList.add('conflict-error');
else if (severity === 'warning') div.classList.add('conflict-warning');
const wPx = item.widthFt * g.scale;
const hPx = item.depthFt * g.scale;
div.style.width = wPx + 'px';
div.style.height = hPx + 'px';
div.style.left = (g.offX + item.x * g.scale) + 'px';
div.style.top = (g.offY + item.y * g.scale) + 'px';
div.dataset.id = item.id;

if (item.kind === 'table') {
div.textContent = item.seatCount > 0 ? (item.seatCount + ' seats') : 'cocktail';
}
canvas.appendChild(div);

if (item.kind === 'table' && item.shape === 'round' && item.seatCount > 0) {
const cx = g.offX + (item.x + item.widthFt / 2) * g.scale;
const cy = g.offY + (item.y + item.depthFt / 2) * g.scale;
const r = (wPx / 2) + Math.max(6, g.scale * 1.0);
for (let i = 0; i < item.seatCount; i++) {
const angle = (i / item.seatCount) * Math.PI * 2;
const dotX = cx + r * Math.cos(angle) - 4;
const dotY = cy + r * Math.sin(angle) - 4;
const dot = document.createElement('div');
dot.className = 'chair-dot';
dot.style.left = dotX + 'px';
dot.style.top = dotY + 'px';
canvas.appendChild(dot);
}
}

attachDrag(div, item);
}

function attachDrag(div, item) {
let dragging = false;
let moved = false;
let startPx = 0, startPy = 0, startX = 0, startY = 0;
let liveX = item.x, liveY = item.y;

div.addEventListener('mousedown', function (e) {
dragging = true;
moved = false;
startPx = e.clientX;
startPy = e.clientY;
startX = item.x;
startY = item.y;
liveX = item.x;
liveY = item.y;
e.preventDefault();
});

window.addEventListener('mousemove', function (e) {
if (!dragging) return;
const dx = e.clientX - startPx;
const dy = e.clientY - startPy;
if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
const g = canvasGeom;
const tent = byId(TENTS, state.tentId);
let newX = startX + dx / g.scale;
let newY = startY + dy / g.scale;
newX = Math.max(0, Math.min(tent.widthFt - item.widthFt, newX));
newY = Math.max(0, Math.min(tent.lengthFt - item.depthFt, newY));
liveX = newX;
liveY = newY;
div.style.left = (g.offX + newX * g.scale) + 'px';
div.style.top = (g.offY + newY * g.scale) + 'px';
});

window.addEventListener('mouseup', function () {
if (!dragging) return;
dragging = false;
if (!moved) {
state.selectedId = item.id;
refreshAll();
} else {
store.updateObject(item.id, { x: liveX, y: liveY });
}
});
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
panel.innerHTML = '<strong>' + tableDef.name + '</strong><br>' +
(item.seatCount > 0 ? (item.seatCount + ' seats &mdash; ' + chairDef.name) : 'No seating (cocktail)');
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
let danceCount = 0;

objects.forEach(function (item) {
if (item.kind === 'table') {
tableCounts[item.tableId] = (tableCounts[item.tableId] || 0) + 1;
if (item.seatCount > 0) {
chairCounts[item.chairId] = (chairCounts[item.chairId] || 0) + item.seatCount;
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
if (danceCount > 0) {
lines.push({ label: DANCE_SECTION.name, qty: danceCount, amount: DANCE_SECTION.pricePerDay * danceCount });
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

let html = '<p><strong>Event:</strong> ' + state.eventType + ' &middot; ' + state.guestCount + ' guests &middot; ' + state.spaceType + '</p>';
html += '<p><strong>Tent:</strong> ' + tent.name + '</p><ul>';
lines.forEach(function (l) {
html += '<li>' + l.label + ' x' + l.qty + ' &mdash; ' + money(l.amount) + '</li>';
});
html += '</ul><p><strong>Estimated Total: ' + money(total) + ' / day</strong></p>';
$('reviewSummary').innerHTML = html;

const subject = encodeURIComponent('Quote Request: ' + state.eventType + ' for ' + state.guestCount + ' guests');
let body = 'Event type: ' + state.eventType + NL + 'Guests: ' + state.guestCount + NL + 'Location type: ' + state.spaceType + NL + 'Tent: ' + tent.name + NL + NL + 'Items:' + NL;
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
byId: byId,
showStep: showStep,
enterDesigner: enterDesigner,
useRecommendedLayout: useRecommendedLayout,
customizeFromScratch: customizeFromScratch,
};
