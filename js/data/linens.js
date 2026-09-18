// RentSketch linen renderer primitives. Rental-company prices are never
// hardcoded here; compatible live tenant products hydrate pricing after the
// tenant catalog has loaded. Unknown styles safely remain "Ask for pricing".

export const LINEN_COLORS = [
  'White', 'Ivory', 'Champagne', 'Gold', 'Black', 'Silver',
  'Navy Blue', 'Royal Blue', 'Dusty Blue', 'Burgundy', 'Red',
  'Blush', 'Dusty Rose', 'Pink', 'Purple', 'Sage Green', 'Hunter Emerald Green',
];

function buildLinen(id,name,fitsTableIds,colors){return{id,name,fitsTableIds,pricePerDay:null,colors:colors||LINEN_COLORS,active:true};}

export const LINENS = [
  buildLinen('linen-round-90','90" Round Tablecloth',['round-5ft']),
  buildLinen('linen-round-108','108" Round Tablecloth',['round-5ft']),
  buildLinen('linen-spandex-6ft','Spandex 6ft Table Linen',['banquet-6ft'],['Black','White']),
  buildLinen('linen-spandex-8ft','Spandex 8ft Table Linen',['banquet-8ft'],['Black','White']),
  buildLinen('linen-banquet-54x120','54x120 Banquet Tablecloth',['banquet-6ft']),
  buildLinen('linen-banquet-72x120','72x120 Banquet Tablecloth',['banquet-8ft']),
  buildLinen('linen-cocktail-cover','Cocktail Table Cover',['cocktail'],['White','Black','Gold','Ivory','Navy Blue','Burgundy']),
  buildLinen('linen-runner-9ft','9ft Table Runner',['round-5ft','banquet-6ft','banquet-8ft']),
  buildLinen('linen-napkins','Matching Napkins (each)',['round-5ft','banquet-6ft','banquet-8ft','cocktail']),
  buildLinen('linen-chair-cover','Spandex Chair Cover (each)',[]),
];

export function optionsForTable(tableId){return LINENS.filter(l=>l.fitsTableIds.indexOf(tableId)!==-1);}
export function byId(id){return LINENS.find(l=>l.id===id);}

export const LINEN_VISUALS = {
  'linen-round-90':'skirt-round','linen-round-108':'skirt-round',
  'linen-spandex-6ft':'skirt-rect','linen-spandex-8ft':'skirt-rect',
  'linen-banquet-54x120':'skirt-rect','linen-banquet-72x120':'skirt-rect',
  'linen-cocktail-cover':'skirt-round','linen-runner-9ft':'runner',
};
export function linenVisual(linenId){return LINEN_VISUALS[linenId]||null;}

function price(p){const n=Number(p&&p.price_per_day);return Number.isFinite(n)?n:null;}
function findCompatible(products,id){
  const live=products.filter(p=>p&&p.active!==false&&String(p.category||'').toLowerCase()==='linen');
  const rules={
    'linen-round-90':n=>/90/.test(n)&&/round/.test(n),
    'linen-round-108':n=>/108/.test(n)&&/round/.test(n),
    'linen-spandex-6ft':n=>/spandex/.test(n)&&/(^|\D)6\s*(?:ft|foot|feet|'|$)/.test(n),
    'linen-spandex-8ft':n=>/spandex/.test(n)&&/(^|\D)8\s*(?:ft|foot|feet|'|$)/.test(n),
    'linen-banquet-54x120':n=>/54\s*[x×]\s*120/.test(n),
    'linen-banquet-72x120':n=>/72\s*[x×]\s*120/.test(n),
    'linen-cocktail-cover':n=>/cocktail/.test(n)&&/(cover|linen|cloth)/.test(n),
    'linen-runner-9ft':n=>/runner/.test(n)&&/(^|\D)9\s*(?:ft|foot|feet|'|$)/.test(n),
    'linen-napkins':n=>/napkin/.test(n),
    'linen-chair-cover':n=>/chair/.test(n)&&/cover/.test(n),
  };
  const rule=rules[id];return rule?live.find(p=>rule(String(p.name||'').toLowerCase())):null;
}
function applyTenantLinens(detail){
  LINENS.forEach(l=>{l.pricePerDay=null;delete l.productId;});
  const tenant=detail&&detail.tenant||window.ACTIVE_TENANT||{};
  if(tenant.slug==='generic'||tenant.showPrices===false)return;
  const products=Array.isArray(detail&&detail.products)?detail.products:[];
  LINENS.forEach(l=>{const p=findCompatible(products,l.id),n=price(p);if(p&&n!=null){l.pricePerDay=n;l.productId=p.id;}});
}
if(typeof window!=='undefined')window.addEventListener('rentsketch:catalogReady',e=>applyTenantLinens(e.detail||{}));
