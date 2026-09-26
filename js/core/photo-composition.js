// Photo composition is a manually edited image overlay, never inferred geometry.
// Points are fractions of the original source image, independent of viewport size.
export const PHOTO_COMPOSITION_VERSION=1;
export const DEFAULT_PHOTO_LIGHTING=Object.freeze({azimuthDeg:309,elevationDeg:47,intensity:2.4,ambient:1.85,shadowSoftness:2,shadowOpacity:.28});
function number(value,min,max,fallback){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;}
function cross(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
function between(a,b,p){return Math.abs(cross(a,b,p))<1e-9&&p.x>=Math.min(a.x,b.x)-1e-9&&p.x<=Math.max(a.x,b.x)+1e-9&&p.y>=Math.min(a.y,b.y)-1e-9&&p.y<=Math.max(a.y,b.y)+1e-9;}
function intersects(a,b,c,d){const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);return (ab1*ab2<0&&cd1*cd2<0)||between(a,b,c)||between(a,b,d)||between(c,d,a)||between(c,d,b);}
export function foregroundMaskValidity(points){
  if(!Array.isArray(points)||points.length<3)return {valid:false,reason:'Add at least three points around the foreground object.'};
  if(points.length>128)return {valid:false,reason:'Use 128 points or fewer for one foreground shape.'};
  if(points.some(p=>!p||!Number.isFinite(Number(p.x))||!Number.isFinite(Number(p.y))||p.x<0||p.x>1||p.y<0||p.y>1))return {valid:false,reason:'Keep every point inside the source photo.'};
  let area=0;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    if(Math.hypot(a.x-b.x,a.y-b.y)<.0001)return {valid:false,reason:'Separate the outline points.'};
    area+=a.x*b.y-a.y*b.x;
    for(let j=i+1;j<points.length;j++){
      if(j===i+1||i===0&&j===points.length-1)continue;
      if(intersects(a,b,points[j],points[(j+1)%points.length]))return {valid:false,reason:'The foreground outline cannot cross itself.'};
    }
  }
  return Math.abs(area)<.000002?{valid:false,reason:'Trace a larger foreground outline.'}:{valid:true,reason:''};
}
export function normalizePhotoComposition(value){
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{},lighting=source.lighting||{},ids=new Set();
  const foregroundMasks=(Array.isArray(source.foregroundMasks)?source.foregroundMasks:[]).slice(0,24).map((mask,index)=>{
    if(!foregroundMaskValidity(mask?.points).valid)return null;
    let id=String(mask.id||'foreground-'+index).slice(0,80);if(ids.has(id))id+='-'+index;ids.add(id);
    return {id,label:String(mask.label||'Foreground '+(index+1)).trim().slice(0,80)||'Foreground '+(index+1),enabled:mask.enabled!==false,featherPx:number(mask.featherPx,0,12,1.5),points:mask.points.map(p=>({x:Number(p.x),y:Number(p.y)}))};
  }).filter(Boolean);
  return {version:PHOTO_COMPOSITION_VERSION,foregroundMasks,lighting:{
    azimuthDeg:number(lighting.azimuthDeg,0,360,DEFAULT_PHOTO_LIGHTING.azimuthDeg),elevationDeg:number(lighting.elevationDeg,10,85,DEFAULT_PHOTO_LIGHTING.elevationDeg),
    intensity:number(lighting.intensity,0,6,DEFAULT_PHOTO_LIGHTING.intensity),ambient:number(lighting.ambient,.1,3,DEFAULT_PHOTO_LIGHTING.ambient),
    shadowSoftness:number(lighting.shadowSoftness,0,6,DEFAULT_PHOTO_LIGHTING.shadowSoftness),shadowOpacity:number(lighting.shadowOpacity,0,.65,DEFAULT_PHOTO_LIGHTING.shadowOpacity)
  }};
}
export function pointInForegroundMask(point,points){
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[j],b=points[i];if(between(a,b,point))return true;
    if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
export function foregroundMaskAt(composition,point){
  if(!point||point.x<0||point.x>1||point.y<0||point.y>1)return null;
  return normalizePhotoComposition(composition).foregroundMasks.find(mask=>mask.enabled&&pointInForegroundMask(point,mask.points))||null;
}
export function photoLightingPosition(lighting,distance=66){
  const light=normalizePhotoComposition({lighting}).lighting,azimuth=light.azimuthDeg*Math.PI/180,elevation=light.elevationDeg*Math.PI/180,horizontal=distance*Math.cos(elevation);
  return {x:Math.sin(azimuth)*horizontal,y:Math.sin(elevation)*distance,z:-Math.cos(azimuth)*horizontal};
}
