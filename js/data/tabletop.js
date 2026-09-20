// Only real products from the active rental catalog are offered or priced.
import { chairPositions } from '../core/seating.js';
export const TABLETOP=[];
export const TABLETOP_GROUPS=['Place settings','Napkins & runners','Centerpieces','Serving & drinks'];
export function tabletopType(product){
 const n=String(product.name||'').toLowerCase();
 if(product.active===false||/package|aisle|chair|tablecloth|table linen|cover|syrup|sugar -|floss|kernel|fuel|floor|wall|arch|tent/.test(n))return null;
 if(/charger.*plate/.test(n))return 'charger';
 if(/plate/.test(n))return 'plate';
 if(/napkin/.test(n))return 'napkin';
 if(/table runner/.test(n))return 'runner';
 if(/serving.*(spoon|tongs)|cake server/.test(n))return 'utensil';
 if(/fork/.test(n))return 'fork';if(/knife/.test(n))return 'knife';if(/spoon/.test(n))return 'spoon';
 if(/pitcher|carafe/.test(n))return 'pitcher';
 if(/goblet|wine glass|champagne flute|martini|pilsner|rocks glass|highball|coffee mug/.test(n))return 'glass';
 if(/soup bowl/.test(n))return 'bowl';
 if(/centerpiece|lantern|vase|floral arrangement/.test(n))return 'centerpiece';
 if(/candelabra|candle/.test(n))return 'candle';
 if(/table number/.test(n))return 'number';
 if(/cake stand|cake display|display dish/.test(n))return 'stand';
 if(/chafer/.test(n))return 'chafer';
 if(/beverage dispenser|coffee urn|percolator/.test(n))return 'dispenser';
 if(/chocolate fountain/.test(n))return 'fountain';
 if(/shaker|creamer/.test(n))return 'condiment';
 if(/serving bowl|sheet pan|card box|champagne bucket/.test(n))return 'serving';
 return null;
}
export function tabletopCatalog(products,showPrices=true){return products.flatMap(p=>{
 const type=tabletopType(p);if(!type)return[];const setting=['charger','plate','napkin','fork','knife','spoon','glass','bowl'].includes(type),price=p.price_per_day==null||p.price_per_day===''?null:Number(p.price_per_day);
 const group=['napkin','runner'].includes(type)?'Napkins & runners':setting?'Place settings':['centerpiece','candle','number'].includes(type)?'Centerpieces':'Serving & drinks';
 return [{id:p.id,productId:p.id,name:p.name,type,group,perSeat:setting,pricePerDay:showPrices&&Number.isFinite(price)&&price!==null?price:null,photoUrl:/^https?:\/\//i.test(p.photo_url||p.image_url||'')?(p.photo_url||p.image_url):null}];
});}
export function genericTabletop(){
 const samples=[['plate','Dinner Plate'],['charger','Gold Charger Plate'],['glass','Wine Glass'],['fork','Dinner Fork'],['knife','Dinner Knife'],['napkin','Napkin'],['runner','Table Runner'],['centerpiece','Floral Centerpiece'],['candle','Candle'],['pitcher','Water Pitcher']];
 return samples.map(([type,name])=>({id:'sample-'+type,productId:null,name,type,group:['napkin','runner'].includes(type)?'Napkins & runners':['centerpiece','candle'].includes(type)?'Centerpieces':type==='pitcher'?'Serving & drinks':'Place settings',perSeat:['plate','charger','glass','fork','knife','napkin'].includes(type),pricePerDay:null,isIllustrative:true,photoUrl:null}));
}
export function tabletopQuantity(entry,item){return entry.perSeat?Math.max(0,Math.floor(Number(item.seatCount)||0)):Math.min(100,Math.max(0,Math.floor(Number(entry.qty)||0)));}
export function tabletopPlacements(item,catalog=TABLETOP){
 const seats=chairPositions(item),placements=[],w=item.widthFt,d=item.depthFt;let centerIndex=0,glassIndex=0,plateIndex=0;
 for(const entry of item.tabletop||[]){
  const p=catalog.find(p=>p.id===entry.productId);if(!p)continue;const qty=tabletopQuantity(entry,item),isSetting=p.perSeat&&seats.length>0;
  const glassOffset=p.type==='glass'?glassIndex++:0,plateLayer=['plate','bowl'].includes(p.type)?++plateIndex:0;
  for(let i=0;i<Math.min(qty,isSetting?seats.length*2:12);i++){
   let x=0,z=0,angle=0,layer=0;
   if(isSetting){const s=seats[i%seats.length];angle=s.angle;const nx=Math.cos(angle),nz=Math.sin(angle);x=s.x-nx*1.68;z=s.y-nz*1.68;
    if(item.shape!=='round'){x=Math.max(-w/2+.46,Math.min(w/2-.46,x));z=Math.max(-d/2+.46,Math.min(d/2-.46,z));}
    const tangent=['fork'].includes(p.type)?-.57:['knife','spoon'].includes(p.type)?(p.type==='knife'?.56:.72):p.type==='glass'?.47+glassOffset*.28:0;
    const inward=p.type==='glass'?-.37:0;x+=-nz*tangent+nx*inward;z+=nx*tangent+nz*inward;
    layer=p.type==='charger'?0:p.type==='napkin'?.095:.025*plateLayer;layer+=Math.floor(i/seats.length)*.035;
   }else if(p.type!=='runner'){
    const index=centerIndex++,long=Math.max(w,d),short=Math.min(w,d),columns=Math.max(1,Math.floor(long/1.7));
    const order=[0,-1,1,-2,2],a=order[index%Math.min(5,columns)]*Math.min(1.4,long/(columns+1)),b=Math.floor(index/Math.max(1,columns))*.6;
    x=w>=d?a:b;z=w>=d?b:a;
   }
   placements.push({product:p,x,z,angle,layer,color:entry.color||'White',index:i});
  }
 }
 return placements;
}
if(typeof window!=='undefined')window.addEventListener('rentsketch:catalogReady',e=>{const d=e.detail||{};TABLETOP.splice(0,TABLETOP.length,...tabletopCatalog(d.products||[],d.tenant?.slug!=='generic'&&d.tenant?.showPrices!==false));});
