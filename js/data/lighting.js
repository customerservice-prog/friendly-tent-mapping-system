// Friendly Party Rental — Lighting inventory data
// Real names/pricing remain tenant data; `visual` tells both renderers how the
// selected product is physically represented inside a tent.

export const TENT_LIGHTING_PRICE_BY_SIZE = {
  '20x20':100.00,'20x30':125.00,'20x40':150.00,'30x30':125.00,
  '30x45':175.00,'30x60':200.00,'40x40':225.00,'40x60':250.00,
  '40x80':300.00,'40x100':350.00,
};
export function tentLightingPriceFor(tent){const key=tent.widthFt+'x'+tent.lengthFt;return TENT_LIGHTING_PRICE_BY_SIZE[key]??null;}

export const LIGHTING_OPTIONS = [
  {id:'lighting-none',name:'None',pricePerDay:0,dynamic:false,visual:'none'},
  // Friendly tent/perimeter lighting follows the inside eave, not a fake grid.
  {id:'lighting-tent',name:'Tent Perimeter Lighting (sized to your tent)',pricePerDay:null,dynamic:true,visual:'perimeter-eave'},
  // Bistro is overhead cross-tent lighting. The renderer gets strand count from
  // computeLightingLayout(), so large footprints receive multiple visible runs.
  {id:'lighting-bistro',name:'Bistro String Lights',pricePerDay:125.00,dynamic:false,visual:'bistro-cross-runs'},
  {id:'lighting-uplighting-12',name:'Uplighting Package (12 Lights)',pricePerDay:225.00,dynamic:false,visual:'uplight-ring'},
  {id:'lighting-uplight-single',name:'Wireless LED Uplight (each)',pricePerDay:25.00,dynamic:false,visual:'uplight-single'},
  {id:'lighting-chandelier',name:'Battery-Operated Crystal Chandelier',pricePerDay:99.00,dynamic:false,visual:'chandelier'},
  {id:'lighting-custom-300',name:'Custom Lighting — 300ft',pricePerDay:200.00,dynamic:false,visual:'perimeter-eave'},
];
export function byId(id){return LIGHTING_OPTIONS.find(l=>l.id===id);}
