// Carry selections to Friendly; Friendly resolves current prices and availability.
// No customer contact information, access tokens or payment amounts travel in the URL.
export function buildBookingHandoff({tenant, lines, products, designId=null, eventDate='', source='designer', surfaceType='notSure'}) {
  if(tenant!=='friendly')throw new Error('Open this designer from Friendly Party Rental to book its rentals.');
  if(!Array.isArray(lines)||!lines.length)throw new Error('Add rentals to your layout first.');
  const items=new Map();
  for(const line of lines) {
    if(['delivery','tax'].includes(line.category))continue;
    const product=products.find(p=>p.id===line.productId&&p.active!==false);
    const slug=String(product?.external_id||'').replace(/^fpr:/,'');
    if(line.amount==null||!product||!String(product.external_id).startsWith('fpr:')||!/^[-a-z0-9]+$/.test(slug)) {
      throw new Error((line.label||'An item')+' needs staff confirmation. Use Request a Quote below so your complete layout is included.');
    }
    if(!Number.isInteger(line.qty)||line.qty<1||line.qty>1000)throw new Error('Please check the quantity for '+line.label+'.');
    const selectedColor=typeof line.selectedColor==='string'?line.selectedColor.trim().slice(0,80):undefined;
    const key=JSON.stringify([slug,selectedColor||'']);
    const item=items.get(key)||{slug,quantity:0,...selectedColor?{selectedColor}:{}};
    item.quantity+=line.qty;
    if(item.quantity>1000)throw new Error('Please request a quote for quantities above 1,000.');
    items.set(key,item);
  }
  if(!items.size||items.size>75)throw new Error('Please request a quote for this layout.');
  return {version:1,tenant:'friendly',designId:typeof designId==='string'?designId:null,eventDate:/^\d{4}-\d{2}-\d{2}$/.test(eventDate)?eventDate:'',source:/^[a-z0-9_-]{1,100}$/i.test(source)?source:'designer',surfaceType:['grass','concrete','asphalt','deck','notSure'].includes(surfaceType)?surfaceType:'notSure',items:[...items.values()]};
}

export function friendlyBookingUrl(payload) {
  return 'https://www.friendlypartyrental.com/design-your-event/book#layout='+encodeURIComponent(JSON.stringify(payload));
}
