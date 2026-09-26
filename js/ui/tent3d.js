import * as THREE from 'three';
import { mergeParts } from './equipment3d.js';
import { structuralProfile, computePerimeterStations } from '../data/tentStructure.js';
import { canopyHeight, crownPoints } from '../core/tent-canopy.js';

const UP=new THREE.Vector3(0,1,0);
const box=(w,h,d,m)=>new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);
const cyl=(r,h,m,n=16)=>new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,n),m);
function tube(a,b,r,m,n=10){const d=new THREE.Vector3().subVectors(b,a),q=cyl(r,d.length(),m,n);q.position.copy(a).add(b).multiplyScalar(.5);q.quaternion.setFromUnitVectors(UP,d.clone().normalize());return q;}
function vinylWeave(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#808080';ctx.fillRect(0,0,128,128);
  // Coated fabric is nearly smooth. A fine bump, not dirty stripes painted into
  // albedo, catches grazing light without turning the roof into patterned plastic.
  for(let i=0;i<128;i+=4){ctx.fillStyle=i%8?'#838383':'#7d7d7d';ctx.fillRect(i,0,1,128);ctx.fillRect(0,i,128,1);}
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(12,12);return texture;
}
function fabricMaterial(bump){return new THREE.MeshPhysicalMaterial({color:0xfafaf8,roughness:.82,metalness:0,clearcoat:0,specularIntensity:.25,sheen:.08,sheenColor:0xffffff,sheenRoughness:1,envMapIntensity:.35,bumpMap:bump,bumpScale:.002,side:THREE.DoubleSide});}
function gridAxis(half,spacing,extras=[]){
  const count=Math.ceil(half*2/spacing),values=Array.from({length:count+1},(_,i)=>-half+2*half*i/count);
  for(const value of extras)if(Number.isFinite(value)&&value>-half&&value<half)values.push(value);
  return [...new Set(values.map(v=>Math.round(v*1e6)/1e6))].sort((a,b)=>a-b);
}
export function makeRoof(t,p,material){
  const crowns=crownPoints(t),xs=gridAxis(t.widthFt/2,.5,[0,...crowns.map(c=>c.x)]),zs=gridAxis(t.lengthFt/2,.75,[0,...crowns.map(c=>c.z)]),vertices=[],uv=[],indices=[];
  for(const z of zs)for(const x of xs){vertices.push(x,canopyHeight(t,p,x,z),z);uv.push((x+t.widthFt/2)/t.widthFt,(z+t.lengthFt/2)/t.lengthFt);}
  for(let row=0;row<zs.length-1;row++)for(let col=0;col<xs.length-1;col++){const a=row*xs.length+col,b=a+1,c=a+xs.length,d=c+1;indices.push(a,c,b,b,c,d);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Continuous tensioned vinyl canopy';mesh.castShadow=mesh.receiveShadow=true;mesh.userData.buildStage='roof';return mesh;
}
function makeValance(t,p,material){
  const group=new THREE.Group();group.name='Thin sewn valance';group.userData.buildStage='valance';
  const hw=t.widthFt/2,hl=t.lengthFt/2;
  for(const side of ['front','back','left','right']){
    const horizontal=side==='front'||side==='back',length=horizontal?t.widthFt:t.lengthFt,count=Math.max(24,Math.ceil(length*4)),v=[],uv=[],indices=[];
    for(let i=0;i<=count;i++){
      const f=i/count,along=(f-.5)*length,fold=.009*Math.sin(along*Math.PI*2),drop=p.valanceDropFt+.075*Math.sin(f*length/2.5*Math.PI)**2;
      const x=horizontal?along:(side==='left'?-hw:hw)+fold,z=horizontal?(side==='front'?-hl:hl)+fold:along;
      v.push(x,p.eaveHeightFt,z,x,p.eaveHeightFt-drop,z);uv.push(f,1,f,0);
      if(i<count){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.buildStage='valance';group.add(mesh);
  }
  mergeParts(group);
  return group;
}
function makeSidewalls(t,p,sidewalls){
  const group=new THREE.Group();group.name='Sidewalls';
  if(!Array.isArray(sidewalls)||!sidewalls.length)return group;
  const hw=t.widthFt/2,hl=t.lengthFt/2,h=Math.max(6,p.eaveHeightFt-.35),th=.06;
  const solid=new THREE.MeshPhysicalMaterial({color:0xfffdf8,roughness:.72,metalness:0,side:THREE.DoubleSide});
  const glass=new THREE.MeshPhysicalMaterial({color:0xbcd9e8,roughness:.2,metalness:0,transparent:true,opacity:.34,transmission:.2,side:THREE.DoubleSide});
  const frame=new THREE.MeshStandardMaterial({color:0xf7f4ec,roughness:.68});
  function addBox(w,hh,d,mat,x,y,z){const q=box(w,hh,d,mat);q.position.set(x,y,z);q.castShadow=true;q.receiveShadow=true;q.userData.kind='sidewall';q.userData.buildStage='sidewalls';group.add(q);return q;}
  sidewalls.forEach(function(seg){
    if(!seg||!['solid','window'].includes(seg.type))return;
    const len=Math.max(.1,Number(seg.lengthFt)||10),start=Number(seg.startFt)||0,windowWall=seg.type==='window';
    let x=0,z=0,w=th,d=th;
    if(seg.side==='front'||seg.side==='back'){x=-hw+start+len/2;z=seg.side==='front'?-hl:hl;w=len;d=th;}
    else if(seg.side==='left'||seg.side==='right'){x=seg.side==='left'?-hw:hw;z=-hl+start+len/2;w=th;d=len;}
    else return;
    if(!windowWall){addBox(w,h,d,solid,x,h/2,z);return;}
    addBox(w,h,d,glass,x,h/2,z);
    const horizontal=seg.side==='front'||seg.side==='back';
    if(horizontal){
      addBox(len,.16,.11,frame,x,.14,z);addBox(len,.16,.11,frame,x,h-.14,z);
      for(const offset of [-len/2,0,len/2])addBox(.13,h,.11,frame,x+offset,h/2,z);
    }else{
      addBox(.11,.16,len,frame,x,.14,z);addBox(.11,.16,len,frame,x,h-.14,z);
      for(const offset of [-len/2,0,len/2])addBox(.11,h,.13,frame,x,h/2,z+offset);
    }
  });
  return group;
}

export function makeTent(t,anchor,sidewalls=[]){
  const p=structuralProfile(t.type,t.widthFt,t.lengthFt),group=new THREE.Group(),hw=t.widthFt/2,hl=t.lengthFt/2;
  group.name='Event tent';group.userData.kind='tent';
  const fabric=fabricMaterial(vinylWeave());group.add(makeRoof(t,p,fabric));
  const frame=new THREE.Group();frame.name='Tent structural poles and rafters';frame.userData.buildStage='frame';group.add(frame);
  const steel=new THREE.MeshStandardMaterial({color:0xc7cbd0,roughness:.36,metalness:.72}),black=new THREE.MeshStandardMaterial({color:0x383a3b,roughness:.75}),strap=new THREE.MeshStandardMaterial({color:0xe8e7e0,roughness:.95});
  const stations=computePerimeterStations(t.widthFt,t.lengthFt).map(s=>[s.x-hw,s.y-hl]);
  const structural=mesh=>{mesh.castShadow=true;mesh.userData.buildStage='frame';frame.add(mesh);return mesh;};
  for(const [x,z] of stations){
    const pole=structural(cyl(p.sidePoleDiameterFt/2,p.eaveHeightFt,steel));pole.position.set(x,p.eaveHeightFt/2,z);
    const foot=structural(cyl(.14,.035,black));foot.position.set(x,.018,z);
    const collar=structural(cyl(p.sidePoleDiameterFt*.7,.13,steel));collar.position.set(x,p.eaveHeightFt-.14,z);
  }
  if(t.type==='pole')for(const point of crownPoints(t)){
    const pole=structural(cyl(p.centerPoleDiameterFt/2,p.peakHeightFt+.08,steel,20));pole.position.set(point.x,(p.peakHeightFt+.08)/2,point.z);
    const cap=structural(cyl(.1,.09,steel));cap.position.set(point.x,p.peakHeightFt+.08,point.z);
  }
  group.add(makeValance(t,p,fabric));group.add(makeSidewalls(t,p,sidewalls));
  // Low-profile weld/sew lines track the actual roof surface. Their scale is
  // deliberately smaller than the structural tubing, unlike the old raised ribs.
  const seams=new THREE.Group();seams.name='Canopy panel seams';seams.userData.buildStage='roof';
  const seamMat=new THREE.MeshStandardMaterial({color:0xeeeef0,roughness:.9,envMapIntensity:.3});
  function seam(a,b){
    const steps=Math.max(16,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)*2)),points=[];
    for(let i=0;i<=steps;i++){const f=i/steps,x=a.x+(b.x-a.x)*f,z=a.z+(b.z-a.z)*f;points.push(new THREE.Vector3(x,canopyHeight(t,p,x,z)+.009,z));}
    const mesh=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),steps,.008,4,false),seamMat);mesh.userData.buildStage='roof';seams.add(mesh);
  }
  if(t.type==='pole'){
    const crowns=crownPoints(t);
    for(const [x,z] of stations){const nearest=crowns.reduce((best,c)=>!best||Math.hypot(x-c.x,z-c.z)<Math.hypot(x-best.x,z-best.z)?c:best,null);if(nearest)seam(nearest,{x,z});}
    for(let i=1;i<crowns.length;i++)seam(crowns[i-1],crowns[i]);
  }else{
    const hip=Math.min(hw,hl),start=-hl+hip,end=hl-hip;
    const rafters=new Set([start,end,0]);for(let z=start;z<=end;z+=10)rafters.add(z);
    const beam=(a,b,r=.06)=>{if(a.distanceTo(b)>.03)structural(tube(a,b,r,steel));};
    for(const z of [...rafters].sort((a,b)=>a-b))if(z>=start&&z<=end){
      const top=new THREE.Vector3(0,canopyHeight(t,p,0,z)-.08,z);
      for(const side of [-1,1]){beam(new THREE.Vector3(side*hw,p.eaveHeightFt-.08,z),top);seam({x:side*hw,z},{x:0,z});}
    }
    if(end>start)beam(new THREE.Vector3(0,p.peakHeightFt-.08,start),new THREE.Vector3(0,p.peakHeightFt-.08,end));
    for(const endSign of [-1,1])for(const side of [-1,1]){
      const ridge={x:0,z:endSign<0?start:end},corner={x:side*hw,z:endSign*hl};
      beam(new THREE.Vector3(corner.x,p.eaveHeightFt-.08,corner.z),new THREE.Vector3(0,p.peakHeightFt-.08,ridge.z));seam(ridge,corner);
    }
    for(const z of [-hl,hl])beam(new THREE.Vector3(-hw,p.eaveHeightFt-.08,z),new THREE.Vector3(hw,p.eaveHeightFt-.08,z));
    for(const x of [-hw,hw])beam(new THREE.Vector3(x,p.eaveHeightFt-.08,-hl),new THREE.Vector3(x,p.eaveHeightFt-.08,hl));
  }
  mergeParts(seams);group.add(seams);mergeParts(frame);
  if(anchor==='ballast'){
    const material=new THREE.MeshStandardMaterial({color:0xd4d0c7,roughness:.95});
    for(const [x,z] of stations){const bx=x+Math.sign(x)*.85,bz=z+Math.sign(z)*.85,weight=box(1.1,1.5,1.1,material);weight.name='Concrete ballast block';weight.userData.kind='concrete-ballast';weight.position.set(bx,.75,bz);weight.castShadow=weight.receiveShadow=true;group.add(weight);group.add(tube(new THREE.Vector3(x,p.eaveHeightFt-.1,z),new THREE.Vector3(bx,1.45,bz),.018,strap,8));}
  }
  if(anchor==='stake'){
    const anchorsGroup=new THREE.Group();anchorsGroup.name='Stakes and tension straps';anchorsGroup.userData.buildStage='stakes';group.add(anchorsGroup);
    const clearance=t.installationClearanceFt||p.stakeClearanceFt;
    for(const [x,z] of stations){
      const edgeX=Math.abs(x)>hw-.1,edgeZ=Math.abs(z)>hl-.1;
      const anchors=edgeX&&edgeZ?[[x+Math.sign(x)*clearance,z],[x,z+Math.sign(z)*clearance]]:[[x+(edgeX?Math.sign(x)*clearance:0),z+(edgeZ?Math.sign(z)*clearance:0)]];
      for(const [ox,oz] of anchors){
        const a=new THREE.Vector3(x,p.eaveHeightFt-.08,z),b=new THREE.Vector3(ox,.12,oz),tie=tube(a,b,.017,strap,8);tie.castShadow=true;tie.userData.buildStage='stakes';anchorsGroup.add(tie);
        const stake=cyl(.025,.7,black,8);stake.position.set(ox,.08,oz);stake.rotation.z=.18;stake.userData.buildStage='stakes';anchorsGroup.add(stake);
        const ratchet=box(.18,.1,.075,steel);ratchet.position.copy(a.clone().lerp(b,.58));ratchet.lookAt(b);ratchet.userData.buildStage='stakes';anchorsGroup.add(ratchet);
      }
    }
    mergeParts(anchorsGroup);
  }
  return group;
}
