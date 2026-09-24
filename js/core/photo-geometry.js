function clamp(n,min,max,fallback){
  n=Number(n);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
}
function point(value,fallback){
  value=value&&typeof value==='object'?value:{};
  return {x:clamp(value.x,0,1,fallback.x),y:clamp(value.y,0,1,fallback.y)};
}
export function defaultPhotoCalibration(tent){
  const aspect=Math.max(0.55,Math.min(1.8,Number(tent?.widthFt||50)/Math.max(1,Number(tent?.lengthFt||60))));
  const topHalf=Math.max(.18,Math.min(.31,.22+(aspect-.8)*.06));
  return {
    version:1,
    horizonY:.34,
    frontLeft:{x:.055,y:.955},
    frontRight:{x:.945,y:.955},
    backRight:{x:.5+topHalf,y:.47},
    backLeft:{x:.5-topHalf,y:.47},
    autoEstimated:true,
    calibratedAt:null
  };
}
export function normalizePhotoCalibration(value,tent){
  const d=defaultPhotoCalibration(tent);
  value=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  let c={
    version:1,
    horizonY:clamp(value.horizonY,.08,.78,d.horizonY),
    frontLeft:point(value.frontLeft,d.frontLeft),
    frontRight:point(value.frontRight,d.frontRight),
    backRight:point(value.backRight,d.backRight),
    backLeft:point(value.backLeft,d.backLeft),
    autoEstimated:value.autoEstimated!==false,
    calibratedAt:typeof value.calibratedAt==='string'?value.calibratedAt:null
  };
  // Keep a sane left/right ordering even after manual calibration.
  if(c.frontLeft.x>c.frontRight.x){const t=c.frontLeft;c.frontLeft=c.frontRight;c.frontRight=t;}
  if(c.backLeft.x>c.backRight.x){const t=c.backLeft;c.backLeft=c.backRight;c.backRight=t;}
  return c;
}
export function calibrationPoints(value,tent){
  const c=normalizePhotoCalibration(value,tent);
  return [c.frontLeft,c.frontRight,c.backRight,c.backLeft];
}
export function worldToPhoto(x,y,tent,calibration){
  const c=normalizePhotoCalibration(calibration,tent),w=Math.max(1,Number(tent?.widthFt||50)),l=Math.max(1,Number(tent?.lengthFt||60));
  const u=Number(x)/w,v=Number(y)/l;
  const fl=c.frontLeft,fr=c.frontRight,br=c.backRight,bl=c.backLeft;
  return {
    x:(1-v)*((1-u)*fl.x+u*fr.x)+v*((1-u)*bl.x+u*br.x),
    y:(1-v)*((1-u)*fl.y+u*fr.y)+v*((1-u)*bl.y+u*br.y)
  };
}
function bilinearUv(u,v,c){
  const fl=c.frontLeft,fr=c.frontRight,br=c.backRight,bl=c.backLeft;
  return {
    x:(1-v)*((1-u)*fl.x+u*fr.x)+v*((1-u)*bl.x+u*br.x),
    y:(1-v)*((1-u)*fl.y+u*fr.y)+v*((1-u)*bl.y+u*br.y)
  };
}
export function photoToWorld(nx,ny,tent,calibration,{clampToGround=true}={}){
  const c=normalizePhotoCalibration(calibration,tent),w=Math.max(1,Number(tent?.widthFt||50)),l=Math.max(1,Number(tent?.lengthFt||60));
  let u=.5,v=.5;
  // Newton solve the inverse bilinear mapping. Stable for normal convex ground quads.
  for(let i=0;i<12;i++){
    const p=bilinearUv(u,v,c),ex=p.x-nx,ey=p.y-ny;
    if(Math.abs(ex)+Math.abs(ey)<1e-6)break;
    const e=1e-4,pu=bilinearUv(u+e,v,c),pv=bilinearUv(u,v+e,c);
    const a=(pu.x-p.x)/e,b=(pv.x-p.x)/e,cc=(pu.y-p.y)/e,d=(pv.y-p.y)/e,det=a*d-b*cc;
    if(Math.abs(det)<1e-8)break;
    const du=(d*ex-b*ey)/det,dv=(-cc*ex+a*ey)/det;
    u-=du;v-=dv;
  }
  if(!Number.isFinite(u)||!Number.isFinite(v))return null;
  if(clampToGround){u=Math.max(0,Math.min(1,u));v=Math.max(0,Math.min(1,v));}
  return {x:u*w,y:v*l,u,v};
}
export function rotatedFootprint(item){
  const w=Math.max(.1,Number(item?.widthFt||1)),d=Math.max(.1,Number(item?.depthFt||1)),cx=Number(item?.x||0)+w/2,cy=Number(item?.y||0)+d/2;
  const a=(Number(item?.rotationDeg||0)||0)*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a);
  return [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([x,y])=>({x:cx+x*ca-y*sa,y:cy+x*sa+y*ca}));
}
export function objectPhotoPolygon(item,tent,calibration){
  return rotatedFootprint(item).map(p=>worldToPhoto(p.x,p.y,tent,calibration));
}
export function objectPhotoCenter(item,tent,calibration){
  return worldToPhoto(Number(item?.x||0)+Math.max(.1,Number(item?.widthFt||1))/2,Number(item?.y||0)+Math.max(.1,Number(item?.depthFt||1))/2,tent,calibration);
}
export function normalizePhotoGeometry(value,tent){
  if(!Array.isArray(value))return [];
  const w=Math.max(1,Number(tent?.widthFt||50)),l=Math.max(1,Number(tent?.lengthFt||60));
  const allowed=new Set(['house','fence','tree','obstacle','no-place']);
  return value.slice(0,80).map((g,i)=>{
    if(!g||typeof g!=='object')return null;
    const type=allowed.has(g.type)?g.type:'obstacle';
    let x=clamp(g.x,-w,w*2,0),y=clamp(g.y,-l,l*2,0),widthFt=clamp(g.widthFt,.2,w*2,3),depthFt=clamp(g.depthFt,.2,l*2,3);
    const heights={house:12,fence:6,tree:18,obstacle:4,'no-place':.2};
    return {
      id:typeof g.id==='string'&&g.id?g.id.slice(0,80):'photo-geo-'+i,
      type,x,y,widthFt,depthFt,
      heightFt:clamp(g.heightFt,.1,80,heights[type]),
      rotationDeg:clamp(g.rotationDeg,-360,360,0)
    };
  }).filter(Boolean);
}
export function geometryPhotoPolygon(geom,tent,calibration){
  return objectPhotoPolygon(geom,tent,calibration);
}
export function photoCameraEstimate(tent,calibration){
  const c=normalizePhotoCalibration(calibration,tent),w=Math.max(8,Number(tent?.widthFt||50)),l=Math.max(8,Number(tent?.lengthFt||60)),fov=42;
  const frontWidth=Math.max(.05,Math.abs(c.frontRight.x-c.frontLeft.x)),backWidth=Math.max(.03,Math.abs(c.backRight.x-c.backLeft.x));
  const ratio=Math.max(.08,Math.min(.92,backWidth/frontWidth));
  let frontDistance=ratio*l/Math.max(.08,1-ratio);
  frontDistance=Math.max(l*.22,Math.min(l*4,frontDistance));
  const frontCenter=(c.frontLeft.x+c.frontRight.x)/2,backCenter=(c.backLeft.x+c.backRight.x)/2;
  const lateral=(frontCenter-backCenter)*w*1.55;
  const halfFov=fov*Math.PI/360;
  const pitch=Math.atan(Math.max(.02,(.5-c.horizonY)*2*Math.tan(halfFov)));
  const lookDistance=frontDistance+l*.48;
  const height=Math.max(5.5,Math.min(45,Math.tan(pitch)*lookDistance+4.5));
  return {
    fov,
    position:[lateral,height,-l/2-frontDistance],
    target:[0,Math.min(5,height*.24),Math.min(l*.12,8)],
    horizonY:c.horizonY,
    confidence:Math.max(.25,Math.min(.92,.65+(frontWidth-backWidth)*.35))
  };
}
export function geometryTypeHeight(type){
  return ({house:12,fence:6,tree:18,obstacle:4,'no-place':.2})[type]||4;
}
