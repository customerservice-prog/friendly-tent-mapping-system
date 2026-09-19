// One equipment list shared by on-screen review, print/share and quote requests.
export function summarizeEvent(scene, catalog, {includeTent = true} = {}) {
  const lines = [], objects = scene.objects || [];
  const find = (list,id) => (list || []).find(item => item.id === id);
  const price = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  function add(item, qty, category, fallback, label, override) {
    if (!qty) return;
    const unitPrice = price(override !== undefined ? override : item && item.pricePerDay);
    lines.push({label:label || item && item.name || fallback,qty,unitPrice,amount:unitPrice == null ? null : unitPrice * qty,productId:item && item.productId || null,category});
  }
  const tent = find(catalog.tents,scene.tentId);
  if(includeTent) add(tent,1,'tent','Tent — confirm selection');
  const tables = new Map(), chairs = new Map(), linens = new Map();
  for(const object of objects) {
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
  linens.forEach((qty,key) => {const [id,color]=JSON.parse(key),linen=find(catalog.linens,id);add(linen,qty,'linen','Linen',color+' '+(linen ? linen.name : 'Linen'));});
  const sections = objects.filter(o=>o.kind === 'dance');
  add(catalog.danceSection,sections.length,'dance_floor','3×3 Dance Floor Section');
  if(scene.lightingId && scene.lightingId !== 'lighting-none') {
    const lighting=find(catalog.lighting,scene.lightingId);
    add(lighting,1,'lighting','Lighting — confirm selection',null,lighting && lighting.dynamic ? catalog.tentLightingPrice(tent) : undefined);
  }
  const knownSubtotal=lines.reduce((n,line)=>n+(line.amount || 0),0);
  return {lines,knownSubtotal,total:lines.some(line=>line.amount == null) ? null : knownSubtotal,seats:[...chairs.values()].reduce((a,b)=>a+b,0),tableCount:[...tables.values()].reduce((a,b)=>a+b,0)};
}
