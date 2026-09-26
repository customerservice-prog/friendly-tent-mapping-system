import * as THREE from 'three';
import { equipmentById } from '../data/equipment.js';
// Motion only affects visual children. The authoritative placement footprint stays fixed.
export function createEquipment(item,{mobile=false}={}){
 const p=equipmentById(item.equipmentId)||{type:item.visualType||'generic',name:item.name,widthFt:item.modelWidthFt||item.widthFt,depthFt:item.modelDepthFt||item.depthFt,heightFt:item.heightFt};
 const root=new THREE.Group();root.userData.itemId=item.id;root.userData.kind='equipment';root.name=p.name||'Rental equipment';root.rotation.y=-(Number(item.rotationDeg)||0)*Math.PI/180;
 const w=p.widthFt||2,d=p.depthFt||2,h=p.heightFt||2;
 const steel=new THREE.MeshStandardMaterial({color:0xabb7bc,metalness:.78,roughness:.29}),dark=new THREE.MeshStandardMaterial({color:0x243033,roughness:.65}),white=new THREE.MeshStandardMaterial({color:0xf0eee6,roughness:.7}),red=new THREE.MeshStandardMaterial({color:0x9a3030,roughness:.74}),glass=new THREE.MeshPhysicalMaterial({color:0xd3eeeb,transparent:true,opacity:.28,roughness:.15,depthWrite:false});
 function add(geometry,mat,x=0,y=0,z=0,host=root){const q=new THREE.Mesh(geometry,mat);q.position.set(x,y,z);q.castShadow=q.receiveShadow=true;host.add(q);return q;}
 const box=(a,b,c,m,x=0,y=0,z=0,host=root)=>add(new THREE.BoxGeometry(a,b,c),m,x,y,z,host);
 const cyl=(a,b,len,m,x=0,y=0,z=0,host=root)=>add(new THREE.CylinderGeometry(a,b,len,20),m,x,y,z,host);
 const legs=(height=h*.55)=>{for(const x of [-1,1])for(const z of [-1,1])cyl(.045,.045,height,steel,x*w*.4,height/2,z*d*.4);};
 let animate=null;
 if(p.type==='fan'||p.type==='foam-machine'){
  cyl(w*.4,w*.43,.12,dark,0,.06,0);cyl(.065,.065,h*.6,steel,0,h*.3,0);
  const face=new THREE.Group();face.position.y=h*.75;root.add(face);
  const body=cyl(w*.38,w*.38,d*.3,dark,0,0,0,face);body.rotation.x=Math.PI/2;
  const rim=add(new THREE.TorusGeometry(w*.39,.035,8,32),steel,0,0,d*.17,face);
  const rotor=new THREE.Group();rotor.position.z=d*.18;face.add(rotor);
  for(let i=0;i<5;i++){const blade=box(w*.13,w*.5,.025,steel,0,w*.18,0,rotor);const holder=new THREE.Group();holder.rotation.z=i*Math.PI*2/5;rotor.remove(blade);holder.add(blade);rotor.add(holder);}
  const hub=cyl(w*.07,w*.07,.1,dark,0,0,d*.23,face);hub.rotation.x=Math.PI/2;
  if(p.type==='fan'){for(let i=0;i<9;i++){const ring=add(new THREE.TorusGeometry(w*(.07+i*.036),.007,4,32),steel,0,0,d*.24,face);ring.castShadow=false;}animate=t=>{rotor.rotation.z=t*15;};}
  else{
   const count=mobile?48:100,geometry=new THREE.SphereGeometry(.085,6,4),mat=new THREE.MeshStandardMaterial({color:0xf8ffff,roughness:1,transparent:true,opacity:.75,depthWrite:false});
   const particles=new THREE.InstancedMesh(geometry,mat,count);particles.frustumCulled=false;particles.castShadow=false;root.add(particles);const dummy=new THREE.Object3D();
   animate=t=>{rotor.rotation.z=t*12;for(let i=0;i<count;i++){const age=(t*.45+i/count)%1,a=i*2.39996;dummy.position.set(Math.sin(a)*age*1.8,h*.72+Math.sin(age*Math.PI)*1.1-age*1.9,d*.25+age*5);dummy.scale.setScalar(.45+age*1.8);dummy.updateMatrix();particles.setMatrixAt(i,dummy.matrix);}particles.instanceMatrix.needsUpdate=true;};
  }
 }else if(p.type==='speaker'){
  cyl(.7,.7,.08,dark,0,.04,0);cyl(.045,.045,h*.48,steel,0,h*.24,0);box(w*.8,h*.52,d*.55,dark,0,h*.74,0);
  for(const [y,r] of [[h*.65,w*.28],[h*.89,w*.12]]){const driver=cyl(r,r,.04,steel,0,y,d*.28);driver.rotation.x=Math.PI/2;const cone=add(new THREE.SphereGeometry(r*.82,16,8),dark,0,y,d*.32);cone.scale.z=.15;}
 }else if(p.type==='podium'){
  box(w,.08,d,steel,0,.04,0);box(w*.7,h*.87,d*.65,white,0,h*.45,0);const top=box(w,.1,d, dark,0,h*.93,0);top.rotation.x=.12;cyl(.025,.025,.65,dark,w*.3,h+.18,-d*.2);add(new THREE.SphereGeometry(.055,8,6),dark,w*.3,h+.5,-d*.2);
 }else if(p.type==='stanchion'){
  cyl(w*.5,w*.5,.1,steel,0,.05,0);cyl(.055,.055,h-.2,steel,0,h/2,0);add(new THREE.SphereGeometry(.12,16,10),steel,0,h-.1,0);
 }else if(p.type==='red-carpet'){
  box(w,.025,d,red,0,.025,0);for(const x of [-1,1])box(.025,.029,d,new THREE.MeshStandardMaterial({color:0xc5a85c,roughness:.8}),x*(w/2-.03),.03,0);
 }else if(p.type==='cooler'||p.type==='fill-chill'){
  const y=p.type==='fill-chill'?h*.65:0;if(y)legs(y);box(w,h-y,d,white,0,y+(h-y)/2,0);box(w*.9,.04,d*.82,steel,0,h+.025,0);for(const x of [-1,1])box(.07,.12,d*.4,dark,x*(w/2+.02),h*.8,0);
 }else if(p.type==='trash-can'){
  cyl(w*.45,w*.35,h,dark,0,h/2,0);cyl(w*.48,w*.48,.1,steel,0,h,0);
 }else if(p.type==='chocolate-fountain'){
  cyl(w*.5,w*.5,h*.18,steel,0,h*.09,0);cyl(.07,.07,h*.7,steel,0,h*.5,0);const chocolate=new THREE.MeshStandardMaterial({color:0x4b2417,roughness:.26});
  const flow=[];for(let i=0;i<3;i++){const y=h*(.35+i*.22),r=w*(.4-i*.095);cyl(r,r,.07,steel,0,y,0);flow.push(cyl(r*.6,r,h*.19,chocolate,0,y-h*.09,0));}animate=t=>flow.forEach((q,i)=>{q.scale.x=q.scale.z=1+Math.sin(t*3+i)*.012;});
 }else if(['popcorn','snow-cone','cotton-candy'].includes(p.type)){
  box(w*.8,h*.27,d*.8,red,0,h*.135,0);
  if(p.type==='cotton-candy'){cyl(w*.5,w*.38,h*.25,steel,0,h*.4,0);cyl(w*.44,w*.44,.04,white,0,h*.53,0);}
  else{box(w*.85,h*.55,d*.85,glass,0,h*.57,0);box(w,h*.12,d,red,0,h*.91,0);for(const x of [-1,1])for(const z of [-1,1])box(.035,h*.58,.035,steel,x*w*.42,h*.57,z*d*.42);cyl(w*.24,w*.24,h*.18,steel,0,h*.55,0);}
 }else if(p.type==='generator'||p.type==='power-distribution'){
  box(w*.87,h*.8,d*.8,dark,0,h*.45,0);box(w*.76,h*.28,d*.78,red,0,h*.84,0);for(let i=0;i<7;i++)box(w*.55,.018,.025,steel,0,h*(.22+i*.06),d*.405);for(const x of [-1,1])for(const z of [-1,1])cyl(.035,.035,h,steel,x*w*.46,h/2,z*d*.45);
 }else if(p.type==='cornhole'){
  const board=box(w,.12,d,new THREE.MeshStandardMaterial({color:0xc7a576,roughness:.8}),0,h*.5,0);board.rotation.x=-.12;const hole=cyl(w*.15,w*.15,.015,dark,0,h*.76,-d*.3);box(w*.85,h*.65,.12,steel,0,h*.325,-d*.4);
 }else if(p.type==='connect-four'){
  const blue=new THREE.MeshStandardMaterial({color:0x2359a5,roughness:.65});box(w,h*.8,.18,blue,0,h*.55,0);for(let x=0;x<7;x++)for(let y=0;y<6;y++){const disc=cyl(w*.045,w*.045,.02,(x+y)%3?red:white,-w*.4+x*w*.133,h*.22+y*h*.13,.11);disc.rotation.x=Math.PI/2;}for(const x of [-1,1])box(.1,.12,d,dark,x*w*.46,.06,0);
 }else if(p.type==='tumbling-timbers'){
  const wood=new THREE.MeshStandardMaterial({color:0xcba474,roughness:.85});for(let i=0;i<15;i++)for(let j=0;j<3;j++){const q=box(w/3-.015,h/15-.01,d,wood,(j-1)*w/3,(i+.5)*h/15,0);if(i%2){q.position.x=0;q.position.z=(j-1)*d/3;q.rotation.y=Math.PI/2;}}
 }else if(p.type==='photobooth'){
  cyl(w*.4,w*.4,.12,steel,0,.06,0);box(w*.3,h*.64,d*.25,white,0,h*.36,0);box(w*.75,h*.3,d*.22,white,0,h*.83,0);box(w*.62,h*.23,.02,new THREE.MeshStandardMaterial({color:0x183934,emissive:0x183934,emissiveIntensity:.3}),0,h*.82,d*.12);
 }else if(p.type==='stage'){
  legs(h*.85);box(w,h*.15,d,dark,0,h*.925,0);for(const x of [-1,1])box(.035,.07,d,steel,x*w*.5,h,0);
 }else{box(w,h,d,white,0,h/2,0);const edges=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w,h,d)),new THREE.LineBasicMaterial({color:0x6e8677}));edges.position.y=h/2;root.add(edges);}
 root.traverse(q=>{if(q.isMesh)q.userData.itemId=item.id;});root.userData.update=animate;animate?.(0);return root;
}
