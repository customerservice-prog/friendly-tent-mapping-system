// Visual tensile profiles in feet. The tent footprint, crown positions and
// structural heights come from the product/structural data, not the camera.
// These surfaces are illustrative geometry, not manufacturer engineering.
import { computeCenterPoles } from '../data/tentStructure.js';
const clamp=v=>Math.max(0,Math.min(1,v));

export function crownPoints(tent){
  const width=tent.widthFt,length=tent.lengthFt;
  const poles=tent.centerPoles?.length?tent.centerPoles:computeCenterPoles(tent.type,width,length);
  return poles.map(p=>({x:Number(p.x??width/2)-width/2,z:Number(p.y??length/2)-length/2}));
}

export function canopyHeight(tent,profile,x,z){
  const hw=tent.widthFt/2,hl=tent.lengthFt/2,eave=profile.eaveHeightFt,rise=profile.peakHeightFt-eave;
  if(Math.abs(x)>=hw||Math.abs(z)>=hl)return eave;
  if(tent.type!=='pole'){
    // Classic frame/canopy hip roofs taper to the end eaves. The old full-length
    // gable ridge created a vertical triangular wall where there was no frame.
    const cross=clamp(1-Math.abs(x)/hw),end=clamp((hl-Math.abs(z))/Math.min(hw,hl));
    const panel=Math.min(cross,end);
    return eave+rise*(panel-.025*Math.sin(Math.PI*panel));
  }
  const crowns=crownPoints(tent).sort((a,b)=>a.z-b.z);
  if(!crowns.length)return eave;
  // Continuous ridge supported by each center pole; unsupported spans droop
  // gently between crowns, while both ends meet the perimeter at eave height.
  const first=crowns[0],last=crowns[crowns.length-1];
  let ridge=1,crownX=first.x;
  if(z<first.z){ridge=Math.pow(clamp((z+hl)/(first.z+hl)),1.28);}
  else if(z>last.z){ridge=Math.pow(clamp((hl-z)/(hl-last.z)),1.28);crownX=last.x;}
  else for(let i=1;i<crowns.length;i++){
    if(z>crowns[i].z)continue;
    const a=crowns[i-1],b=crowns[i],span=b.z-a.z,f=span>0?(z-a.z)/span:0;
    ridge=1-.15*Math.sin(Math.PI*f);crownX=a.x+(b.x-a.x)*f;break;
  }
  // Rectangular ruled panels reach ALL four sides; no inscribed ellipse and
  // no flat shelf at the corners. Small catenary curvature reads as tensioned
  // fabric while every crown retains its actual configured height.
  const sideWidth=x<crownX?hw+crownX:hw-crownX;
  const cross=Math.pow(clamp(1-Math.abs(x-crownX)/Math.max(.01,sideWidth)),1.16);
  return eave+rise*ridge*cross;
}
