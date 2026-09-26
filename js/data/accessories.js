// General rental visual catalog.
// Anything not already handled by tents/tables/chairs/linens/lighting/dance floor
// can still become a real placeable RentSketch object instead of disappearing
// from the customer sidebar.

export const ACCESSORIES = [];

const EXCLUDED_CATEGORIES=new Set(['tent','table','chair','linen','lighting']);
const normal=v=>String(v||'').toLowerCase().replace(/×/g,'x').replace(/[^a-z0-9]+/g,' ').trim();
const slug=v=>normal(v).replace(/\s+/g,'-');
const finite=v=>{const n=Number(v);return Number.isFinite(n)&&n>0?n:null;};

const NON_PLACEABLE=/\b(delivery|pickup|travel fee|mileage|damage waiver|deposit|security deposit|setup fee|set up fee|labor|late fee|exact time|rush fee|cleaning fee|tax|discount|coupon|credit|payment|balance|renewal|extra hour|additional hour|package|bundle|service charge|processing fee)\b/i;

const PROFILES=[
  {test:/foam/,type:'foam-machine',category:'Effects',w:2.5,d:2.5,h:2.5,animated:true},
  {test:/photo ?booth|photobooth/,type:'photo-booth',category:'Entertainment',w:6,d:6,h:7,animated:true},
  {test:/speaker|pa system|bluetooth/,type:'speaker',category:'Audio',w:2,d:2,h:4.5,animated:true},
  {test:/podium|lectern/,type:'podium',category:'Audio',w:2,d:2,h:4},
  {test:/microphone|mic stand/,type:'microphone',category:'Audio',w:1,d:1,h:5},
  {test:/generator|power distribution|power box/,type:'generator',category:'Power',w:3,d:2.2,h:2.4,animated:true},
  {test:/fan|mister|misting/,type:'fan',category:'Cooling',w:2.2,d:2.2,h:5,animated:true},
  {test:/heater/,type:'heater',category:'Climate',w:2.2,d:2.2,h:7,animated:true},
  {test:/cooler/,type:'cooler',category:'Service',w:3,d:2,h:2},
  {test:/trash|garbage/,type:'trash-can',category:'Service',w:2,d:2,h:3},
  {test:/stanchion|velvet rope|crowd control/,type:'stanchion',category:'Event Accessories',w:5,d:1.5,h:3.5},
  {test:/red carpet|aisle runner/,type:'red-carpet',category:'Event Accessories',w:4,d:15,h:.08},
  {test:/cornhole/,type:'cornhole',category:'Games',w:8,d:12,h:1.2},
  {test:/connect ?4|connect four/,type:'connect-four',category:'Games',w:4,d:2,h:4.5},
  {test:/tumbling timbers|giant jenga|jenga/,type:'tumbling-blocks',category:'Games',w:4,d:4,h:5,animated:true},
  {test:/cotton candy/,type:'cotton-candy',category:'Concessions',w:2.5,d:2.5,h:4,animated:true},
  {test:/popcorn/,type:'popcorn',category:'Concessions',w:2.5,d:2.5,h:5,animated:true},
  {test:/snow cone|snowcone|shaved ice/,type:'snow-cone',category:'Concessions',w:2.5,d:2.5,h:4,animated:true},
  {test:/chocolate fountain/,type:'chocolate-fountain',category:'Concessions',w:2.5,d:2.5,h:4,animated:true},
  {test:/fountain/,type:'fountain',category:'Concessions',w:2.5,d:2.5,h:4,animated:true},
  {test:/bar(?!rel)|beverage station/,type:'bar',category:'Service',w:6,d:2.5,h:4},
  {test:/fill.*chill/,type:'service-table',category:'Service',w:4,d:2.5,h:3},
  {test:/stage section|stage deck/,type:'stage',category:'Staging',w:4,d:4,h:2},
  {test:/stage stair|stage step/,type:'stage-stair',category:'Staging',w:4,d:3,h:2},
  {test:/stage ramp/,type:'stage-ramp',category:'Staging',w:4,d:8,h:2},
  {test:/carpet|runner/,type:'floor-runner',category:'Event Accessories',w:4,d:12,h:.06},
  {test:/arch|backdrop/,type:'backdrop',category:'Decor',w:8,d:2,h:8},
  {test:/centerpiece/,type:'centerpiece',category:'Decor',w:2,d:2,h:3},
];

function profileFor(product){
  const text=normal((product.name||'')+' '+(product.external_id||'')+' '+(product.category||''));
  if(/bounce|water ?slide|waterslide|inflatable|obstacle course/.test(text))return {exclude:'inflatable'};
  if(/dance floor/.test(text))return {exclude:'dance-floor'};
  for(const p of PROFILES)if(p.test.test(text))return p;
  const cat=normal(product.category);
  if(cat==='game'||cat==='games')return {type:'game',category:'Games',w:4,d:4,h:4};
  if(cat==='concession'||cat==='concessions')return {type:'concession',category:'Concessions',w:2.5,d:2.5,h:4,animated:true};
  if(cat==='audio')return {type:'speaker',category:'Audio',w:2,d:2,h:4,animated:true};
  if(cat==='power')return {type:'generator',category:'Power',w:3,d:2.2,h:2.4,animated:true};
  if(cat==='decor')return {type:'decor',category:'Decor',w:3,d:3,h:5};
  if(cat==='accessory'||cat==='other'||cat==='equipment')return {type:'generic',category:'More Rentals',w:3,d:3,h:3};
  return {type:'generic',category:String(product.category||'More Rentals').replace(/_/g,' ').replace(/\b\w/g,m=>m.toUpperCase()),w:3,d:3,h:3};
}

export function accessoryCatalog(products,showPrices=true){
  const out=[];
  for(const product of Array.isArray(products)?products:[]){
    if(!product||product.active===false||EXCLUDED_CATEGORIES.has(product.category))continue;
    const searchable=String(product.name||'')+' '+String(product.external_id||'');
    if(NON_PLACEABLE.test(searchable))continue;
    const p=profileFor(product);if(p.exclude)continue;
    const width=finite(product.width_ft)||finite(product.widthFt)||p.w;
    const depth=finite(product.length_ft)||finite(product.depth_ft)||finite(product.lengthFt)||finite(product.depthFt)||p.d;
    const height=finite(product.height_ft)||finite(product.metadata?.heightFt)||finite(product.heightFt)||p.h;
    const raw=product.price_per_day,price=raw==null||raw===''?null:Number(raw);
    out.push({
      id:'accessory-'+String(product.id||slug(product.external_id||product.name)),
      productId:product.id||null,
      externalId:product.external_id||null,
      name:product.name||'Rental item',
      accessoryType:p.type,
      visualCategory:p.category,
      widthFt:width,
      depthFt:depth,
      heightFt:height,
      animated:!!p.animated,
      photoUrl:/^https?:\/\//i.test(product.photo_url||'')?product.photo_url:null,
      pricePerDay:showPrices&&Number.isFinite(price)?price:null,
      sourceCategory:product.category||'other',
    });
  }
  return out.sort((a,b)=>a.visualCategory.localeCompare(b.visualCategory)||a.name.localeCompare(b.name));
}

export function hydrateAccessories(products,showPrices=true){
  ACCESSORIES.splice(0,ACCESSORIES.length,...accessoryCatalog(products,showPrices));
  return ACCESSORIES;
}
export function accessoryById(id){return ACCESSORIES.find(item=>item.id===id||item.productId===id)||null;}

export function accessoryItem(product,id,x,y){
  return {
    id,
    kind:'accessory',
    accessoryId:product.id,
    productId:product.productId||null,
    name:product.name,
    accessoryType:product.accessoryType,
    visualCategory:product.visualCategory,
    widthFt:product.widthFt,
    depthFt:product.depthFt,
    heightFt:product.heightFt,
    x,y,rotationDeg:0,
    animated:!!product.animated,
    photoUrl:product.photoUrl||null,
    pricePerDay:product.pricePerDay,
  };
}

export function accessoryCategoryGroups(items=ACCESSORIES){
  const groups=new Map();
  for(const item of items){
    if(!groups.has(item.visualCategory))groups.set(item.visualCategory,[]);
    groups.get(item.visualCategory).push(item);
  }
  const order=['Effects','Entertainment','Games','Concessions','Audio','Cooling','Climate','Power','Service','Staging','Event Accessories','Decor','More Rentals'];
  return [...groups.entries()].sort((a,b)=>{
    const ai=order.indexOf(a[0]),bi=order.indexOf(b[0]);
    return (ai<0?999:ai)-(bi<0?999:bi)||a[0].localeCompare(b[0]);
  });
}
