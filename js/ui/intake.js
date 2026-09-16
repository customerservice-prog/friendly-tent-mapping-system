// Friendly Event Designer — Intake wizard module
// Walks the customer through the Guided Event Studio experience, then calls
// the recommendation engine and hands off to the existing designer via
// window.FriendlyBridge.

import { recommendTents, SEATING_STYLE_OPTIONS } from '../core/recommendation.js';
import { DANCE_FLOOR_SIZES } from '../data/danceFloor.js';
import { suggestPackage } from '../data/packages.js';
import * as plan2dMod from './plan2d.js';
import { resolveAnchoringMethod } from '../data/tentStructure.js';

let Bridge = window.FriendlyBridge;

const EVENT_TYPES = [
  { id: 'wedding', label: 'Wedding', icon: '<circle cx="9" cy="14" r="5"/><circle cx="15" cy="14" r="5"/>' },
  { id: 'graduation', label: 'Graduation Party', icon: '<path d="M12 4 2 9l10 5 10-5-10-5Z"/><path d="M6 11.5V17c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5"/>' },
  { id: 'birthday', label: 'Birthday Party', icon: '<path d="M4 20h16v-5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v5Z"/><path d="M12 9V6"/>' },
  { id: 'corporate', label: 'Corporate Event', icon: '<rect x="3" y="8" width="18" height="11" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' },
  { id: 'school', label: 'School Event', icon: '<path d="M4 10 12 5l8 5"/><rect x="5" y="10" width="14" height="9"/>' },
  { id: 'festival', label: 'Festival', icon: '<path d="M6 3v18"/><path d="M6 4h11l-4 4 4 4H6"/>' },
  { id: 'community', label: 'Community Event', icon: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/>' },
  { id: 'backyard', label: 'Backyard Party', icon: '<path d="M12 3 7 11h3l-4 6h4v4h4v-4h4l-4-6h3L12 3Z"/>' },
  { id: 'anniversary', label: 'Anniversary', icon: '<path d="M12 20s-7-4.4-9.3-8.8C1.4 8 5.7 5 9 8c2 2 3 4 3 4"/>' },
  { id: 'babyShower', label: 'Baby Shower', icon: '<rect x="9" y="8" width="6" height="12" rx="2"/><rect x="10" y="4" width="4" height="4"/>' },
  { id: 'bridalShower', label: 'Bridal Shower', icon: '<circle cx="12" cy="12" r="2.4"/><circle cx="12" cy="6" r="2"/><circle cx="12" cy="18" r="2"/>' },
  { id: 'ceremony', label: 'Ceremony', icon: '<path d="M5 20V11a7 7 0 0 1 14 0v9"/><path d="M5 20h14"/>' },
  { id: 'other', label: 'Other', icon: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>' },
  ];

const SEATING_STYLE_CARDS = [
  { id: SEATING_STYLE_OPTIONS.DINING, label: 'Dinner at Tables', hint: 'Guests seated at round or banquet tables for a meal.', visual: '<circle cx="32" cy="22" r="10"/><circle cx="32" cy="6" r="2.2"/><circle cx="45" cy="12" r="2.2"/><circle cx="49" cy="24" r="2.2"/><circle cx="45" cy="34" r="2.2"/><circle cx="32" cy="40" r="2.2"/><circle cx="19" cy="34" r="2.2"/><circle cx="15" cy="24" r="2.2"/><circle cx="19" cy="12" r="2.2"/>' },
  { id: SEATING_STYLE_OPTIONS.CEREMONY, label: 'Ceremony Rows', hint: 'Rows of chairs facing forward, like a wedding ceremony.', visual: '<rect x="27" y="3" width="10" height="6" rx="1"/><rect x="8" y="16" width="6" height="4" rx="1"/><rect x="17" y="16" width="6" height="4" rx="1"/><rect x="41" y="16" width="6" height="4" rx="1"/><rect x="50" y="16" width="6" height="4" rx="1"/><rect x="8" y="26" width="6" height="4" rx="1"/><rect x="17" y="26" width="6" height="4" rx="1"/><rect x="41" y="26" width="6" height="4" rx="1"/><rect x="50" y="26" width="6" height="4" rx="1"/><rect x="8" y="36" width="6" height="4" rx="1"/><rect x="17" y="36" width="6" height="4" rx="1"/><rect x="41" y="36" width="6" height="4" rx="1"/><rect x="50" y="36" width="6" height="4" rx="1"/>' },
  { id: SEATING_STYLE_OPTIONS.COCKTAIL, label: 'Cocktail / Mostly Standing', hint: 'Standing room with a few cocktail tables.', visual: '<circle cx="18" cy="16" r="5"/><circle cx="44" cy="14" r="5"/><circle cx="30" cy="34" r="5"/>' },
  { id: SEATING_STYLE_OPTIONS.MIXED, label: 'Mixed Seating', hint: 'A mix of seated and standing areas.', visual: '<circle cx="16" cy="24" r="8"/><circle cx="16" cy="10" r="2"/><circle cx="27" cy="17" r="2"/><circle cx="27" cy="31" r="2"/><circle cx="16" cy="38" r="2"/><circle cx="5" cy="31" r="2"/><circle cx="5" cy="17" r="2"/><circle cx="46" cy="16" r="4.5"/><circle cx="46" cy="34" r="4.5"/>' },
  { id: SEATING_STYLE_OPTIONS.NOT_SURE, label: 'Not Sure', hint: 'We will plan around a flexible layout.', visual: '<rect x="6" y="8" width="52" height="32" rx="6" stroke-dasharray="4 4"/><circle cx="26" cy="24" r="1.8" fill="currentColor" stroke="none"/><circle cx="32" cy="24" r="1.8" fill="currentColor" stroke="none"/><circle cx="38" cy="24" r="1.8" fill="currentColor" stroke="none"/>' },
  ];

const FEATURES = [
  { id: 'danceFloor', label: 'Dance Floor', icon: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 12h18M12 3v18"/>' },
  { id: 'dj', label: 'DJ', icon: '<path d="M4 15v-3a8 8 0 1 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>' },
  { id: 'band', label: 'Live Band', icon: '<circle cx="8" cy="17" r="3"/><path d="M11 17V4l7-2v13"/><circle cx="18" cy="15" r="3"/>' },
  { id: 'buffet', label: 'Buffet', icon: '<path d="M4 15a8 8 0 0 1 16 0"/><path d="M2 15h20"/><path d="M12 4v3"/>' },
  { id: 'bar', label: 'Bar', icon: '<path d="M5 4h14l-7 8v7"/><path d="M9 19h6"/>' },
  { id: 'cocktailTables', label: 'Cocktail Tables', icon: '<ellipse cx="12" cy="6" rx="6" ry="2.4"/><path d="M12 8.4V19"/><path d="M8 19h8"/>' },
  { id: 'cakeTable', label: 'Cake Table', icon: '<path d="M4 20h16v-5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v5Z"/><path d="M12 9V6"/><path d="M12 13v4"/>' },
  { id: 'giftTable', label: 'Gift Table', icon: '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M4 9h16M12 9v11"/><path d="M8 9c0-2 1-4 4-4s4 2 4 4"/>' },
  { id: 'photoBooth', label: 'Photo Booth', icon: '<rect x="3" y="7" width="18" height="12" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 7l1.5-2h5L16 7"/>' },
  { id: 'stage', label: 'Stage', icon: '<path d="M4 19V9a8 8 0 0 1 16 0v10"/><path d="M4 19h16"/>' },
  { id: 'lounge', label: 'Lounge Area', icon: '<path d="M4 18v-4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M4 18h16"/><path d="M6 12V9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3"/>' },
  { id: 'catering', label: 'Catering / Service Area', icon: '<path d="M6 21h12"/><path d="M8 21v-6"/><path d="M16 21v-6"/><path d="M6 9a4 4 0 0 1 4-4 3 3 0 0 1 4 0 4 4 0 0 1 4 4c0 2-1.5 3-2 6H8c-.5-3-2-4-2-6Z"/>' },
  ];
const FEATURE_NONE = 'none';
const FEATURE_NOT_SURE = 'notSure';

const LOCATION_TYPES = [
  { id: 'backyard', label: 'Backyard', icon: '<path d="M4 11 12 4l8 7"/><path d="M6 10v9h4v-5h4v5h4v-9"/>' },
  { id: 'venue', label: 'Venue', icon: '<path d="M4 9h16"/><path d="M6 9V6l6-3 6 3v3"/><rect x="6" y="9" width="3" height="9"/><rect x="10.5" y="9" width="3" height="9"/><rect x="15" y="9" width="3" height="9"/><path d="M4 18h16"/>' },
  { id: 'park', label: 'Park', icon: '<path d="M12 3 7 11h3l-4 6h4v4h4v-4h4l-4-6h3L12 3Z"/>' },
  { id: 'lot', label: 'Parking Lot', icon: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 16V8h3.5a2.5 2.5 0 0 1 0 5H9"/>' },
  { id: 'indoor', label: 'Indoor Space', icon: '<rect x="4" y="9" width="16" height="11"/><path d="M4 9 12 3l8 6"/>' },
  { id: 'other', label: 'Other', icon: '<path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="9" r="2.4"/>' },
  ];

const SURFACE_TYPES = [
  { id: 'grass', label: 'Grass', icon: '<path d="M4 20v-6c0-2 1-3 2-3s2 1 2 3v6"/><path d="M10 20v-8c0-2 1-3 2-3s2 1 2 3v8"/><path d="M16 20v-6c0-2 1-3 2-3s2 1 2 3v6"/>' },
  { id: 'dirt', label: 'Dirt / Gravel', icon: '<circle cx="7" cy="14" r="1.5"/><circle cx="12" cy="10" r="1.5"/><circle cx="17" cy="15" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="19" r="1.5"/><circle cx="12" cy="16" r="1.5"/>' },
  { id: 'asphalt', label: 'Asphalt', icon: '<rect x="3" y="8" width="18" height="8" rx="1"/><path d="M7 12h2M12 12h2M17 12h2"/>' },
  { id: 'concrete', label: 'Concrete', icon: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 12h16M12 4v16"/>' },
  { id: 'deck', label: 'Deck / Patio', icon: '<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M4 9h16M4 13h16M4 17h16"/>' },
  { id: 'indoor', label: 'Indoor Floor', icon: '<rect x="4" y="4" width="16" height="16"/><path d="M4 10h16M4 16h16M10 4v16M16 4v16"/>' },
  { id: 'notSure', label: 'Not Sure', icon: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.8.5-1 1-1 2.2"/><path d="M12 17.5h.01"/>' },
  ];

// Functional order: Space now comes before Extras so it matches the Guided
// Event Studio's conceptual stage order (Occasion, Guests, Seating, Space,
// Extras, Your Plan).
const STEP_ORDER = ['eventType', 'guestCount', 'seatingStyle', 'location', 'features', 'danceFloorSize'];

// Semantic stage grouping for the left-rail progress list and the persistent
// "Your Event" brief. Multiple functional steps can share one human stage
// (features + danceFloorSize both read as "Extras").
const STAGE_DEFS = [
  { key: 'occasion', label: 'Occasion', steps: ['eventType'] },
  { key: 'guests', label: 'Guests', steps: ['guestCount'] },
  { key: 'seating', label: 'Seating', steps: ['seatingStyle'] },
  { key: 'space', label: 'Space', steps: ['location'] },
  { key: 'extras', label: 'Extras', steps: ['features', 'danceFloorSize'] },
  ];

const wiz = {
  eventType: null,
  guestCount: 50,
  seatingStyle: null,
  features: [],
  danceFloorSizeId: '18x18',
  customDanceFloorFt: null,
  spaceType: null,
  surfaceType: null,
  spaceWidthFt: null,
  spaceLengthFt: null,
};

let stepIndex = 0;
const stepHistory = []; let briefFinalMode = false;

function money(n) { return '$' + n.toFixed(2); }

function moneyOrAsk(n) { return (n === null || n === undefined) ? 'Ask for pricing' : money(n); }

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function needsDanceFloorStep() {
  return wiz.features.indexOf('danceFloor') !== -1;
}


   function iconSvg(inner) {
     const wrapper = document.createElement('span');
     wrapper.className = 'icon';
     wrapper.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
     return wrapper;
   }
function seatVisualSvg(inner) {
  const wrapper = document.createElement('span');
  wrapper.className = 'seat-visual';
  wrapper.innerHTML = '<svg viewBox="0 0 64 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  return wrapper;
}
function packageCategoryForEventType(eventType) {
  if (eventType === 'wedding' || eventType === 'ceremony' || eventType === 'bridalShower') return 'wedding';
  if (eventType === 'graduation') return 'graduation';
  if (eventType === 'corporate') return 'corporate';
  if (eventType === 'backyard') return 'backyard';
  return null;
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

// ---------- Semantic stage helpers (progress list + persistent brief) ----------

function stageForStepName(name) {
  return STAGE_DEFS.filter(function (s) { return s.steps.indexOf(name) !== -1; })[0] || null;
}

function stageFirstStepIndex(stage) {
  return STEP_ORDER.indexOf(stage.steps[0]);
}

function eventTypeLabel(id) {
  const found = EVENT_TYPES.filter(function (o) { return o.id === id; })[0];
  return found ? found.label : null;
}

function seatingStyleLabel(id) {
  const found = SEATING_STYLE_CARDS.filter(function (o) { return o.id === id; })[0];
  return found ? found.label : null;
}

function locationLabel(id) {
  const found = LOCATION_TYPES.filter(function (o) { return o.id === id; })[0];
  return found ? found.label : null;
}

function surfaceLabel(id) {
  const found = SURFACE_TYPES.filter(function (o) { return o.id === id; })[0];
  return found ? found.label : null;
}

function isStageDone(stage) { const lastStepName = stage.steps[stage.steps.length - 1]; const lastIndex = STEP_ORDER.indexOf(lastStepName); return stepIndex > lastIndex; } function briefValueForStage(stageKey, final) { const stageDef = STAGE_DEFS.filter(function (s) { return s.key === stageKey; })[0]; if (stageDef && !briefFinalMode && !isStageDone(stageDef)) return null;
  if (stageKey === 'occasion') return wiz.eventType ? eventTypeLabel(wiz.eventType) : null;
  if (stageKey === 'guests') return wiz.guestCount ? (wiz.guestCount + ' guests') : null;
  if (stageKey === 'seating') return wiz.seatingStyle ? seatingStyleLabel(wiz.seatingStyle) : null;
  if (stageKey === 'space') {
    const bits = [];
    if (wiz.spaceType) bits.push(locationLabel(wiz.spaceType));
    if (wiz.surfaceType) bits.push(surfaceLabel(wiz.surfaceType));
    return bits.length ? bits.join(' · ') : null;
  }
  if (stageKey === 'extras') {
    if (!wiz.features.length) return null;
    const real = wiz.features.filter(function (f) { return f !== FEATURE_NONE && f !== FEATURE_NOT_SURE; });
    if (!real.length) return null;
    const labels = real.map(function (id) {
      const found = FEATURES.filter(function (f) { return f.id === id; })[0];
      return found ? found.label : id;
    });
    return labels.join(' · ');
  }
  return null;
}

function renderProgress(container) {
  const nav = el('nav', 'studio-progress');
  nav.setAttribute('aria-label', 'Event planning progress');
  const currentStepName = STEP_ORDER[stepIndex];
  const currentStage = stageForStepName(currentStepName);
  STAGE_DEFS.forEach(function (stage) {
    const firstIndex = stageFirstStepIndex(stage);
    const isActive = currentStage && currentStage.key === stage.key;
    const isDone = !isActive && firstIndex < stepIndex;
    const value = briefValueForStage(stage.key);
    const item = el('button', 'studio-progress-item' + (isDone ? ' is-done' : '') + (isActive ? ' is-active' : '')); item.setAttribute('aria-current', isActive ? 'step' : 'false');
    item.type = 'button';
    if (isDone) {
      item.classList.add('is-clickable');
      item.addEventListener('click', function () { goToStep(firstIndex); });
    } else {
      item.disabled = true;
    }
    if (isDone) {
      item.appendChild(el('span', 'check', '✓'));
    } else {
      item.appendChild(el('span', 'dot', null));
    }
    item.appendChild(el('span', 'label', stage.label));
    if (isDone && value) item.appendChild(el('span', 'value', value));
    nav.appendChild(item);
  });
  const planItem = el('div', 'studio-progress-item is-upcoming');
  planItem.appendChild(el('span', 'dot', null));
  planItem.appendChild(el('span', 'label', 'Your Plan'));
  nav.appendChild(planItem);
  container.appendChild(nav);
}

// Final, all-done variant of the progress rail used on the "Your Plan"
// recommendation screen: every stage reads as complete (with its chosen
// value) and clicking one jumps back into the wizard at that stage so the
// customer can revise a decision without losing anything else.
function renderFinalProgress(container) {
  const nav = el('nav', 'studio-progress');
  nav.setAttribute('aria-label', 'Event planning progress');
  STAGE_DEFS.forEach(function (stage) {
    const value = briefValueForStage(stage.key);
    const item = el('button', 'studio-progress-item is-done is-clickable');
    item.type = 'button';
    item.appendChild(el('span', 'check', '✓'));
    item.appendChild(el('span', 'label', stage.label));
    if (value) item.appendChild(el('span', 'value', value));
    item.addEventListener('click', function () {
      Bridge.showStep('step-intake');
      goToStep(stageFirstStepIndex(stage));
    });
    nav.appendChild(item);
  });
  const planItem = el('div', 'studio-progress-item is-active');
  planItem.appendChild(el('span', 'dot', null));
  planItem.appendChild(el('span', 'label', 'Your Plan'));
  nav.appendChild(planItem);
  container.appendChild(nav);
}

function renderBrief(container, final) {
  const brief = el('div', 'studio-brief');
  STAGE_DEFS.forEach(function (stage) {
    const value = briefValueForStage(stage.key);
    if (!value) return;
    brief.appendChild(el('span', 'studio-brief-chip', value));
  });
  container.appendChild(brief);
}

// ---------- Event Stage (right panel) — REAL renderer, honest, state-driven ----------
// Uses the actual RentSketch 2D scene renderer (js/ui/plan2d.js) so the guided
// flow shows the same tent geometry, pole layout, and anchoring visuals as the
// real designer instead of a fake CSS placeholder. Before the customer reaches
// the Guests step, the neutral internal guest-count baseline (50, matching the
// rest of the app's default) only sizes the ambient tent shape and is never
// displayed as if the customer chose it -- see currentStageGuestCount().

function currentStageGuestCount() {
    const guestsStepIndex = STEP_ORDER.indexOf('guestCount');
    if (briefFinalMode || stepIndex > guestsStepIndex) return wiz.guestCount;
    if (stepIndex === guestsStepIndex) return wiz.guestCount;
    return null;
}

function previewTentEntry() {
    if (!wiz.eventType) return null;
    const gc = currentStageGuestCount() || 50;
    const result = recommendTents({
          guestCount: gc,
          seatingStyle: wiz.seatingStyle || SEATING_STYLE_OPTIONS.NOT_SURE,
          features: wiz.features,
          surfaceType: wiz.surfaceType || 'notSure',
          danceFloorSizeId: wiz.danceFloorSizeId,
          customDanceFloorFt: wiz.customDanceFloorFt,
    });
    return result.recommended || result.moreSpacious || result.tighter || null;
}

function buildPreviewSnapshot(entry) {
    const tent = entry.tent;
    return {
          tent: tent,
          anchoringMethod: resolveAnchoringMethod(tent.type, wiz.surfaceType || 'notSure'),
          objects: [],
          lightingOn: false,
          lightingId: 'lighting-none',
          selectedId: null,
          severityMap: {},
    };
}

function buildStageOverlayNodes() {
    const nodes = [];
    const occLabel = eventTypeLabel(wiz.eventType);
    nodes.push(el('div', 'studio-stage-occasion-label', occLabel));
    const gc = currentStageGuestCount();
    if (gc) {
          nodes.push(el('div', 'studio-stage-caption', 'Planning for ' + gc + ' guests'));
    } else {
          const occWords = occLabel.toLowerCase();
          nodes.push(el('div', 'studio-stage-caption', "Let's build your starting " + occWords + ' layout.'));
    }
    const chipsWrap = el('div', 'studio-stage-chips');
    STAGE_DEFS.forEach(function (s) {
          if (s.key === 'occasion') return;
          const value = briefValueForStage(s.key);
          if (!value) return;
          chipsWrap.appendChild(el('span', 'studio-stage-chip', value));
    });
    if (chipsWrap.childNodes.length) nodes.push(chipsWrap);
    return nodes;
}

function renderStageVisual(container) {
    const stage = el('div', 'studio-stage-inner');
    const hasOccasion = !!wiz.eventType;
    if (!hasOccasion) {
          const empty = el('div', 'studio-stage-empty');
          empty.appendChild(el('h3', null, 'Your event starts here'));
          empty.appendChild(el('p', null, "Answer a few quick questions and we'll build your starting plan."));
          stage.appendChild(empty);
          container.appendChild(stage);
          return;
    }

    stage.classList.add('has-visual');
  container.classList.add('studio-stage--visual');

    const visual = el('div', 'studio-stage-visual');
    stage.appendChild(visual);

    const overlay = el('div', 'studio-stage-overlay');
    buildStageOverlayNodes().forEach(function (n) { overlay.appendChild(n); });
    stage.appendChild(overlay);

    container.appendChild(stage);

    const entry = previewTentEntry();
    if (entry) {
          plan2dMod.mount(visual, buildPreviewSnapshot(entry), {});
    }
}

function refreshStagePanel() {
    var stageHost = document.querySelector('#intakeWizard .studio-stage');
    if (!stageHost) return;
    var visual = stageHost.querySelector('.studio-stage-visual');
    var entry = previewTentEntry();
    if (visual && entry) {
          plan2dMod.update(buildPreviewSnapshot(entry));
    }
    var overlay = stageHost.querySelector('.studio-stage-overlay');
    if (overlay) {
          overlay.innerHTML = '';
          buildStageOverlayNodes().forEach(function (n) { overlay.appendChild(n); });
    }
}

function refreshBriefPanel() {
  var briefHost = document.querySelector('#intakeWizard .studio-brief');
  if (!briefHost) return;
  briefHost.innerHTML = '';
  renderBrief(briefHost);
}

// ---------- Render ----------

function render() {
  document.body.classList.add('guided-active');
  const root = document.getElementById('intakeWizard');
  root.innerHTML = '';
  if (stepIndex >= STEP_ORDER.length) {
    computeAndShowRecommendations();
    return;
  }
  const shell = el('div', 'studio-shell');
  const left = el('div', 'studio-left');
  const leftInner = el('div', 'studio-left-inner');
  renderProgress(leftInner);
  renderBrief(leftInner);

const question = el('div', 'studio-question');
  const name = STEP_ORDER[stepIndex];
  if (name === 'eventType') question.appendChild(renderEventTypeStep());
  else if (name === 'guestCount') question.appendChild(renderGuestCountStep());
  else if (name === 'seatingStyle') question.appendChild(renderSeatingStyleStep());
  else if (name === 'location') question.appendChild(renderLocationStep());
  else if (name === 'features') question.appendChild(renderFeaturesStep());
  else if (name === 'danceFloorSize') question.appendChild(renderDanceFloorSizeStep());
  leftInner.appendChild(question);

left.appendChild(leftInner);
  shell.appendChild(left);

const stageEl = el('div', 'studio-stage');
  renderStageVisual(stageEl);
  shell.appendChild(stageEl);

root.appendChild(shell);
}

function renderNav(container, opts) {
  const nav = el('div', 'studio-nav');
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
  const grid = el('div', 'studio-occasion-grid');
  EVENT_TYPES.forEach(function (opt) {
    const card = el('button', 'studio-occasion-card' + (wiz.eventType === opt.id ? ' selected' : '')); card.setAttribute('aria-pressed', wiz.eventType === opt.id ? 'true' : 'false');
    card.type = 'button';
    card.appendChild(iconSvg(opt.icon));
    card.appendChild(el('span', 'text', opt.label));
    card.appendChild(el('span', 'check', '✓'));
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
  wrap.appendChild(el('h2', null, 'How many guests are you planning for?'));
  const stageWrap = el('div', 'studio-guest-stage');

const display = el('div', 'studio-guest-count-display');
  const minusBtn = el('button', 'count-btn', '−');
  minusBtn.type = 'button';
  const numberEl = el('div', 'studio-guest-count-number', String(wiz.guestCount));
  const plusBtn = el('button', 'count-btn', '+');
  plusBtn.type = 'button';

  minusBtn.setAttribute('aria-label', 'Decrease guest count');
  plusBtn.setAttribute('aria-label', 'Increase guest count');
const quickWrap = el('div', 'studio-guest-quickpicks');
  function renderQuickpicks() {
    quickWrap.innerHTML = '';
    [25, 50, 75, 100, 150, 200].forEach(function (n) {
      const pick = el('button', 'studio-guest-quickpick' + (wiz.guestCount === n ? ' selected' : ''), String(n)); pick.setAttribute('aria-pressed', wiz.guestCount === n ? 'true' : 'false');
      pick.type = 'button';
      pick.addEventListener('click', function () { setCount(n); });
      quickWrap.appendChild(pick);
    });
  }

function setCount(n) {
  wiz.guestCount = Math.max(1, Math.min(1000, n));
  numberEl.textContent = String(wiz.guestCount);
  input.value = String(wiz.guestCount);
  renderQuickpicks();
  refreshStagePanel();
  refreshBriefPanel();
}
  minusBtn.addEventListener('click', function () { setCount(wiz.guestCount - 5); });

plusBtn.addEventListener('click', function () { setCount(wiz.guestCount + 5); });

display.appendChild(minusBtn);
  display.appendChild(numberEl);
  display.appendChild(plusBtn);
  stageWrap.appendChild(display);

renderQuickpicks();
  stageWrap.appendChild(quickWrap);

const field = el('div', 'field');
  const label = el('label', null, 'Or enter an exact number');
  label.setAttribute('for', 'guestCountExactInput');
  field.appendChild(label);
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.max = '1000';
  input.value = String(wiz.guestCount);
  input.className = 'guest-count-input';
  input.id = 'guestCountExactInput';
  input.addEventListener('input', function () {
    const n = Math.max(1, parseInt(input.value, 10) || 1);
    wiz.guestCount = n;
    numberEl.textContent = String(n);
    renderQuickpicks();
    refreshStagePanel();
    refreshBriefPanel();
  });
  field.appendChild(input);
  stageWrap.appendChild(field);

stageWrap.appendChild(el('div', 'studio-guest-hint', 'An estimate is fine. You can change this later.'));

wrap.appendChild(stageWrap);
  renderNav(wrap);
  return wrap;
}

function renderSeatingStyleStep() {
  const wrap = el('div', 'wizard-step');
  wrap.appendChild(el('h2', null, 'How would you like your guests seated?'));
  const grid = el('div', 'studio-option-grid');
  SEATING_STYLE_CARDS.forEach(function (opt) {
    const card = el('button', 'studio-option-card seat-card' + (wiz.seatingStyle === opt.id ? ' selected' : '')); card.setAttribute('aria-pressed', wiz.seatingStyle === opt.id ? 'true' : 'false');
    card.type = 'button';
    card.appendChild(seatVisualSvg(opt.visual));
    card.appendChild(el('span', 'text', opt.label));
    card.appendChild(el('span', 'hint', opt.hint));
    card.appendChild(el('span', 'check', '✓'));
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
  wrap.appendChild(el('h2', null, 'Make it yours'));
  wrap.appendChild(el('p', 'studio-subtext', 'Choose anything you would like RentSketch to plan around. Select all that apply.'));
  const grid = el('div', 'studio-feature-grid');
  FEATURES.forEach(function (opt) {
    const chip = el('button', 'studio-feature-chip' + (wiz.features.indexOf(opt.id) !== -1 ? ' selected' : '')); chip.setAttribute('aria-pressed', wiz.features.indexOf(opt.id) !== -1 ? 'true' : 'false');
    chip.type = 'button';
    chip.appendChild(iconSvg(opt.icon));
    chip.appendChild(el('span', null, opt.label));
    chip.addEventListener('click', function () {
      toggleFeature(opt.id);
      render();
    });
    grid.appendChild(chip);
  });
  const noneChip = el('button', 'studio-feature-chip muted' + (wiz.features.indexOf(FEATURE_NONE) !== -1 ? ' selected' : ''), '🚫 None of These'); noneChip.setAttribute('aria-pressed', wiz.features.indexOf(FEATURE_NONE) !== -1 ? 'true' : 'false');
  noneChip.type = 'button';
  noneChip.addEventListener('click', function () { toggleFeature(FEATURE_NONE); render(); });
  grid.appendChild(noneChip);
  const notSureChip = el('button', 'studio-feature-chip muted' + (wiz.features.indexOf(FEATURE_NOT_SURE) !== -1 ? ' selected' : ''), '🤷 Not Sure Yet'); notSureChip.setAttribute('aria-pressed', wiz.features.indexOf(FEATURE_NOT_SURE) !== -1 ? 'true' : 'false');
  notSureChip.type = 'button';
  notSureChip.addEventListener('click', function () { toggleFeature(FEATURE_NOT_SURE); render(); });
  grid.appendChild(notSureChip);
  wrap.appendChild(grid);
  renderNav(wrap, { nextLabel: 'See My Recommendations', isLast: !needsDanceFloorStep() });
  return wrap;
}

function renderDanceFloorSizeStep() {
  const wrap = el('div', 'wizard-step');
  wrap.appendChild(el('h2', null, 'What size dance floor would you like?'));
  const grid = el('div', 'studio-option-grid small');
  DANCE_FLOOR_SIZES.forEach(function (size) {
    const card = el('button', 'studio-option-card small' + (wiz.danceFloorSizeId === size.id ? ' selected' : '')); card.setAttribute('aria-pressed', wiz.danceFloorSizeId === size.id ? 'true' : 'false');
    card.type = 'button';
    card.appendChild(el('span', 'text', size.ft + ' x ' + size.ft + ' ft'));
    card.appendChild(el('span', 'check', '✓'));
    card.addEventListener('click', function () {
      wiz.danceFloorSizeId = size.id;
      wiz.customDanceFloorFt = null;
      render();
    });
    grid.appendChild(card);
  });
  const customCard = el('button', 'studio-option-card small' + (wiz.danceFloorSizeId === 'custom' ? ' selected' : '')); customCard.setAttribute('aria-pressed', wiz.danceFloorSizeId === 'custom' ? 'true' : 'false');
  customCard.type = 'button';
  customCard.appendChild(el('span', 'text', 'Custom Size'));
  customCard.appendChild(el('span', 'check', '✓'));
  customCard.addEventListener('click', function () {
    wiz.danceFloorSizeId = 'custom';
    render();
  });
  grid.appendChild(customCard);
  wrap.appendChild(grid);
  if (wiz.danceFloorSizeId === 'custom') {
    const field = el('div', 'field');
    var dfLabel = el('label', null, 'Custom size (feet per side)'); dfLabel.setAttribute('for', 'customDanceFloorInput'); field.appendChild(dfLabel);
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '6'; input.id = 'customDanceFloorInput';
    input.max = '60';
    input.value = wiz.customDanceFloorFt ? String(wiz.customDanceFloorFt) : '';
    input.addEventListener('input', function () {
      wiz.customDanceFloorFt = parseInt(input.value, 10) || null;
    });
    field.appendChild(input);
    wrap.appendChild(field);
  }
  renderNav(wrap, { nextLabel: 'See My Recommendations', isLast: true });
  return wrap;
}

function renderLocationStep() {
  const wrap = el('div', 'wizard-step');
  wrap.appendChild(el('h2', null, 'Where will everything be set up?'));
  const grid = el('div', 'studio-option-grid');
  LOCATION_TYPES.forEach(function (opt) {
    const card = el('button', 'studio-option-card' + (wiz.spaceType === opt.id ? ' selected' : '')); card.setAttribute('aria-pressed', wiz.spaceType === opt.id ? 'true' : 'false');
    card.type = 'button';
    card.appendChild(iconSvg(opt.icon));
    card.appendChild(el('span', 'text', opt.label));
    card.appendChild(el('span', 'check', '✓'));
    card.addEventListener('click', function () {
      wiz.spaceType = opt.id;
      render();
    });
    grid.appendChild(card);
  });
  wrap.appendChild(grid);

  wrap.appendChild(el('h3', null, 'What surface will the tent sit on?'));
  const surfaceGrid = el('div', 'studio-option-grid small');
  SURFACE_TYPES.forEach(function (opt) {
    const card = el('button', 'studio-option-card small' + (wiz.surfaceType === opt.id ? ' selected' : '')); card.setAttribute('aria-pressed', wiz.surfaceType === opt.id ? 'true' : 'false');
    card.type = 'button';
    card.appendChild(iconSvg(opt.icon));
    card.appendChild(el('span', 'text', opt.label));
    card.appendChild(el('span', 'check', '✓'));
    card.addEventListener('click', function () {
      wiz.surfaceType = opt.id;
      render();
    });
    surfaceGrid.appendChild(card);
  });
  wrap.appendChild(surfaceGrid);

  wrap.appendChild(el('h3', null, 'Do you know your usable space? (optional)'));
  const dimsWrap = el('div', 'studio-space-dims');
  const widthField = el('div', 'field small');
  const widthLabel = el('label', null, 'Width (ft)'); widthLabel.setAttribute('for', 'spaceWidthInput');
  widthField.appendChild(widthLabel);
  const widthInput = document.createElement('input');
  widthInput.type = 'number'; widthInput.min = '1'; widthInput.id = 'spaceWidthInput';
  widthInput.value = wiz.spaceWidthFt ? String(wiz.spaceWidthFt) : '';
  widthField.appendChild(widthInput);
  dimsWrap.appendChild(widthField);
  const lengthField = el('div', 'field small');
  const lengthLabel = el('label', null, 'Length (ft)'); lengthLabel.setAttribute('for', 'spaceLengthInput');
  lengthField.appendChild(lengthLabel);
  const lengthInput = document.createElement('input');
  lengthInput.type = 'number'; lengthInput.min = '1'; lengthInput.id = 'spaceLengthInput';
  lengthInput.value = wiz.spaceLengthFt ? String(wiz.spaceLengthFt) : '';
  lengthField.appendChild(lengthInput);
  dimsWrap.appendChild(lengthField);
  wrap.appendChild(dimsWrap);
  const footprintNote = el('div', 'studio-space-footprint');
  function renderFootprint() {
    footprintNote.innerHTML = '';
    if (wiz.spaceWidthFt && wiz.spaceLengthFt) {
      footprintNote.appendChild(el('div', 'studio-space-footprint-label', 'Usable space: ' + wiz.spaceWidthFt + ' x ' + wiz.spaceLengthFt + ' ft'));
      const box = el('div', 'studio-space-footprint-box');
      box.style.aspectRatio = wiz.spaceWidthFt + ' / ' + wiz.spaceLengthFt;
      footprintNote.appendChild(box);
    }
  }
  widthInput.addEventListener('input', function () {
    wiz.spaceWidthFt = parseInt(widthInput.value, 10) || null;
    renderFootprint();
  });
  lengthInput.addEventListener('input', function () {
    wiz.spaceLengthFt = parseInt(lengthInput.value, 10) || null;
    renderFootprint();
  });
  renderFootprint();
  wrap.appendChild(footprintNote);

  renderNav(wrap);
  return wrap;
}

function applyWizardStateToBridge() {
  Bridge.state.eventType = wiz.eventType || 'other';
  Bridge.state.guestCount = wiz.guestCount;
  Bridge.state.spaceType = wiz.spaceType || 'other';
  Bridge.state.surfaceType = wiz.surfaceType || 'notSure';
  Bridge.state.needDance = wiz.features.indexOf('danceFloor') !== -1;
  Bridge.state.danceFloorSizeId = wiz.danceFloorSizeId;
  Bridge.state.customDanceFloorFt = wiz.customDanceFloorFt;
  const pkgCategory = packageCategoryForEventType(wiz.eventType);
  const matchedPackage = pkgCategory ? suggestPackage(pkgCategory, wiz.guestCount) : null;
  Bridge.state.matchedPackageId = matchedPackage ? matchedPackage.id : null;
  return matchedPackage;
}

function recommendTentsForWiz() {
  return recommendTents({
    guestCount: wiz.guestCount,
    seatingStyle: wiz.seatingStyle || SEATING_STYLE_OPTIONS.NOT_SURE,
    features: wiz.features,
    surfaceType: wiz.surfaceType || 'notSure',
    danceFloorSizeId: wiz.danceFloorSizeId,
    customDanceFloorFt: wiz.customDanceFloorFt,
  });
}

function computeAndShowRecommendations() {
  const result = recommendTentsForWiz();
  const matchedPackage = applyWizardStateToBridge();
  renderRecommendations(result, matchedPackage);
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
  card.appendChild(el('div', 'recommend-card-meta', entry.tent.widthFt + ' x ' + entry.tent.lengthFt + ' ft - ' + (entry.tent.pricePerDay != null ? (money(entry.tent.pricePerDay) + '/day') : 'Ask for pricing')));
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

function renderRecommendations(result, matchedPackage) {
  document.body.classList.add('guided-active');
  const root = document.getElementById('recommendWizard');
  root.innerHTML = '';

const header = el('div', 'studio-plan-header');
  briefFinalMode = true; renderFinalProgress(header);
  briefFinalMode = true; renderBrief(header); briefFinalMode = false;
  root.appendChild(header);

root.appendChild(el('h2', 'studio-plan-title', 'Recommended Starting Setup'));

if (matchedPackage && (!window.ACTIVE_TENANT || window.ACTIVE_TENANT.showPackages !== false)) {
  const box = el('div', 'package-match');
  box.appendChild(el('div', 'package-match-title', 'This matches our "' + matchedPackage.name + '" package'));
  box.appendChild(el('div', 'package-match-meta', money(matchedPackage.price) + '/day flat — up to ' + matchedPackage.maxGuests + ' guests'));
  box.appendChild(el('div', 'package-match-hint', 'Ask ' + ((window.ACTIVE_TENANT && window.ACTIVE_TENANT.name) || 'Friendly Party Rental') + ' about bundling into this package for potential savings.'));
  root.appendChild(box);
}

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

// Demo mode: ?demo=1 skips the wizard and jumps straight into a curated,
// fully populated example so first-time visitors can explore the designer
// without answering any questions. This never runs unless that exact query
// parameter is present, so the normal customer wizard flow is unaffected.
function maybeStartDemoMode() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') !== '1') return false;
  wiz.eventType = 'wedding';
  wiz.guestCount = 100;
  wiz.seatingStyle = SEATING_STYLE_OPTIONS.DINING;
  wiz.features = ['danceFloor', 'buffet', 'bar', 'cakeTable'];
  wiz.danceFloorSizeId = '15x15';
  wiz.spaceType = 'backyard';
  wiz.surfaceType = 'grass';
  const result = recommendTentsForWiz();
  applyWizardStateToBridge();
  const entry = result.recommended || result.moreSpacious || result.tighter;
  if (entry) Bridge.state.tentId = entry.tent.id;
  Bridge.state.chairId = 'chiavari-gold';
  Bridge.state.lightingId = 'lighting-bistro';
  Bridge.useRecommendedLayout();
  return true;
}

function startIntake() {
  Bridge = window.FriendlyBridge;
  if (!maybeStartDemoMode()) {
    render();
  }
}
if (window.FriendlyBridge) {
  startIntake();
} else {
  var intakeBridgeWaitCount = 0;
  (function waitForFriendlyBridge() {
    if (window.FriendlyBridge) { startIntake(); return; }
    intakeBridgeWaitCount++;
    if (intakeBridgeWaitCount > 200) { startIntake(); return; }
    setTimeout(waitForFriendlyBridge, 10);
  })();
}
