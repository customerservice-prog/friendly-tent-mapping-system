import { chairPositions } from './seating.js';
import { tablePositions, dancePositions } from './suggested-layout.js';

// The party starter uses the same catalog definitions and placement machinery as
// manual editing. It returns real rental objects, never an alternative scene store.
export function partyLayout(tent,{tables=[],chairs=[],linens=[],danceAvailable=false}={}) {
  const dining=tables.find(t=>t.shape==='round'&&t.seatsDefault>=6)||tables.find(t=>t.seatsDefault>0);
  const chair=chairs.find(c=>c.silhouette==='resin')||chairs[0];
  if(!dining||!chair)return [];
  let next=0;const objects=[];
  if(danceAvailable)objects.push(...dancePositions(tent,6).map(p=>({id:'party-'+(++next),kind:'dance',widthFt:3,depthFt:3,...p})));
  const linenFor=t=>linens.find(l=>l.active!==false&&l.fitsTableIds?.includes(t.id)&&!['linen-napkins','linen-runner-9ft'].includes(l.id));
  const add=(t,p,seats)=>objects.push({id:'party-'+(++next),kind:'table',tableId:t.id,shape:t.shape,widthFt:t.diameterFt||t.widthFt,depthFt:t.diameterFt||t.depthFt,...p,seatCount:seats,chairId:chair.id,linenId:linenFor(t)?.id||null,linenColor:'White'});
  tablePositions(tent,dining,chair,objects).slice(0,2).forEach(p=>add(dining,p,dining.seatsDefault));
  if(!objects.some(o=>o.kind==='table'))return [];
  const cocktail=tables.find(t=>t.silhouette==='cocktail-pedestal');
  if(cocktail){
    const occupied=objects.map(o=>{const margin=o.seatCount?1.9:.6;return{x:o.x-margin,y:o.y-margin,widthFt:o.widthFt+margin*2,depthFt:o.depthFt+margin*2};});
    // Leave a real standing envelope around the cocktail table.
    const p=tablePositions(tent,{...cocktail,seatsDefault:2},chair,occupied).at(-1);
    if(p)add(cocktail,p,0);
  }
  return objects;
}

export function activityPositions(tent,objects,chairs=[],limit=32) {
  const people=[],occupied=[],poles=tent.centerPoles||[],hw=tent.widthFt/2,hl=tent.lengthFt/2;
  for(const item of objects){
    if(item.kind!=='table'||!item.seatCount)continue;
    const chair=chairs.find(c=>c.id===item.chairId)||{},seats=chairPositions(item,chair);
    seats.forEach((p,i)=>{
      if(people.length>=limit)return;
      people.push({x:item.x+item.widthFt/2-hw+p.x,z:item.y+item.depthFt/2-hl+p.y,heading:-p.angle-Math.PI/2,seated:true,activity:'conversation',tableId:item.id,variant:i});
    });
    occupied.push(...seats.map(p=>({x:item.x+item.widthFt/2+p.x,z:item.y+item.depthFt/2+p.y})));
  }
  const free=(x,z,r=.65,ignoreFloor=false)=>x>r&&z>r&&x<tent.widthFt-r&&z<tent.lengthFt-r&&!poles.some(p=>Math.hypot(x-p.x,z-p.y)<r+.5)&&!occupied.some(p=>Math.hypot(x-p.x,z-p.z)<r+.55)&&!objects.some(o=>(!ignoreFloor||o.kind!=='dance')&&x>o.x-r&&x<o.x+o.widthFt+r&&z>o.y-r&&z<o.y+o.depthFt+r)&&!people.some(p=>!p.seated&&Math.hypot(x-hw-p.x,z-hl-p.z)<r+.8);
  const standing=(x,z,heading,activity)=>{people.push({x:x-hw,z:z-hl,heading,seated:false,activity});};
  for(const item of objects.filter(o=>o.kind==='table'&&!o.seatCount)){
    const radius=Math.max(item.widthFt,item.depthFt)/2+1.1,cx=item.x+item.widthFt/2,cz=item.y+item.depthFt/2;
    for(const a of [0,Math.PI*.7,Math.PI*1.4]){
      const x=cx+Math.cos(a)*radius,z=cz+Math.sin(a)*radius;
      if(free(x,z)&&people.length<limit+6)standing(x,z,-a-Math.PI/2,'cocktail');
    }
  }
  const floor=objects.filter(o=>o.kind==='dance');
  if(floor.length){
    const minX=Math.min(...floor.map(o=>o.x)),minZ=Math.min(...floor.map(o=>o.y)),maxX=Math.max(...floor.map(o=>o.x+o.widthFt)),maxZ=Math.max(...floor.map(o=>o.y+o.depthFt));
    const cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
    for(const side of [-1,1]){
      const x=cx+side*1.05,z=cz;
      // Every corner of a dancer's moving footprint must lie on real sections.
      const onFloor=[-.7,.7].every(dx=>[-.7,.7].every(dz=>floor.some(o=>x+dx>=o.x&&x+dx<=o.x+o.widthFt&&z+dz>=o.y&&z+dz<=o.y+o.depthFt)));
      if(onFloor&&free(x,z,.7,true))standing(x,z,side<0?Math.PI/2:-Math.PI/2,'dance');
    }
  }
  // Find an aisle under this exact tent. A route is only included when the full
  // walking footprint clears furniture, chairs, poles, floor and other people.
  const step=1.2,nx=Math.floor(tent.widthFt/step),nz=Math.floor(tent.lengthFt/step),nodes=new Map();
  for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){const x=(ix+.5)*step,z=(iz+.5)*step;if(free(x,z,.8))nodes.set(ix+':'+iz,{ix,iz,x,z});}
  const flood=start=>{const queue=[start],seen=new Map([[start,null]]);for(let i=0;i<queue.length;i++){const a=nodes.get(queue[i]);for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const k=(a.ix+dx)+':'+(a.iz+dz),b=nodes.get(k);if(b&&!seen.has(k)&&free((a.x+b.x)/2,(a.z+b.z)/2,.8)){seen.set(k,queue[i]);queue.push(k);}}}return {end:queue.at(-1),seen};};
  let best=[];
  for(const key of [...nodes.keys()].filter((_,i)=>i%Math.max(1,Math.ceil(nodes.size/12))===0)){
    const first=flood(key),walk=flood(first.end),route=[];let at=walk.end;while(at!=null){const p=nodes.get(at);route.push({x:p.x-hw,z:p.z-hl});at=walk.seen.get(at);}if(route.length>best.length)best=route;
  }
  if(best.length>=5){
    // Keep a short, visible aisle route rather than touring the perimeter.
    best=best.slice(0,9);people.push({...best[0],heading:0,seated:false,activity:'walk',route:best});
  }
  return people;
}
