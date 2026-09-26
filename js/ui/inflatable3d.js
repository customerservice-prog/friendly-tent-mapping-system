import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { byId, inflatableZones } from '../data/inflatables.js';
const UP=new THREE.Vector3(0,1,0);
export function slidePoint(zone,lane,t){
 const u=Math.max(0,Math.min(1,t)),ease=(1-Math.cos(Math.PI*Math.min(1,u/.82)))/2;
 return {x:zone.x+(lane+.5)/zone.lanes*zone.width-zone.width/2,z:zone.z0+(zone.z1-zone.z0)*u,y:zone.y0+(zone.y1-zone.y0)*ease};
}
function vinyl(color,marble=false){
 let map=null;
 if(marble){const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,128,128);for(let i=0;i<20;i++){ctx.strokeStyle=i%2?'rgba(60,65,90,.20)':'rgba(130,145,155,.26)';ctx.lineWidth=1+i%3;ctx.beginPath();for(let y=0;y<=128;y+=4){const x=i*9+Math.sin(y*.06+i)*7+Math.sin(y*.025)*11;y?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}map=new THREE.CanvasTexture(c);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(2,3);map.colorSpace=THREE.SRGBColorSpace;}
 return new THREE.MeshPhysicalMaterial({color,map,roughness:.43,metalness:0,clearcoat:.28,clearcoatRoughness:.48});
}
function rounded(w,h,d,material,r=.28){return new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3)),material);}
function tube(points,r,mat){return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),Math.max(12,points.length*3),r,10,false),mat);}
function netMaterial(){
 const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d');ctx.strokeStyle='#394348';ctx.lineWidth=2;ctx.strokeRect(0,0,32,32);const texture=new THREE.CanvasTexture(c);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(28,18);
 return new THREE.MeshStandardMaterial({map:texture,transparent:true,alphaTest:.2,side:THREE.DoubleSide,roughness:.8});
}
export function createInflatable(item,definition=byId(item.inflatableId)){
 const root=new THREE.Group();root.name=definition?.name||'Inflatable';root.userData.kind='inflatable';root.userData.itemId=item.id;
 if(!definition)return root;
 const p=definition,w=p.widthFt,d=p.depthFt,h=p.heightFt,group=new THREE.Group();group.rotation.y=-(item.rotationDeg||0)*Math.PI/180;root.add(group);
 const mats=p.colors.map(color=>vinyl(color,!!p.marble)),dark=vinyl('#29323d'),white=vinyl('#fff7de'),water=new THREE.MeshPhysicalMaterial({color:'#49bed4',roughness:.15,transparent:true,opacity:.83,clearcoat:1});
 const add=(mesh,x,y,z)=>{mesh.position.set(x,y,z);group.add(mesh);return mesh;};
 const cushion=(x,y,z,cw,ch,cd,mat=mats[0],r=.3)=>add(rounded(cw,ch,cd,mat,r),x,y,z);
 const zones=inflatableZones(p);
 cushion(0,.5,0,w,1,d,mats[0],.45);
 // Parallel welded ribs give the inflated vinyl its volume at close range.
 for(let x=-w/2+1;x<w/2;x+=1.1)cushion(x,1.02,0,.95,.35,d-1,mats[0],.16);
 if(zones.bounce){
  const b=zones.bounce,front=b.z+b.d/2,back=b.z-b.d/2,top=p.combo?h*.66:h*.72;
  cushion(b.x,b.floor-.32,b.z,b.w,.65,b.d,mats[1],.35);
  for(let z=back+.65;z<front;z+=1)cushion(0,b.floor-.06,z,b.w-.4,.2,.82,mats[2],.09);
  const posts=[[-b.w/2,back],[b.w/2,back],[-b.w/2,front],[b.w/2,front]];
  posts.forEach(([x,z],i)=>{
   const color=p.style==='crayon'?mats[i%4]:p.style==='white'?mats[0]:mats[i%2?2:0];
   add(new THREE.Mesh(new THREE.CylinderGeometry(.62,.68,top,14),color),x,top/2+1,z);
   add(new THREE.Mesh(new THREE.ConeGeometry(.9,h-top-1,14),p.style==='white'?mats[0]:mats[(i+1)%4]),x,(h+top+1)/2,z);
   if(p.style==='crayon')for(const y of [top-.7,top-1.1])add(new THREE.Mesh(new THREE.CylinderGeometry(.66,.66,.13,14),dark),x,y,z);
  });
  const wallH=top-1;
  const meshMat=netMaterial();
  for(const [x,z,ww,dd] of [[0,back,b.w,.055],[-b.w/2,b.z,.055,b.d],[b.w/2,b.z,.055,b.d]]){
   cushion(x,1.9,z,ww===.055?.5:ww,1.2,dd===.055?.5:dd,mats[1]);
   if(p.style==='white'){for(let y=3;y<top;y+=1.5)cushion(x,y,z,ww===.055?.85:ww,1.45,dd===.055?.85:dd,mats[0],.4);}else{const mesh=new THREE.Mesh(new THREE.BoxGeometry(ww,wallH-1.6,dd),meshMat);add(mesh,x,3.2+(wallH-1.6)/2,z);}
   cushion(x,top+.4,z,ww===.055?.65:ww,.7,dd===.055?.65:dd,mats[1]);
  }
  if(p.style!=='white'){
   const roof=new THREE.Mesh(new THREE.CylinderGeometry(0,1,1,4),mats[1]);roof.scale.set(b.w*.74,1.9,b.d*.74);roof.rotation.y=Math.PI/4;add(roof,0,top+1,b.z);
   // Front opening and rounded entry tunnel stay clear for the jumping figures.
   cushion(0,top-.4,front,b.w-1,2,.6,mats[2]);
  }else cushion(0,top+.15,front,b.w,.85,.8,mats[0]);
  const entryZ=p.combo?b.z:d/2-.8,entryX=p.combo?-w/2+.8:0;
  cushion(entryX,.75,entryZ,p.combo?2.8:3.8,.6,3,mats[0]);
  if(!p.combo){const pts=[];for(let i=0;i<=16;i++){const a=i/16*Math.PI;pts.push([Math.cos(a)*1.8,1.2+Math.sin(a)*2.8,entryZ]);}group.add(tube(pts,.34,mats[2]));}
 }
 if(zones.slide){
  const s=zones.slide,n=32;
  for(let lane=0;lane<s.lanes;lane++){
   const laneW=s.width/s.lanes-.48,first=slidePoint(s,lane,0),shape=new THREE.Shape();shape.moveTo(-s.z0,1);
   for(let i=0;i<=n;i++){const pt=slidePoint(s,lane,i/n);shape.lineTo(-pt.z,pt.y);}
   shape.lineTo(-s.z1,1);shape.closePath();const geo=new THREE.ExtrudeGeometry(shape,{depth:laneW,bevelEnabled:false,steps:1});geo.rotateY(Math.PI/2);
   add(new THREE.Mesh(geo,mats[0]),first.x-laneW/2,0,0);
   const vertices=[],indices=[];
   for(let i=0;i<=n;i++){const pt=slidePoint(s,lane,i/n);vertices.push(pt.x-laneW/2,pt.y+.035,pt.z,pt.x+laneW/2,pt.y+.035,pt.z);if(i<n){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}}
   const surface=new THREE.BufferGeometry();surface.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));surface.setIndex(indices);surface.computeVertexNormals();group.add(new THREE.Mesh(surface,mats[2]));
   for(const side of [-1,1]){
    const pts=[];for(let i=0;i<=n;i++){const pt=slidePoint(s,lane,i/n);pts.push([pt.x+side*laneW/2,pt.y+.48,pt.z]);}group.add(tube(pts,.43,mats[1]));
   }
   const end=slidePoint(s,lane,1),poolZ=Math.min(d/2-1.8,s.z1+1.7),poolD=Math.max(2.4,d/2-s.z1-.2);
   cushion(end.x,.98,poolZ,laneW+.4,.65,poolD,mats[0]);cushion(end.x,1.34,poolZ,laneW-.5,.08,poolD-.65,water,.03);
   for(const side of [-1,1])cushion(end.x+side*laneW/2,1.6,poolZ,.48,.75,poolD,mats[1]);
   cushion(end.x,1.6,d/2-.6,laneW+.4,.75,.7,mats[1]);
  }
  // A separate center climbing strip, with visible footholds, never shares a lane.
  for(let i=0;i<15;i++){
   const pt=slidePoint({...s,x:0,width:0,lanes:1},0,i/15);
   cushion(0,pt.y+.12,pt.z,.38,.12,.38,dark,.04);
  }
  const pts=[[-s.width/2,s.y0+.4,s.z0],[-s.width/2,s.y0+2.5,s.z0],[0,h-.7,s.z0],[s.width/2,s.y0+2.5,s.z0],[s.width/2,s.y0+.4,s.z0]];group.add(tube(pts,.58,mats[1]));
  // Curved side seams and alternating vinyl sections follow the same slide path.
  for(const side of [-1,1])for(let i=1;i<8;i++){const pt=slidePoint(s,side<0?0:s.lanes-1,i/9);cushion(side*(s.width/2+.25),Math.max(1,pt.y*.48),pt.z,.20,Math.max(.4,pt.y-.8),.12,mats[3],.04);}
  if(p.palms){for(const x of [-s.width/2,s.width/2])for(const z of [s.z0,s.z1-.8]){
   const y=z===s.z0?s.y0+1:2;add(new THREE.Mesh(new THREE.CylinderGeometry(.2,.32,2.2,10),mats[3]),x,y+1,z);
   for(let i=0;i<6;i++){const a=i*Math.PI/3,leaf=new THREE.Mesh(new THREE.SphereGeometry(1,10,6),p.slug.startsWith('22ft')?mats[1]:vinyl('#269748'));leaf.scale.set(.3,.16,1.45);leaf.rotation.set(.23,a,0);add(leaf,x+Math.sin(a)*.85,y+2.05,z+Math.cos(a)*.85);}
  }}
 }
 if(p.style==='firetruck'){
  // Rear bounce enclosure and slide are one fire-engine combo, not a tent.
  for(const side of [-1,1])for(const z of [-d*.32,d*.28]){const q=new THREE.Mesh(new THREE.CylinderGeometry(1,1,.35,18),dark);q.rotation.z=Math.PI/2;add(q,side*(w/2-.08),1.2,z);const hub=new THREE.Mesh(new THREE.CylinderGeometry(.48,.48,.38,14),white);hub.rotation.z=Math.PI/2;add(hub,side*(w/2-.04),1.2,z);}
  for(const side of [-1,1]){group.add(tube([[side*(w/2-.1),3,-d*.18],[side*(w/2-.1),7,-d*.38]],.13,white));for(let i=0;i<7;i++)cushion(side*(w/2-.1),3+i*.55,-d*.18-i*.8,.15,.10,1.1,white);}
  cushion(0,2.7,d/2-1.4,w*.40,3,2,mats[0]);cushion(0,3.5,d/2-.35,w*.29,1.2,.12,dark);for(const x of [-w*.13,w*.13])cushion(x,1.9,d/2-.3,.8,.4,.13,white);
 }
 if(p.style==='pirate'){
  const z=-d*.28;add(new THREE.Mesh(new THREE.CylinderGeometry(.2,.27,h-1,12),mats[3]),w*.30,(h-1)/2,z);
  cushion(w*.15,h-2,z,w*.42,2.4,.10,dark,.04);cushion(w*.13,h-2,z+.07,.65,.6,.05,white,.04);
  for(const side of [-1,1]){const q=new THREE.Mesh(new THREE.TorusGeometry(.85,.2,8,20),mats[1]);add(q,side*w*.29,3.3,-d*.40);}
 }
 root.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;o.userData.itemId=item.id;}});root.userData.profile=p;root.userData.zones=zones;root.userData.update=time=>{const breathe=Math.sin(time*1.75+(item.id?.length||0))*.008,wobble=Math.sin(time*1.17+(item.x||0)*.1)*.004;group.scale.set(1+breathe*.35,1+breathe,1-breathe*.22);group.rotation.z=wobble;if(water)water.opacity=.80+Math.sin(time*2.2)*.035;};return root;
}

// Child-sized articulated figures. Activities are decorative and stay in the
// inflatable's local coordinate system, including after moving or rotating it.
export function childPose(zone,activity,index,time){
 if(activity==='slide'){
  const cycle=(time+index*2.35)%6.6,t=Math.min(1,cycle/4.8),p=slidePoint(zone,index%zone.lanes,t);
  return {...p,visible:cycle<5.6,jump:0,lean:-.22,seated:true};
 }
 const phase=time*3.5+index*2.3,jump=Math.max(0,Math.sin(phase))*.85;
 return {x:zone.x+(index%2?1:-1)*zone.w*.20,z:zone.z+(index%2?1:-1)*zone.d*.15,y:zone.floor,visible:true,jump,lean:Math.sin(phase)*.07,seated:false};
}
export function createInflatableActivity(space,objects,{mobile=false}={}){
 const root=new THREE.Group();root.name='Children playing · illustrative activity';root.userData.decorative=true;const animated=[];let time=0;
 const skins=['#e4b08a','#955f42','#c98d62'],shirts=['#f2c238','#ee735b','#3b9cc3'],hair=['#473329','#302d28','#805739'];
 const sphere=new THREE.SphereGeometry(1,12,8),limb=new THREE.CylinderGeometry(1,1,1,10),shoe=new RoundedBoxGeometry(.27,.17,.48,2,.06);
 objects.filter(o=>o.kind==='inflatable').slice(0,mobile?4:8).forEach((item,oi)=>{
  const p=byId(item.inflatableId);if(!p)return;const host=new THREE.Group();host.position.set(item.x+item.widthFt/2-space.widthFt/2,0,item.y+item.depthFt/2-space.lengthFt/2);host.rotation.y=-(item.rotationDeg||0)*Math.PI/180;root.add(host);
  const zones=inflatableZones(p),activities=[...(zones.bounce?['jump','jump']:[]),...(zones.slide?Array(zones.slide.lanes).fill('slide'):[])];
  activities.forEach((activity,i)=>{
   const kid=new THREE.Group(),skin=new THREE.MeshStandardMaterial({color:skins[(oi+i)%3],roughness:.85}),cloth=new THREE.MeshStandardMaterial({color:shirts[(oi+i)%3],roughness:.85}),hairMat=new THREE.MeshStandardMaterial({color:hair[(oi+i)%3]}),pants=new THREE.MeshStandardMaterial({color:'#345270'}),dark=new THREE.MeshStandardMaterial({color:'#25303b'});
   host.add(kid);const parts={};
   function ball(name,geometry,mat,x,y,z,sx,sy,sz){const q=new THREE.Mesh(geometry,mat);q.position.set(x,y,z);q.scale.set(sx,sy,sz);q.castShadow=true;q.receiveShadow=true;kid.add(q);parts[name]=q;return q;}
   ball('torso',sphere,cloth,0,1.88,0,.39,.60,.25);ball('head',sphere,skin,0,2.82,.01,.31,.37,.29);ball('hair',sphere,hairMat,0,3.00,-.04,.32,.24,.28);
   for(const side of [-1,1]){ball('eye'+side,sphere,dark,side*.105,2.86,.276,.021,.026,.018);ball('foot'+side,shoe,dark,side*.20,.13,.10,1,1,1);for(const name of ['thigh','shin','upperarm','forearm'])ball(name+side,limb,name==='forearm'?skin:name==='thigh'||name==='shin'?pants:cloth,0,0,0,1,1,1);ball('hand'+side,sphere,skin,0,0,0,.085,.11,.075);}
   function bone(name,a,b,r){const q=parts[name],va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),delta=vb.clone().sub(va);q.position.copy(va.add(vb).multiplyScalar(.5));q.scale.set(r,delta.length(),r);q.quaternion.setFromUnitVectors(UP,delta.normalize());}
   function draw(){
    const zone=activity==='slide'?zones.slide:zones.bounce,pose=childPose(zone,activity,i,time);kid.visible=pose.visible;kid.position.set(pose.x,pose.y+pose.jump,pose.z);kid.rotation.z=pose.lean;
    const seated=pose.seated,hip=seated?.68:1.35,head=hip+1.47,top=hip+.90;
    parts.torso.position.y=hip+.54;parts.head.position.y=head;parts.hair.position.y=head+.18;
    for(const side of [-1,1]){
     parts['eye'+side].position.y=head+.04;
     const knee=[side*.21,seated?.35:.73,seated?.62:0],ankle=[side*.21,seated?.18:.20,seated?1.12:.02];
     bone('thigh'+side,[side*.21,hip,0],knee,.15);bone('shin'+side,knee,ankle,.10);parts['foot'+side].position.set(side*.21,seated?.11:.11,seated?1.27:.16);
     const raise=seated?.12:pose.jump*.70,elbow=[side*.58,hip+.34+raise,.04],hand=[side*.65,hip+.10+raise*1.5,seated?.35:.18];
     bone('upperarm'+side,[side*.33,top,0],elbow,.13);bone('forearm'+side,elbow,hand,.085);parts['hand'+side].position.set(...hand);
    }
   }
   draw();animated.push(draw);
  });
 });
 root.userData.update=dt=>{time+=dt;animated.forEach(draw=>draw());};root.userData.activityCount=animated.length;return root;
}
