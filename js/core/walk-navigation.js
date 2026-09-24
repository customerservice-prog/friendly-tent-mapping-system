import { worldPointToLayout, objectGroundFootprint } from './world-space.js';
import { pointInPolygon } from './site-fit.js';

function finite(value, fallback=0){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

function siteSize(site){
  return {
    widthFt:Math.max(1,finite(site?.widthFt,50)),
    lengthFt:Math.max(1,finite(site?.lengthFt,60)),
  };
}

function polygonFor(entity,paddingFt=0){
  if(Array.isArray(entity?.polygon)&&entity.polygon.length>=3){
    return entity.polygon.map(p=>({x:finite(p.x),y:finite(p.y)}));
  }
  return objectGroundFootprint({
    x:finite(entity?.x),
    y:finite(entity?.y),
    widthFt:Math.max(.1,finite(entity?.widthFt,1)),
    depthFt:Math.max(.1,finite(entity?.depthFt??entity?.lengthFt,1)),
    rotationDeg:finite(entity?.rotationDeg),
  },Math.max(0,finite(paddingFt)));
}

export function walkBlockingObstacles({photoGeometry=[],items=[],blockRentalKinds=['inflatable']}={}){
  const blockers=[];
  for(const g of photoGeometry||[]){
    if(!g)continue;
    blockers.push({
      id:g.id||null,
      type:g.type||'obstacle',
      source:'property',
      polygon:polygonFor(g),
    });
  }
  const allowed=new Set(blockRentalKinds||[]);
  for(const item of items||[]){
    if(!item||!allowed.has(item.kind))continue;
    const p=item.photoPlacement&&Number.isFinite(Number(item.photoPlacement.x))&&Number.isFinite(Number(item.photoPlacement.y))
      ? {...item,x:Number(item.photoPlacement.x),y:Number(item.photoPlacement.y),rotationDeg:finite(item.photoPlacement.rotationDeg,item.rotationDeg||0)}
      : item;
    blockers.push({
      id:item.id||null,
      type:item.kind||'rental',
      source:'rental',
      polygon:polygonFor(p),
    });
  }
  return blockers;
}

export function walkPositionBlocked({
  worldX,
  worldZ,
  site,
  photoGeometry=[],
  items=[],
  bodyRadiusFt=.85,
  blockRentalKinds=['inflatable'],
}={}){
  const s=siteSize(site);
  const layout=worldPointToLayout({x:finite(worldX),y:0,z:finite(worldZ)},s);
  const pad=Math.max(0,finite(bodyRadiusFt,.85));

  if(layout.x<pad||layout.y<pad||layout.x>s.widthFt-pad||layout.y>s.lengthFt-pad){
    return {blocked:true,reason:'outside_site',layoutPoint:{x:layout.x,y:layout.y},blocker:null};
  }

  const blockers=walkBlockingObstacles({photoGeometry,items,blockRentalKinds});
  for(const blocker of blockers){
    // Expand rotated rectangles by the viewer body radius. Arbitrary polygons
    // are used as-is because reconstructed polygons may already represent their
    // safe extent.
    let poly=blocker.polygon;
    const source=(photoGeometry||[]).find(g=>g?.id&&g.id===blocker.id)||(items||[]).find(i=>i?.id&&i.id===blocker.id);
    if(source&&!Array.isArray(source?.polygon)){
      const p=source?.photoPlacement&&Number.isFinite(Number(source.photoPlacement.x))&&Number.isFinite(Number(source.photoPlacement.y))
        ? {...source,x:Number(source.photoPlacement.x),y:Number(source.photoPlacement.y),rotationDeg:finite(source.photoPlacement.rotationDeg,source.rotationDeg||0)}
        : source;
      poly=polygonFor(p,pad);
    }
    if(pointInPolygon({x:layout.x,y:layout.y},poly)){
      return {blocked:true,reason:'obstacle',layoutPoint:{x:layout.x,y:layout.y},blocker:{id:blocker.id,type:blocker.type,source:blocker.source}};
    }
  }
  return {blocked:false,reason:null,layoutPoint:{x:layout.x,y:layout.y},blocker:null};
}

export function resolveWalkStep({
  from,
  to,
  site,
  photoGeometry=[],
  items=[],
  bodyRadiusFt=.85,
  blockRentalKinds=['inflatable'],
}={}){
  const start={x:finite(from?.x),z:finite(from?.z)};
  const target={x:finite(to?.x,start.x),z:finite(to?.z,start.z)};
  const args={site,photoGeometry,items,bodyRadiusFt,blockRentalKinds};
  const direct=walkPositionBlocked({worldX:target.x,worldZ:target.z,...args});
  if(!direct.blocked)return {x:target.x,z:target.z,moved:true,slid:false,blocked:false};

  const slideX=walkPositionBlocked({worldX:target.x,worldZ:start.z,...args});
  if(!slideX.blocked)return {x:target.x,z:start.z,moved:target.x!==start.x,slid:true,blocked:false};

  const slideZ=walkPositionBlocked({worldX:start.x,worldZ:target.z,...args});
  if(!slideZ.blocked)return {x:start.x,z:target.z,moved:target.z!==start.z,slid:true,blocked:false};

  return {x:start.x,z:start.z,moved:false,slid:false,blocked:true,blocker:direct.blocker||slideX.blocker||slideZ.blocker||null};
}

export function findSafeWalkStart({
  preferredWorldPoint,
  site,
  photoGeometry=[],
  items=[],
  bodyRadiusFt=.85,
  blockRentalKinds=['inflatable'],
}={}){
  const s=siteSize(site);
  const candidates=[
    preferredWorldPoint&&{x:finite(preferredWorldPoint.x),z:finite(preferredWorldPoint.z)},
    {x:0,z:-s.lengthFt*.34},
    {x:-s.widthFt*.22,z:-s.lengthFt*.18},
    {x:s.widthFt*.22,z:-s.lengthFt*.18},
    {x:0,z:0},
    {x:-s.widthFt*.28,z:0},
    {x:s.widthFt*.28,z:0},
    {x:0,z:s.lengthFt*.24},
  ].filter(Boolean);

  for(const p of candidates){
    const check=walkPositionBlocked({
      worldX:p.x,worldZ:p.z,site:s,photoGeometry,items,bodyRadiusFt,blockRentalKinds
    });
    if(!check.blocked)return {x:p.x,z:p.z};
  }
  // Last-resort deterministic fallback inside the site boundary.
  return {x:0,z:-Math.max(0,s.lengthFt/2-bodyRadiusFt-1)};
}

export function walkSpeedFtPerSecond({sprint=false,mobile=false}={}){
  if(sprint)return mobile?11:15;
  return mobile?6.5:8.5;
}
