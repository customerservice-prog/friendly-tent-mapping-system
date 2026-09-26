function clamp(n,min,max,fallback){
  n=Number(n);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
}
function point(value,fallback){
  value=value&&typeof value==='object'?value:{};
  return {x:clamp(value.x,0,1,fallback.x),y:clamp(value.y,0,1,fallback.y)};
}
export function defaultPhotoCalibration(tent,photo={}){
  // A coherent eye-level starting camera, not an inferred property measurement.
  // The handles describe a visible reference rectangle. The planning site can
  // extend beyond the photo; squeezing its entire width into the image creates
  // an implausible high camera and makes a real-size tent look miniature.
  const w=Math.max(1,Number(tent?.widthFt)||50),l=Math.max(1,Number(tent?.lengthFt)||60);
  const imageAspect=clamp(Number(photo.widthPx)/Number(photo.heightPx),.3,4,4/3);
  const fovDeg=60,horizonY=.46,cameraHeightFt=5.5,frontDistance=Math.max(6,Math.min(12,w*.16));
  const fy=1/(2*Math.tan(fovDeg*Math.PI/360)),fx=fy/imageAspect,pitch=Math.atan((.5-horizonY)/fy),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const lengthFt=Math.min(20,l*.7),referenceY=(l-lengthFt)/2,visibleWidth=.8*(cp*(referenceY+frontDistance)+sp*cameraHeightFt)/fx;
  const widthFt=Math.min(20,w*.7,Math.max(1,Math.floor(visibleWidth*2)/2));
  const reference={x:(w-widthFt)/2,y:referenceY,widthFt,lengthFt};
  function project(x,y){const depth=y+frontDistance,den=cp*depth+sp*cameraHeightFt;return {x:.5+fx*(x-w/2)/den,y:.5+fy*(cp*cameraHeightFt-sp*depth)/den};}
  return {version:2,horizonY,fovDeg,imageAspect,reference,
    frontLeft:project(reference.x,reference.y),frontRight:project(reference.x+reference.widthFt,reference.y),
    backRight:project(reference.x+reference.widthFt,reference.y+reference.lengthFt),backLeft:project(reference.x,reference.y+reference.lengthFt),
    autoEstimated:true,scaleConfirmed:false,calibratedAt:null};
}
export function normalizePhotoCalibration(value,tent,photo={}){
  value=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const aspect=Number(photo.widthPx)/Number(photo.heightPx);
  const d=defaultPhotoCalibration(tent,{widthPx:Number.isFinite(aspect)&&aspect>0?aspect:value.imageAspect||4/3,heightPx:1});
  // Only migrate untouched automatic legacy guesses. Preserve customer marks.
  if((Number(value.version)||1)<2&&value.autoEstimated!==false)return d;
  const version=Number(value.version)>=2?2:1;
  const c={version,horizonY:clamp(value.horizonY,.08,.78,d.horizonY),
    fovDeg:clamp(value.fovDeg,30,100,version===2?60:42),imageAspect:clamp(value.imageAspect,.3,4,4/3),
    frontLeft:point(value.frontLeft,d.frontLeft),frontRight:point(value.frontRight,d.frontRight),
    backRight:point(value.backRight,d.backRight),backLeft:point(value.backLeft,d.backLeft),
    autoEstimated:value.autoEstimated!==false,scaleConfirmed:value.scaleConfirmed===true&&photoCalibrationValidity(value).valid,
    calibratedAt:typeof value.calibratedAt==='string'?value.calibratedAt:null};
  if(version===2){const r=value.reference||d.reference,w=Math.max(1,Number(tent?.widthFt)||50),l=Math.max(1,Number(tent?.lengthFt)||60);c.reference={x:clamp(r.x,0,w,0),y:clamp(r.y,0,l,0),widthFt:clamp(r.widthFt,1,500,d.reference.widthFt),lengthFt:clamp(r.lengthFt,1,500,d.reference.lengthFt)};}
  if(c.frontLeft.x>c.frontRight.x){const t=c.frontLeft;c.frontLeft=c.frontRight;c.frontRight=t;}
  if(c.backLeft.x>c.backRight.x){const t=c.backLeft;c.backLeft=c.backRight;c.backRight=t;}
  return c;
}
export function photoCalibrationValidity(value){
  const points=['frontLeft','frontRight','backRight','backLeft'].map(k=>value?.[k]);
  if(points.some(p=>!p||!Number.isFinite(Number(p.x))||!Number.isFinite(Number(p.y))||Number(p.x)<0||Number(p.x)>1||Number(p.y)<0||Number(p.y)>1))return {valid:false,reason:'Mark all four ground corners.'};
  let twiceArea=0,orientation=0;
  for(let i=0;i<4;i++){
    const a=points[i],b=points[(i+1)%4],c=points[(i+2)%4],edge=Math.hypot(b.x-a.x,b.y-a.y),cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
    if(edge<.008||Math.abs(cross)<.00003)return {valid:false,reason:'Spread the four corners farther apart on the ground.'};
    const sign=Math.sign(cross);if(orientation&&orientation!==sign)return {valid:false,reason:'Ground edges cannot cross. Keep the four corners in order.'};orientation=sign;
    twiceArea+=a.x*b.y-a.y*b.x;
  }
  if(Math.abs(twiceArea)/2<.0005)return {valid:false,reason:'Use a larger ground rectangle for a useful scale reference.'};
  return {valid:true,reason:''};
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
  let c=normalizePhotoCalibration(calibration,tent);
  // Invalid user marks are never promoted into a calibrated affine fallback.
  // Keep a safe estimated preview while the UI asks the user to fix the marks.
  if(!photoCalibrationValidity(c).valid)c=defaultPhotoCalibration(tent,{widthPx:c.imageAspect,heightPx:1});
  const w=Math.max(1,Number(tent?.widthFt||50)),l=Math.max(1,Number(tent?.lengthFt||60)),rows=[];
  const r=c.reference||{x:0,y:0,widthFt:w,lengthFt:l},key=JSON.stringify([w,l,r,c.frontLeft,c.frontRight,c.backRight,c.backLeft]);
  if(homographies.has(key))return homographies.get(key);
  [[r.x,r.y,c.frontLeft],[r.x+r.widthFt,r.y,c.frontRight],[r.x+r.widthFt,r.y+r.lengthFt,c.backRight],[r.x,r.y+r.lengthFt,c.backLeft]].forEach(([x,y,p])=>{
    rows.push([x,y,1,0,0,0,-p.x*x,-p.x*y,p.x],[0,0,0,x,y,1,-p.y*x,-p.y*y,p.y]);
  });
  const h=solve(rows)||[1/w,0,0,0,-1/l,1,0,0];
  if(homographies.size>=32)homographies.delete(homographies.keys().next().value);homographies.set(key,h);return h;
}
// Horizon of the actual ground homography, not a decorative stored line.
export function photoGroundHorizon(tent,calibration){
  const h=photoHomography(tent,calibration),line=[h[3]*h[7]-h[6]*h[4],h[6]*h[1]-h[0]*h[7],h[0]*h[4]-h[3]*h[1]];
  return Math.abs(line[1])>1e-10?-(line[0]*.5+line[2])/line[1]:null;
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
  const c=normalizePhotoCalibration(calibration,tent),h=photoHomography(tent,c),w=Number(tent.widthFt),l=Number(tent.lengthFt);
  const aspect=Math.max(.2,imageWidth/imageHeight),fy=1/(2*Math.tan(c.fovDeg*Math.PI/360)),fx=fy/aspect;
  const a=[(h[0]-.5*h[6])/fx,(h[3]-.5*h[6])/fy,h[6]],b=[(h[1]-.5*h[7])/fx,(h[4]-.5*h[7])/fy,h[7]];
  const cross=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...cross)||1;
  const s=Math.sqrt(Math.hypot(...a)*Math.hypot(...b))/length,r=cross.map(v=>v*s);
  const vertical=[fx*r[0]+.5*r[2],fy*r[1]+.5*r[2],r[2]];
  const rows=[[h[0],vertical[0],h[1],h[2]+h[0]*w/2+h[1]*l/2],[h[3],vertical[1],h[4],h[5]+h[3]*w/2+h[4]*l/2],[h[6],vertical[2],h[7],1+h[6]*w/2+h[7]*l/2]];
  const center=solve(rows.map(row=>[row[0],row[1],row[2],-row[3]]));
  const rect=photoImageRect(width,height,imageWidth,imageHeight,photo),sx=2*rect.width/width,sy=-2*rect.height/height,ox=2*rect.x/width-1,oy=1-2*rect.y/height;
  const near=.001,far=100,A=(far+near)/(far-near),B=-2*far*near/(far-near),matrix=[];
  matrix.push(...rows[0].map((v,i)=>sx*v+ox*rows[2][i]),...rows[1].map((v,i)=>sy*v+oy*rows[2][i]),...rows[2].map((v,i)=>A*v+(i===3?B:0)),...rows[2]);
  return {matrix,center,rect,accuracy:'unverified',heightEstimated:true,fovDeg:c.fovDeg,calibrationValid:photoCalibrationValidity(c).valid};
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
  const c=normalizePhotoCalibration(calibration,tent),w=Math.max(8,Number(tent?.widthFt||50)),l=Math.max(8,Number(tent?.lengthFt||60)),fov=c.fovDeg;
  if(c.version===2){const p=photoProjection(tent,c,1000,1000/c.imageAspect,1000,1000/c.imageAspect);return {fov,position:p.center||[0,5.5,-l/2-8],target:[0,0,0],horizonY:c.horizonY,confidence:.25};}
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
