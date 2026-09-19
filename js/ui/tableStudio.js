// The close-up edits the same rental objects and uses the same controls as the plan.
import { escapeHtml, tableVisual, tableControls, renderEquipmentContent } from './equipment-controls.js';
import { summarizeEvent } from '../core/eventSummary.js';

let dialog=null, activeId=null, storeRef=null, options=null, unsubscribe=null, previousOverflow='';
const money=n=>'$'+Number(n).toFixed(2);
const item=()=>storeRef?.getState().objects.find(o=>o.id===activeId && o.kind==='table');
const find=(list,id)=>(list || []).find(o=>o.id===id);

function render() {
  const current=item(),table=current && find(options.tables,current.tableId);
  if(!current || !table){close();return;}
  const chair=find(options.chairs,current.chairId),linen=find(options.linens,current.linenId);
  const matching=storeRef.getState().objects.filter(o=>o.kind==='table' && o.tableId===current.tableId).length;
  const linens=options.linens.filter(l=>l.fitsTableIds?.includes(current.tableId) && !['linen-napkins','linen-runner-9ft'].includes(l.id));
  const summary=summarizeEvent({objects:[current]},options,{includeTent:false});
  const caption=[current.seatCount?`${current.seatCount} ${chair?.name || 'chairs'}`:'No chairs',linen?`${current.linenColor || 'White'} ${linen.name}`:'No linen'].join(' · ');
  dialog.querySelector('#tableStudioTitle').textContent=table.name;
  const preview=dialog.querySelector('.ts-visual');
  preview.setAttribute('aria-label',table.name+': '+caption);
  preview.innerHTML=tableVisual(table,chair,current);
  dialog.querySelector('.ts-caption').textContent=caption;
  renderEquipmentContent(dialog.querySelector('.ts-controls'),tableControls(current,table,options.chairs,linens,matching));
  dialog.querySelector('.ts-price-lines').innerHTML=summary.lines.map(line=>`<div><span>${line.qty} × ${escapeHtml(line.label)}</span><strong>${line.amount==null?'Confirm pricing':money(line.amount)}</strong></div>`).join('');
  dialog.querySelector('.ts-total').textContent=summary.total==null?'Confirm pricing':money(summary.total)+'/day';
  dialog.querySelector('.ts-price-note').textContent=summary.total==null?`Known items: ${money(summary.knownSubtotal)}/day`:'Table, selected chairs and linen';
  dialog.querySelector('[data-ts="undo"]').disabled=!storeRef.canUndo();
  dialog.querySelector('[data-ts="redo"]').disabled=!storeRef.canRedo();
}

function ensure() {
  if(dialog)return;
  dialog=document.createElement('dialog');
  dialog.className='ts-dialog';dialog.setAttribute('aria-labelledby','tableStudioTitle');
  dialog.innerHTML=`<header class="ts-header"><div><small>YOUR TABLE</small><h2 id="tableStudioTitle"></h2></div><button type="button" class="btn-secondary" data-ts="close">← Event</button></header>
    <div class="ts-body"><section class="ts-preview"><div class="ts-visual" role="img"></div><p class="ts-caption"></p></section>
    <section class="ts-editing" aria-label="Customize this table"><p class="ts-intro">Changes update your event as you go.</p><div class="ts-controls"></div>
      <details class="ts-breakdown"><summary>Price breakdown for this table</summary><div class="ts-price-lines"></div><p>Delivery, taxes and final pricing are confirmed with your rental company.</p></details>
      <p class="ts-message" role="status"></p>
    </section></div>
    <footer class="ts-footer"><div class="ts-estimate" role="status"><span>This table setup</span><strong class="ts-total"></strong><small class="ts-price-note"></small></div><div class="ts-history"><button type="button" class="btn-secondary" data-ts="undo" aria-label="Undo">↶</button><button type="button" class="btn-secondary" data-ts="redo" aria-label="Redo">↷</button></div><button type="button" class="btn-primary ts-done" data-ts="close">Done</button></footer>`;
  document.body.appendChild(dialog);
  dialog.addEventListener('click',e=>{
    const action=e.target.closest('[data-ts]')?.dataset.ts;
    if(action==='close'){close();return;}
    if(action==='undo'){storeRef.undo();return;}
    if(action==='redo'){storeRef.redo();return;}
    const control=e.target.closest('[data-role]');
    if(!control)return;
    options.onClick(e);
    if(control.dataset.role==='insp-match-tables' && dialog.open)dialog.querySelector('.ts-message').textContent='Chairs and linens now match on tables of this size.';
  });
  dialog.addEventListener('change',e=>{if(e.target.matches('[data-role]'))options.onChange(e);});
  // Keep Escape local so closing the detail does not deselect the event table.
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}});
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('close',()=>{if(!dialog.open)cleanup();});
}

function cleanup() {
  if(!storeRef)return;
  const id=activeId;
  unsubscribe?.();unsubscribe=null;storeRef=null;activeId=null;options=null;
  document.body.style.overflow=previousOverflow;
  // Edits replace the original inspector button, so resolve its current element.
  const trigger=[...document.querySelectorAll('#inspectorPanel [data-role="insp-design-table"]')].find(el=>el.dataset.id===id);
  (trigger || document.getElementById('btnUndo'))?.focus({preventScroll:true});
}
export function close(){if(dialog?.open)dialog.close();cleanup();}
export function openTableStudio(id,store,config) {
  close();ensure();
  activeId=id;storeRef=store;options=config;
  if(!item() || !find(config.tables,item().tableId)){cleanup();return;}
  previousOverflow=document.body.style.overflow;
  render();
  dialog.querySelector('.ts-editing').scrollTop=0;
  dialog.querySelector('.ts-breakdown').open=false;
  dialog.querySelector('.ts-message').textContent='';
  unsubscribe=store.subscribe(render);
  dialog.showModal();document.body.style.overflow='hidden';
  dialog.querySelector('[data-ts="close"]').focus({preventScroll:true});
}
