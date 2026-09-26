// Catalog identities for rentals that attach to a table or a tent.
const text=value=>String(value||'');
const amount=value=>value==null||value===''||!Number.isFinite(Number(value))?null:Number(value);
export function contextualProducts(catalog={}){
 const rows=[],products=(catalog.products||[]).filter(p=>p.active!==false),live=new Map(products.map(p=>[p.id,p]));
 const add=(kind,item)=>{if(!item?.productId||!live.has(item.productId))return;const source=live.get(item.productId);rows.push({...item,id:item.productId,sourceId:item.id,kind,name:source.name||item.name,pricePerDay:catalog.showPrices===false?null:item.pricePerDay,photoUrl:source.photo_url||source.image_url||item.photoUrl||null});};
 for(const p of catalog.tabletop||[])add('tabletop',p);
 for(const p of catalog.linens||[])if(!/napkin|runner|chair.cover/i.test(p.name||'')&&p.fitsTableIds?.length)add('linen',p);
 for(const p of products){
  const name=text(p.name),category=text(p.category).toLowerCase(),metadata=p.metadata||{};
  if(category==='lighting'){
   const visual=(catalog.lighting||[]).find(o=>o.id===p.visual_model_id);if(!visual||visual.id==='lighting-none')continue;
   rows.push({id:p.id,productId:p.id,sourceId:visual.id,kind:'lighting',name,photoUrl:p.photo_url||p.image_url||null,visual:visual.visual,widthFt:Number(p.width_ft)||null,lengthFt:Number(p.length_ft)||null,pricePerDay:catalog.showPrices===false?null:amount(p.price_per_day)});
  }else if(/side\s*wall/i.test(name)||category==='sidewall'){
   const parsed=name.match(/(?:^|\D)(10|15|20|30|40)\s*(?:ft|foot|feet|['′])/i);
   const panelFt=Number(metadata.panel_width_ft)||Number(p.width_ft)||(parsed?Number(parsed[1]):null);
   rows.push({id:p.id,productId:p.id,sourceId:p.visual_model_id||null,kind:'sidewall',name,photoUrl:p.photo_url||p.image_url||null,type:['solid','window'].includes(metadata.sidewall_type)?metadata.sidewall_type:/window|cathedral/i.test(name+' '+(p.visual_model_id||''))?'window':/solid|opaque/i.test(name+' '+(p.visual_model_id||''))?'solid':null,panelFt,pricePerDay:catalog.showPrices===false?null:amount(p.price_per_day)});
  }
 }
 return rows.filter((row,index)=>rows.findIndex(other=>other.kind===row.kind&&other.id===row.id)===index);
}
export function compatibleContextTables(product,objects=[]){
 return objects.filter(item=>item.kind==='table'&&(product.kind==='linen'?product.fitsTableIds?.includes(item.tableId):product.kind==='tabletop'&&(!product.perSeat||Number(item.seatCount)>0)));
}
export function applyTableProduct(item,product){
 if(!compatibleContextTables(product,[item]).length)return null;
 if(product.kind==='linen')return {linenId:product.sourceId,linenProductId:product.productId,linenColor:product.colors?.includes(item.linenColor)?item.linenColor:product.colors?.[0]||'White'};
 const entries=JSON.parse(JSON.stringify(item.tabletop||[])),existing=entries.find(entry=>entry.productId===product.productId);
 // Selection applies this exact item once (or one per seat), never duplicates it silently.
 if(!existing)entries.push({productId:product.productId,qty:1,perSeat:!!product.perSeat,...(['napkin','runner'].includes(product.type)?{color:'White'}:{})});
 return {tabletop:entries};
}
export function lightingCompatibility(product,tent){
 if(product?.kind!=='lighting'||!tent)return false;
 if(tent.isSite)return !product.widthFt&&!product.lengthFt&&/^uplight/.test(product.visual||'');
 if(product.widthFt&&product.lengthFt)return (product.widthFt===tent.widthFt&&product.lengthFt===tent.lengthFt)||(product.widthFt===tent.lengthFt&&product.lengthFt===tent.widthFt);
 return true;
}
export function sidewallPanelCount(product,tent,side){
 if(product?.kind!=='sidewall'||!['solid','window'].includes(product.type)||!tent||tent.isSite||!['front','back','left','right'].includes(side))return 0;
 const length=['front','back'].includes(side)?tent.widthFt:tent.lengthFt,span=Number(product.panelFt);
 // The visual perimeter is built from 10-foot sections. Only full, known physical panels are offered.
 if(!(span>=10&&Number.isInteger(span/10)&&Number.isInteger(length/span)))return 0;
 return length/span;
}
export function exactSidewallSegments(product,tent,side,segments){
 if(!sidewallPanelCount(product,tent,side))return null;
 const run=segments.filter(segment=>segment.side===side),perPanel=product.panelFt/10;
 return run.map((segment,index)=>({...segment,type:product.type,enabled:true,productId:product.productId,panelId:side+':'+product.productId+':'+Math.floor(index/perPanel),panelWidthFt:product.panelFt}));
}
