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
  buildLinen('linen-round-120','120" Round Polyester Tablecloth',['round-5ft']),
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
  'linen-round-120':'skirt-round','linen-round-90':'skirt-round','linen-round-108':'skirt-round',
  'linen-spandex-6ft':'skirt-rect','linen-spandex-8ft':'skirt-rect',
  'linen-banquet-54x120':'skirt-rect','linen-banquet-72x120':'skirt-rect',
  'linen-cocktail-cover':'skirt-round','linen-runner-9ft':'runner',
};
export function linenVisual(linenId){return LINEN_VISUALS[linenId]||byId(linenId)?.visual||null;}

function price(p){if(!p||p.price_per_day==null||p.price_per_day==='')return null;const n=Number(p.price_per_day);return Number.isFinite(n)?n:null;}
function findCompatible(products,id){
  const live=products.filter(p=>p&&p.active!==false&&String(p.category||'').toLowerCase()==='linen');
  const rules={
    'linen-round-120':n=>/120/.test(n)&&/round/.test(n)&&/polyester/.test(n),
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
const LINEN_BASE=JSON.parse(JSON.stringify(LINENS));
function applyTenantLinens(detail){
  LINENS.splice(0,LINENS.length,...JSON.parse(JSON.stringify(LINEN_BASE)));
  const tenant=detail&&detail.tenant||window.ACTIVE_TENANT||{};
  const products=Array.isArray(detail&&detail.products)?detail.products:[],show=tenant.slug!=='generic'&&tenant.showPrices!==false;
  const used=new Set();
  function hydrate(l,p){l.name=p.name;l.productId=p.id;l.pricePerDay=show?price(p):null;l.photoUrl=p.photo_url||p.image_url||null;if(Array.isArray(p.metadata?.colors)&&p.metadata.colors.length)l.colors=p.metadata.colors;else if(/black/i.test(p.name))l.colors=['Black'];else if(/white/i.test(p.name))l.colors=['White'];used.add(p.id);}
  LINENS.forEach(l=>{const p=findCompatible(products,l.id);if(p)hydrate(l,p);});
  for(const p of products){
    if(used.has(p.id)||p.active===false||String(p.category).toLowerCase()!=='linen'||/package|aisle|chair|clip|napkin|runner/i.test(p.name))continue;
    const n=p.name.toLowerCase(),round=/round/.test(n)&&n.match(/(60|90|108|120|132)/),rect=n.match(/(54|72|90)\s*[x×]\s*(120|132|156)/);
    if(!round&&!rect)continue;
    const id='linen-product-'+p.id,fit=round?['round-5ft']:Number(rect[2])>=156?['banquet-8ft']:Number(rect[2])===132?['banquet-6ft']:['banquet-6ft','banquet-8ft'];
    const l=buildLinen(id,p.name,fit);l.visual=round?'skirt-round':'skirt-rect';if(round)l.roundSizeIn=Number(round[1]);else{l.clothWidthIn=Number(rect[1]);l.clothLengthIn=Number(rect[2]);}hydrate(l,p);LINENS.push(l);
  }
}
if(typeof window!=='undefined')window.addEventListener('rentsketch:catalogReady',e=>applyTenantLinens(e.detail||{}));

export const LINEN_COLOR_HEX = {'White':'#ffffff','Ivory':'#eee4cf','Champagne':'#d9c39d','Gold':'#b58b42','Black':'#18191b','Silver':'#aeb3b8','Navy Blue':'#172c52','Royal Blue':'#2350a2','Dusty Blue':'#829cae','Burgundy':'#681f2d','Red':'#a72b2c','Blush':'#e4bbb7','Dusty Rose':'#b97c7c','Pink':'#e4a9bd','Purple':'#76538f','Sage Green':'#8b9b79','Hunter Emerald Green':'#285d49'};
export function linenColorHex(name){return LINEN_COLOR_HEX[name] || '#ffffff';}
