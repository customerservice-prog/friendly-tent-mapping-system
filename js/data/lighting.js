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

function resetLivePricing(){
  Object.keys(TENT_LIGHTING_PRICE_BY_SIZE).forEach(k=>{TENT_LIGHTING_PRICE_BY_SIZE[k]=null;});
  LIGHTING_OPTIONS.forEach(o=>{if(o.id!=='lighting-none'){o.pricePerDay=null;delete o.productId;}});
}
function numericPrice(p){const n=Number(p&&p.price_per_day);return Number.isFinite(n)?n:null;}
function applyTenantLighting(detail){
  resetLivePricing();
  const tenant=detail&&detail.tenant||window.ACTIVE_TENANT||{};
  if(tenant.slug==='generic'||tenant.showPrices===false)return;
  const products=Array.isArray(detail&&detail.products)?detail.products:[];
  products.filter(p=>p&&p.active!==false&&String(p.category||'').toLowerCase()==='lighting').forEach(p=>{
    const price=numericPrice(p);if(price==null)return;
    const visual=p.visual_model_id;
    if(visual==='lighting-tent'){
      const w=Number(p.width_ft),l=Number(p.length_ft);
      if(Number.isFinite(w)&&Number.isFinite(l)){
        const direct=w+'x'+l,reverse=l+'x'+w;
        if(Object.prototype.hasOwnProperty.call(TENT_LIGHTING_PRICE_BY_SIZE,direct))TENT_LIGHTING_PRICE_BY_SIZE[direct]=price;
        else if(Object.prototype.hasOwnProperty.call(TENT_LIGHTING_PRICE_BY_SIZE,reverse))TENT_LIGHTING_PRICE_BY_SIZE[reverse]=price;
      }
      return;
    }
    const option=LIGHTING_OPTIONS.find(o=>o.id===visual&&!o.dynamic);
    if(option){option.pricePerDay=price;option.productId=p.id;if(p.name)option.name=p.name;}
  });
}
if(typeof window!=='undefined')window.addEventListener('rentsketch:catalogReady',e=>applyTenantLighting(e.detail||{}));
