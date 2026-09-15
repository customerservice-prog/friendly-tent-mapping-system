// Friendly Event Designer — Intake wizard module
// Walks the customer through the Guided Event Studio experience, then calls
// the recommendation engine and hands off to the existing designer via
// window.FriendlyBridge.

import { recommendTents, SEATING_STYLE_OPTIONS } from '../core/recommendation.js';
import { DANCE_FLOOR_SIZES } from '../data/danceFloor.js';
import { suggestPackage } from '../data/packages.js';

let Bridge = window.FriendlyBridge;

const EVENT_TYPES = [
  { id: 'wedding', label: '💍 Wedding' },
  { id: 'graduation', label: '🎓 Graduation Party' },
  { id: 'birthday', label: '🎂 Birthday Party' },
  { id: 'corporate', label: '💼 Corporate Event' },
  { id: 'school', label: '🏫 School Event' },
  { id: 'festival', label: '🎪 Festival' },
  { id: 'community', label: '🤝 Community Event' },
  { id: 'backyard', label: '🏡 Backyard Party' },
  { id: 'anniversary', label: '💞 Anniversary' },
  { id: 'babyShower', label: '🍼 Baby Shower' },
  { id: 'bridalShower', label: '💐 Bridal Shower' },
  { id: 'ceremony', label: '⛪ Ceremony' },
  { id: 'other', label: '✨ Other' },
  ];

const SEATING_STYLE_CARDS = [
  { id: SEATING_STYLE_OPTIONS.DINING, label: '🍽️ Dinner at Tables', hint: 'Guests seated at round or banquet tables for a meal.' },
  { id: SEATING_STYLE_OPTIONS.CEREMONY, label: '💒 Ceremony Rows', hint: 'Rows of chairs facing forward, like a wedding ceremony.' },
  { id: SEATING_STYLE_OPTIONS.COCKTAIL, label: '🥂 Cocktail / Mostly Standing', hint: 'Standing room with a few cocktail tables.' },
  { id: SEATING_STYLE_OPTIONS.MIXED, label: '🔀 Mixed Seating', hint: 'A mix of seated and standing areas.' },
  { id: SEATING_STYLE_OPTIONS.NOT_SURE, label: '🤔 Not Sure', hint: "We will plan around a flexible layout." },
  ];

const FEATURES = [
  { id: 'danceFloor', label: '💃 Dance Floor' },
  { id: 'dj', label: '🎧 DJ' },
  { id: 'band', label: '🎸 Live Band' },
  { id: 'buffet', label: '🍲 Buffet' },
  { id: 'bar', label: '🍸 Bar' },
  { id: 'cocktailTables', label: '🍹 Cocktail Tables' },
  { id: 'cakeTable', label: '🎂 Cake Table' },
  { id: 'giftTable', label: '🎁 Gift Table' },
  { id: 'photoBooth', label: '📸 Photo Booth' },
  { id: 'stage', label: '🎤 Stage' },
  { id: 'lounge', label: '🛋️ Lounge Area' },
  { id: 'catering', label: '👨‍🍳 Catering / Service Area' },
  ];
const FEATURE_NONE = 'none';
const FEATURE_NOT_SURE = 'notSure';

const LOCATION_TYPES = [
  { id: 'backyard', label: '🏡 Backyard' },
  { id: 'venue', label: '🏛️ Venue' },
  { id: 'park', label: '🌳 Park' },
  { id: 'lot', label: '🅿️ Parking Lot' },
  { id: 'indoor', label: '🏢 Indoor Space' },
  { id: 'other', label: '📍 Other' },
  ];

const SURFACE_TYPES = [
  { id: 'grass', label: '🌱 Grass' },
  { id: 'dirt', label: '🚧 Dirt / Gravel' },
  { id: 'asphalt', label: '🛣️ Asphalt' },
  { id: 'concrete', label: '🧱 Concrete' },
  { id: 'deck', label: '⛱️ Deck / Patio' },
  { id: 'indoor', label: '🏠 Indoor Floor' },
  { id: 'notSure', label: '❓ Not Sure' },
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
};

let stepIndex = 0;
const stepHistory = [];

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

function briefValueForStage(stageKey) {
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
    const item = el('button', 'studio-progress-item' + (isDone ? ' is-done' : '') + (isActive ? ' is-active' : ''));
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

function renderBrief(container) {
  const brief = el('div', 'studio-brief');
  STAGE_DEFS.forEach(function (stage) {
    const value = briefValueForStage(stage.key);
    if (!value) return;
    brief.appendChild(el('span', 'studio-brief-chip', value));
  });
  container.appendChild(brief);
}

// ---------- Event Stage (right panel) — honest, state-driven, no fake AI ----------

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

const occLabel = eventTypeLabel(wiz.eventType);
  const summary = el('div', 'studio-stage-summary');
  const strong = el('strong', null, occLabel);
  summary.appendChild(strong);
  stage.appendChild(summary);

const body = el('div', 'studio-stage-body');
  if (wiz.guestCount) {
    const dotsWrap = el('div', 'studio-stage-guestviz');
    const dotCount = Math.max(1, Math.min(160, Math.round(wiz.guestCount / 2)));
    for (let i = 0; i < dotCount; i++) dotsWrap.appendChild(el('span', 'g', null));
    body.appendChild(dotsWrap);
    body.appendChild(el('div', 'studio-stage-caption', 'Planning for ' + wiz.guestCount + ' guests'));
  } else {
    const occWords = occLabel.replace(/^\S+\s/, '').toLowerCase();
    body.appendChild(el('div', 'studio-stage-caption', "Let's build your starting " + occWords + ' layout.'));
  }

const chipsWrap = el('div', 'studio-stage-chips');
  STAGE_DEFS.forEach(function (s) {
    if (s.key === 'occasion') return;
    const value = briefValueForStage(s.key);
    if (!value) return;
    chipsWrap.appendChild(el('span', 'studio-stage-chip', value));
  });
  if (chipsWrap.childNodes.length) body.appendChild(chipsWrap);

stage.appendChild(body);
  container.appendChild(stage);
}

      function refreshStagePanel() {
        var stageHost = document.querySelector('#intakeWizard .studio-stage');
        if (!stageHost) return;
        stageHost.innerHTML = '';
        renderStageVisual(stageHost);
      }

// ---------- Render ----------

function render() {
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
    const parts = opt.label.split(/\s(.+)/);
    const emoji = parts[0];
    const text = parts[1] || opt.label;
    const card = el('button', 'studio-occasion-card' + (wiz.eventType === opt.id ? ' selected' : ''));
    card.type = 'button';
    card.appendChild(el('span', 'emoji', emoji));
    card.appendChild(el('span', 'text', text));
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

const quickWrap = el('div', 'studio-guest-quickpicks');
  function renderQuickpicks() {
    quickWrap.innerHTML = '';
    [25, 50, 75, 100, 150, 200].forEach(function (n) {
      const pick = el('button', 'studio-guest-quickpick' + (wiz.guestCount === n ? ' selected' : ''), String(n));
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
  field.appendChild(label);
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.max = '1000';
  input.value = String(wiz.guestCount);
  input.className = 'guest-count-input';
  input.addEventListener('input', function () {
    const n = Math.max(1, parseInt(input.value, 10) || 1);
    wiz.guestCount = n;
    numberEl.textContent = String(n);
    renderQuickpicks();
    refreshStagePanel();
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
  wrap.appendChild(el('h2', null, 'Make it yours'));
  wrap.appendChild(el('p', 'studio-subtext', 'Choose anything you would like RentSketch to plan around. Select all that apply.'));
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
  const noneChip = el('button', 'feature-chip' + (wiz.features.indexOf(FEATURE_NONE) !== -1 ? ' selected' : ''), '🚫 None of These');
  noneChip.type = 'button';
  noneChip.addEventListener('click', function () { toggleFeature(FEATURE_NONE); render(); });
  grid.appendChild(noneChip);
  const notSureChip = el('button', 'feature-chip' + (wiz.features.indexOf(FEATURE_NOT_SURE) !== -1 ? ' selected' : ''), '🤷 Not Sure Yet');
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
  renderNav(wrap, { nextLabel: 'See My Recommendations', isLast: true });
  return wrap;
}

  function renderLocationStep() {
    const wrap = el('div', 'wizard-step');
    wrap.appendChild(el('h2', null, 'Where will everything be set up?'));
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
  const root = document.getElementById('recommendWizard');
  root.innerHTML = '';
  root.appendChild(el('h2', null, 'Recommended Starting Setup'));

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
