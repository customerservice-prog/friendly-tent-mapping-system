// RentSketch dance-floor and stage renderer primitives. Prices are tenant data
// and are hydrated from the live catalog after tenant startup.

export const DANCE_SECTION = { id: 'dance-3x3', name: '3x3 Dance Floor Section', pricePerDay: null, ft: 3 };

// Customer-facing size presets. Section counts are calculated automatically
// so customers never need to think in terms of individual sections themselves.
export const DANCE_FLOOR_SIZES = [
  { id: '12x12', ft: 12 },
  { id: '15x15', ft: 15 },
  { id: '18x18', ft: 18 },
  { id: '21x21', ft: 21 },
  { id: '24x24', ft: 24 },
];

export function sectionsForSize(sizeFt) {
  const perSide = Math.ceil(sizeFt / DANCE_SECTION.ft);
  return perSide * perSide;
}

export function priceForSize(sizeFt) {
  return DANCE_SECTION.pricePerDay == null ? null : sectionsForSize(sizeFt) * DANCE_SECTION.pricePerDay;
}

export const STAGE_SECTION = { id: 'stage-section', name: 'Stage Section', pricePerDay: null };
export const STAGE_RAMP = { id: 'stage-ramp', name: 'Stage Ramp', pricePerDay: null };
export const STAGE_STAIR = { id: 'stage-stair', name: 'Stage Stair', pricePerDay: null };
export const STAGE_SKIRT = { id: 'stage-skirt', name: 'Stage Skirt', pricePerDay: null };

function price(p){const n=Number(p&&p.price_per_day);return Number.isFinite(n)?n:null;}
function reset(){[DANCE_SECTION,STAGE_SECTION,STAGE_RAMP,STAGE_STAIR,STAGE_SKIRT].forEach(x=>{x.pricePerDay=null;delete x.productId;});}
function applyTenantDance(detail){
  reset();
  const tenant=detail&&detail.tenant||window.ACTIVE_TENANT||{};
  if(tenant.slug==='generic'||tenant.showPrices===false)return;
  const products=(detail&&detail.products)||[];
  const live=products.filter(p=>p&&p.active!==false&&String(p.category||'').toLowerCase()==='dance_floor');
  const floor=live.find(p=>p.visual_model_id==='dance-floor'&&(/3\s*[x×]\s*3/i.test(p.name||'')||(Number(p.width_ft)===3&&Number(p.length_ft)===3)))||live.find(p=>p.visual_model_id==='dance-floor');
  if(floor&&price(floor)!=null){DANCE_SECTION.pricePerDay=price(floor);DANCE_SECTION.productId=floor.id;if(floor.name)DANCE_SECTION.name=floor.name;}
  const stage=live.find(p=>p.visual_model_id==='stage-section');
  if(stage&&price(stage)!=null){STAGE_SECTION.pricePerDay=price(stage);STAGE_SECTION.productId=stage.id;if(stage.name)STAGE_SECTION.name=stage.name;}
  const ramp=live.find(p=>/stage\s*ramp/i.test(p.name||''));if(ramp&&price(ramp)!=null){STAGE_RAMP.pricePerDay=price(ramp);STAGE_RAMP.productId=ramp.id;STAGE_RAMP.name=ramp.name||STAGE_RAMP.name;}
  const stair=live.find(p=>/stage\s*stair/i.test(p.name||''));if(stair&&price(stair)!=null){STAGE_STAIR.pricePerDay=price(stair);STAGE_STAIR.productId=stair.id;STAGE_STAIR.name=stair.name||STAGE_STAIR.name;}
  const skirt=live.find(p=>/stage\s*skirt/i.test(p.name||''));if(skirt&&price(skirt)!=null){STAGE_SKIRT.pricePerDay=price(skirt);STAGE_SKIRT.productId=skirt.id;STAGE_SKIRT.name=skirt.name||STAGE_SKIRT.name;}
}
if(typeof window!=='undefined')window.addEventListener('rentsketch:catalogReady',e=>applyTenantDance(e.detail||{}));
