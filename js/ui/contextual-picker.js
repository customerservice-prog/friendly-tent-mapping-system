import {compatibleContextTables,lightingCompatibility,sidewallPanelCount} from '../core/contextual-products.js';
import {equipmentPhoto} from './inventory-browser.js';
import {escapeHtml as esc} from './equipment-controls.js';
const price=(p,qty=1)=>p.pricePerDay==null?'Confirm pricing':'$'+(p.pricePerDay*qty).toFixed(2)+'/day';
export function contextualPicker(product,catalog,objects,tent){
 const tables=objects.filter(o=>o.kind==='table'),eligible=compatibleContextTables(product,objects),names=new Map(tables.map((o,index)=>[o.id,(catalog.tables.find(t=>t.id===o.tableId)?.name||'Table')+' · #'+(index+1)]));
 let content='';
 if(['linen','tabletop'].includes(product.kind)){
  content='<h4>Choose a table</h4><p>'+ (product.perSeat?'Adds one per seat on the table you choose.':'Applies this rental to the table you choose.')+'</p>';
  if(eligible.length)content+='<div class="context-targets">'+eligible.map(item=>'<button class="context-target" type="button" data-role="context-apply-table" data-id="'+esc(item.id)+'"><strong>'+esc(names.get(item.id))+'</strong><span>'+item.seatCount+' seats · '+(product.perSeat?item.seatCount+' × ':'')+price(product,product.perSeat?item.seatCount:1)+'</span><b>Apply →</b></button>').join('')+'</div>';
  else content+='<p class="context-empty">'+(tables.length?'This rental does not fit your current tables.':'Add a compatible table to use this rental.')+'</p>';
  const compatible=(catalog.tables||[]).filter(table=>compatibleContextTables(product,[{kind:'table',tableId:table.id,seatCount:table.seatsDefault}]).length);
  if(compatible.length)content+='<details class="context-add-table"'+(!eligible.length?' open':'')+'><summary>Add a new table with this rental</summary><div class="context-targets">'+compatible.map(table=>'<button class="context-target" type="button" data-role="context-new-table" data-id="'+esc(table.id)+'"><strong>'+esc(table.name)+'</strong><span>Choose a spot, then place this setup</span><b>Add →</b></button>').join('')+'</div></details>';
 }else if(product.kind==='lighting'){
  const compatible=lightingCompatibility(product,tent);
  content='<h4>Light your event</h4><p>'+esc(product.widthFt?product.widthFt+' × '+product.lengthFt+' ft tent lighting':'Lighting selected for your current event')+'</p>'+(compatible?'<button class="btn-primary context-apply" type="button" data-role="context-apply-lighting">Apply to '+esc(tent.name)+'</button>':'<p class="context-empty">This lighting does not fit your current tent. Choose a compatible tent first.</p><div class="context-targets">'+(catalog.tents||[]).filter(t=>lightingCompatibility(product,t)).map(t=>'<button class="context-target" type="button" data-role="context-select-tent" data-id="'+esc(t.id)+'"><strong>'+esc(t.name)+'</strong><span>Change tent, then apply lighting</span><b>Choose →</b></button>').join('')+'</div>');
 }else if(product.kind==='sidewall'){
  content='<h4>Choose a tent side</h4><p>'+ (product.panelFt&&product.type?product.panelFt+' ft panels. Quantities below are whole rental panels.':'Panel size or style is not configured. Your rental team needs to confirm this item before it can be placed.')+'</p>';
  const sides=['front','back','left','right'].filter(side=>sidewallPanelCount(product,tent,side));
  content+=sides.length?'<div class="context-targets">'+sides.map(side=>{const qty=sidewallPanelCount(product,tent,side);return '<button class="context-target" type="button" data-role="context-apply-sidewall" data-side="'+side+'"><strong>'+side[0].toUpperCase()+side.slice(1)+' side</strong><span>'+qty+' '+(qty===1?'panel':'panels')+' · '+price(product,qty)+'</span><b>Apply →</b></button>';}).join('')+'</div>':'<p class="context-empty">'+(tent?.isSite?'Add a tent before selecting sidewalls.':'No complete side fits these panels. Choose another panel size or ask your rental team.')+'</p>';
 }
 return '<section class="context-picker"><button class="btn-tertiary context-back" type="button" data-role="context-cancel">← All rentals</button><div class="context-product">'+equipmentPhoto(product)+'<div><small>SELECTED RENTAL</small><h3>'+esc(product.name)+'</h3><strong>'+price(product)+'</strong></div></div>'+content+'<p class="context-note">Your choice is saved only when you apply it or confirm placement. Availability and installation are confirmed by your rental team.</p></section>';
}
