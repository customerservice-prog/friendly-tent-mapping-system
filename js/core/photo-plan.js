import { rentalPhotoPlacement, photoTentTransform } from './photo-geometry.js';
import { objectLocalDimensions, objectGroundFootprint } from './world-space.js';
import { pointInPolygon } from './site-fit.js';
import { CONFLICT_TYPES, SEVERITY, checkSurfaceAnchoringConflicts } from './collision.js';

// Read-only adapter: all views share photo-site placement while older saved
// tent-local coordinates remain available for compatibility and photo removal.
export function photoPlanSnapshot(data) {
  if(!data?.backgroundPhoto||!data.photoSite||!data.tent||data.photoSitePlan)return data;
  const map=item=>{
    const local=objectLocalDimensions(item);
    return rentalPhotoPlacement({...item,modelWidthFt:local.widthFt,modelDepthFt:local.depthFt},data.tent,data.photoSite,data.photoTentPlacement);
  };
  let placement=data.placement;
  if(placement&&!placement.photoMode){
    const objects=placement.objects.map(map),x=Math.min(...objects.map(o=>o.x)),y=Math.min(...objects.map(o=>o.y));
    placement={...placement,objects,x,y,widthFt:Math.max(...objects.map(o=>o.x+o.widthFt))-x,depthFt:Math.max(...objects.map(o=>o.y+o.depthFt))-y,photoMode:true};
  }
  return {...data,photoSitePlan:true,
    tent:{...data.tent,planningArea:{widthFt:data.photoSite.widthFt,lengthFt:data.photoSite.lengthFt}},
    planTentPlacement:photoTentTransform(data.tent,data.photoSite,data.photoTentPlacement),
    objects:(data.objects||[]).map(map),placement};
}

// Photo layouts keep legacy tent-local fields for compatibility, so checks must
// use the same resolved site positions as their renderers. This path deliberately
// leaves the original tent-only checker unchanged.
export function runPhotoPlanChecks(snapshot,guestCount=0,surfaceType=snapshot?.surfaceType){
  const plan=photoPlanSnapshot(snapshot),tent=plan.tent,site=plan.photoSite||tent,objects=plan.objects||[],results=[];
  const add=(type,severity,ids,message)=>results.push({type,severity,objectIds:ids,message});
  const shape=(item,padding=0)=>objectGroundFootprint(item,padding);
  const footprints=new Map(objects.map(o=>[o.id,shape(o)])),floors=objects.filter(o=>o.kind==='dance'||o.kind==='danceFloor'),rentals=objects.filter(o=>!floors.includes(o));
  const placement=plan.planTentPlacement||photoTentTransform(tent,site,plan.photoTentPlacement),a=placement.rotationDeg*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const poles=tent.isSite?[]:(tent.centerPoles||[]).map(p=>{const x=(Number(p.x)||0)-tent.widthFt/2,y=(Number(p.y)||0)-tent.lengthFt/2;return {x:placement.x+tent.widthFt/2+x*c-y*s,y:placement.y+tent.lengthFt/2+x*s+y*c};});
  const tentClearance=tent.isSite?null:objectGroundFootprint({x:placement.x,y:placement.y,widthFt:tent.widthFt,depthFt:tent.lengthFt,rotationDeg:placement.rotationDeg},Math.max(0,Number(tent.installationClearanceFt)||0));
  for(const item of objects){
    const polygon=footprints.get(item.id);
    if(polygon.some(p=>p.x < -1e-7||p.y < -1e-7||p.x>site.widthFt+1e-7||p.y>site.lengthFt+1e-7))add(CONFLICT_TYPES.TENT_EDGE_CONFLICT,SEVERITY.ERROR,[item.id],'This item extends beyond your estimated site planning area.');
    if(!floors.includes(item)&&poles.some(p=>circleTouchesPolygon(p,.75,polygon)))add(CONFLICT_TYPES.HARD_CONFLICT,SEVERITY.ERROR,[item.id],'This item overlaps a tent center pole. Move it to clear the pole line.');
    if(item.kind==='inflatable'&&tentClearance&&polygonsOverlap(polygon,tentClearance))add(CONFLICT_TYPES.HARD_CONFLICT,SEVERITY.ERROR,[item.id],'Keep inflatables outside the tent and its installation clearance. Confirm manufacturer operating clearance with staff.');
  }
  for(let i=0;i<rentals.length;i++)for(let j=i+1;j<rentals.length;j++){
    const one=rentals[i],two=rentals[j];
    if(polygonsOverlap(footprints.get(one.id),footprints.get(two.id)))add(CONFLICT_TYPES.OBJECT_OVERLAP,SEVERITY.WARNING,[one.id,two.id],'These two items overlap and need to be spaced apart.');
    if(['table','tableGroup'].includes(one.kind)&&['table','tableGroup'].includes(two.kind)&&polygonsOverlap(shape(one,1),footprints.get(two.id)))add(CONFLICT_TYPES.CHAIR_CLEARANCE,SEVERITY.WARNING,[one.id,two.id],'Chairs at these tables are seated back-to-back with little walking room. Consider adding spacing.');
  }
  if(floors.length){const protectedFloor=convexHull(floors.flatMap(o=>shape(o,2)));for(const item of rentals)if(polygonsOverlap(footprints.get(item.id),protectedFloor))add(CONFLICT_TYPES.DANCE_FLOOR_CONFLICT,SEVERITY.WARNING,[item.id],'This item is too close to the dance floor. Leave clear space around it for guests to move.');}
  for(const aisle of plan.aisles||[]){const polygon=objectGroundFootprint({...aisle,widthFt:aisle.widthFt||aisle.width,depthFt:aisle.depthFt||aisle.depth});for(const item of objects)if(polygonsOverlap(footprints.get(item.id),polygon))add(CONFLICT_TYPES.AISLE_CONFLICT,SEVERITY.WARNING,[item.id],'This item intrudes into a reserved aisle or walkway.');}
  for(const item of objects)if(item.kind==='buffet'&&item.widthFt*item.depthFt<Math.ceil((guestCount||1)/50)*60)add(CONFLICT_TYPES.SERVICE_CONFLICT,SEVERITY.INFO,[item.id],'The buffet area may be tight for this guest count. Your rental team can help plan additional service space.');
  return results.concat(checkSurfaceAnchoringConflicts(tent,surfaceType));
}
function polygonsOverlap(one,two){
  for(const polygon of [one,two])for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length],axis={x:-(q.y-p.y),y:q.x-p.x};
    const first=one.map(v=>v.x*axis.x+v.y*axis.y),second=two.map(v=>v.x*axis.x+v.y*axis.y);
    if(Math.max(...first)<=Math.min(...second)+1e-7||Math.max(...second)<=Math.min(...first)+1e-7)return false;
  }
  return true;
}
function circleTouchesPolygon(center,radius,polygon){
  if(pointInPolygon(center,polygon))return true;
  return polygon.some((p,i)=>{const q=polygon[(i+1)%polygon.length],dx=q.x-p.x,dy=q.y-p.y,t=Math.max(0,Math.min(1,((center.x-p.x)*dx+(center.y-p.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(center.x-p.x-t*dx,center.y-p.y-t*dy)<=radius;});
}
function convexHull(points){
  const sorted=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y),cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x),lower=[],upper=[];
  for(const p of sorted){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
  for(const p of sorted.slice().reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
  return lower.slice(0,-1).concat(upper.slice(0,-1));
}
