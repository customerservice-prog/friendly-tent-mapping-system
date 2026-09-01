// Friendly Event Designer - 2D top-down plan view
// Lightweight DOM-based renderer that mirrors the mount/update API of
// js/ui/view3d.js so script.js can swap between the two views. This is the
// default editing surface: it is easier to scan and arrange a layout from
// directly above than in a 3D perspective view.

let container = null;
let stageEl = null;
let resizeObserver = null;
let currentData = null;
let callbacks = {};

let dragging = false;
let dragMoved = false;
let dragTarget = null;
let dragStartPx = { x: 0, y: 0 };
let dragOrigFt = { x: 0, y: 0 };
let dragLiveFt = { x: 0, y: 0 };
let pxPerFt = 20;

function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

function computeStageSize(tent) {
  const availW = Math.max(80, container.clientWidth - 32);
  const availH = Math.max(80, container.clientHeight - 32);
  const scale = Math.min(availW / tent.widthFt, availH / tent.lengthFt);
  pxPerFt = Math.max(4, scale);
  return { w: tent.widthFt * pxPerFt, h: tent.lengthFt * pxPerFt };
}

function buildChairDots(host, item, radiusFt, cxFt, cyFt) {
  const count = item.seatCount || 0;
  if (!count) return;
  const chairR = radiusFt + 0.85;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const fx = cxFt + chairR * Math.cos(angle);
    const fy = cyFt + chairR * Math.sin(angle);
    const dot = document.createElement('div');
    dot.className = 'plan2d-chair';
    dot.style.left = (fx * pxPerFt) + 'px';
    dot.style.top = (fy * pxPerFt) + 'px';
    host.appendChild(dot);
  }
}

function severityClass(data, itemId) {
  const sev = data.severityMap && data.severityMap[itemId];
  if (sev === 'error') return 'severity-error';
  if (sev === 'warning') return 'severity-warning';
  return '';
}

function render(data) {
  currentData = data;
  const tent = data.tent;
  const size = computeStageSize(tent);
  clear(stageEl);
  stageEl.style.width = size.w + 'px';
  stageEl.style.height = size.h + 'px';

  (tent.centerPoles || []).forEach(function (p) {
    const pole = document.createElement('div');
    pole.className = 'plan2d-pole';
    const r = 6;
    pole.style.width = r + 'px';
    pole.style.height = r + 'px';
    pole.style.left = (p.x * pxPerFt) + 'px';
    pole.style.top = (p.y * pxPerFt) + 'px';
    stageEl.appendChild(pole);
  });

  (data.objects || []).forEach(function (item) {
    const wrap = document.createElement('div');
    const isDance = item.kind === 'dance';
    const shapeClass = isDance ? 'rect dance' : (item.shape === 'round' ? 'round' : 'rect');
    wrap.className = 'plan2d-object ' + shapeClass + ' ' + severityClass(data, item.id) + (data.selectedId === item.id ? ' selected' : '');
    wrap.style.left = (item.x * pxPerFt) + 'px';
    wrap.style.top = (item.y * pxPerFt) + 'px';
    wrap.style.width = (item.widthFt * pxPerFt) + 'px';
    wrap.style.height = (item.depthFt * pxPerFt) + 'px';
    wrap.dataset.itemId = item.id;

    const top = document.createElement('div');
    top.className = 'plan2d-table-top';
    if (isDance) {
      top.textContent = '';
    } else {
      top.textContent = item.seatCount > 0 ? (item.seatCount + ' seats') : '';
    }
    wrap.appendChild(top);
    stageEl.appendChild(wrap);

    if (!isDance && item.seatCount > 0) {
      const radiusFt = item.shape === 'round' ? item.widthFt / 2 : Math.max(item.widthFt, item.depthFt) / 2;
      buildChairDots(stageEl, item, radiusFt, item.x + item.widthFt / 2, item.y + item.depthFt / 2);
    }

    wrap.addEventListener('pointerdown', function (e) { onPointerDown(e, item); });
  });
}

function onPointerDown(e, item) {
  if (e.button !== undefined && e.button !== 0) return;
  e.preventDefault();
  dragging = true;
  dragMoved = false;
  dragTarget = item;
  dragStartPx = { x: e.clientX, y: e.clientY };
  dragOrigFt = { x: item.x, y: item.y };
  dragLiveFt = { x: item.x, y: item.y };
  const el = e.currentTarget;
  el.classList.add('dragging');
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}

function onPointerMove(e) {
  if (!dragging || !dragTarget) return;
  const dxPx = e.clientX - dragStartPx.x;
  const dyPx = e.clientY - dragStartPx.y;
  if (Math.abs(dxPx) > 3 || Math.abs(dyPx) > 3) dragMoved = true;
  const tent = currentData.tent;
  let newX = dragOrigFt.x + dxPx / pxPerFt;
  let newY = dragOrigFt.y + dyPx / pxPerFt;
  newX = Math.max(0, Math.min(tent.widthFt - dragTarget.widthFt, newX));
  newY = Math.max(0, Math.min(tent.lengthFt - dragTarget.depthFt, newY));
  dragLiveFt = { x: newX, y: newY };
  const el = stageEl.querySelector('[data-item-id="' + dragTarget.id + '"]');
  if (el) {
    el.style.left = (newX * pxPerFt) + 'px';
    el.style.top = (newY * pxPerFt) + 'px';
  }
}

function onPointerUp() {
  if (!dragging) return;
  dragging = false;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  const target = dragTarget;
  dragTarget = null;
  const el = target ? stageEl.querySelector('[data-item-id="' + target.id + '"]') : null;
  if (el) el.classList.remove('dragging');
  if (!target) return;
  if (!dragMoved) {
    if (callbacks.onSelect) callbacks.onSelect(target.id);
  } else {
    if (callbacks.onMove) callbacks.onMove(target.id, dragLiveFt.x, dragLiveFt.y);
  }
}

function onResize() {
  if (currentData) render(currentData);
}

export function mount(containerEl, data, cbs) {
  container = containerEl;
  callbacks = cbs || {};
  clear(container);
  stageEl = document.createElement('div');
  stageEl.className = 'plan2d-stage';
  container.appendChild(stageEl);
  render(data);
  if (window.ResizeObserver) {
    resizeObserver = new ResizeObserver(function () { onResize(); });
    resizeObserver.observe(container);
  } else {
    window.addEventListener('resize', onResize);
  }
}

export function update(data) {
  if (!stageEl) return;
  render(data);
}

export function unmount() {
  if (resizeObserver && container) {
    resizeObserver.disconnect();
    resizeObserver = null;
  } else {
    window.removeEventListener('resize', onResize);
  }
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  if (container) clear(container);
  container = null;
  stageEl = null;
  currentData = null;
  callbacks = {};
}
