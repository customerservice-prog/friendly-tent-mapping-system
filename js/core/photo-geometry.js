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
  const h=photoHomography(tent,calibration),d=h[6]*x+h[7]*y+1;
  return {x:(h[0]*x+h[1]*y+h[2])/d,y:(h[3]*x+h[4]*y+h[5])/d};
}
function solve(matrix){
  const a=matrix.map(row=>row.slice()),n=a.length;
  for(let k=0;k<n;k++){
    let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[pivot][k]))pivot=i;
    if(Math.abs(a[pivot][k])<1e-10)return null;
    [a[k],a[pivot]]=[a[pivot],a[k]];const d=a[k][k];for(let j=k;j<=n;j++)a[k][j]/=d;
    for(let i=0;i<n;i++)if(i!==k){const f=a[i][k];for(let j=k;j<=n;j++)a[i][j]-=f*a[k][j];}
  }
  return a.map(row=>row[n]);
}
// One projective mapping is shared by the SVG plan, 3D rendering and pointers.
// Four user marks establish correspondence, not measured site accuracy.
const homographies=new Map();
export function photoHomography(tent,calibration){
  const c=normalizePhotoCalibration(calibration,tent),w=Math.max(1,Number(tent?.widthFt||50)),l=Math.max(1,Number(tent?.lengthFt||60)),rows=[];
  const key=JSON.stringify([w,l,c.frontLeft,c.frontRight,c.backRight,c.backLeft]);
  if(homographies.has(key))return homographies.get(key);
  [[0,0,c.frontLeft],[w,0,c.frontRight],[w,l,c.backRight],[0,l,c.backLeft]].forEach(([x,y,p])=>{
    rows.push([x,y,1,0,0,0,-p.x*x,-p.x*y,p.x],[0,0,0,x,y,1,-p.y*x,-p.y*y,p.y]);
  });
  const h=solve(rows)||[1/w,0,0,0,-1/l,1,0,0];
  if(homographies.size>=32)homographies.delete(homographies.keys().next().value);homographies.set(key,h);return h;
}
export function photoToWorld(nx,ny,tent,calibration,{clampToGround=true}={}){
  const h=photoHomography(tent,calibration),p=solve([[h[0]-nx*h[6],h[1]-nx*h[7],nx-h[2]],[h[3]-ny*h[6],h[4]-ny*h[7],ny-h[5]]]);
  if(!p)return null;const w=Math.max(1,Number(tent?.widthFt||50)),l=Math.max(1,Number(tent?.lengthFt||60));
  const x=clampToGround?Math.max(0,Math.min(w,p[0])):p[0],y=clampToGround?Math.max(0,Math.min(l,p[1])):p[1];
  return {x,y,u:x/w,v:y/l};
}

export function photoImageRect(width,height,imageWidth,imageHeight,photo={}){
  const zoom=clamp(photo.zoom,1,1.8,1),scale=Math.min(width/Math.max(1,imageWidth),height/Math.max(1,imageHeight))*zoom;
  const w=imageWidth*scale,h=imageHeight*scale;
  return {x:(width-w)*clamp(photo.focusX,0,100,50)/100,y:(height-h)*clamp(photo.focusY,0,100,50)/100,width:w,height:h};
}

// A projective photo camera: ground registration is exact to the supplied four
// marks. Height uses an estimated focal length; this is not a measured camera.
export function photoProjection(tent,calibration,width,height,imageWidth,imageHeight,photo={}){
  const h=photoHomography(tent,calibration),w=Number(tent.widthFt),l=Number(tent.lengthFt);
  const aspect=Math.max(.2,imageWidth/imageHeight),fy=1/(2*Math.tan(21*Math.PI/180)),fx=fy/aspect;
  const a=[(h[0]-.5*h[6])/fx,(h[3]-.5*h[6])/fy,h[6]],b=[(h[1]-.5*h[7])/fx,(h[4]-.5*h[7])/fy,h[7]];
  const cross=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...cross)||1;
  const s=Math.sqrt(Math.hypot(...a)*Math.hypot(...b))/length,r=cross.map(v=>v*s);
  const vertical=[fx*r[0]+.5*r[2],fy*r[1]+.5*r[2],r[2]];
  const rows=[[h[0],vertical[0],h[1],h[2]+h[0]*w/2+h[1]*l/2],[h[3],vertical[1],h[4],h[5]+h[3]*w/2+h[4]*l/2],[h[6],vertical[2],h[7],1+h[6]*w/2+h[7]*l/2]];
  const center=solve(rows.map(row=>[row[0],row[1],row[2],-row[3]]));
  const rect=photoImageRect(width,height,imageWidth,imageHeight,photo),sx=2*rect.width/width,sy=-2*rect.height/height,ox=2*rect.x/width-1,oy=1-2*rect.y/height;
  const near=.001,far=100,A=(far+near)/(far-near),B=-2*far*near/(far-near),matrix=[];
  matrix.push(...rows[0].map((v,i)=>sx*v+ox*rows[2][i]),...rows[1].map((v,i)=>sy*v+oy*rows[2][i]),...rows[2].map((v,i)=>A*v+(i===3?B:0)),...rows[2]);
  return {matrix,center,rect,accuracy:'unverified',heightEstimated:true};
}

export function photoTentTransform(tent,site,placement){
  return {x:Number.isFinite(Number(placement?.x))?Number(placement.x):Math.max(0,(site.widthFt-tent.widthFt)/2),y:Number.isFinite(Number(placement?.y))?Number(placement.y):Math.max(0,(site.lengthFt-tent.lengthFt)/2),rotationDeg:Number(placement?.rotationDeg)||0};
}
export function rentalPhotoPlacement(item,tent,site,placement){
  if(item.photoPlacement)return {...item,x:Number(item.photoPlacement.x)||0,y:Number(item.photoPlacement.y)||0,rotationDeg:Number(item.photoPlacement.rotationDeg)||0};
  if(tent.isSite)return {...item};
  const p=photoTentTransform(tent,site,placement),a=p.rotationDeg*Math.PI/180,dx=Number(item.x||0)+item.widthFt/2-tent.widthFt/2,dy=Number(item.y||0)+item.depthFt/2-tent.lengthFt/2;
  return {...item,x:p.x+tent.widthFt/2+dx*Math.cos(a)-dy*Math.sin(a)-item.widthFt/2,y:p.y+tent.lengthFt/2+dx*Math.sin(a)+dy*Math.cos(a)-item.depthFt/2,rotationDeg:(Number(item.rotationDeg)||0)+p.rotationDeg};
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
