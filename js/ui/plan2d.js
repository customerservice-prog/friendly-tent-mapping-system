// Friendly Event Designer - 2D top-down plan view
// Lightweight DOM-based renderer that mirrors the mount/update API of
// js/ui/view3d.js so script.js can swap between the two views. This is the
// default editing surface: it is easier to scan and arrange a layout from
// directly above than in a 3D perspective view.

import { chairPlanSvg } from './equipment-symbols.js';
import { chairPositions } from '../core/seating.js';
import { byId as chairById } from '../data/chairs.js';
import { byId as tableById } from '../data/tables.js';
import { linenVisual, linenColorHex } from '../data/linens.js';
import { byId as lightingById } from '../data/lighting.js';

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

// When true, the entire scene is presented rotated 90 degrees from the
// tent's stored widthFt/lengthFt orientation. This NEVER changes the actual
// rental dimensions or any stored object coordinates in state -- it only
// changes how the plan is drawn, so a tent that is physically "tall and
// narrow" can still be framed as a wide, landscape-filling floor plan on a
// landscape canvas (and vice versa). See computeStageSize().
let rotate90 = false;
let placementPointer=null;
const placementPointers=new Set();

function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

// Maps a model-space point/footprint (feet, in the tent's own widthFt x
// lengthFt axes) to display-space feet after the presentation rotation, if
// any. This is a pure axis swap, so it is its own inverse -- the same
// function converts display-space deltas back to model-space during drags.
function toDispXY(xFt, yFt) {
  return rotate90 ? { x: yFt, y: xFt } : { x: xFt, y: yFt };
}

function toDispWD(wFt, dFt) {
  return rotate90 ? { w: dFt, d: wFt } : { w: wFt, d: dFt };
}

function computeStageSize(tent) {
  const overlap = inspectorOverlap();
  const bar=document.getElementById('placementBar');
  if(currentData?.placement&&bar&&!bar.hidden)overlap.h=Math.max(overlap.h,bar.offsetHeight+24);
  container.style.paddingRight = overlap.w ? (overlap.w + 'px') : '';
  container.style.paddingBottom = overlap.h ? (overlap.h + 'px') : '';
  const rawW = container.clientWidth - 32 - overlap.w;
  const rawH = container.clientHeight - 32 - overlap.h;
  if (rawW <= 0 || rawH <= 0) {
    const w = rotate90 ? tent.lengthFt : tent.widthFt;
    const h = rotate90 ? tent.widthFt : tent.lengthFt;
    return { w: w * pxPerFt, h: h * pxPerFt };
  }
  const availW = Math.max(80, rawW);
  const availH = Math.max(80, rawH);
  const scaleNormal = Math.min(availW / tent.widthFt, availH / tent.lengthFt);
  const scaleRotated = Math.min(availW / tent.lengthFt, availH / tent.widthFt);
  rotate90 = scaleRotated > scaleNormal;
  const scale = rotate90 ? scaleRotated : scaleNormal;
  // Large tents must fit short phone canvases too. A four-pixel minimum per
  // foot made a 100-foot tent taller than the entire visible preview.
  pxPerFt = scale;
  const effW = rotate90 ? tent.lengthFt : tent.widthFt;
  const effH = rotate90 ? tent.widthFt : tent.lengthFt;
  return { w: effW * pxPerFt, h: effH * pxPerFt };
}

// At narrower viewport widths the Event Overview inspector panel switches
// to a fixed-position overlay (a right-hand card, or a bottom sheet on
// very narrow/mobile widths -- see style.css's inspector-panel media
// rules) so it can float above the canvas instead of taking its own flex
// column. A fixed element is removed from normal layout flow, so the
// plan2d container's own measured width/height does NOT shrink to make
// room for it. Without this check the plan sizes itself using the full
// container and can end up drawing part of the layout (in practice, often
// the dance floor, since it tends to sit toward one edge) directly
// underneath that overlay, where it is completely invisible to the
// customer. This measures how much of the container the overlay actually
// covers so the stage can be kept clear of it.
function inspectorOverlap() {
  const inspector = document.getElementById('inspectorPanel');
  if (!inspector || inspector.hidden || !container) return { w: 0, h: 0 };
  const cs = window.getComputedStyle(inspector);
  if (cs.position !== 'fixed') return { w: 0, h: 0 };
  const c = container.getBoundingClientRect();
  const p = inspector.getBoundingClientRect();
  const ix = Math.min(c.right, p.right) - Math.max(c.left, p.left);
  const iy = Math.min(c.bottom, p.bottom) - Math.max(c.top, p.top);
  if (ix <= 0 || iy <= 0) return { w: 0, h: 0 };
  if (iy >= c.height * 0.5) return { w: ix, h: 0 };
  if (ix >= c.width * 0.5) return { w: 0, h: iy };
  return { w: 0, h: 0 };
}

function buildChairDots(host, item, radiusFt, cxFt, cyFt) {
  const count = item.seatCount || 0;
  if (!count) return;
  const chair = chairById(item.chairId) || {};
  const wFt = chair.seatWidthFt || 1.5;
  const dFt = chair.seatDepthFt || 1.5;
  const silhouette = chair.silhouette || 'folding';
  const frameColor = chair.frameColor || '#ffffff';
  const accentColor = chair.accentColor || frameColor;
  for (const position of chairPositions(item,chair)) {
    const fx = cxFt + position.x;
    const fy = cyFt + position.y;
    const disp = toDispXY(fx, fy);
    const effAngle = rotate90 ? (Math.PI / 2 - position.angle) : position.angle;
    const bearingDeg = Math.atan2(-Math.cos(effAngle), Math.sin(effAngle)) * 180 / Math.PI;
    const dot = document.createElement('div');
    dot.className = 'plan2d-chair plan2d-chair--' + silhouette+(item.preview?' placement-ghost':'');
    dot.style.width = (wFt * pxPerFt) + 'px';
    dot.style.height = (dFt * pxPerFt) + 'px';
    dot.style.left = (disp.x * pxPerFt) + 'px';
    dot.style.top = (disp.y * pxPerFt) + 'px';
    dot.style.setProperty('--chair-frame', frameColor);
    dot.style.setProperty('--chair-accent', accentColor);
    dot.style.transform = 'translate(-50%, -50%) rotate(' + bearingDeg + 'deg)';
    dot.dataset.chairFor=item.id;dot.dataset.modelX=fx;dot.dataset.modelY=fy;
    dot.innerHTML = chairPlanSvg(silhouette);
    host.appendChild(dot);
  }
}

function severityClass(data, itemId) {
  const sev = data.severityMap && data.severityMap[itemId];
  if (sev === 'error') return 'severity-error';
  if (sev === 'warning') return 'severity-warning';
  return '';
}

// ===================== Lighting (2D) =====================
// Tent Lighting / Bistro String Lights / Uplighting / Chandelier / Custom
// Lighting are real rentable line items (js/data/lighting.js) that already
// affected 3D (js/ui/view3d.js applyLighting) and pricing, but had NO
// representation at all in the 2D plan -- a customer who added lighting
// saw zero visual change on the default editing surface. These helpers add
// a real, honest top-down visual per lighting type so the 2D plan matches
// what was actually selected, without inventing extra fake "decor" beyond
// what is really in the catalog.
function addLightBulb(layer, fx, fy, variant) {
  const disp = toDispXY(fx, fy);
  const el = document.createElement('div');
  el.className = 'plan2d-light-bulb plan2d-light-bulb--' + variant;
  el.style.left = (disp.x * pxPerFt) + 'px';
  el.style.top = (disp.y * pxPerFt) + 'px';
  layer.appendChild(el);
}

function addUplight(layer, fx, fy) {
  const disp = toDispXY(fx, fy);
  const el = document.createElement('div');
  el.className = 'plan2d-light-uplight';
  el.style.left = (disp.x * pxPerFt) + 'px';
  el.style.top = (disp.y * pxPerFt) + 'px';
  layer.appendChild(el);
}

function buildCanopyLights(layer, tent) {
  const margin = 3;
  const spacing = 8;
  const w = tent.widthFt, l = tent.lengthFt;
  const cols = Math.max(1, Math.round((w - margin * 2) / spacing));
  const rows = Math.max(1, Math.round((l - margin * 2) / spacing));
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const fx = margin + (c * (w - margin * 2)) / cols;
      const fy = margin + (r * (l - margin * 2)) / rows;
      addLightBulb(layer, fx, fy, 'grid');
    }
  }
}

function buildPerimeterLights(layer, tent, spacingFt) {
  const w = tent.widthFt, l = tent.lengthFt, inset = 1.5;
  for (let x = inset; x <= w - inset + 0.01; x += spacingFt) addLightBulb(layer, Math.min(x, w - inset), inset, 'perimeter');
  for (let x2 = inset; x2 <= w - inset + 0.01; x2 += spacingFt) addLightBulb(layer, Math.min(x2, w - inset), l - inset, 'perimeter');
  for (let y = inset; y <= l - inset + 0.01; y += spacingFt) addLightBulb(layer, inset, Math.min(y, l - inset), 'perimeter');
  for (let y2 = inset; y2 <= l - inset + 0.01; y2 += spacingFt) addLightBulb(layer, w - inset, Math.min(y2, l - inset), 'perimeter');
}

function pointAtPerimeterDistance(d, w, l, inset) {
  const topLen = w - 2 * inset;
  const rightLen = l - 2 * inset;
  if (d < topLen) return { x: inset + d, y: inset };
  d -= topLen;
  if (d < rightLen) return { x: w - inset, y: inset + d };
  d -= rightLen;
  if (d < topLen) return { x: w - inset - d, y: l - inset };
  d -= topLen;
  return { x: inset, y: l - inset - d };
}

function buildUplights(layer, tent, count) {
  const w = tent.widthFt, l = tent.lengthFt, inset = 1;
  if (count <= 1) { addUplight(layer, w / 2, inset); return; }
  const perim = 2 * ((w - 2 * inset) + (l - 2 * inset));
  for (let i = 0; i < count; i++) {
    const d = (perim * i) / count;
    const pt = pointAtPerimeterDistance(d, w, l, inset);
    addUplight(layer, pt.x, pt.y);
  }
}

function buildChandelier(layer, tent) {
  const disp = toDispXY(tent.widthFt / 2, tent.lengthFt / 2);
  const el = document.createElement('div');
  el.className = 'plan2d-light-chandelier';
  el.style.left = (disp.x * pxPerFt) + 'px';
  el.style.top = (disp.y * pxPerFt) + 'px';
  layer.appendChild(el);
}

function renderLighting(data, tent) {
  if (!data.lightingOn) return;
  const opt = lightingById(data.lightingId);
  const visual = opt && opt.visual;
  if (!visual || visual === 'none') return;
  const layer = document.createElement('div');
  layer.className = 'plan2d-lighting-layer';
  stageEl.appendChild(layer);
  if (visual === 'bistro-cross-runs') buildCanopyLights(layer, tent);
  else if (visual === 'perimeter-eave') buildPerimeterLights(layer, tent, 4);
  else if (visual === 'grid-canopy') buildCanopyLights(layer, tent);
  else if (visual === 'perimeter-swag') buildPerimeterLights(layer, tent, 4);
  else if (visual === 'perimeter-strand') buildPerimeterLights(layer, tent, 2.5);
  else if (visual === 'uplight-ring') buildUplights(layer, tent, 12);
  else if (visual === 'uplight-single') buildUplights(layer, tent, 1);
  else if (visual === 'chandelier') buildChandelier(layer, tent);
}

function render(data) {
  currentData = data;
  const tent = data.tent;
  const size = computeStageSize(tent);
  clear(stageEl);
  stageEl.style.width = size.w + 'px';
  stageEl.style.height = size.h + 'px';
  stageEl.style.setProperty('--plan-grid-size',pxPerFt+'px');
  stageEl.dataset.dimensions = tent.widthFt+' × '+tent.lengthFt+' ft';
  stageEl.setAttribute('role','group');
  stageEl.setAttribute('aria-label',tent.name+' floor plan');

(tent.centerPoles || []).forEach(function (p) {
  const pole = document.createElement('div');
  pole.className = 'plan2d-pole';
  pole.title = 'Center pole';
  const r = 6;
  const disp = toDispXY(p.x, p.y);
  pole.style.width = r + 'px';
  pole.style.height = r + 'px';
  pole.style.left = (disp.x * pxPerFt) + 'px';
  pole.style.top = (disp.y * pxPerFt) + 'px';
  stageEl.appendChild(pole);
});

renderLighting(data, tent);
  
  if (data.anchoringMethod) {
    var corners = [
      { x: 0, y: 0 },
      { x: tent.widthFt, y: 0 },
      { x: 0, y: tent.lengthFt },
      { x: tent.widthFt, y: tent.lengthFt },
      ];
    var dispWD = toDispWD(tent.widthFt, tent.lengthFt);
    var pxOutset = 10;
    corners.forEach(function (c) {
      var cornerDisp = toDispXY(c.x, c.y);
      var cx = cornerDisp.x * pxPerFt;
      var cy = cornerDisp.y * pxPerFt;
      var dirX = cornerDisp.x <= dispWD.w / 2 ? -1 : 1;
      var dirY = cornerDisp.y <= dispWD.d / 2 ? -1 : 1;
      var outPxX = cx + dirX * pxOutset;
      var outPxY = cy + dirY * pxOutset;
      if (data.anchoringMethod === 'stake') {
        var line = document.createElement('div');
        line.className = 'plan2d-guyline';
        var ang = Math.atan2(dirY, dirX) * 180 / Math.PI;
        line.style.width = pxOutset + 'px';
        line.style.left = cx + 'px';
        line.style.top = cy + 'px';
        line.style.transform = 'rotate(' + ang + 'deg)';
        stageEl.appendChild(line);
        var stake = document.createElement('div');
        stake.className = 'plan2d-anchor-stake';
        stake.style.left = outPxX + 'px';
        stake.style.top = outPxY + 'px';
        stageEl.appendChild(stake);
      } else if (data.anchoringMethod === 'ballast') {
        var block = document.createElement('div');
        block.className = 'plan2d-anchor-ballast';
        block.style.left = outPxX + 'px';
        block.style.top = outPxY + 'px';
        stageEl.appendChild(block);
      }
    });
  }
  const selectedItem = (data.objects || []).find(function (o) { return o.id === data.selectedId; });
  const selectedDanceGroup = !!(selectedItem && selectedItem.kind === 'dance');
  
  const displayObjects=(data.objects||[]).filter(o=>!(data.placement?.danceSizeId&&o.kind==='dance')).concat((data.placement?.objects||[]).map(o=>({...o,preview:true})));
  stageEl.classList.toggle('is-placing',!!data.placement);
  displayObjects.forEach(function (item) {
  const wrap = document.createElement('div');
  const isDance = item.kind === 'dance';
  const tableDef = (!isDance && item.kind === 'table') ? tableById(item.tableId) : null;
  const silhouette = tableDef ? tableDef.silhouette : null;
  const shapeClass = isDance ? 'rect dance' : (item.shape === 'round' ? 'round' : 'rect');
  const silhouetteClass = silhouette ? ' plan2d-table--' + silhouette : '';
  var linenClass = linenVisual(item.linenId) ? ' plan2d-linen--' + linenVisual(item.linenId) : '';
  wrap.className = 'plan2d-object ' + shapeClass + silhouetteClass + linenClass + ' ' + severityClass(data, item.id) + ((selectedDanceGroup ? item.kind === 'dance' : data.selectedId === item.id) ? ' selected' : '');
  if(item.preview)wrap.classList.add('placement-ghost');
  const disp = toDispXY(item.x, item.y);
  const dispSize = toDispWD(item.widthFt, item.depthFt);
  wrap.style.left = (disp.x * pxPerFt) + 'px';
  wrap.style.top = (disp.y * pxPerFt) + 'px';
  wrap.style.width = (dispSize.w * pxPerFt) + 'px';
  wrap.style.height = (dispSize.d * pxPerFt) + 'px';
  wrap.dataset.itemId = item.id;
  if(tableDef)wrap.dataset.tableId=tableDef.id;
  wrap.tabIndex = item.preview?-1:0;
  if(item.preview)wrap.dataset.preview='true';
  wrap.setAttribute('role','button');
  wrap.setAttribute('aria-label',(isDance?'Dance floor section':(tableDef?.name||'Table'))+' · '+(item.seatCount||0)+' seats');
  wrap.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();callbacks.onSelect?.(item.id);}});

                             const top = document.createElement('div');
  top.className = 'plan2d-table-top';
  top.innerHTML = isDance ? '<span class="parquet-quadrants"><i></i><i></i><i></i><i></i></span>' : item.linenId ? '' : tableTopDetailHtml(silhouette);
  if(['linen-runner-9ft','linen-napkins'].includes(item.linenId)){
    const accent=document.createElement('span');accent.className=item.linenId==='linen-napkins'?'plan2d-napkin':'plan2d-runner';
    accent.style.background=linenColorHex(item.linenColor);
    if(item.linenId==='linen-runner-9ft'){accent.style.width=(Math.max(dispSize.w,dispSize.d)*pxPerFt)+'px';accent.style.height=(1.1*pxPerFt)+'px';if(dispSize.d>dispSize.w)accent.style.transform='translate(-50%,-50%) rotate(90deg)';}
    top.appendChild(accent);
  }else if(item.linenId){top.classList.add('has-linen');top.style.background=linenColorHex(item.linenColor);}
  const label = document.createElement('span');
  label.className = 'plan2d-table-label';
  if (isDance) {
    label.textContent = '';
  } else {
    label.textContent = item.seatCount > 0 ? (item.seatCount + ' seats') : '';
  }
  top.appendChild(label);
  wrap.appendChild(top);
  stageEl.appendChild(wrap);

                             if (!isDance && item.seatCount > 0) {
                               const radiusFt = item.shape === 'round' ? item.widthFt / 2 : Math.max(item.widthFt, item.depthFt) / 2;
                               buildChairDots(stageEl, item, radiusFt, item.x + item.widthFt / 2, item.y + item.depthFt / 2);
                             }

                             wrap.addEventListener('pointerdown', function (e) { onPointerDown(e, item); });
});

    var danceItems = displayObjects.filter(function (o) { return o.kind === 'dance'; });
  if (danceItems.length) {
    var fMinX = Infinity, fMinY = Infinity, fMaxX = -Infinity, fMaxY = -Infinity;
    danceItems.forEach(function (o) {
      var c1 = toDispXY(o.x, o.y);
      var c2 = toDispXY(o.x + o.widthFt, o.y + o.depthFt);
      [c1, c2].forEach(function (c) {
        if (c.x < fMinX) fMinX = c.x;
        if (c.y < fMinY) fMinY = c.y;
        if (c.x > fMaxX) fMaxX = c.x;
        if (c.y > fMaxY) fMaxY = c.y;
      });
    });
    var frame = document.createElement('div');
    frame.className = 'plan2d-dance-frame' + (selectedDanceGroup ? ' selected' : '');
    frame.style.left = (fMinX * pxPerFt) + 'px';
    frame.style.top = (fMinY * pxPerFt) + 'px';
    frame.style.width = ((fMaxX - fMinX) * pxPerFt) + 'px';
    frame.style.height = ((fMaxY - fMinY) * pxPerFt) + 'px';
    var frameLabel = document.createElement('span');
    frameLabel.className = 'plan2d-dance-frame-label';
    frameLabel.textContent = Math.round(fMaxX - fMinX) + '\u00d7' + Math.round(fMaxY - fMinY) + ' Dance Floor';
    frame.appendChild(frameLabel);
    stageEl.appendChild(frame);
  }
  
}

// Small top-down visual detail per real Friendly Party Rental table type so tables
// are recognizable on the plan without reading the label (e.g. a fold seam on
// banquet tables, a pedestal mark on cocktail tables, a basin on Fill & Chill).
function tableTopDetailHtml(silhouette) {
  if (silhouette === 'banquet-rect') {
    return '<span class="plan2d-table-seam"></span>';
  }
  if (silhouette === 'cocktail-pedestal') {
    return '<span class="plan2d-table-pedestal"></span>';
  }
  if (silhouette === 'fillchill-tub') {
    return '<span class="plan2d-table-basin"><span class="plan2d-table-drain"></span></span>';
  }
  return '';
}

function onPointerDown(e, item) {
  if(currentData?.placement)return;
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
  window.addEventListener('pointercancel', onPointerUp);
}

function onPointerMove(e) {
  if (!dragging || !dragTarget) return;
  const dxPx = e.clientX - dragStartPx.x;
  const dyPx = e.clientY - dragStartPx.y;
  if (Math.abs(dxPx) > 3 || Math.abs(dyPx) > 3) dragMoved = true;
  const tent = currentData.tent;
  // Mouse deltas are measured in display space; convert back through the
// current presentation rotation (toDispXY is a pure axis swap, so it is
// its own inverse) so dragging still feels natural regardless of whether
// the scene is being shown rotated 90 degrees for framing.
const dModel = toDispXY(dxPx / pxPerFt, dyPx / pxPerFt);
  let newX = dragOrigFt.x + dModel.x;
  let newY = dragOrigFt.y + dModel.y;
  newX = Math.max(0, Math.min(tent.widthFt - dragTarget.widthFt, newX));
  newY = Math.max(0, Math.min(tent.lengthFt - dragTarget.depthFt, newY));
  if(dragTarget.kind==='dance'){
    const floor=currentData.objects.filter(o=>o.kind==='dance');
    const dx=Math.max(-Math.min(...floor.map(o=>o.x)),Math.min(tent.widthFt-Math.max(...floor.map(o=>o.x+o.widthFt)),newX-dragOrigFt.x));
    const dy=Math.max(-Math.min(...floor.map(o=>o.y)),Math.min(tent.lengthFt-Math.max(...floor.map(o=>o.y+o.depthFt)),newY-dragOrigFt.y));
    newX=dragOrigFt.x+dx;newY=dragOrigFt.y+dy;
    floor.forEach(item=>{const el=stageEl.querySelector('[data-item-id="'+item.id+'"]'),disp=toDispXY(item.x+dx,item.y+dy);if(el){el.style.left=disp.x*pxPerFt+'px';el.style.top=disp.y*pxPerFt+'px';}});
    const frame=stageEl.querySelector('.plan2d-dance-frame'),delta=toDispXY(dx,dy);if(frame)frame.style.transform='translate('+delta.x*pxPerFt+'px,'+delta.y*pxPerFt+'px)';
  }
  stageEl.querySelectorAll('.plan2d-chair').forEach(chair=>{if(chair.dataset.chairFor!==dragTarget.id)return;const disp=toDispXY(Number(chair.dataset.modelX)+newX-dragOrigFt.x,Number(chair.dataset.modelY)+newY-dragOrigFt.y);chair.style.left=disp.x*pxPerFt+'px';chair.style.top=disp.y*pxPerFt+'px';});
  dragLiveFt = { x: newX, y: newY };
  const el = stageEl.querySelector('[data-item-id="' + dragTarget.id + '"]');
  if (el) {
    const disp = toDispXY(newX, newY);
    el.style.left = (disp.x * pxPerFt) + 'px';
    el.style.top = (disp.y * pxPerFt) + 'px';
  }
}

function onPointerUp(event) {
  if (!dragging) return;
  dragging = false;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
  const target = dragTarget;
  dragTarget = null;
  const el = target ? stageEl.querySelector('[data-item-id="' + target.id + '"]') : null;
  if (el) el.classList.remove('dragging');
  if (!target) return;
  if(event?.type==='pointercancel'){render(currentData);return;}
  if (!dragMoved) {
    if (callbacks.onSelect) callbacks.onSelect(target.id);
  } else {
    if (callbacks.onMove) callbacks.onMove(target.id, dragLiveFt.x, dragLiveFt.y);
  }
}

function onResize() {
  if (currentData) render(currentData);
}

function placementPoint(e){
  const r=stageEl.getBoundingClientRect();return toDispXY((e.clientX-r.left)/pxPerFt,(e.clientY-r.top)/pxPerFt);
}
function placementDown(e){
  if(!currentData?.placement||e.button>0)return;
  e.preventDefault();e.stopPropagation();placementPointers.add(e.pointerId);
  if(placementPointers.size>1){placementPointer=null;return;}
  placementPointer=e.pointerId;stageEl.setPointerCapture?.(e.pointerId);
  const p=placementPoint(e);callbacks.onPlacementMove?.(p.x,p.y);
}
function placementMove(e){
  if(!currentData?.placement||placementPointers.size>1||!(e.pointerType==='mouse'||placementPointer===e.pointerId))return;
  const p=placementPoint(e);callbacks.onPlacementMove?.(p.x,p.y);
}
function placementUp(e){
  placementPointers.delete(e.pointerId);
  if(placementPointer!==e.pointerId)return;placementPointer=null;
  if(e.type!=='pointercancel'){const p=placementPoint(e);callbacks.onPlacementMove?.(p.x,p.y);callbacks.onPlace?.();}
  try{stageEl.releasePointerCapture?.(e.pointerId);}catch{}
}

export function mount(containerEl, data, cbs) {
  container = containerEl;
  callbacks = cbs || {};
  clear(container);
  stageEl = document.createElement('div');
  stageEl.className = 'plan2d-stage';
  stageEl.addEventListener('pointerdown',placementDown,true);
  stageEl.addEventListener('pointermove',placementMove);
  stageEl.addEventListener('pointerup',placementUp);
  stageEl.addEventListener('pointercancel',placementUp);
  container.appendChild(stageEl);
  currentData = data;
  // Defer the first paint by a couple of frames so the container has a real,
// stable measured size (fixes the plan rendering at a tiny collapsed scale
// right after mount or after switching back from 3D view).
requestAnimationFrame(function () {
  requestAnimationFrame(function () { if(currentData&&stageEl)render(currentData); });
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
  window.removeEventListener('pointercancel', onPointerUp);
  if (container) clear(container);
  placementPointers.clear();placementPointer=null;
  container = null;
  stageEl = null;
  currentData = null;
  callbacks = {};
}
