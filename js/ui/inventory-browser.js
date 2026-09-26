import { contextualProducts } from '../core/contextual-products.js';
import { TABLETOP, tabletopType } from '../data/tabletop.js';
import { escapeHtml as esc, equipmentPreview, chairVisual, tableVisual } from './equipment-controls.js';
import { accessoryIcon } from './accessory-controls.js';
import { inflatablePlanSvg } from './inflatable-controls.js';
import { tabletopSymbol } from './tabletop-symbols.js';
const CATEGORIES=[['all','All rentals'],['tent','Tents & sidewalls'],['table','Tables'],['chair','Chairs'],['linen','Linens'],['tabletop','Tabletop & serving'],['inflatable','Bounce houses & waterslides'],['effects','Foam, bubbles & effects'],['lighting','Lighting'],['climate','Fans & climate'],['flooring','Dance floors & stages'],['service','Food & beverage service'],['concessions','Concessions'],['games','Games'],['audio','Audio, karaoke & podiums'],['power','Power'],['photo','Photo booths & projection'],['accessories','More rentals']];
const mediaDocuments=new WeakSet();
// Capture image errors once, including images inserted by later drawer renders.
// Each source has a local fallback, so a failed photo cannot hide another card.
export function bindInventoryMedia(root=globalThis.document){
 if(!root||mediaDocuments.has(root))return;
 mediaDocuments.add(root);
 root.addEventListener('error',event=>{
  const target=event.target;
  if(!target?.matches?.('img[data-inventory-image]'))return;
  const layer=target.closest('[data-inventory-layer]'),fallback=layer?.nextElementSibling;
  if(!fallback)return;
  layer.hidden=true;fallback.hidden=false;
 },true);
}
if(typeof document!=='undefined')bindInventoryMedia(document);
const symbol=(body,viewBox='0 0 120 90')=>`<svg viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;
const safePhoto=value=>/^(https?:\/\/|\/(?!\/))/i.test(String(value||'').trim())?String(value).trim():null;
function planningSymbol(p,category){
 const modelId=p.visualModelId||p.sourceId||String(p.id||'').split('--')[0];
 if(category==='tent'&&p.kind!=='sidewall'){
  const frame=p.type==='frame',canopy=p.type==='canopy';
  return symbol(`<ellipse cx="60" cy="77" rx="49" ry="7" fill="#dce5df"/><g stroke="#82998d" stroke-width="1.7" stroke-linejoin="round"><path d="M17 45v28m86-28v28M43 58v22m42-22v22"/><path d="M12 43 36 17h47l25 26-24 15H41Z" fill="#fffef9"/><path d="m12 43 29 15 19-32 24 32 24-15M36 17l24 9 23-9" fill="none" stroke="#cbd8ce"/>${!frame&&!canopy?'<path d="M60 25v48"/><path d="m10 73 7-28m93 28-7-28" stroke="#a7b7ad"/>':''}${frame?'<path d="m17 46 26 30m60-30L85 76" stroke="#c4d0c7"/>':''}</g>`);
 }
 if(category==='chair'||p.silhouette&&/folding|resin|chiavari|throne/.test(p.silhouette))return chairVisual({...p,id:'symbol',photoUrl:null});
 if(category==='table'||p.shape){
  const table={...p,shape:p.shape||'rect',widthFt:p.widthFt||6,depthFt:p.depthFt||2.5,diameterFt:p.diameterFt||5,seatsDefault:0};
  if(p.silhouette==='fillchill-tub')return symbol('<ellipse cx="60" cy="78" rx="42" ry="5" fill="#dce5df"/><path d="m31 46-7 31m60-31 9 31M30 72h62" fill="none" stroke="#879791" stroke-width="3"/><path d="m16 30 72-8 18 20-71 12Z" fill="#333d3a"/><path d="m16 30 19 24v9l-18-17Zm19 24 71-12-1 13-70 8Z" fill="#1c2723"/><path d="m25 32 59-6 12 13-58 9Z" fill="#131e1a"/>');
  return tableVisual(table,{}, {shape:table.shape,widthFt:table.shape==='round'?table.diameterFt:table.widthFt,depthFt:table.shape==='round'?table.diameterFt:table.depthFt,seatCount:0});
 }
 if(category==='inflatable'||p.style&&p.colors){
  const colors=(p.colors||['#3279ab','#eac548','#e86b53','#389b76']).map(c=>/^#[0-9a-f]{3,8}$/i.test(c)?c:'#70998b');
  return inflatablePlanSvg({...p,colors});
 }
 if(p.kind==='tabletop')return symbol(tabletopSymbol(p),'-0.85 -0.65 1.7 1.3');
 if(p.kind==='sidewall')return symbol(`<path d="M12 18h96v57H12Z" fill="#fffcf3" stroke="#a4b7aa" stroke-width="2"/>${p.type==='window'?'<g fill="#d9e7e3" stroke="#a4b7aa" stroke-width="1.5"><path d="M23 65V42q0-26 20-12v35Zm34 0V42q0-26 20-12v35Zm34 0V42q0-26 8-12v35Z"/></g>':'<path d="M36 20v53m24-53v53m24-53v53" stroke="#e0e7df" stroke-width="2"/>'}`);
 if(p.kind==='linen')return symbol('<ellipse cx="60" cy="78" rx="44" ry="5" fill="#dce5df"/><path d="m25 30-9 43q12 9 22 0 12 10 23 0 14 10 23 0 12 7 21 0L93 30Z" fill="#fbfaf5" stroke="#c5d1c5" stroke-width="1.5"/><ellipse cx="59" cy="30" rx="34" ry="13" fill="#fffefa" stroke="#bdcabb" stroke-width="1.5"/><path d="m29 42-7 29m22-27-5 28m25-27v26m17-29 4 28m7-33 8 34" stroke="#dce4d9" stroke-width="1.5"/>');
 if(category==='flooring'||modelId==='dance')return symbol('<g stroke="#8d7560" stroke-width="1.3"><path d="m13 47 49-27 47 28-48 27Z" fill="#c9a779"/><path d="m29 38 48 27M46 29l47 27m-63 1 47-27M45 66l49-27" fill="none"/></g>');
 if(p.kind==='lighting')return symbol('<path d="M10 25q50 30 100 0" fill="none" stroke="#667a6e" stroke-width="2"/><g fill="#ffeab4" stroke="#c4ae75" stroke-width="1.4">'+[22,41,60,79,98].map((x,i)=>`<path d="M${x} ${[33,41,43,41,33][i]}v10"/><circle cx="${x}" cy="${[48,56,58,56,48][i]}" r="5"/>`).join('')+'</g>');
 return accessoryIcon(p.accessoryType||p.type||'generic');
}
export function equipmentPhoto(p={}, {category=p.kind||p.category||''}={}){
 const modelId=p.visualModelId||p.sourceId||String(p.id||'').split('--')[0];
 // These are existing renderer previews, never substituted product photographs.
 const preview=modelId==='fill-chill-4ft'?'':equipmentPreview(modelId,'inventory-preview-image');
 const illustration=planningSymbol(p,category),photo=safePhoto(p.photoUrl);
 const illustrated=`<span class="inventory-symbol">${illustration}</span><small class="inventory-source-label">${p.type==='generic'?'No preview available':'Planning illustration'}</small>`;
 const fallback=`<span class="inventory-illustration"${photo?' hidden':''}>${preview?`<span data-inventory-layer>${preview.replace('<img ','<img data-inventory-image ')}<small class="inventory-source-label">Illustrative model</small></span><span hidden>${illustrated}</span>`:illustrated}</span>`;
 return `<span class="inventory-media">${photo?`<span class="inventory-photo-layer" data-inventory-layer><img class="inventory-photo" data-inventory-image src="${esc(photo)}" alt="${esc(p.name||'Rental item')}" loading="lazy" decoding="async"><small class="inventory-source-label">Product photo</small></span>`:''}${fallback}</span>`;
}
export function equipmentInspector(item,p){p=p||{name:item.name||'Equipment',widthFt:item.widthFt,depthFt:item.depthFt};return `<button class="btn-tertiary inspector-close" data-role="inspector-close">Close</button><h3>${esc(p.name)}</h3>${equipmentPhoto(p)}<p>${item.widthFt} × ${item.depthFt} ft footprint</p><p class="equipment-note">${p.dimensionsConfirmed?'Catalog dimensions supplied. Confirm required operating clearance.':'Approximate model dimensions. Staff must confirm the actual item and operating clearance.'}</p><p>${p.pricePerDay==null?'Price needs confirmation':'$'+Number(p.pricePerDay).toFixed(2)+'/day'}</p>${p.operation?.supported?`<button type="button" class="btn-secondary equipment-operation" data-role="equipment-operation" data-id="${esc(item.id)}" data-state="${item.operationState==='off'?'running':'off'}">${item.operationState==='off'?'Run preview':'Stop preview'}</button><p class="equipment-note">Preview operation only. Setup and operation are confirmed by your rental team.</p>`:''}<div class="inspector-actions">${['rotate','duplicate','delete'].map(a=>`<button type="button" class="btn-secondary" data-role="insp-${a}" data-id="${esc(item.id)}">${a[0].toUpperCase()+a.slice(1)}</button>`).join('')}</div>`;}
export function inventoryBrowser(catalog,objects=[],{query='',category='all'}={}){
 const rows=[]; const add=(items,cat,role)=>{for(const p of items||[])rows.push({p,cat,role:cat==='chair'&&p.isThrone?'accent-chair':role});};
 add(catalog.tents,'tent','tent-card');add(catalog.tables,'table','table-card');add(catalog.chairs,'chair','chair-card');add(catalog.inflatables,'inflatable','inflatable-card');
 const contextual=contextualProducts({...catalog,tabletop:catalog.tabletop||TABLETOP});
 for(const p of contextual)rows.push({p,cat:p.kind==='sidewall'?'tent':p.kind,role:'inventory-context'});
 const accessories=catalog.accessories||[], equipment=catalog.equipment||[];
 const upgrades=new Map();
 for(const p of equipment){const a=accessories.find(a=>a.productId&&a.productId===p.productId);if(p.type==='generic'&&a&&a.accessoryType!=='generic')upgrades.set(p.id,a);}
 for(const p of equipment){const a=upgrades.get(p.id);rows.push({p:a||p,cat:p.category||'accessories',role:a?'accessory-card':'equipment-card'});}
 // Compatibility for integrations that provide a pre-resolved accessory catalog.
 if(!(catalog.products||[]).length)for(const p of accessories)if(!equipment.some(e=>e.productId&&e.productId===p.productId))rows.push({p,cat:'accessories',role:'accessory-card'});
 for(const [cat,name,drawer] of [['flooring','Dance floor sizes','dance'],['tent','Sidewall planning','tent']])if(cat!=='tent'||!contextual.some(p=>p.kind==='sidewall'))rows.push({cat,p:{id:drawer,name,kind:cat==='tent'?'sidewall':'flooring'},role:'inventory-open',drawer});
 const mapped=new Set([...(catalog.tents||[]),...(catalog.tables||[]),...(catalog.chairs||[]),...(catalog.inflatables||[]),...(catalog.equipment||[]),...contextual].map(p=>p.productId));
 const unresolved=(catalog.products||[]).filter(p=>p.active!==false&&!mapped.has(p.id)&&!tabletopType(p)&&!(p.external_id&&p.external_id===p.visual_model_id)&&!['linen','lighting','dance_floor','package'].includes(p.category)&&!/sidewall|side wall/i.test(p.name||''));
 const tokens=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
 const filtered=rows.filter(r=>(category==='all'||r.cat===category)&&tokens.every(q=>(r.p.name+' '+r.cat).toLowerCase().includes(q)));
 return `<div class="inventory-browser"><div class="inventory-heading"><span>BUILD YOUR EVENT</span><h3>Everything in one place.</h3><p>Place rentals in your event. Add linens, table settings and tent extras to the setup they belong to.</p></div><label class="inventory-search"><span class="sr-only">Search rentals</span><input type="search" data-role="inventory-query" value="${esc(query)}" placeholder="Search tents, foam, coolers…" autocomplete="off"></label><div class="inventory-categories" aria-label="Rental categories">${CATEGORIES.filter(([id])=>id==='all'||rows.some(r=>r.cat===id)).map(([id,label])=>`<button type="button" data-role="inventory-category" data-category="${id}" aria-pressed="${id===category}">${label}</button>`).join('')}</div><p class="inventory-results" role="status">${filtered.length} options${query?' matching “'+esc(query)+'”':''}</p><div class="inventory-grid">${filtered.map(({p,cat,role,drawer})=>{const count=objects.filter(o=>[o.equipmentId,o.accessoryId,o.tableId,o.inflatableId,o.chairId].includes(p.id)||(p.productId&&o.productId===p.productId)).length;return `<button type="button" class="inventory-card" data-role="${role}" data-id="${esc(p.id)}"${p.kind?' data-context-kind="'+esc(p.kind)+'"':''}${drawer?' data-drawer="'+drawer+'"':''}>${equipmentPhoto(p,{category:cat})}<span class="inventory-card-copy"><small>${esc(CATEGORIES.find(c=>c[0]===cat)?.[1]||cat)}</small><strong>${esc(p.name)}</strong><span>${role==='inventory-context'?(['linen','tabletop'].includes(p.kind)?'Choose a table':p.kind==='sidewall'?(p.panelFt?p.panelFt+' ft panels':'Panel size needs confirmation'):p.widthFt?p.widthFt+' × '+p.lengthFt+' ft tent':'Apply to your event'):p.widthFt?(p.widthFt+' × '+(p.depthFt||p.lengthFt)+' ft'):'Choose options'}${p.dimensionsConfirmed===false?' · approx.':''}</span><span class="inventory-price">${drawer?(cat==='tabletop'?'Choose a table →':'Customize →'):p.pricePerDay==null?'Confirm pricing':'$'+Number(p.pricePerDay).toFixed(2)+'/day'}</span>${p.animated?'<span class="inventory-motion">Animated in 3D</span>':''}${count?'<span class="inventory-count">'+count+' in layout</span>':''}${p.isPreview?'<span class="inventory-preview">Planning model · availability unconfirmed</span>':''}</span></button>`;}).join('')}</div>${!filtered.length?'<div class="inventory-empty">No matches. Try a shorter name or another category.</div>':''}${category==='all'&&!query&&unresolved.length?`<details class="inventory-unmapped"><summary>${unresolved.length} catalog items need configuration</summary><p>These products are in the rental catalog but do not yet have a placement model. They have not been added to your layout.</p><ul>${unresolved.map(p=>'<li>'+esc(p.name)+'</li>').join('')}</ul></details>`:''}<p class="inventory-footnote">Product selection is not a reservation. Approximate models are labeled; your rental team confirms measurements, setup and availability.</p></div>`;
}
