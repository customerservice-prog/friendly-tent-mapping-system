// Friendly Event Designer - v1 client-side logic
// Pricing below reflects Friendly Party Rental's published per-day pricing
// (see FRIENDLY-EVENT-DESIGNER.md, section 7). Update here if prices change.

const TENTS = [
  { id: 'popup-10x10', name: "10x10 Pop-Up Canopy", widthFt: 10, lengthFt: 10, pricePerDay: 100, maxGuests: { dining: 8, cocktail: 15 } },
  { id: 'popup-10x20', name: "10x20 Pop-Up Canopy", widthFt: 10, lengthFt: 20, pricePerDay: 175, maxGuests: { dining: 16, cocktail: 30 } },
  { id: 'pole-20x20', name: "20x20 Pole Tent", widthFt: 20, lengthFt: 20, pricePerDay: 250, maxGuests: { dining: 24, cocktail: 40 } },
  { id: 'pole-20x30', name: "20x30 Pole Tent", widthFt: 20, lengthFt: 30, pricePerDay: 350, maxGuests: { dining: 32, cocktail: 60 } },
  { id: 'pole-20x40', name: "20x40 Pole Tent", widthFt: 20, lengthFt: 40, pricePerDay: 450, maxGuests: { dining: 48, cocktail: 80 } },
  { id: 'pole-30x30', name: "30x30 Pole Tent", widthFt: 30, lengthFt: 30, pricePerDay: 575, maxGuests: { dining: 56, cocktail: 90 } },
  { id: 'pole-30x45', name: "30x45 Pole Tent", widthFt: 30, lengthFt: 45, pricePerDay: 700, maxGuests: { dining: 80, cocktail: 130 } },
  { id: 'pole-30x60', name: "30x60 Pole Tent", widthFt: 30, lengthFt: 60, pricePerDay: 850, maxGuests: { dining: 112, cocktail: 180 } },
  { id: 'pole-40x40', name: "40x40 Pole Tent", widthFt: 40, lengthFt: 40, pricePerDay: 1500, maxGuests: { dining: 64, cocktail: 110 } },
  { id: 'pole-40x60', name: "40x60 Pole Tent", widthFt: 40, lengthFt: 60, pricePerDay: 850, maxGuests: { dining: 150, cocktail: 220 } },
  { id: 'pole-40x80', name: "40x80 Pole Tent", widthFt: 40, lengthFt: 80, pricePerDay: 1850, maxGuests: { dining: 200, cocktail: 300 } },
  { id: 'pole-40x100', name: "40x100 Pole Tent", widthFt: 40, lengthFt: 100, pricePerDay: 1950, maxGuests: { dining: 250, cocktail: 380 } },
  ];

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
  { id: 'chiavari-white', name: 'White Chiavari Chair', pricePerDay: 12.00 },
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
    items: [],
    selectedUid: null,
    nextUid: 1,
};

function byId(arr, id) { return arr.find(function (a) { return a.id === id; }); }
function $(id) { return document.getElementById(id); }

function showStep(id) {
     document.querySelectorAll('.step').forEach(function (el) { el.classList.remove('active'); });
    $(id).classList.add('active');
}

function recommendTent(guestCount) {
    const sorted = TENTS.slice().sort(function (a, b) { return a.maxGuests.dining - b.maxGuests.dining; });
    for (let i = 0; i < sorted.length; i++) {
          if (sorted[i].maxGuests.dining >= guestCount) return sorted[i];
    }
    return sorted[sorted.length - 1];
}

function money(n) { return '$' + n.toFixed(2); }

$('btnToRecommend').addEventListener('click', function () {
    state.eventType = $('eventType').value;
    state.guestCount = Math.max(1, parseInt($('guestCount').value, 10) || 1);
    state.spaceType = $('spaceType').value;
    state.needDance = $('needDance').checked;

                                       const tent = recommendTent(state.guestCount);
    state.tentId = tent.id;
    const tablesNeeded = Math.ceil(state.guestCount / 8);

                                       const html = '<p><strong>' + tent.name + '</strong> (' + tent.widthFt + ' x ' + tent.lengthFt + ' ft) &mdash; ' + money(tent.pricePerDay) + '/day</p>' +
                                             '<ul>' +
                                             '<li>' + tablesNeeded + " x 5' Round Tables (8 seats each)</li>" +
                                             '<li>' + state.guestCount + ' White Plastic Folding Chairs</li>' +
                                             (state.needDance ? '<li>Dance floor area</li>' : '') +
                                             '</ul>' +
                                             '<p>Fits up to ' + tent.maxGuests.dining + ' guests seated for dining.</p>';
    $('recommendSummary').innerHTML = html;
    showStep('step-recommend');
});

$('btnBackToIntake').addEventListener('click', function () { showStep('step-intake'); });

$('btnUseRecommend').addEventListener('click', function () {
    state.items = [];
    state.nextUid = 1;
    const tablesNeeded = Math.ceil(state.guestCount / 8);
    for (let i = 0; i < tablesNeeded; i++) { addTable('round-5ft', 'plastic-white'); }
    if (state.needDance) {
          addDanceFloor(); addDanceFloor(); addDanceFloor(); addDanceFloor();
    }
    enterDesigner();
});

$('btnCustomize').addEventListener('click', function () {
    state.items = [];
    state.nextUid = 1;
    enterDesigner();
});

function enterDesigner() {
    populateTentSelect();
    populateChairSelect();
    renderCanvas();
    renderSidePanels();
    showStep('step-designer');
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
    renderCanvas();
    renderSidePanels();
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

function nextGridPosition(index, tent) {
    const spacing = 7;
    const cols = Math.max(1, Math.floor((tent.widthFt - 4) / spacing));
    const col = index % cols;
    const row = Math.floor(index / cols);
    return { x: 3 + col * spacing, y: 3 + row * spacing };
}

function addTable(tableId, chairId) {
    const tent = byId(TENTS, state.tentId);
    const tableDef = byId(TABLES, tableId);
    const tableCount = state.items.filter(function (i) { return i.kind === 'table'; }).length;
    const pos = nextGridPosition(tableCount, tent);
    const item = {
          uid: state.nextUid++,
          kind: 'table',
          tableId: tableId,
          shape: tableDef.shape,
          wFt: tableDef.shape === 'round' ? tableDef.diameterFt : tableDef.widthFt,
          hFt: tableDef.shape === 'round' ? tableDef.diameterFt : tableDef.depthFt,
          x: pos.x,
          y: pos.y,
          seatCount: tableDef.seatsDefault,
          chairId: chairId,
    };
    state.items.push(item);
    renderCanvas();
    renderSidePanels();
}

function addDanceFloor() {
    const tent = byId(TENTS, state.tentId);
    const count = state.items.filter(function (i) { return i.kind === 'dance'; }).length;
    const cols = Math.max(1, Math.floor(tent.widthFt / DANCE_SECTION.ft));
    const col = count % cols;
    const row = Math.floor(count / cols);
    const item = {
          uid: state.nextUid++,
          kind: 'dance',
          wFt: DANCE_SECTION.ft,
          hFt: DANCE_SECTION.ft,
          x: tent.widthFt - (col + 1) * DANCE_SECTION.ft - 2,
          y: tent.lengthFt - (row + 1) * DANCE_SECTION.ft - 2,
    };
    state.items.push(item);
    renderCanvas();
    renderSidePanels();
}

function removeSelected() {
    if (state.selectedUid == null) return;
    state.items = state.items.filter(function (i) { return i.uid !== state.selectedUid; });
    state.selectedUid = null;
    renderCanvas();
    renderSidePanels();
}
$('removeSelected').addEventListener('click', removeSelected);

let canvasGeom = { scale: 1, offX: 0, offY: 0 };

function renderCanvas() {
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

  state.items.forEach(function (item) { renderItem(canvas, item); });
}

function renderItem(canvas, item) {
    const g = canvasGeom;
    const div = document.createElement('div');
    div.className = 'item ' + (item.kind === 'dance' ? 'dance' : (item.shape === 'round' ? 'round' : 'rect'));
    if (item.uid === state.selectedUid) div.classList.add('selected');
    const wPx = item.wFt * g.scale;
    const hPx = item.hFt * g.scale;
    div.style.width = wPx + 'px';
    div.style.height = hPx + 'px';
    div.style.left = (g.offX + item.x * g.scale) + 'px';
    div.style.top = (g.offY + item.y * g.scale) + 'px';
    div.dataset.uid = item.uid;

  if (item.kind === 'table') {
        div.textContent = item.seatCount > 0 ? (item.seatCount + ' seats') : 'cocktail';
  }
    canvas.appendChild(div);

  if (item.kind === 'table' && item.shape === 'round' && item.seatCount > 0) {
        const cx = g.offX + (item.x + item.wFt / 2) * g.scale;
        const cy = g.offY + (item.y + item.hFt / 2) * g.scale;
        const r = (wPx / 2) + 10;
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

  div.addEventListener('mousedown', function (e) {
        dragging = true;
        moved = false;
        startPx = e.clientX;
        startPy = e.clientY;
        startX = item.x;
        startY = item.y;
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
        newX = Math.max(0, Math.min(tent.widthFt - item.wFt, newX));
        newY = Math.max(0, Math.min(tent.lengthFt - item.hFt, newY));
        item.x = newX;
        item.y = newY;
        div.style.left = (g.offX + newX * g.scale) + 'px';
        div.style.top = (g.offY + newY * g.scale) + 'px';
  });

  window.addEventListener('mouseup', function () {
        if (!dragging) return;
        dragging = false;
        if (!moved) {
                state.selectedUid = item.uid;
                renderCanvas();
                renderSidePanels();
        } else {
                renderCanvas();
        }
  });
}

function renderSidePanels() {
    renderSelectedPanel();
    renderCapacityCheck();
    renderPricing();
}

function renderSelectedPanel() {
    const panel = $('selectedItemPanel');
    const removeBtn = $('removeSelected');
    const item = state.items.find(function (i) { return i.uid === state.selectedUid; });
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
    const totalSeats = state.items.reduce(function (sum, i) { return sum + (i.seatCount || 0); }, 0);
    const tableCount = state.items.filter(function (i) { return i.kind === 'table'; }).length;

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

function computeLineItems() {
    const tent = byId(TENTS, state.tentId);
    const lines = [{ label: tent.name + ' (tent)', qty: 1, amount: tent.pricePerDay }];

  const tableCounts = {};
    const chairCounts = {};
    let danceCount = 0;

  state.items.forEach(function (item) {
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
    let body = 'Event type: ' + state.eventType + '\nGuests: ' + state.guestCount + '\nLocation type: ' + state.spaceType + '\nTent: ' + tent.name + '\n\nItems:\n';
    lines.forEach(function (l) { body += '- ' + l.label + ' x' + l.qty + ' (' + money(l.amount) + ')\n'; });
    body += '\nEstimated Total: ' + money(total) + ' / day\n';
    $('btnEmailQuote').addEventListener('click', function () {
          const name = $('customerName').value;
          const email = $('customerEmail').value;
          const date = $('customerDate').value;
          const fullBody = encodeURIComponent('Name: ' + name + '\nEmail: ' + email + '\nRequested Date: ' + date + '\n\n' + body);
          this.href = 'mailto:customerservice@friendlypartyrental.com?subject=' + subject + '&body=' + fullBody;
    });

                                    showStep('step-review');
});

$('btnBackToDesigner').addEventListener('click', function () { showStep('step-designer'); });

showStep('step-intake');
