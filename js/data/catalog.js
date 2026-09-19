// Keep renderer primitives and live product identity together. Imported inventory
// replaces older seed rows for the same model; an explicit product ID wins.
export function liveCatalog(category, renderer, products, showPrices, requestedProductId) {
  const models=new Map(renderer.map(item=>[item.id,item])), groups=new Map();
  for(const product of products) {
    if(!product || product.active===false || product.category!==category || !models.has(product.visual_model_id))continue;
    const key=product.visual_model_id,current=groups.get(key);
    if(!current || product.id===requestedProductId || (current.id!==requestedProductId && current.external_id===key && product.external_id!==key))groups.set(key,product);
  }
  return [...groups.values()].map(product=>{
    const raw=product.price_per_day,price=raw==null || raw==='' ? null : Number(raw);
    return {...models.get(product.visual_model_id),productId:product.id,externalId:product.external_id || null,name:product.name || models.get(product.visual_model_id).name,pricePerDay:showPrices && price!=null && Number.isFinite(price) ? price : null};
  });
}
