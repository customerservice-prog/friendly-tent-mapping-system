// Friendly Event Designer - 2D top-down plan view
// Lightweight DOM-based renderer that mirrors the mount/update API of
// js/ui/view3d.js so script.js can swap between the two views. This is the
// default editing surface: it is easier to scan and arrange a layout from
// directly above than in a 3D perspective view.

import { byId as chairById } from '../data/chairs.js';

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
  const rawW = container.clientWidth - 32;
  const rawH = container.clientHeight - 32;
  // Guard against reading the container's size before the browser has finished
  // laying it out (e.g. immediately on mount, or right after a view switch).
  // In that case clientWidth/clientHeight can briefly read as 0, which used to
  // permanently collapse the whole plan to a tiny fixed scale. Instead, keep the
  // last known-good pxPerFt until we get a real measurement.
  if (rawW <= 0 || rawH <= 0) {
    return { w: tent.widthFt * pxPerFt, h: tent.lengthFt * pxPerFt };
  }
  const availW = Math.max(80, rawW);
  const availH = Math.max(80, rawH);
  const scale = Math.min(availW / tent.widthFt, availH / tent.lengthFt);
  pxPerFt = Math.max(4, scale);
  return { w: tent.widthFt * pxPerFt, h: tent.lengthFt * pxPerFt };
}

function chairIconSvg(silhouette) {
  if (silhouette === 'resin') {
    return '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' +
      '<ellipse cx="50" cy="42" rx="38" ry="34" fill="var(--chair-frame)" stroke="rgba(0,0,0,0.3)" stroke-width="3"/>' +
      '<path d="M20 70 Q50 95 80 70" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="5" stroke-linecap="round"/>' +
      '</svg>';
  }
  if (silhouette === 'chiavari') {
    return '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' +
      '<path d="M26 64 Q50 92 74 64" fill="none" stroke="var(--chair-frame)" stroke-width="4" stroke-linecap="round"/>' +
      '<circle cx="50" cy="44" r="25" fill="var(--chair-accent)" stroke="var(--chair-frame)" stroke-width="5"/>' +
      '<circle cx="17" cy="26" r="3" fill="var(--chair-frame)"/>' +
      '<circle cx="83" cy="26" r="3" fill="var(--chair-frame)"/>' +
      '<circle cx="17" cy="62" r="3" fill="var(--chair-frame)"/>' +
      '<circle cx="83" cy="62" r="3" fill="var(--chair-frame)"/>' +
      '</svg>';
  }
  if (silhouette === 'throne') {
    return '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' +
      '<path d="M6 40 Q6 4 50 4 Q94 4 94 40 L94 46 Q50 30 6 46 Z" fill="var(--chair-frame)" stroke="rgba(0,0,0,0.3)" stroke-width="2"/>' +
      '<rect x="18" y="38" width="64" height="46" rx="10" fill="var(--chair-accent)" stroke="var(--chair-frame)" stroke-width="4"/>' +
      '<rect x="4" y="46" width="14" height="30" rx="6" fill="var(--chair-frame)"/>' +
      '<rect x="82" y="46" width="14" height="30" rx="6" fill="var(--chair-frame)"/>' +
      '<circle cx="50" cy="10" r="5" fill="var(--chair-frame)"/>' +
      '</svg>';
  }
  return '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' +
    '<rect x="14" y="10" width="72" height="58" rx="10" fill="var(--chair-frame)" stroke="rgba(0,0,0,0.35)" stroke-width="3"/>' +
    '<rect x="24" y="64" width="52" height="16" rx="4" fill="var(--chair-frame)" stroke="rgba(0,0,0,0.35)" stroke-width="3"/>' +
    '<line x1="16" y1="70" x2="6" y2="92" stroke="rgba(0,0,0,0.45)" stroke-width="4"/>' +
    '<line x1="84" y1="70" x2="94" y2="92" stroke="rgba(0,0,0,0.45)" stroke-width="4"/>' +
    '</svg>';
}

function buildChairDots(host, item, radiusFt, cxFt, cyFt) {
  const count = item.seatCount || 0;
  if (!count) return;
  const chair = chairById(item.chairId) || {};
  const wFt = chair.seatWidthFt || 1.5;
  const dFt = chair.seatDepthFt || 1.5;
  const chairR = radiusFt + Math.max(wFt, dFt) / 2 + 0.35;
  const silhouette = chair.silhouette || 'folding';
  const frameColor = chair.frameColor || '#ffffff';
  const accentColor = chair.accentColor || frameColor;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const fx = cxFt + chairR * Math.cos(angle);
    const fy = cyFt + chairR * Math.sin(angle);
    const bearingDeg = Math.atan2(-Math.cos(angle), Math.sin(angle)) * 180 / Math.PI;
    const dot = document.createElement('div');
    dot.className = 'plan2d-chair plan2d-chair--' + silhouette;
    dot.style.width = (wFt * pxPerFt) + 'px';
    dot.style.height = (dFt * pxPerFt) + 'px';
    dot.style.left = (fx * pxPerFt) + 'px';
    dot.style.top = (fy * pxPerFt) + 'px';
    dot.style.setProperty('--chair-frame', frameColor);
    dot.style.setProperty('--chair-accent', accentColor);
    dot.style.transform = 'translate(-50%, -50%) rotate(' + bearingDeg + 'deg)';
    dot.innerHTML = chairIconSvg(silhouette);
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
  currentData = data;
  // Defer the first paint by a couple of frames so the container has a real,
  // stable measured size (fixes the plan rendering at a tiny collapsed scale
  // right after mount or after switching back from 3D view).
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { render(data); });
  });
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
