import { inferVisualModel } from './visualResolver.js';

// Imported products replace old seed rows. Distinct tent products may share a
// physical model, but must keep their own name, price and quote identity.
export function liveCatalog(category, renderer, products, showPrices, requestedProductId) {
  const models=new Map(renderer.map(item=>[item.id,item])), groups=new Map();
  for(const product of products) {
    if(!product || product.active===false || product.category!==category)continue;
    // Only infer a tent with an explicit supported type and complete dimensions.
    // An existing mapping remains authoritative, including an unsupported one.
    const key=product.visual_model_id || (category==='tent' ? inferVisualModel(product) : null);
    if(!models.has(key))continue;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({...product,visual_model_id:key});
  }
  const selected=[];
  for(const [key,group] of groups){
    const imported=group.filter(p=>p.external_id!==key);
    const requested=group.find(p=>p.id===requestedProductId);
    if(category==='tent'){
      // Stable ordering keeps saved model IDs attached to the standard product.
      const standard=String(models.get(key).name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
      const options=(imported.length?imported:group).slice().sort((a,b)=>{
        const score=p=>standard&&String(p.name||'').toLowerCase().replace(/[^a-z0-9]/g,'').startsWith(standard)?0:1;
        return score(a)-score(b)||String(a.external_id||a.id).localeCompare(String(b.external_id||b.id));
      });
      if(requested&&!options.some(p=>p.id===requested.id))options[0]=requested;
      options.forEach((p,i)=>selected.push({...p,catalogId:i?key+'--'+p.id:key}));
    }else selected.push({...requested||imported[0]||group[0],catalogId:key});
  }
  return selected.map(product=>{
    const raw=product.price_per_day,price=raw==null || raw==='' ? null : Number(raw);
    return {...models.get(product.visual_model_id),id:product.catalogId,visualModelId:product.visual_model_id,productId:product.id,externalId:product.external_id || null,photoUrl:/^https?:\/\//i.test(product.photo_url||'')?product.photo_url:null,name:product.name || models.get(product.visual_model_id).name,pricePerDay:showPrices && price!=null && Number.isFinite(price) ? price : null};
  });
}
