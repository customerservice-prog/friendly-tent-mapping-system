// Product identity/pricing always come from the active tenant catalog. These
// photo-based visual profiles contain no inventory or pricing. Dimensions are
// illustrative until the rental company's catalog supplies measured dimensions.
export const INFLATABLES = [];
const profile=(slug,style,colors,widthFt,depthFt,heightFt,extra={})=>({slug,style,colors,widthFt,depthFt,heightFt,...extra});
export const INFLATABLE_PROFILES = [
  profile('rainbow-castle-bounce-house','castle',['#1453bb','#efc829','#d73b30','#36a44d'],15,18,15),
  profile('crayon-bounce-house','crayon',['#17449a','#edcf30','#e84b44','#25bade'],15,17,14),
  profile('pink-inflatable-bounce-house','castle',['#a349ad','#f08bb8','#139cc0','#8c63b9'],15,18,15),
  profile('patriotic-red-white-and-blue-bounce-house','castle',['#183e8a','#eeeeec','#d53b35','#f3f2ee'],15,18,15),
  profile('wedding-white-bounce-house','white',['#f5f1e8','#fffcf4','#ece7dd','#ffffff'],15,18,14),
  profile('fire-truck-water-slide-bounce-house','firetruck',['#cf302d','#ed5740','#29313c','#ead6bf'],16,32,15,{combo:true}),
  profile('pirate-ship-slide-combo-bounce-house','pirate',['#bd643c','#ee9b37','#2849ae','#6e412f'],16,32,16,{combo:true}),
  profile('tidal-wave-inflatable-water-slide','slide',['#1678b6','#f2f2ec','#2ca6d8','#1e4d83'],16,32,17,{lanes:2}),
  profile('fire-red-marble-inflatable-water-slide','slide',['#e44125','#ffca3b','#dc3024','#717a7c'],16,32,18,{lanes:2,marble:true}),
  profile('18ft-purple-tropical-marble-double-bay-waterslide','slide',['#753dac','#f2be33','#17b6dd','#702c9c'],18,36,18,{lanes:2,palms:true,marble:true}),
  profile('22ft-tropical-lava-wave-marble-waterslide','slide',['#b82420','#ffbf2f','#d74329','#e3811d'],18,40,22,{lanes:2,palms:true,marble:true}),
];
const normal=v=>String(v||'').toLowerCase().replace(/×/g,'x').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export function isInflatableProduct(p){return p?.active!==false && !/package|cover|blower|repair|accessor/i.test(p?.name||'') && /\bbounce\s*house\b|\bwater\s*slide\b|\bwaterslide\b|\bobstacle\s*course\b|\binflatable\s+(?:slide|game|combo)\b/i.test(p?.name||'');}
function positive(v){const n=Number(v);return Number.isFinite(n)&&n>0&&n<=200?n:null;}
export function inflatableCatalog(products,showPrices){
  return products.filter(isInflatableProduct).map(p=>{
    const slug=normal(String(p.external_id||'').split(':').pop()),metadata=p.metadata||{};
    const known=INFLATABLE_PROFILES.find(m=>m.slug===slug||m.slug===normal(p.name));
    // Unknown tenants get a labeled illustrative profile, never another tenant's item.
    const style=metadata.inflatableStyle || (/slide/i.test(p.name)?(/bounce/i.test(p.name)?'combo':'slide'):'castle');
    const model=known||{style,colors:['#247ab1','#efd33c','#ef644e','#3d9b67'],widthFt:style==='castle'?15:16,depthFt:style==='castle'?18:32,heightFt:16,lanes:1,combo:style==='combo'};
    const width=positive(p.width_ft),depth=positive(p.length_ft),height=positive(metadata.heightFt||metadata.height_ft);
    const price=p.price_per_day==null||p.price_per_day===''?null:Number(p.price_per_day);
    const photo=String(p.photo_url||p.image_url||'');
    return {...model,id:'inflatable-'+p.id,productId:p.id,externalId:p.external_id||null,name:p.name,category:'inflatable',widthFt:width||model.widthFt,depthFt:depth||model.depthFt,heightFt:height||model.heightFt,dimensionsConfirmed:!!(width&&depth),photoUrl:/^https?:\/\//i.test(photo)?photo:null,pricePerDay:showPrices&&price!=null&&Number.isFinite(price)?price:null};
  });
}
export function byId(id){return INFLATABLES.find(p=>p.id===id);}
export function inflatableItem(product,id,x=0,y=0){return {id,kind:'inflatable',inflatableId:product.id,widthFt:product.widthFt,depthFt:product.depthFt,rotationDeg:0,x,y};}
export function inflatableSizeLabel(p){return p.dimensionsConfirmed?`${p.widthFt} × ${p.depthFt} ft`:'Illustrative size · confirm dimensions';}
// Shared geometry/activity coordinates: feet, positive Z toward the entrance.
export function inflatableZones(p){
  const w=p.widthFt,d=p.depthFt,h=p.heightFt;
  if(p.combo)return {bounce:{x:0,z:-d*.26,w:w*.75,d:d*.32,floor:1.35},slide:{x:0,z0:-d*.08,z1:d*.33,y0:h*.50,y1:1.3,width:w*.48,lanes:1}};
  if(p.style==='slide')return {slide:{x:0,z0:-d*.33,z1:d*.30,y0:h*.73,y1:1.3,width:w*.74,lanes:p.lanes||1}};
  return {bounce:{x:0,z:-d*.06,w:w*.74,d:d*.64,floor:1.35}};
}
