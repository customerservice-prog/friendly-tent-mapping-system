// Close-up and event plan edit the same rental object; new tables remain drafts
// until the customer chooses to place them in the event.
import { escapeHtml as esc, tableVisual, tableControls, renderEquipmentContent, chairVisual } from './equipment-controls.js';
import { TABLETOP, TABLETOP_GROUPS, tabletopQuantity } from '../data/tabletop.js';
import { LINEN_COLORS, linenColorHex } from '../data/linens.js';
import { summarizeEvent } from '../core/eventSummary.js';
let dialog=null,activeId=null,storeRef=null,options=null,unsubscribe=null,previousOverflow='',view=null,mode='3d',loadToken=0,loadTimer=null,category='Place settings',search='';
const money=n=>'$'+Number(n).toFixed(2),item=()=>storeRef?.getState().objects.find(o=>o.id===activeId&&o.kind==='table'),find=(list,id)=>(list||[]).find(o=>o.id===id);
function change(patch){if(item())storeRef.updateObject(activeId,{tabletop:item().tabletop||[],...patch});}
function rentalPrice(p){return p.pricePerDay==null?'Confirm pricing':money(p.pricePerDay)+'/each';}
function tabletopControls(current){
 const selected=current.tabletop||[],groups=TABLETOP_GROUPS.filter(g=>TABLETOP.some(p=>p.group===g));if(category!=='selected'&&!groups.includes(category))category=groups[0]||'selected';
 if(!groups.length&&!selected.length)return '<p class="equipment-note">Your rental company has not listed tabletop accessories in this catalog yet.</p>';
 const query=search.trim().toLocaleLowerCase();
 const products=(category==='selected'?selected.map(e=>TABLETOP.find(p=>p.id===e.productId)||{id:e.productId,name:'Unavailable item',unavailable:true}):TABLETOP.filter(p=>query||p.group===category)).filter(p=>!query||(p.name+' '+(p.group||'')).toLocaleLowerCase().includes(query));
 return `<div class="ts-category-tabs" role="group" aria-label="Tabletop categories" data-scroll-key="tabletop-groups"><button type="button" data-ts="category" data-category="selected" aria-pressed="${category==='selected'}">On this table <span>${selected.length}</span></button>${groups.map(g=>`<button type="button" data-ts="category" data-category="${g}" aria-pressed="${g===category&&!query}">${g}</button>`).join('')}</div><p class="ts-results" role="status">${query?`${products.length} ${products.length===1?'item':'items'} found${category==='selected'?' on this table':''}`:category==='selected'?'All your tabletop selections, in one place.':'Choose items to add to this table.'}</p><div class="ts-product-grid">${products.map(p=>{
  const entry=selected.find(e=>e.productId===p.id),qty=entry?tabletopQuantity(entry,current):0;
  return `<article class="ts-product${entry?' is-selected':''}">${p.photoUrl?`<img src="${esc(p.photoUrl)}" alt="" loading="lazy" decoding="async">`:'<span class="ts-product-placeholder" aria-hidden="true">✧</span>'}<div><h4>${esc(p.name)}</h4><p>${rentalPrice(p)}</p></div>${p.unavailable?`<p>This saved item is no longer in the catalog. Remove it or confirm it with your rental company.</p><output>Quantity: ${qty}</output><button class="ts-remove" type="button" data-ts="remove" data-product="${esc(p.id)}">Remove</button>`:entry?`<div class="ts-product-quantity"><button type="button" data-ts="quantity" data-product="${esc(p.id)}" data-delta="-1" aria-label="Remove one ${esc(p.name)}">−</button><output aria-label="Quantity of ${esc(p.name)}">${qty}</output><button type="button" data-ts="quantity" data-product="${esc(p.id)}" data-delta="1" aria-label="Add one ${esc(p.name)}"${qty>=100?' disabled':''}>+</button></div>${p.perSeat?`<label class="ts-per-seat"><input type="checkbox" data-ts="per-seat" data-product="${esc(p.id)}"${entry.perSeat?' checked':''}> One per seat</label>`:''}${['napkin','runner'].includes(p.type)?`<label class="ts-color-label">Preview color<select data-ts="top-color" data-product="${esc(p.id)}">${LINEN_COLORS.map(c=>`<option${(entry.color||'White')===c?' selected':''}>${c}</option>`).join('')}</select></label>`:''}<button class="ts-remove" type="button" data-ts="remove" data-product="${esc(p.id)}">Remove</button>`:`<button type="button" class="ts-add" data-ts="add" data-product="${esc(p.id)}">${p.perSeat&&current.seatCount?'Add for '+current.seatCount+' seats':'+ Add to table'}</button>`}</article>`;
 }).join('')}</div>${!products.length?`<div class="ts-empty">${query?'No matching items. Try another search.':category==='selected'?'Nothing on the tabletop yet. Choose a category above to add items.':'No items in this category.'}${query?'<button type="button" data-ts="clear-search">Clear search</button>':''}</div>`:''}`;
}
function renderTabletop(current){
 // Keep the input mounted so typing never dismisses a phone’s keyboard.
 const input=dialog.querySelector('[data-ts="search"]');if(input.value!==search)input.value=search;input.closest('label').hidden=!TABLETOP.length&&!current.tabletop?.length;
 const panel=dialog.querySelector('.ts-top-controls'),active=document.activeElement,focused=panel.contains(active)?{...active.dataset}:null;
 renderEquipmentContent(panel,tabletopControls(current));
 if(focused&&!panel.contains(document.activeElement)){
  const replacement=[...panel.querySelectorAll('[data-product]')].find(el=>!el.disabled&&el.dataset.product===focused.product)||panel.querySelector('[data-ts="category"][aria-pressed="true"]')||input;
  replacement?.focus({preventScroll:true});
 }
}
function applyWholeSetup(){
 const source=item();if(!source||options.onCommit)return;
 const targets=storeRef.getState().objects.filter(o=>o.kind==='table'&&o.tableId===source.tableId&&o.id!==source.id);if(!targets.length)return;
 const style={chairId:source.chairId,linenId:source.linenId||null,linenProductId:source.linenProductId||null,linenColor:source.linenColor||null,tabletop:source.tabletop||[]};
 storeRef.replaceObjects(storeRef.getState().objects.map(o=>targets.some(t=>t.id===o.id)?{...o,...JSON.parse(JSON.stringify(style))}:o));
 dialog.querySelector('.ts-message').textContent=`Setup applied to ${targets.length} other ${targets.length===1?'table':'tables'}. One-per-seat items follow each table’s seat count. You can undo this change.`;
}
function render(){
 const current=item(),table=current&&find(options.tables,current.tableId);if(!current||!table){close();return;}
 dialog.querySelector('.ts-message').textContent='';
 const chair=find(options.chairs,current.chairId),linen=find(options.linens,current.linenId),matching=storeRef.getState().objects.filter(o=>o.kind==='table'&&o.tableId===current.tableId).length;
 const linens=options.linens.filter(l=>l.fitsTableIds?.includes(current.tableId)&&!['linen-napkins','linen-runner-9ft'].includes(l.id));
 const summary=summarizeEvent({objects:[current]},options,{includeTent:false});
 dialog.querySelector('#tableStudioTitle').textContent=table.name;
 dialog.querySelector('.ts-model-note').textContent=TABLETOP.some(p=>p.isIllustrative)?'Sample styles for planning. Open RentSketch from your rental company’s website for its products, photos and pricing.':'Style preview. Product photos show your rental items; confirm dimensions and colors with your rental company.';
 const caption=[current.seatCount?`${current.seatCount} ${chair?.name||'chairs'}`:'Standing / service table',linen?`${current.linenColor||'White'} ${linen.name}`:'Natural tabletop'].join(' · ');
 const preview=dialog.querySelector('.ts-visual');preview.setAttribute('aria-label',table.name+': '+caption);preview.innerHTML=tableVisual(table,chair,current);dialog.querySelector('.ts-caption').textContent=caption;
 renderEquipmentContent(dialog.querySelector('.ts-controls'),tableControls(current,table,options.chairs,linens,matching));
 renderEquipmentContent(dialog.querySelector('.ts-chair-cards'),current.seatCount?options.chairs.filter(c=>!c.isThrone).map(c=>`<button type="button" data-ts="chair" data-id="${esc(c.id)}" aria-pressed="${c.id===current.chairId}">${chairVisual(c)}<span>${esc(c.name)}</span><small>${rentalPrice(c)}</small></button>`).join(''):'');
 renderEquipmentContent(dialog.querySelector('.ts-linen-cards'),linens.map(l=>`<button type="button" data-ts="linen" data-id="${esc(l.id)}" aria-pressed="${l.id===current.linenId}">${l.photoUrl?`<img class="ts-linen-photo" src="${esc(l.photoUrl)}" alt="" loading="lazy">`:`<span class="ts-fabric-sample" style="--fabric:${linenColorHex(current.linenColor)}"></span>`}<span>${esc(l.name)}</span><small>${rentalPrice(l)}</small></button>`).join(''));
 renderTabletop(current);
 renderEquipmentContent(dialog.querySelector('.ts-copy-setup'),matching>1&&!options.onCommit?`<button type="button" class="btn-secondary" data-ts="apply-setup">Use this whole setup on ${matching-1} other ${matching===2?'table':'tables'}</button><p>Replaces chairs, linen and tabletop items on matching tables. Keeps each table’s position and seat count. One-per-seat items adjust automatically.</p>`:'');
 dialog.querySelector('.ts-price-lines').innerHTML=summary.lines.map(l=>`<div><span>${l.qty} × ${esc(l.label)}</span><strong>${l.amount==null?'Confirm pricing':money(l.amount)}</strong></div>`).join('');
 dialog.querySelector('.ts-total').textContent=summary.total==null?'Confirm pricing':money(summary.total)+'/day';dialog.querySelector('.ts-price-note').textContent=summary.total==null?'Known items: '+money(summary.knownSubtotal)+'/day':'Table, chairs, linen and selected extras';
 dialog.querySelector('[data-ts="undo"]').disabled=!storeRef.canUndo();dialog.querySelector('[data-ts="redo"]').disabled=!storeRef.canRedo();
 if(view)view.update(current);
}
function setMode(next){
 mode=next;dialog.dataset.view=mode;dialog.querySelectorAll('[data-ts="view"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===mode)));
 dialog.querySelector('.ts-view-hint').textContent=mode==='3d'?'Drag to turn · Pinch or scroll to zoom':'Overhead view · Your exact selections';view?.visible(mode==='3d');
 if(mode==='3d'&&!view){const token=++loadToken;clearTimeout(loadTimer);loadTimer=setTimeout(()=>{if(token===loadToken){loadToken++;fallback();}},12000);dialog.querySelector('.ts-render-status').textContent='Opening your table in 3D…';import('./tableStudio3d.js').then(m=>{
  if(token!==loadToken||!dialog.open||!storeRef)return;clearTimeout(loadTimer);
  view=m.createTableView(dialog.querySelector('.ts-three'),fallback);view.update(item());dialog.querySelector('.ts-render-status').textContent='';view.visible(mode==='3d');
 }).catch(()=>{if(token===loadToken)fallback();});}
}
function fallback(){clearTimeout(loadTimer);if(!storeRef||!dialog.open)return;view?.destroy();view=null;setMode('2d');dialog.querySelector('.ts-render-status').textContent='3D is unavailable here. Keep styling your table in the overhead view.';}
function setLinen(id){const l=find(options.linens,id),colors=l?.colors||['White'];change({linenId:id||null,linenProductId:l?.productId||null,linenColor:id?(colors.includes(item().linenColor)?item().linenColor:colors[0]):null});}
function editTop(id,edit){const list=JSON.parse(JSON.stringify(item().tabletop||[]));edit(list,list.find(e=>e.productId===id));change({tabletop:list});}
function ensure(){
 if(dialog)return;dialog=document.createElement('dialog');dialog.className='ts-dialog';dialog.setAttribute('aria-labelledby','tableStudioTitle');
 dialog.innerHTML=`<header class="ts-header"><div><small>TABLE STUDIO</small><h2 id="tableStudioTitle"></h2></div><button type="button" class="btn-secondary" data-ts="close">← Event</button></header><div class="ts-body"><section class="ts-preview"><div class="ts-view-toolbar"><div role="group" aria-label="Table preview"><button type="button" data-ts="view" data-view="3d">3D</button><button type="button" data-ts="view" data-view="2d">Overhead</button></div><button type="button" data-ts="fit">Fit table</button></div><div class="ts-scene"><div class="ts-visual" role="img"></div><div class="ts-three"></div><p class="ts-render-status" role="status"></p></div><p class="ts-view-hint"></p><p class="ts-caption"></p></section><section class="ts-editing" aria-label="Customize this table"><p class="ts-intro"></p><div class="ts-controls"></div><details class="ts-options"><summary>Explore chair styles</summary><div class="ts-chair-cards ts-option-cards"></div></details><details class="ts-options"><summary>Explore linen styles</summary><div class="ts-linen-cards ts-option-cards"></div></details><section class="ts-tabletop"><h3>Set your table</h3><p>Add place settings, finishing touches or serving pieces.</p><label class="ts-search">Find tabletop items<input type="text" inputmode="search" data-ts="search" placeholder="Search plates, glasses, napkins…" autocomplete="off"></label><div class="ts-top-controls"></div><p class="ts-model-note">Style preview. Product photos show your rental items; confirm dimensions and colors with your rental company.</p></section><div class="ts-copy-setup"></div><details class="ts-breakdown"><summary>Price breakdown for this table</summary><div class="ts-price-lines"></div><p>Delivery, taxes and final pricing are confirmed with your rental company.</p></details><p class="ts-message" role="status"></p></section></div><footer class="ts-footer"><div class="ts-estimate" role="status"><span>This table setup</span><strong class="ts-total"></strong><small class="ts-price-note"></small></div><div class="ts-history"><button type="button" class="btn-secondary" data-ts="undo" aria-label="Undo">↶</button><button type="button" class="btn-secondary" data-ts="redo" aria-label="Redo">↷</button></div><button type="button" class="btn-primary ts-done" data-ts="done">Done</button></footer>`;document.body.appendChild(dialog);
 dialog.addEventListener('click',e=>{
  const button=e.target.closest('[data-ts]'),action=button?.dataset.ts;if(action==='close'){close();return;}if(action==='done'){const commit=options.onCommit,draft=JSON.parse(JSON.stringify(item()));close();commit?.(draft);return;}if(action==='undo'){storeRef.undo();return;}if(action==='redo'){storeRef.redo();return;}
  if(action==='view'){setMode(button.dataset.view);return;}if(action==='fit'){view?.fit();return;}if(action==='category'){category=button.dataset.category;search='';renderTabletop(item());return;}if(action==='clear-search'){search='';renderTabletop(item());dialog.querySelector('[data-ts="search"]').focus({preventScroll:true});return;}if(action==='apply-setup'){applyWholeSetup();return;}if(action==='chair'){if(!find(options.chairs,button.dataset.id)?.isThrone)change({chairId:button.dataset.id});return;}if(action==='linen'){setLinen(button.dataset.id);return;}
  const id=button?.dataset.product,p=TABLETOP.find(p=>p.id===id);
  if(action==='add'&&p){editTop(id,(list,existing)=>{if(!existing)list.push({productId:id,qty:1,perSeat:p.perSeat&&item().seatCount>0,...(['napkin','runner'].includes(p.type)?{color:'White'}:{})});});return;}
  if(action==='remove'){editTop(id,(list,entry)=>{if(entry)list.splice(list.indexOf(entry),1);});return;}
  if(action==='quantity'){editTop(id,(list,entry)=>{if(!entry)return;entry.qty=Math.min(100,Math.max(0,tabletopQuantity(entry,item())+Number(button.dataset.delta)));entry.perSeat=false;if(!entry.qty)list.splice(list.indexOf(entry),1);});return;}
  const control=e.target.closest('[data-role]');if(!control)return;const role=control.dataset.role;
  if(role==='insp-seats')change({seatCount:Math.max(0,Math.min(Math.max(...find(options.tables,item().tableId).seatsOptions),item().seatCount+Number(control.dataset.delta)))});
  else if(role==='insp-linen-swatch')change({linenColor:control.dataset.color});else options.onClick?.(e);
 });
 dialog.addEventListener('input',e=>{if(e.target.dataset.ts==='search'){search=e.target.value;renderTabletop(item());}});
 dialog.addEventListener('change',e=>{const el=e.target,id=el.dataset.product;if(el.dataset.ts==='per-seat')editTop(id,(list,entry)=>{if(entry){entry.qty=tabletopQuantity(entry,item());entry.perSeat=el.checked;}});else if(el.dataset.ts==='top-color')editTop(id,(list,entry)=>{if(entry)entry.color=el.value;});else if(el.dataset.role==='insp-chair'&&!find(options.chairs,el.value)?.isThrone)change({chairId:el.value});else if(el.dataset.role==='insp-linen')setLinen(el.value);});
 dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}});dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('close',()=>{if(!dialog.open)cleanup();});
}
function cleanup(){loadToken++;clearTimeout(loadTimer);view?.destroy();view=null;if(!storeRef)return;const id=activeId;unsubscribe?.();unsubscribe=null;storeRef=null;activeId=null;options=null;document.body.style.overflow=previousOverflow;document.body.classList.remove('table-studio-open');const trigger=[...document.querySelectorAll('#inspectorPanel [data-role="insp-design-table"]')].find(el=>el.dataset.id===id);(trigger||document.getElementById('btnUndo'))?.focus({preventScroll:true});}
export function close(){if(dialog?.open)dialog.close();cleanup();}
export function openTableStudio(id,store,config){
 close();ensure();previousOverflow=document.body.style.overflow;activeId=id;storeRef=store;options=config;if(!item()||!find(config.tables,item().tableId)){cleanup();return;}search='';category=item().tabletop?.length?'selected':'Place settings';
 dialog.querySelector('.ts-intro').textContent=config.onCommit?'Explore this table on its own. Nothing is added to your event until you place it.':'Changes update this table in your event as you go.';dialog.querySelector('[data-ts="done"]').textContent=config.onCommit?'Place in My Event':'Done';render();dialog.querySelector('.ts-editing').scrollTop=0;dialog.querySelector('.ts-breakdown').open=false;dialog.querySelector('.ts-message').textContent='';unsubscribe=store.subscribe(render);dialog.showModal();document.body.style.overflow='hidden';document.body.classList.add('table-studio-open');setMode('3d');dialog.querySelector('[data-ts="close"]').focus({preventScroll:true});
}
