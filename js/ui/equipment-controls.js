import { tabletopSvg } from './tabletop-symbols.js';
import { chairPlanSvg } from './equipment-symbols.js';
import { chairPositions } from '../core/seating.js';
import { objectLocalDimensions } from '../core/world-space.js';
import { linenColorHex } from '../data/linens.js';
export function escapeHtml(value) {return String(value == null ? '' : value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

// Common dining equipment first; imported catalog order can change after a sync.
const DISPLAY_ORDER=['round-5ft','banquet-6ft','banquet-8ft','sweetheart-half-round-60','cocktail','fill-chill-4ft','plastic-white','resin-white','crossback-natural','chiavari-gold','chiavari-white','chiavari-mahogany','throne-king','throne-queen-tiffany'];
export function orderEquipment(items) {
  const rank=item=>{const index=DISPLAY_ORDER.indexOf(item.visualModelId||String(item.id||'').split('--')[0]);return index<0?100:index;};
  return [...items].sort((a,b)=>rank(a)-rank(b) || String(a.name||'').localeCompare(String(b.name||'')));
}

// Refresh controls without losing the customer's place during repeated edits.
export function renderEquipmentContent(panel, html) {
  const active=panel.ownerDocument.activeElement;
  const focused=panel.contains(active) && (active.dataset.role || active.dataset.ts) ? {...active.dataset} : null;
  const selection=focused && typeof active.selectionStart==='number' ? [active.selectionStart,active.selectionEnd,active.selectionDirection] : null;
  const scrollTop=panel.scrollTop;
  const horizontal=[...panel.querySelectorAll('[data-scroll-key]')].map(el=>[el.dataset.scrollKey,el.scrollLeft]);
  panel.innerHTML=html;
  if(focused) {
    const family=focused.role ? 'role' : 'ts';
    const controls=[...panel.querySelectorAll('[data-'+family+']')];
    const replacement=controls.find(el=>!el.disabled && Object.entries(focused).every(([k,v])=>el.dataset[k]===v))
      || controls.find(el=>!el.disabled && el.dataset[family]===focused[family] && ['id','product','category'].every(k=>el.dataset[k]===focused[k]));
    replacement?.focus({preventScroll:true});
    if(replacement && selection && typeof replacement.selectionStart==='number')replacement.setSelectionRange(...selection);
  }
  panel.scrollTop=scrollTop;
  for(const [key,left] of horizontal) {
    const row=[...panel.querySelectorAll('[data-scroll-key]')].find(el=>el.dataset.scrollKey===key);
    if(row)row.scrollLeft=left;
  }
}

const MODEL_PREVIEWS=new Set(['crossback-natural','sweetheart-half-round-60','plastic-white','resin-white','chiavari-gold','chiavari-white','chiavari-mahogany','throne-king','throne-queen-tiffany','round-5ft','banquet-6ft','banquet-8ft','cocktail','fill-chill-4ft','dance-floor','lighting-bistro','lighting-chandelier','lighting-uplight-single']);
export function equipmentPreview(id, className='equipment-model') {
  if(!MODEL_PREVIEWS.has(id))return '';
  return `<img class="${escapeHtml(className)}" src="/assets/equipment/${id}.png?v=20260926-furniture-1" width="480" height="360" alt="" aria-hidden="true" decoding="async" loading="lazy">`;
}
export function chairVisual(chair) {
  if(chair.photoUrl)return `<img class="chair-visual equipment-model" src="${escapeHtml(chair.photoUrl)}" alt="" decoding="async" loading="lazy">`;
  const preview=equipmentPreview(chair.visualModelId||chair.id,'chair-visual equipment-model');
  if(preview)return preview;
  const frame=escapeHtml(chair.frameColor || '#f2f1ec'),accent=escapeHtml(chair.accentColor || '#f2f1ec');
  let back;
  if(chair.silhouette==='throne') back=`<path d="M31 70V30Q31 18 42 18Q50 1 58 18Q69 18 69 30V70Z" fill="${accent}" stroke-width="5"/><path d="M37 35L63 61M63 35L37 61" opacity=".3"/><path d="M22 66V83M78 66V83M22 68H32M68 68H78" stroke-width="5"/>`;
  else if(chair.silhouette==='crossback') back=`<path d="M30 76L27 26Q50 12 73 26L70 76M29 31Q50 24 71 31M33 85Q50 91 67 85" fill="none" stroke-width="5"/><path d="M30 34L68 65M70 34L32 65" fill="none" stroke="#5e4028" stroke-width="6"/><path d="M30 34L68 65M70 34L32 65" fill="none" stroke-width="4"/>`;
  else if(chair.silhouette==='chiavari') back='<path d="M32 78V23Q50 14 68 23V78M32 31H68M32 57H68M40 30V57M50 30V57M60 30V57M32 91H68" fill="none" stroke-width="4"/>';
  else if(chair.silhouette==='resin') back=`<path d="M31 76V27Q50 18 69 27V76" fill="none" stroke-width="5"/><path d="M32 32H68V44H32Z" fill="${frame}"/><path d="M33 84H67" stroke-width="4"/>`;
  else back=`<rect x="30" y="29" width="40" height="23" rx="7" fill="${frame}"/><path d="M33 52L67 106M67 52L33 106" stroke-width="4" fill="none"/>`;
  return `<svg class="chair-visual" aria-hidden="true" viewBox="0 0 100 120"><ellipse cx="50" cy="110" rx="31" ry="4" fill="#dce3dd"/><g stroke="${frame}" stroke-linejoin="round" stroke-linecap="round">${back}<path d="M32 76L28 106M68 76L72 106" stroke-width="5"/><rect x="28" y="70" width="44" height="9" rx="3" fill="${accent}" stroke-width="3"/></g><path d="M30 79H70" stroke="#66776b" opacity=".35"/></svg>`;
}

export function chairsDrawer(chairs, defaultId, objects) {
  const tables=objects.filter(o=>o.kind==='table' && o.seatCount>0);
  const total=tables.reduce((n,o)=>n+Number(o.seatCount),0);
  const note=tables.length ? `Choose a style for all ${tables.length} seated ${tables.length===1?'table':'tables'} (${total} chairs). To change just one table, select it on the plan.` : 'Choose the chairs to include when you add tables.';
  return `<p class="equipment-note">${note}</p><div class="item-card-grid">${orderEquipment(chairs.filter(c=>!c.isThrone)).map(chair=>{
    const quantity=tables.filter(o=>o.chairId===chair.id).reduce((n,o)=>n+Number(o.seatCount),0);
    const selected=tables.length ? tables.every(o=>o.chairId===chair.id) : chair.id===defaultId;
    const price=chair.pricePerDay==null ? 'Confirm pricing' : '$'+Number(chair.pricePerDay).toFixed(2)+' / chair / day';
    const action=tables.length ? `Use for ${total} chairs` : 'Use with new tables';
    return `<button type="button" class="item-card equipment-card${selected?' selected':''}" data-role="chair-card" data-id="${escapeHtml(chair.id)}" aria-pressed="${selected}" aria-label="${escapeHtml(chair.name)}: ${action}">${selected?'<span class="item-card-check" aria-hidden="true">✓</span>':''}${chairVisual(chair)}<span class="item-card-name">${escapeHtml(chair.name)}</span><span class="item-card-price">${price}</span><span class="item-card-desc">${quantity?quantity+' in your layout':chair.isThrone?'Statement chair':'Dining chair'}${chair.dimensionsConfirmed===false?' · dimensions approximate':''}</span><span class="equipment-add">${selected?'✓ Selected':action}</span></button>`;
  }).join('')}</div>${chairs.some(c=>c.isThrone)?`<h3>Throne &amp; accent chairs</h3><p class="equipment-note">Place these individually for a guest of honor, sweetheart area or photo spot.</p><div class="item-card-grid">${chairs.filter(c=>c.isThrone).map(c=>`<button type="button" class="item-card equipment-card" data-role="accent-chair" data-id="${escapeHtml(c.id)}">${chairVisual(c)}<span class="item-card-name">${escapeHtml(c.name)}</span><span class="item-card-price">${c.pricePerDay==null?'Confirm pricing':'$'+Number(c.pricePerDay).toFixed(2)+'/each/day'}</span><span class="equipment-add">+ Place one chair</span></button>`).join('')}</div>`:''}`;
}
let previewSequence=0;
export function tableVisual(table, chair = {}, placed) {
  const item=placed || {shape:table.shape,widthFt:table.diameterFt || table.widthFt,depthFt:table.diameterFt || table.depthFt,seatCount:table.seatsDefault};
  const w=item.widthFt,d=item.depthFt,span=Math.max(w,d)+5,id='table-surface-'+(++previewSequence);
  const cw=chair.seatWidthFt || 1.5,cd=chair.seatDepthFt || 1.5;
  const seats=chairPositions(item,chair).map(p=>`<g style="--chair-frame:${escapeHtml(chair.frameColor || '#fff')};--chair-accent:${escapeHtml(chair.accentColor || '#fff')}" transform="translate(${p.x} ${p.y}) rotate(${p.angle*180/Math.PI-90})">${chairPlanSvg(chair.silhouette).replace('<svg ', '<svg x="'+(-cw/2)+'" y="'+(-cd/2)+'" width="'+cw+'" height="'+cd+'" overflow="visible" ')}</g>`).join('');
  const local=objectLocalDimensions(item),halfRound=item.shape==='half-round';
  const top=halfRound?`<path data-table-shape="half-round" d="M${-local.widthFt/2} ${-local.depthFt/2}H${local.widthFt/2}A${local.widthFt/2} ${local.depthFt} 0 0 1 ${-local.widthFt/2} ${-local.depthFt/2}Z" transform="rotate(${Number(item.rotationDeg)||0})"/>`:item.shape==='round'?`<ellipse cx="0" cy="0" rx="${w/2}" ry="${d/2}"/>`:`<rect x="${-w/2}" y="${-d/2}" width="${w}" height="${d}" rx=".14"/>`;
  const partial=['linen-runner-9ft','linen-napkins'].includes(item.linenId);
  const tub=table.silhouette==='fillchill-tub',plastic=(table.visualModelId||String(table.id||'').split('--')[0])==='banquet-6ft',color=item.linenId && !partial ? linenColorHex(item.linenColor) : tub || plastic?'#eeeee5':'#b99165';
  const grain=plastic&&!item.linenId?'':item.linenId?'<path d="M0 0H1M0 0V1" stroke="#fff" stroke-opacity=".16" stroke-width=".02"/>':'<path d="M0 .08Q.25 .04 .5 .08T1 .08M0 .23Q.25 .19 .5 .23T1 .23" fill="none" stroke="#6e451f" stroke-opacity=".24" stroke-width=".018"/>';
  const linenOverlay=partial ? `<rect x="${item.linenId==='linen-napkins'?-.35:w>=d?-w/2:-.55}" y="${item.linenId==='linen-napkins'?-.25:w>=d?-.55:-d/2}" width="${item.linenId==='linen-napkins'?.7:w>=d?w:1.1}" height="${item.linenId==='linen-napkins'?.5:w>=d?1.1:d}" fill="${linenColorHex(item.linenColor)}" stroke="#667363" stroke-opacity=".4" stroke-width=".025"/>` : '';
  const basin=tub&&!item.linenId?`<rect x="${-w/2+.15}" y="${-d/2+.15}" width="${w-.3}" height="${d-.3}" rx=".12" fill="#d2d5ce" stroke="#929c90" stroke-width=".05"/><circle cx="${w*.3}" cy="0" r=".07" fill="#7a8477"/>`:'';
  return `<svg class="equipment-visual" aria-hidden="true" viewBox="${-span/2} ${-span/2} ${span} ${span}"><defs>${halfRound?`<clipPath id="${id}-clip">${top}</clipPath>`:''}<pattern id="${id}" width="${item.linenId ? .12 : 1}" height="${item.linenId ? .12 : .3}" patternUnits="userSpaceOnUse">${grain}</pattern></defs>${seats}<g class="table-surface" fill="${color}" stroke="#8f917f" stroke-width=".025">${top}</g><g fill="url(#${id})" stroke="none">${tub?'':top}</g>${basin}<g${halfRound?` clip-path="url(#${id}-clip)"`:''}>${linenOverlay}${tabletopSvg(item).replace('<svg ','<svg x="'+(-w/2)+'" y="'+(-d/2)+'" width="'+w+'" height="'+d+'" ')}</g></svg>`;
}
export function tableCard(table, chair, quantity) {
  const seats=table.seatsDefault || 0;
  const price=table.pricePerDay == null || seats && chair?.pricePerDay==null ? 'Confirm pricing' : '$'+(Number(table.pricePerDay)+seats*Number(chair?.pricePerDay || 0)).toFixed(2)+'/day';
  const included=seats ? `Table + ${seats} chairs` : 'Table only';
  return `<div class="table-choice"><button class="item-card equipment-card" data-role="table-card" data-id="${escapeHtml(table.id)}" aria-label="Add ${escapeHtml(table.name)}">${table.photoUrl?`<img class="equipment-model" src="${escapeHtml(table.photoUrl)}" alt="" loading="lazy" decoding="async">`:equipmentPreview(table.visualModelId||table.id) || tableVisual(table,chair)}<span class="item-card-name">${escapeHtml(table.name)}</span><span class="item-card-desc">${table.seatsDefault ? table.seatsDefault+' seats' : 'Standing / service'}${quantity ? ' · '+quantity+' in layout' : ''}</span><span class="item-card-price">${price}</span><span class="item-card-desc">${included}${table.dimensionsConfirmed===false?' · approximate dimensions':''}</span><span class="equipment-add">+ Add table</span></button><button type="button" class="table-style-link" data-role="table-style" data-id="${escapeHtml(table.id)}">Style a table first ↗</button></div>`;
}
export function tableControls(item, table, chairs, linens, matchingCount=1) {
  chairs=chairs.filter(c=>!c.isThrone);
  const esc=escapeHtml,max=Math.max(0,...(table.seatsOptions||[12]));
  const options=(list,current)=>list.map(x=>`<option value="${esc(x.id)}"${x.id===current?' selected':''}>${esc(x.name)}</option>`).join('');
  const linen=linens.find(l=>l.id===item.linenId),color=item.linenColor || 'White',chair=chairs.find(c=>c.id===item.chairId);
  const colors=linen?.colors || ['White'];
  const dimensionNotes=(table.dimensionsConfirmed===false?`<p class="equipment-note" data-dimension-status="estimated">${esc(table.dimensionsNote||'Approximate model dimensions. Confirm the actual table size and required clearance with your rental company.')}</p>`:'')+(chair?.dimensionsConfirmed===false?`<p class="equipment-note" data-chair-dimension-status="estimated">${esc(chair.dimensionsNote||'Chair dimensions are approximate. Confirm actual measurements with your rental company.')}</p>`:'');
  return `${dimensionNotes?`<details class="equipment-dimension-notes"><summary>Approximate dimensions · check details</summary>${dimensionNotes}</details>`:''}${max>0?`<div class="table-seat-controls">
      <label class="equipment-field">Chairs<select data-role="insp-chair" data-id="${esc(item.id)}">${options(orderEquipment(chairs),item.chairId)}</select></label>
      <div class="equipment-field"><span>Seats</span><div class="seat-stepper">
        <button type="button" data-role="insp-seats" data-delta="-1" data-id="${esc(item.id)}" aria-label="Remove one seat"${item.seatCount<=0?' disabled':''}>−</button>
        <output aria-label="Seat count">${item.seatCount || 0}</output>
        <button type="button" data-role="insp-seats" data-delta="1" data-id="${esc(item.id)}" aria-label="Add one seat"${item.seatCount>=max?' disabled':''}>+</button>
      </div></div>
    </div>`:'<p class="equipment-note">Standing / service table · no chairs</p>'}
    <label class="equipment-field">Linen<select data-role="insp-linen" data-id="${esc(item.id)}"><option value="">No linen</option>${options(linens,item.linenId)}</select></label>
    ${item.linenId?`<div class="equipment-field"><span>Linen color · ${esc(color)}</span><div class="linen-swatches" role="group" aria-label="Linen color" data-scroll-key="linen-colors">${colors.map(c=>`<button type="button" class="linen-swatch" style="--swatch:${linenColorHex(c)}" data-role="insp-linen-swatch" data-id="${esc(item.id)}" data-color="${esc(c)}" aria-label="${esc(c)}" title="${esc(c)}" aria-pressed="${c===color}"><span aria-hidden="true">${c===color?'✓':''}</span></button>`).join('')}</div></div>`:''}
    ${matchingCount>1?`<div class="match-table-style"><button type="button" class="btn-secondary" data-role="insp-match-tables" data-id="${esc(item.id)}">Use chairs &amp; linen on all ${matchingCount} matching tables</button><span>Table positions and seat counts stay the same.</span></div>`:''}
    `;
}
export function tableInspector(item, table, chairs, linens, matchingCount=1) {
  const esc=escapeHtml,chair=chairs.find(c=>c.id===item.chairId) || {};
  return `<button class="btn-tertiary inspector-close" data-role="inspector-close">Close</button>
    <h3 class="inspector-title">${esc(table.name)}</h3>${tableVisual(table,chair,item)}
    ${tableControls(item,table,chairs,linens,matchingCount)}
    <div class="inspector-actions equipment-actions"><button class="btn-secondary" data-role="insp-rotate" data-id="${esc(item.id)}">Rotate 90°</button><button class="btn-secondary" data-role="insp-duplicate" data-id="${esc(item.id)}">Duplicate</button><button class="btn-danger" data-role="insp-delete" data-id="${esc(item.id)}">Delete</button></div>
    <button class="btn-primary table-studio-launch" data-role="insp-design-table" data-id="${esc(item.id)}">Style This Table · Close-up</button>
    <p class="equipment-note">Drag this table on the plan to move it.</p>`;
}
