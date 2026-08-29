// Friendly Event Designer — Intake wizard module
// Walks the customer through event questions, then calls the recommendation
// engine and hands off to the existing designer via window.FriendlyBridge.

import { recommendTents, SEATING_STYLE_OPTIONS } from '../core/recommendation.js';
import { DANCE_FLOOR_SIZES } from '../data/danceFloor.js';

const Bridge = window.FriendlyBridge;

const EVENT_TYPES = [
{ id: 'wedding', label: 'Wedding' },
{ id: 'graduation', label: 'Graduation Party' },
{ id: 'birthday', label: 'Birthday Party' },
{ id: 'corporate', label: 'Corporate Event' },
{ id: 'school', label: 'School Event' },
{ id: 'festival', label: 'Festival' },
{ id: 'community', label: 'Community Event' },
{ id: 'backyard', label: 'Backyard Party' },
{ id: 'anniversary', label: 'Anniversary' },
{ id: 'babyShower', label: 'Baby Shower' },
{ id: 'bridalShower', label: 'Bridal Shower' },
{ id: 'ceremony', label: 'Ceremony' },
{ id: 'other', label: 'Other' },
];

const SEATING_STYLE_CARDS = [
{ id: SEATING_STYLE_OPTIONS.DINING, label: 'Dinner at Tables', hint: 'Guests seated at round or banquet tables for a meal.' },
{ id: SEATING_STYLE_OPTIONS.CEREMONY, label: 'Ceremony Rows', hint: 'Rows of chairs facing forward, like a wedding ceremony.' },
{ id: SEATING_STYLE_OPTIONS.COCKTAIL, label: 'Cocktail / Mostly Standing', hint: 'Standing room with a few cocktail tables.' },
{ id: SEATING_STYLE_OPTIONS.MIXED, label: 'Mixed Seating', hint: 'A mix of seated and standing areas.' },
{ id: SEATING_STYLE_OPTIONS.NOT_SURE, label: 'Not Sure', hint: "We will plan around a flexible layout." },
];

const FEATURES = [
{ id: 'danceFloor', label: 'Dance Floor' },
{ id: 'dj', label: 'DJ' },
{ id: 'band', label: 'Live Band' },
{ id: 'buffet', label: 'Buffet' },
{ id: 'bar', label: 'Bar' },
{ id: 'cocktailTables', label: 'Cocktail Tables' },
{ id: 'cakeTable', label: 'Cake Table' },
{ id: 'giftTable', label: 'Gift Table' },
{ id: 'photoBooth', label: 'Photo Booth' },
{ id: 'stage', label: 'Stage' },
{ id: 'lounge', label: 'Lounge Area' },
{ id: 'catering', label: 'Catering / Service Area' },
];
const FEATURE_NONE = 'none';
const FEATURE_NOT_SURE = 'notSure';

const LOCATION_TYPES = [
{ id: 'backyard', label: 'Backyard' },
{ id: 'venue', label: 'Venue' },
{ id: 'park', label: 'Park' },
{ id: 'lot', label: 'Parking Lot' },
{ id: 'indoor', label: 'Indoor Space' },
{ id: 'other', label: 'Other' },
];

const SURFACE_TYPES = [
{ id: 'grass', label: 'Grass' },
{ id: 'dirt', label: 'Dirt / Gravel' },
{ id: 'asphalt', label: 'Asphalt' },
{ id: 'concrete', label: 'Concrete' },
{ id: 'deck', label: 'Deck / Patio' },
{ id: 'indoor', label: 'Indoor Floor' },
{ id: 'notSure', label: 'Not Sure' },
];

const STEP_ORDER = ['eventType', 'guestCount', 'seatingStyle', 'features', 'danceFloorSize', 'location'];

const wiz = {
eventType: null,
guestCount: 50,
seatingStyle: null,
features: [],
danceFloorSizeId: '18x18',
customDanceFloorFt: null,
spaceType: null,
surfaceType: null,
};

let stepIndex = 0;
const stepHistory = [];

function money(n) { return '$' + n.toFixed(2); }

function el(tag, className, text) {
const node = document.createElement(tag);
if (className) node.className = className;
if (text != null) node.textContent = text;
return node;
}

function needsDanceFloorStep() {
return wiz.features.indexOf('danceFloor') !== -1;
}

function goToStep(index) {
stepHistory.push(stepIndex);
stepIndex = index;
if (STEP_ORDER[stepIndex] === 'danceFloorSize' && !needsDanceFloorStep()) {
stepIndex += 1;
}
render();
}

function nextStep() {
goToStep(stepIndex + 1);
}

function backStep() {
if (stepHistory.length) {
stepIndex = stepHistory.pop();
} else if (stepIndex > 0) {
stepIndex -= 1;
}
render();
}

function render() {
const root = document.getElementById('intakeWizard');
root.innerHTML = '';
if (stepIndex >= STEP_ORDER.length) {
computeAndShowRecommendations();
return;
}
const name = STEP_ORDER[stepIndex];
const progress = el('div', 'wizard-progress', 'Step ' + (stepIndex + 1) + ' of ' + STEP_ORDER.length);
root.appendChild(progress);

if (name === 'eventType') root.appendChild(renderEventTypeStep());
else if (name === 'guestCount') root.appendChild(renderGuestCountStep());
else if (name === 'seatingStyle') root.appendChild(renderSeatingStyleStep());
else if (name === 'features') root.appendChild(renderFeaturesStep());
else if (name === 'danceFloorSize') root.appendChild(renderDanceFloorSizeStep());
else if (name === 'location') root.appendChild(renderLocationStep());
}

function renderNav(container, opts) {
const nav = el('div', 'wizard-nav');
if (stepIndex > 0) {
const back = el('button', 'btn-link', 'Back');
back.type = 'button';
back.addEventListener('click', backStep);
nav.appendChild(back);
}
const next = el('button', 'btn-primary', opts && opts.nextLabel ? opts.nextLabel : 'Continue');
next.type = 'button';
next.addEventListener('click', function () {
if (opts && opts.isLast) {
computeAndShowRecommendations();
} else {
nextStep();
}
});
nav.appendChild(next);
container.appendChild(nav);
}

function renderEventTypeStep() {
const wrap = el('div', 'wizard-step');
wrap.appendChild(el('h2', null, 'What are you planning?'));
const grid = el('div', 'event-type-grid');
EVENT_TYPES.forEach(function (opt) {
const card = el('button', 'option-card' + (wiz.eventType === opt.id ? ' selected' : ''), opt.label);
card.type = 'button';
card.addEventListener('click', function () {
wiz.eventType = opt.id;
nextStep();
});
grid.appendChild(card);
});
wrap.appendChild(grid);
renderNav(wrap, { nextLabel: 'Continue' });
return wrap;
}

function renderGuestCountStep() {
const wrap = el('div', 'wizard-step');
wrap.appendChild(el('h2', null, 'How many guests are you expecting?'));
const field = el('div', 'field');
const input = document.createElement('input');
input.type = 'number';
input.min = '1';
input.max = '1000';
input.value = String(wiz.guestCount);
input.className = 'guest-count-input';
input.addEventListener('input', function () {
wiz.guestCount = Math.max(1, parseInt(input.value, 10) || 1);
});
field.appendChild(input);
wrap.appendChild(field);
renderNav(wrap);
return wrap;
}

function renderSeatingStyleStep() {
const wrap = el('div', 'wizard-step');
wrap.appendChild(el('h2', null, 'How will guests be seated?'));
const grid = el('div', 'option-grid');
SEATING_STYLE_CARDS.forEach(function (opt) {
const card = el('button', 'option-card' + (wiz.seatingStyle === opt.id ? ' selected' : ''));
card.type = 'button';
card.appendChild(el('div', 'option-card-title', opt.label));
card.appendChild(el('div', 'option-card-hint', opt.hint));
card.addEventListener('click', function () {
wiz.seatingStyle = opt.id;
nextStep();
});
grid.appendChild(card);
});
wrap.appendChild(grid);
renderNav(wrap);
return wrap;
}

function toggleFeature(id) {
const idx = wiz.features.indexOf(id);
if (id === FEATURE_NONE || id === FEATURE_NOT_SURE) {
wiz.features = idx === -1 ? [id] : [];
return;
}
if (idx !== -1) {
wiz.features.splice(idx, 1);
} else {
wiz.features = wiz.features.filter(function (f) { return f !== FEATURE_NONE && f !== FEATURE_NOT_SURE; });
wiz.features.push(id);
}
}

function renderFeaturesStep() {
const wrap = el('div', 'wizard-step');
wrap.appendChild(el('h2', null, 'What else is part of your event?'));
wrap.appendChild(el('p', 'wizard-subtext', 'Select all that apply, this helps us leave room under the tent.'));
const grid = el('div', 'feature-grid');
FEATURES.forEach(function (opt) {
const chip = el('button', 'feature-chip' + (wiz.features.indexOf(opt.id) !== -1 ? ' selected' : ''), opt.label);
chip.type = 'button';
chip.addEventListener('click', function () {
toggleFeature(opt.id);
render();
});
grid.appendChild(chip);
});
const noneChip = el('button', 'feature-chip' + (wiz.features.indexOf(FEATURE_NONE) !== -1 ? ' selected' : ''), 'None of These');
noneChip.type = 'button';
noneChip.addEventListener('click', function () { toggleFeature(FEATURE_NONE); render(); });
grid.appendChild(noneChip);
const notSureChip = el('button', 'feature-chip' + (wiz.features.indexOf(FEATURE_NOT_SURE) !== -1 ? ' selected' : ''), 'Not Sure Yet');
notSureChip.type = 'button';
notSureChip.addEventListener('click', function () { toggleFeature(FEATURE_NOT_SURE); render(); });
grid.appendChild(notSureChip);
wrap.appendChild(grid);
renderNav(wrap);
return wrap;
}

function renderDanceFloorSizeStep() {
const wrap = el('div', 'wizard-step');
wrap.appendChild(el('h2', null, 'What size dance floor would you like?'));
const grid = el('div', 'option-grid');
DANCE_FLOOR_SIZES.forEach(function (size) {
const card = el('button', 'option-card' + (wiz.danceFloorSizeId === size.id ? ' selected' : ''), size.ft + ' x ' + size.ft + ' ft');
card.type = 'button';
card.addEventListener('click', function () {
wiz.danceFloorSizeId = size.id;
wiz.customDanceFloorFt = null;
render();
});
grid.appendChild(card);
});
const customCard = el('button', 'option-card' + (wiz.danceFloorSizeId === 'custom' ? ' selected' : ''), 'Custom Size');
customCard.type = 'button';
customCard.addEventListener('click', function () {
wiz.danceFloorSizeId = 'custom';
render();
});
grid.appendChild(customCard);
wrap.appendChild(grid);
if (wiz.danceFloorSizeId === 'custom') {
const field = el('div', 'field');
field.appendChild(el('label', null, 'Custom size (feet per side)'));
const input = document.createElement('input');
input.type = 'number';
input.min = '6';
input.max = '60';
input.value = wiz.customDanceFloorFt ? String(wiz.customDanceFloorFt) : '';
input.addEventListener('input', function () {
wiz.customDanceFloorFt = parseInt(input.value, 10) || null;
});
field.appendChild(input);
wrap.appendChild(field);
}
renderNav(wrap);
return wrap;
}

function renderLocationStep() {
const wrap = el('div', 'wizard-step');
wrap.appendChild(el('h2', null, 'Where will the event take place?'));
const grid = el('div', 'option-grid');
LOCATION_TYPES.forEach(function (opt) {
const card = el('button', 'option-card' + (wiz.spaceType === opt.id ? ' selected' : ''), opt.label);
card.type = 'button';
card.addEventListener('click', function () {
wiz.spaceType = opt.id;
render();
});
grid.appendChild(card);
});
wrap.appendChild(grid);

wrap.appendChild(el('h3', null, 'What surface will the tent sit on?'));
const surfaceGrid = el('div', 'option-grid');
SURFACE_TYPES.forEach(function (opt) {
const card = el('button', 'option-card small' + (wiz.surfaceType === opt.id ? ' selected' : ''), opt.label);
card.type = 'button';
card.addEventListener('click', function () {
wiz.surfaceType = opt.id;
render();
});
surfaceGrid.appendChild(card);
});
wrap.appendChild(surfaceGrid);

renderNav(wrap, { nextLabel: 'See My Recommendations', isLast: true });
return wrap;
}

function computeAndShowRecommendations() {
const result = recommendTents({
guestCount: wiz.guestCount,
seatingStyle: wiz.seatingStyle || SEATING_STYLE_OPTIONS.NOT_SURE,
features: wiz.features,
surfaceType: wiz.surfaceType || 'notSure',
danceFloorSizeId: wiz.danceFloorSizeId,
customDanceFloorFt: wiz.customDanceFloorFt,
});

Bridge.state.eventType = wiz.eventType || 'other';
Bridge.state.guestCount = wiz.guestCount;
Bridge.state.spaceType = wiz.spaceType || 'other';
Bridge.state.needDance = wiz.features.indexOf('danceFloor') !== -1;
Bridge.state.danceFloorSizeId = wiz.danceFloorSizeId;
Bridge.state.customDanceFloorFt = wiz.customDanceFloorFt;

renderRecommendations(result);
Bridge.showStep('step-recommend');
}

function capacityLabel(key) {
if (key === 'ceremonyRows') return 'ceremony seats';
if (key === 'cocktail') return 'cocktail guests';
return 'dining guests';
}

function tentCard(title, entry, capacityKey, badgeClass) {
const card = el('div', 'recommend-card ' + badgeClass);
card.appendChild(el('div', 'recommend-card-badge', title));
card.appendChild(el('h3', null, entry.tent.name));
card.appendChild(el('div', 'recommend-card-meta', entry.tent.widthFt + ' x ' + entry.tent.lengthFt + ' ft - ' + money(entry.tent.pricePerDay) + '/day'));
card.appendChild(el('div', 'recommend-card-capacity', 'Fits up to ' + entry.tent.capacity[capacityKey] + ' ' + capacityLabel(capacityKey)));
if (entry.note && entry.note.message) {
card.appendChild(el('div', 'recommend-card-note note-' + entry.note.level, entry.note.message));
}
if (entry.caution) {
card.appendChild(el('div', 'recommend-card-note note-warning', entry.caution));
}
if (entry.benefit) {
card.appendChild(el('div', 'recommend-card-note note-info', entry.benefit));
}
const useBtn = el('button', 'btn-primary', 'Use This Layout');
useBtn.type = 'button';
useBtn.addEventListener('click', function () {
Bridge.state.tentId = entry.tent.id;
Bridge.useRecommendedLayout();
});
card.appendChild(useBtn);
return card;
}

function renderRecommendations(result) {
const root = document.getElementById('recommendWizard');
root.innerHTML = '';
root.appendChild(el('h2', null, 'Recommended Starting Setup'));

if (result.warnings && result.warnings.length) {
result.warnings.forEach(function (w) {
root.appendChild(el('div', 'recommend-warning', w.message));
});
}

const grid = el('div', 'recommend-grid');
if (result.tighter) grid.appendChild(tentCard('TIGHTER FIT', result.tighter, result.capacityKey, 'tighter'));
if (result.recommended) grid.appendChild(tentCard('RECOMMENDED', result.recommended, result.capacityKey, 'recommended'));
if (result.moreSpacious) grid.appendChild(tentCard('MORE SPACIOUS', result.moreSpacious, result.capacityKey, 'spacious'));
root.appendChild(grid);

const row = el('div', 'button-row');
const customizeBtn = el('button', 'btn-secondary', 'Customize From Scratch');
customizeBtn.type = 'button';
customizeBtn.addEventListener('click', function () {
const fallback = result.recommended || result.moreSpacious || result.tighter;
if (fallback) Bridge.state.tentId = fallback.tent.id;
Bridge.customizeFromScratch();
});
row.appendChild(customizeBtn);

const backBtn = el('button', 'btn-link', 'Back to Questions');
backBtn.type = 'button';
backBtn.addEventListener('click', function () {
Bridge.showStep('step-intake');
});
row.appendChild(backBtn);

root.appendChild(row);
}

render();
