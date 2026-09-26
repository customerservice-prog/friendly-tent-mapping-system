import { createHeroEquipment } from './hero-equipment3d.js';
import { attachEquipmentOperation } from './equipment-operation.js';
import { equipmentAssetDescriptor } from '../data/asset-registry.js';
import * as THREE from 'three';
import { equipmentById } from '../data/equipment.js';
// Motion only affects visual children. The authoritative placement footprint stays fixed.
export function createEquipment(item,{mobile=false}={}){
 const p=equipmentById(item.equipmentId)||{...item,externalId:item.externalId||item.asset?.source?.externalId,type:item.visualType||'generic',name:item.name,widthFt:item.modelWidthFt||item.widthFt,depthFt:item.modelDepthFt||item.depthFt,heightFt:item.heightFt};
 const hero=createHeroEquipment(p,item,{mobile});if(hero){hero.userData.itemId=item.id;hero.userData.kind='equipment';hero.rotation.y=-(Number(item.rotationDeg)||0)*Math.PI/180;return hero;}
 const root=new THREE.Group();root.userData.itemId=item.id;root.userData.kind='equipment';root.name=p.name||'Rental equipment';root.rotation.y=-(Number(item.rotationDeg)||0)*Math.PI/180;
 const w=p.widthFt||2,d=p.depthFt||2,h=p.heightFt||2;
 const steel=new THREE.MeshStandardMaterial({color:0xabb7bc,metalness:.78,roughness:.29}),dark=new THREE.MeshStandardMaterial({color:0x243033,roughness:.65}),white=new THREE.MeshStandardMaterial({color:0xf0eee6,roughness:.7}),red=new THREE.MeshStandardMaterial({color:0x9a3030,roughness:.74}),glass=new THREE.MeshPhysicalMaterial({color:0xd3eeeb,transparent:true,opacity:.28,roughness:.15,depthWrite:false});
 function add(geometry,mat,x=0,y=0,z=0,host=root){const q=new THREE.Mesh(geometry,mat);q.position.set(x,y,z);q.castShadow=q.receiveShadow=true;host.add(q);return q;}
 const box=(a,b,c,m,x=0,y=0,z=0,host=root)=>add(new THREE.BoxGeometry(a,b,c),m,x,y,z,host);
 const cyl=(a,b,len,m,x=0,y=0,z=0,host=root)=>add(new THREE.CylinderGeometry(a,b,len,20),m,x,y,z,host);
 const legs=(height=h*.55)=>{for(const x of [-1,1])for(const z of [-1,1])cyl(.045,.045,height,steel,x*w*.4,height/2,z*d*.4);};
 let animate=null;const effects=[];
 if(['bubble-machine','fog-machine','confetti-machine'].includes(p.type)){
  box(w*.82,h*.55,d*.72,dark,0,h*.3,0);for(const x of [-1,1])cyl(.12,.12,.08,steel,x*w*.32,.08,d*.28);
  const count=mobile?36:72,geometry=p.type==='confetti-machine'?new THREE.BoxGeometry(.05,.09,.02):new THREE.SphereGeometry(.06,6,4);
  const material=new THREE.MeshStandardMaterial({color:p.type==='fog-machine'?0xdde5e8:0xf8ffff,roughness:1,transparent:true,opacity:p.type==='fog-machine'?.25:.78,depthWrite:false});
  const particles=new THREE.InstancedMesh(geometry,material,count);particles.frustumCulled=false;particles.castShadow=false;particles.userData.effect=true;root.add(particles);effects.push(particles);const dummy=new THREE.Object3D();
  animate=t=>{for(let i=0;i<count;i++){const age=(t*.22+i/count)%1,a=i*2.39996;const lateral=Math.sin(a)*age*(p.type==='fog-machine'?2.4:1.6),rise=p.type==='bubble-machine'?age*3.4:Math.sin(age*Math.PI)*1.1+age*.8;dummy.position.set(lateral,h*.45+rise,d*.3+age*4.5);dummy.rotation.set(age*5,a,age*3);dummy.scale.setScalar(.35+age*(p.type==='fog-machine'?2.2:1.1));dummy.updateMatrix();particles.setMatrixAt(i,dummy.matrix);}particles.instanceMatrix.needsUpdate=true;};
 }else if(p.type==='speaker'){
  cyl(.7,.7,.08,dark,0,.04,0);cyl(.045,.045,h*.48,steel,0,h*.24,0);box(w*.8,h*.52,d*.55,dark,0,h*.74,0);
  const cones=[];for(const [y,r] of [[h*.65,w*.28],[h*.89,w*.12]]){const driver=cyl(r,r,.04,steel,0,y,d*.28);driver.rotation.x=Math.PI/2;const cone=add(new THREE.SphereGeometry(r*.82,16,8),dark,0,y,d*.32);cone.scale.z=.15;cones.push(cone);}
  animate=t=>{const pulse=1+Math.max(0,Math.sin(t*8))*.035;cones.forEach(cone=>cone.scale.set(pulse,pulse,.15));};
 }else if(p.type==='karaoke'){
  box(w*.72,h*.48,d*.55,dark,0,h*.26,0);const screen=box(w*.58,h*.28,.05,new THREE.MeshStandardMaterial({color:0x183934,emissive:0x1b8bc9,emissiveIntensity:.15}),0,h*.72,-d*.3);const mic=cyl(.05,.05,h*.28,steel,w*.26,h*.88,-d*.2);mic.rotation.z=-.25;
  animate=t=>{screen.material.emissiveIntensity=.12+Math.max(0,Math.sin(t*2.4))*.22;};
 }else if(p.type==='screen'){
  const frameMat=steel;box(w,h*.82,.12,frameMat,0,h*.48,0);const panel=box(w*.92,h*.72,.035,new THREE.MeshStandardMaterial({color:0xe7eef6,emissive:0x5f91c7,emissiveIntensity:.08}),0,h*.48,-.08);cyl(.06,.06,h*.18,steel,0,h*.09,0);
  animate=t=>{panel.material.emissiveIntensity=.07+Math.max(0,Math.sin(t*.9))*.08;};
 }else if(p.type==='heater'){
  cyl(w*.22,w*.28,.12,dark,0,.06,0);cyl(.06,.06,h*.68,steel,0,h*.34,0);const hood=cyl(w*.42,w*.22,.18,steel,0,h*.82,0);const glow=add(new THREE.SphereGeometry(w*.10,12,8),new THREE.MeshStandardMaterial({color:0xffa135,emissive:0xff6f00,emissiveIntensity:.8}),0,h*.75,0);
  animate=t=>{glow.material.emissiveIntensity=.55+Math.max(0,Math.sin(t*6))*.65;glow.scale.setScalar(.9+Math.sin(t*8)*.05);};
 }else if(p.type==='red-carpet'){
  box(w,.025,d,red,0,.025,0);for(const x of [-1,1])box(.025,.029,d,new THREE.MeshStandardMaterial({color:0xc5a85c,roughness:.8}),x*(w/2-.03),.03,0);
 }else if(p.type==='trash-can'){
  cyl(w*.45,w*.35,h,dark,0,h/2,0);const lid=cyl(w*.48,w*.48,.1,steel,0,h,0);
 }else if(p.type==='chocolate-fountain'){
  cyl(w*.5,w*.5,h*.18,steel,0,h*.09,0);cyl(.07,.07,h*.7,steel,0,h*.5,0);const chocolate=new THREE.MeshStandardMaterial({color:0x4b2417,roughness:.26});
  const flow=[];for(let i=0;i<3;i++){const y=h*(.35+i*.22),r=w*(.4-i*.095);cyl(r,r,.07,steel,0,y,0);flow.push(cyl(r*.6,r,h*.19,chocolate,0,y-h*.09,0));}animate=t=>flow.forEach((q,i)=>{q.scale.x=q.scale.z=1+Math.sin(t*3+i)*.012;});
 }else if(p.type==='generator'||p.type==='power-distribution'){
  const housing=box(w*.87,h*.8,d*.8,dark,0,h*.45,0);box(w*.76,h*.28,d*.78,red,0,h*.84,0);for(let i=0;i<7;i++)box(w*.55,.018,.025,steel,0,h*(.22+i*.06),d*.405);for(const x of [-1,1])for(const z of [-1,1])cyl(.035,.035,h,steel,x*w*.46,h/2,z*d*.45);
  if(p.type==='generator')animate=t=>{housing.position.y=h*.45+Math.sin(t*18)*.002;};
 }else if(p.type==='cornhole'){
  const board=box(w,.12,d,new THREE.MeshStandardMaterial({color:0xc7a576,roughness:.8}),0,h*.5,0);board.rotation.x=-.12;const hole=cyl(w*.15,w*.15,.015,dark,0,h*.76,-d*.3);box(w*.85,h*.65,.12,steel,0,h*.325,-d*.4);const bag=box(w*.16,.05,w*.16,red,0,h*.7,-d*.4);

 }else if(p.type==='connect-four'){
  const blue=new THREE.MeshStandardMaterial({color:0x2359a5,roughness:.65});box(w,h*.8,.18,blue,0,h*.55,0);let active=null;for(let x=0;x<7;x++)for(let y=0;y<6;y++){const disc=cyl(w*.045,w*.045,.02,(x+y)%3?red:white,-w*.4+x*w*.133,h*.22+y*h*.13,.11);disc.rotation.x=Math.PI/2;if(x===6&&y===5)active=disc;}for(const x of [-1,1])box(.1,.12,d,dark,x*w*.46,.06,0);

 }else if(p.type==='tumbling-timbers'){
  const wood=new THREE.MeshStandardMaterial({color:0xcba474,roughness:.85}),top=[];for(let i=0;i<15;i++)for(let j=0;j<3;j++){const q=box(w/3-.015,h/15-.01,d,wood,(j-1)*w/3,(i+.5)*h/15,0);if(i%2){q.position.x=0;q.position.z=(j-1)*d/3;q.rotation.y=Math.PI/2;}if(i>=13)top.push(q);}
 }else if(p.type==='photobooth'){
  cyl(w*.4,w*.4,.12,steel,0,.06,0);box(w*.3,h*.64,d*.25,white,0,h*.36,0);box(w*.75,h*.3,d*.22,white,0,h*.83,0);const screen=box(w*.62,h*.23,.02,new THREE.MeshStandardMaterial({color:0x183934,emissive:0x183934,emissiveIntensity:.3}),0,h*.82,d*.12);const flash=add(new THREE.SphereGeometry(.05,8,6),new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:.5}),w*.22,h*.96,d*.13);
  animate=t=>{flash.material.emissiveIntensity=.18;screen.material.emissiveIntensity=.24+Math.sin(t*.7)*.015;};
 }else if(p.type==='stage'){
  legs(h*.85);box(w,h*.15,d,dark,0,h*.925,0);for(const x of [-1,1])box(.035,.07,d,steel,x*w*.5,h,0);
 }else{box(w,h,d,white,0,h/2,0);const edges=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w,h,d)),new THREE.LineBasicMaterial({color:0x6e8677}));edges.position.y=h/2;root.add(edges);}
 root.traverse(q=>{if(q.isMesh)q.userData.itemId=item.id;});root.userData.asset=equipmentAssetDescriptor(p,p.type);attachEquipmentOperation(root,p.type,item,animate,{effects});return root;
}
