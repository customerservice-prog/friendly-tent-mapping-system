import { TABLETOP, tabletopQuantity } from '../data/tabletop.js';
// One equipment list shared by on-screen review, print/share and quote requests.
export function summarizeEvent(scene, catalog, {includeTent = true} = {}) {
  const lines = [], objects = scene.objects || [];
  const find = (list,id) => (list || []).find(item => item.id === id);
  const price = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  function add(item, qty, category, fallback, label, override) {
    if (!qty) return;
    const unitPrice = price(override !== undefined ? override : item && item.pricePerDay);
    lines.push({label:label || item && item.name || fallback,qty,unitPrice,amount:unitPrice == null ? null : Math.round(unitPrice * qty * 100) / 100,productId:item && item.productId || null,category});
  }
  const tent = find(catalog.tents,scene.tentId);
  if(includeTent && scene.tentId) add(tent,1,'tent','Tent — confirm selection');
  const inflatables=new Map();for(const o of objects)if(o.kind==='inflatable')inflatables.set(o.inflatableId,(inflatables.get(o.inflatableId)||0)+1);inflatables.forEach((qty,id)=>add(find(catalog.inflatables,id),qty,'inflatable','Inflatable — confirm selection'));
  const tables = new Map(), chairs = new Map(), linens = new Map();
  for(const object of objects) {
    if(object.kind==='chair')chairs.set(object.chairId,(chairs.get(object.chairId)||0)+1);
    if(object.kind !== 'table') continue;
    tables.set(object.tableId,(tables.get(object.tableId) || 0) + 1);
    if(object.seatCount > 0) chairs.set(object.chairId,(chairs.get(object.chairId) || 0) + Number(object.seatCount));
    if(object.linenId) {
      const key = JSON.stringify([object.linenId,object.linenColor || 'White']);
      linens.set(key,(linens.get(key) || 0) + 1);
    }
  }
  tables.forEach((qty,id) => add(find(catalog.tables,id),qty,'table','Table — confirm selection'));
  chairs.forEach((qty,id) => add(find(catalog.chairs,id),qty,'chair','Chairs — confirm selection'));
  linens.forEach((qty,key) => {const [id,color]=JSON.parse(key),linen=find(catalog.linens,id);add(linen,qty,'linen','Linen',color+' '+(linen ? linen.name : 'Linen'));lines[lines.length-1].selectedColor=color;});
  const tabletop=new Map();for(const object of objects.filter(o=>o.kind==='table'))for(const entry of object.tabletop||[]){const key=JSON.stringify([entry.productId,entry.color||null]);tabletop.set(key,(tabletop.get(key)||0)+tabletopQuantity(entry,object));}
  tabletop.forEach((qty,key)=>{const [id,color]=JSON.parse(key),product=find(catalog.tabletop||TABLETOP,id);add(product,qty,'tabletop','Tabletop rental — confirm selection',product?(color?color+' ':'')+product.name:null);if(color&&qty)lines[lines.length-1].selectedColor=color;});
  const sections = objects.filter(o=>o.kind === 'dance');
  add(catalog.danceSection,sections.length,'dance_floor','3×3 Dance Floor Section');
  if(scene.lightingId && scene.lightingId !== 'lighting-none') {
    const lighting=catalog.lightingForTent?catalog.lightingForTent(scene.lightingId,tent):find(catalog.lighting,scene.lightingId);
    add(lighting,1,'lighting','Lighting — confirm selection',null,lighting && lighting.dynamic ? catalog.tentLightingPrice(tent) : undefined);
  }
  if(includeTent && tent && scene.sidewalls && !tent.isSite) {
    const counts={solid:0,window:0},dims={front:tent.widthFt,back:tent.widthFt,left:tent.lengthFt,right:tent.lengthFt};
    for(const side of ['front','right','back','left']){
      const style=scene.sidewalls[side];
      if(style==='solid'||style==='window') counts[style]+=Math.max(1,Math.ceil(Number(dims[side]||0)/10));
    }
    if(counts.solid)add(null,counts.solid,'sidewall','10 ft Solid Sidewall — confirm pricing');
    if(counts.window)add(null,counts.window,'sidewall','10 ft Window Sidewall — confirm pricing');
  }
  if(includeTent&&tent?.type!=='pole'&&tent&&!tent.isSite&&['concrete','asphalt','deck'].includes(scene.surfaceType))add(null,1,'installation','Concrete ballast setup — confirm quantity and pricing');
  const knownSubtotal=lines.reduce((n,line)=>n+Math.round((line.amount || 0)*100),0)/100;
  return {lines,knownSubtotal,total:lines.some(line=>line.amount == null) ? null : knownSubtotal,seats:[...chairs.values()].reduce((a,b)=>a+b,0),tableCount:[...tables.values()].reduce((a,b)=>a+b,0)};
}
