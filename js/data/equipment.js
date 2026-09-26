// Visual planning profiles, not stock records. Tenant products supply identity,
// photos, pricing and measured dimensions. Profile dimensions remain illustrative.
import { tabletopType } from './tabletop.js';
import { inferVisualModel } from './visualResolver.js';
import { isInflatableProduct } from './inflatables.js';

export const EQUIPMENT = [];
const profile=(type,name,category,widthFt,depthFt,heightFt,animated=false)=>({type,name,category,widthFt,depthFt,heightFt,animated});
export const EQUIPMENT_PROFILES = [
  profile('foam-machine','Foam machine','effects',3,3,4,true),
  profile('bubble-machine','Bubble machine','effects',2.5,2.5,2.5,true),
  profile('fog-machine','Fog machine','effects',2.5,2.5,2,true),
  profile('confetti-machine','Confetti machine','effects',2.5,2.5,2,true),
  profile('fan','Event fan','climate',2.2,2.2,4,true),
  profile('heater','Patio heater','climate',2.2,2.2,7,true),
  profile('fill-chill','Fill & chill table','service',4,2,2.5,true),
  profile('cooler','Beverage cooler','service',3.5,1.8,2,true),
  profile('generator','Generator','power',3,2.3,2.5,true),
  profile('power-distribution','Power distribution box','power',1.5,1,1.5,true),
  profile('speaker','Speaker','audio',2,2,5,true),
  profile('podium','Podium & microphone','audio',2,2,4,true),
  profile('karaoke','Karaoke system','audio',4,3,5,true),
  profile('screen','Projection screen','photo',8,2,7,true),
  profile('stanchion','Stanchion','accessories',1.2,1.2,3.2,true),
  profile('red-carpet','Red carpet','accessories',3,10,.05),
  profile('trash-can','Trash can','service',1.8,1.8,3,true),
  profile('popcorn','Popcorn machine','concessions',2,2,3,true),
  profile('cotton-candy','Cotton candy machine','concessions',2.4,2.4,3,true),
  profile('snow-cone','Snow cone machine','concessions',2,2,2.5,true),
  profile('chocolate-fountain','Chocolate fountain','concessions',1.8,1.8,3,true),
  profile('cornhole','Cornhole game','games',2,4,.8,true),
  profile('connect-four','Giant Connect Four','games',4,1.5,4,true),
  profile('tumbling-timbers','Tumbling Timbers','games',1.5,1.5,5,true),
  profile('photobooth','Photo booth','photo',3,3,6,true),
  profile('stage','Stage section','flooring',4,8,1.5,true),
  profile('generic','Rental equipment','accessories',2,2,2),
];
const byType=type=>EQUIPMENT_PROFILES.find(p=>p.type===type);
export function safeProductPhoto(value){const s=String(value||'').trim();return /^(https?:\/\/|\/(?!\/))/i.test(s)?s:null;}
function finitePositive(value){const n=Number(value);return Number.isFinite(n)&&n>0&&n<=500?n:null;}
function price(value){if(value==null||value==='')return null;const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;}
function metadata(product){const raw=product.metadata;return raw&&typeof raw==='object'?raw:{};}
export function equipmentType(product){
  const n=String(product?.name||'').toLowerCase(),m=metadata(product||{});
  const visual=String(product?.visual_model_id||'').trim();
  const visualAliases={'photo-booth':'photobooth','tumbling-blocks':'tumbling-timbers'};
  const mapped=visualAliases[visual]||visual;
  if(mapped&&byType(mapped))return mapped;
  const explicit=m.equipmentType||m.equipment_type;
  if(explicit&&byType(explicit))return explicit;
  if(/foam/.test(n)&&/machine|cannon|party/.test(n))return 'foam-machine';
  if(/bubble/.test(n)&&/machine|blower/.test(n))return 'bubble-machine';
  if(/fog|smoke|haze/.test(n)&&/machine|unit/.test(n))return 'fog-machine';
  if(/confetti|streamer/.test(n)&&/machine|launcher|cannon/.test(n))return 'confetti-machine';
  if(/\bfan\b|mister|misting/.test(n))return 'fan';
  if(/heater/.test(n))return 'heater';
  if(/power.*distribut|distribut.*box/.test(n))return 'power-distribution';
  if(/generator/.test(n))return 'generator';
  if(/fill.*chill/.test(n))return 'fill-chill';
  if(/cooler|ice\s*chest/.test(n))return 'cooler';
  if(/podium|lectern/.test(n))return 'podium';
  if(/karaoke/.test(n))return 'karaoke';
  if(/projector|projection\s*screen|movie\s*screen|tv\s*screen/.test(n))return 'screen';
  if(/speaker|pa\s*system/.test(n))return 'speaker';
  if(/stanchion/.test(n))return 'stanchion';
  if(/red\s*carpet|aisle\s*runner/.test(n))return 'red-carpet';
  if(/trash|garbage|waste\s*bin/.test(n))return 'trash-can';
  if(/popcorn/.test(n)&&!/supply|supplies|serving|bag|kernel/.test(n))return 'popcorn';
  if(/cotton\s*candy/.test(n)&&(/machine|maker/.test(n)||!/supply|supplies|sugar|cone|floss/.test(n)))return 'cotton-candy';
  if(/snow\s*cone|sno\s*kone/.test(n)&&!/supply|supplies|syrup|cup/.test(n))return 'snow-cone';
  if(/chocolate\s*fountain/.test(n))return 'chocolate-fountain';
  if(/corn\s*hole/.test(n))return 'cornhole';
  if(/connect\s*(?:four|4)/.test(n))return 'connect-four';
  if(/tumbling\s*timbers|giant\s*jenga/.test(n))return 'tumbling-timbers';
  if(/photo\s*booth/.test(n)&&!/extra\s*hour|upgrade|print|attendant\s*only|template|backdrop/.test(n))return 'photobooth';
  if(/stage\s*(?:section|deck)/.test(n))return 'stage';
  return null;
}
export function isCatalogConfiguration(product){
  const n=String(product?.name||''),c=String(product?.category||'').toLowerCase();
  if(/photo\s*booth/i.test(n)&&!/extra\s*hour|upgrade|print|template|backdrop/i.test(n))return false;
  return /^(linen|lighting|package)$/.test(c)||/syrup|floss sugar|popcorn kernel|fuel cans|propane tank/i.test(n)||/side\s*wall|sidewall|dance\s*floor|\bpackage\b|extra\s*hour|\bupgrade\b|\bdelivery\b|\bsetup\b|\battendant\b|\bsupplies\b/i.test(n);
}
export function equipmentCatalog(products=[],showPrices=false,mappedIds=null){
  return products.filter(p=>p&&p.active!==false&&p.id).flatMap(p=>{
    if(isCatalogConfiguration(p))return [];
    const type=equipmentType(p);
    if(!type&&tabletopType(p))return [];
    if(mappedIds&&p.external_id&&p.external_id===p.visual_model_id)return [];
    // Furniture/inflatables keep their richer existing planners. Unknown physical
    // catalog items still get an explicitly approximate footprint, never vanish.
    if(mappedIds?.has(p.id))return [];
    if(!type&&(isInflatableProduct(p)||(!mappedIds&&inferVisualModel(p))||isCatalogConfiguration(p)))return [];
    const model=byType(type||'generic'),m=metadata(p);
    const width=finitePositive(p.width_ft||m.widthFt),depth=finitePositive(p.length_ft||m.depthFt||m.lengthFt),height=finitePositive(p.height_ft||m.heightFt||m.height_ft);
    return [{...model,id:'equipment-'+p.id,productId:p.id,externalId:p.external_id||null,name:p.name||model.name,sourceCategory:p.category||'other',photoUrl:safeProductPhoto(p.photo_url||p.image_url),pricePerDay:showPrices?price(p.price_per_day):null,widthFt:width||model.widthFt,depthFt:depth||model.depthFt,heightFt:height||model.heightFt,dimensionsConfirmed:!!(width&&depth),heightConfirmed:!!height,visualFidelity:type?'illustrative':'footprint',isPreview:false}];
  });
}
export function genericEquipment(){return EQUIPMENT_PROFILES.filter(p=>p.type!=='generic').map(p=>({...p,id:'preview-'+p.type,productId:null,externalId:null,photoUrl:null,pricePerDay:null,dimensionsConfirmed:false,heightConfirmed:false,visualFidelity:'illustrative',isPreview:true}));}
export function equipmentById(id){return EQUIPMENT.find(p=>p.id===id);}
export function equipmentItem(product,id,x=0,y=0){return {id,kind:'equipment',equipmentId:product.id,widthFt:product.widthFt,depthFt:product.depthFt,modelWidthFt:product.widthFt,modelDepthFt:product.depthFt,heightFt:product.heightFt,rotationDeg:0,footprintOriented:true,x,y,name:product.name,productId:product.productId||null,externalId:product.externalId||null,dimensionsConfirmed:product.dimensionsConfirmed===true,visualType:product.type};}
