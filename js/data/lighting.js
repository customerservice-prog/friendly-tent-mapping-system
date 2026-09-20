// RentSketch lighting renderer primitives. Tenant catalog/API data supplies
// customer-facing names and prices; these defaults intentionally carry no
// rental-company pricing so one tenant can never leak into another.

export const TENT_LIGHTING_PRICE_BY_SIZE = {
  '20x20':null,'20x30':null,'20x40':null,'30x30':null,
  '30x45':null,'30x60':null,'40x40':null,'40x60':null,
  '40x80':null,'40x100':null,
};
export function tentLightingPriceFor(tent){if(!tent)return null;const key=tent.widthFt+'x'+tent.lengthFt;return TENT_LIGHTING_PRICE_BY_SIZE[key]??null;}

export const LIGHTING_OPTIONS = [
  {id:'lighting-none',name:'None',pricePerDay:0,dynamic:false,visual:'none'},
  {id:'lighting-tent',name:'Tent Perimeter Lighting (sized to your tent)',pricePerDay:null,dynamic:true,visual:'perimeter-eave'},
  {id:'lighting-bistro',name:'Bistro String Lights',pricePerDay:null,dynamic:false,visual:'bistro-cross-runs'},
  {id:'lighting-uplighting-12',name:'Uplighting Package (12 Lights)',pricePerDay:null,dynamic:false,visual:'uplight-ring'},
  {id:'lighting-uplight-single',name:'Wireless LED Uplight (each)',pricePerDay:null,dynamic:false,visual:'uplight-single'},
  {id:'lighting-chandelier',name:'Battery-Operated Crystal Chandelier',pricePerDay:null,dynamic:false,visual:'chandelier'},
  {id:'lighting-custom-300',name:'Custom Lighting — 300ft',pricePerDay:null,dynamic:false,visual:'perimeter-eave'},
];
export function byId(id){return LIGHTING_OPTIONS.find(l=>l.id===id);}

const LIGHTING_LABELS=new Map(LIGHTING_OPTIONS.map(o=>[o.id,o.name]));
export const LIGHTING_PRODUCTS_BY_SIZE=new Map();
let liveCatalogLoaded=false;
export function lightingForTent(id,tent){
 const option=byId(id);if(!option)return null;if(id==='lighting-none')return option;
 const sized=LIGHTING_PRODUCTS_BY_SIZE.get(id),key=tent?tent.widthFt+'x'+tent.lengthFt:'';
 const exact=sized?.get(key)||sized?.get(tent?.lengthFt+'x'+tent?.widthFt);
 if(exact)return {...option,...exact,id:option.id,available:true,dynamic:false};
 if(sized?.size)return {...option,productId:null,pricePerDay:null,available:false};
 return {...option,available:!liveCatalogLoaded||!!option.productId,pricePerDay:option.dynamic?tentLightingPriceFor(tent):option.pricePerDay};
}
function resetLivePricing(){
  LIGHTING_PRODUCTS_BY_SIZE.clear();
  Object.keys(TENT_LIGHTING_PRICE_BY_SIZE).forEach(k=>{TENT_LIGHTING_PRICE_BY_SIZE[k]=null;});
  LIGHTING_OPTIONS.forEach(o=>{if(o.id!=='lighting-none'){o.pricePerDay=null;o.name=LIGHTING_LABELS.get(o.id);delete o.productId;delete o.photoUrl;}});
}
function numericPrice(p){if(!p||p.price_per_day==null||p.price_per_day==='')return null;const n=Number(p.price_per_day);return Number.isFinite(n)?n:null;}
function applyTenantLighting(detail){
  resetLivePricing();
  const tenant=detail&&detail.tenant||window.ACTIVE_TENANT||{};
  liveCatalogLoaded=tenant.slug!=='generic';
  const showPrices=tenant.slug!=='generic'&&tenant.showPrices!==false;
  const products=Array.isArray(detail&&detail.products)?detail.products:[];
  products.filter(p=>p&&p.active!==false&&String(p.category||'').toLowerCase()==='lighting').forEach(p=>{
    const visual=p.visual_model_id,option=byId(visual);if(!option)return;
    const value={name:p.name||option.name,pricePerDay:showPrices?numericPrice(p):null,productId:p.id,photoUrl:/^https?:\/\//i.test(p.photo_url||'')?p.photo_url:null};
    const w=Number(p.width_ft),l=Number(p.length_ft);
    if(w>0&&l>0){
      if(!LIGHTING_PRODUCTS_BY_SIZE.has(visual))LIGHTING_PRODUCTS_BY_SIZE.set(visual,new Map());
      LIGHTING_PRODUCTS_BY_SIZE.get(visual).set(w+'x'+l,value);
      if(visual==='lighting-tent')TENT_LIGHTING_PRICE_BY_SIZE[w+'x'+l]=value.pricePerDay;
    }else Object.assign(option,value);
  });
}

if(typeof window!=='undefined')window.addEventListener('rentsketch:catalogReady',e=>applyTenantLighting(e.detail||{}));
