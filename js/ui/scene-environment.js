import * as THREE from 'three';
import { createBoundaryTrees } from './scene-trees.js';
import { sceneSetting, environmentBounds } from './scene-setting.js';

// Self-contained scenery: no stock-photo downloads or large model dependencies.
// Repeated fence boards, leaves and roof details share geometry/materials.
function random(seed = 417) {
  return () => ((seed = Math.imul(seed, 1664525) + 1013904223 | 0) >>> 0) / 4294967296;
}
function texture(draw, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size, random());
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}
function lawnTexture() {
  return texture((ctx, size, rand) => {
    ctx.fillStyle = '#849766'; ctx.fillRect(0,0,size,size);
    for (let i=0;i<13000;i++) {
      const x=rand()*size,y=rand()*size;
      ctx.strokeStyle = rand()>.45 ? 'rgba(34,60,22,.22)' : 'rgba(209,221,153,.32)';
      ctx.lineWidth=.5+rand()*.7; ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(rand()-.5)*3,y-1-rand()*4);ctx.stroke();
    }
    ctx.fillStyle='rgba(232,234,184,.065)';ctx.fillRect(0,0,size/2,size);
  },512);
}
function pavingTexture() {
  return texture((ctx,size,rand)=>{
    ctx.fillStyle='#8d8c86';ctx.fillRect(0,0,size,size);
    for(let i=0;i<17000;i++){
      ctx.fillStyle=rand()>.45?'rgba(240,233,212,.22)':'rgba(38,40,36,.18)';
      const r=.25+rand()*1.2;ctx.fillRect(rand()*size,rand()*size,r,r);
    }
    // Expansion joints repeat every eight feet instead of forming giant tiles.
    ctx.strokeStyle='#666862';ctx.lineWidth=1.4;ctx.strokeRect(1,1,size-2,size-2);
    ctx.strokeStyle='rgba(232,232,220,.26)';ctx.lineWidth=1;ctx.strokeRect(3,3,size-6,size-6);
  },512);
}
function sidingTexture() {
  return texture((ctx,size)=>{
    ctx.fillStyle='#d5d0bc';ctx.fillRect(0,0,size,size);
    for(let y=0;y<size;y+=16){ctx.fillStyle='#b1ad9d';ctx.fillRect(0,y,size,2);ctx.fillStyle='#e9e5d6';ctx.fillRect(0,y+2,size,2);}
  });
}
function roofTexture() {
  return texture((ctx,size,rand)=>{
    ctx.fillStyle='#505756';ctx.fillRect(0,0,size,size);
    for(let y=0;y<size;y+=16)for(let x=-32;x<size;x+=32){ctx.fillStyle=['#555c59','#60635c','#4b5352'][Math.floor(rand()*3)];ctx.fillRect(x+(y%32?16:0),y,31,15);}
  });
}
function material(color, extra = {}) { return new THREE.MeshStandardMaterial({color,roughness:.9,...extra}); }
function block(group, w,h,d, mat, x,y,z) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);return mesh;
}
function instances(group, geometry, mat, transforms, {shadow = true} = {}) {
  const mesh=new THREE.InstancedMesh(geometry,mat,transforms.length), dummy=new THREE.Object3D();
  transforms.forEach((t,i)=>{
    dummy.position.set(t.x,t.y,t.z);dummy.rotation.set(t.rx||0,t.ry||0,t.rz||0);dummy.scale.set(t.sx||1,t.sy||1,t.sz||1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    if(t.color)mesh.setColorAt(i,new THREE.Color(t.color));
  });
  mesh.castShadow=shadow;mesh.receiveShadow=true;mesh.instanceMatrix.needsUpdate=true;group.add(mesh);return mesh;
}
function fence(group, bounds) {
  const wood=material('#b0a48a'),posts=[],boards=[],rails=[];
  const {side,back,front}=bounds;
  // Rear and side boundaries; the foreground remains open for the camera.
  for(let x=-side;x<=side;x+=.7)boards.push({x,y:2.5,z:-back});
  for(const x of [-side,side])for(let z=-back;z<front-22;z+=.7)boards.push({x,y:2.5,z,ry:Math.PI/2});
  for(let x=-side;x<=side;x+=7)posts.push({x,y:2.75,z:-back});
  for(const x of [-side,side])for(let z=-back;z<front-22;z+=7)posts.push({x,y:2.75,z});
  instances(group,new THREE.BoxGeometry(.62,5,.12),wood,boards);
  instances(group,new THREE.BoxGeometry(.26,5.5,.26),wood,posts);
  for(const y of [1.2,3.9]){
    block(group,side*2,.14,.17,wood,0,y,-back+.13);
    for(const x of [-side,side])block(group,.17,.14,back+front-22,wood,x-Math.sign(x)*.13,y,(front-22-back)/2);
  }
}
function trees(group,bounds) {
  group.add(createBoundaryTrees(bounds));
  const hedges=[];
  for(let x=-bounds.side+4;x<bounds.side-3;x+=2.8)hedges.push({x,y:1.25,z:-bounds.back+2.5,sx:1.8,sy:1.7,sz:1.5,color:x%3?'#567046':'#657d50'});
  instances(group,new THREE.IcosahedronGeometry(1,1),material('#65784b'),hedges);
}
function house(group,bounds,setting,nightMaterials) {
  const home=new THREE.Group();home.name='Background home';
  // Rear-left backdrop stays outside the complete stake/ballast envelope.
  home.position.set(setting==='driveway'?0:-bounds.side*.26,0,-bounds.back-16);
  const wallMap=sidingTexture();wallMap.repeat.set(3,2);
  const wall=material('#fff', {map:wallMap}),trim=material('#f3f0e5'),dark=material('#4b5b58'),glass=material('#6c8587',{metalness:.2,roughness:.3,emissive:'#ffce86',emissiveIntensity:0});
  nightMaterials.push(glass);
  block(home,38,11,20,wall,0,5.5,0);
  block(home,39,.4,21,trim,0,11,0);
  const roofMap=roofTexture();roofMap.repeat.set(5,3);
  const roofMat=material('#fff',{map:roofMap});
  // Gabled roof slopes meet exactly above the center ridge.
  const pitch=Math.atan2(5,11),roofSide=Math.hypot(11,5);
  for(const sign of [-1,1]){
    const roof=block(home,40,.22,roofSide,roofMat,0,13.5,sign*5.5);
    roof.rotation.x=sign*pitch;
  }
  const gableShape=new THREE.Shape();gableShape.moveTo(-10,0);gableShape.lineTo(10,0);gableShape.lineTo(0,5);gableShape.closePath();
  for(const x of [-19,19]){const gable=new THREE.Mesh(new THREE.ShapeGeometry(gableShape),new THREE.MeshStandardMaterial({color:'#d5d0bc',side:THREE.DoubleSide}));gable.rotation.y=Math.PI/2;gable.position.set(x,11,0);home.add(gable);}
  block(home,1.8,4.5,2.2,material('#8e6d57'),-11,15,0);
  for(const x of [-13,0,13]){
    block(home,4.4,5.1,.3,trim,x,6.4,10.12);
    block(home,3.9,4.6,.15,glass,x,6.4,10.31);
    block(home,.12,4.6,.15,trim,x,6.4,10.45);
    block(home,3.9,.12,.15,trim,x,6.4,10.45);
    for(const side of [-1,1])block(home,.85,4.9,.18,dark,x+side*2.7,6.4,10.19);
    block(home,4.8,.18,.6,trim,x,3.86,10.35);
  }
  if(setting==='driveway'){
    // Garage at the end of the paved drive.
    block(home,14,9,.35,trim,0,4.5,10.55);
    const garageMap=texture((ctx,s)=>{ctx.fillStyle='#dad9cd';ctx.fillRect(0,0,s,s);ctx.strokeStyle='#b4b7ac';ctx.lineWidth=2;for(let y=0;y<s;y+=s/5){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(s,y);ctx.stroke();}for(let x=0;x<s;x+=s/4){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,s);ctx.stroke();}});
    block(home,13.4,8.5,.15,material('#fff',{map:garageMap}),0,4.3,10.78);
    block(home,1,.13,.1,dark,0,3.2,10.9);
  }else{
    block(home,3.2,7,.35,dark,6.5,3.5,10.5);
    block(home,2.4,4,.15,glass,6.5,4.6,10.72);
    const deck=material('#ad9978');block(home,14,.65,7,deck,6.5,.35,14);
    for(let x=0;x<14;x+=.65)block(home,.04,.015,7,material('#8d7c61'),x-.5,.69,14);
    block(home,7,.28,1.5,deck,6.5,.14,18.25);
  }
  group.add(home);
}
function gardenDetails(group,bounds,setting) {
  const pots=material('#a77b62'),flowers=material('#ddd6b7'),green=material('#526c44'),stones=material('#d1c9b7');
  const back=-bounds.back+7;
  for(const x of [-bounds.side+6,bounds.side-6]){
    const pot=new THREE.Mesh(new THREE.CylinderGeometry(1,.68,1.5,12),pots);pot.position.set(x,.75,back);pot.castShadow=true;group.add(pot);
    const leaves=new THREE.Mesh(new THREE.IcosahedronGeometry(1.25,1),green);leaves.position.set(x,1.9,back);leaves.scale.y=.75;group.add(leaves);
    const blooms=[];for(let i=0;i<8;i++){const a=i*Math.PI/4;blooms.push({x:x+Math.cos(a)*.85,y:2.3,z:back+Math.sin(a)*.85});}
    instances(group,new THREE.IcosahedronGeometry(.19,0),flowers,blooms);
  }
  if(setting==='backyard'){
    const x=-bounds.side+8;
    for(let z=-bounds.back+7;z<bounds.front-22;z+=3)block(group,2,.035,1.8,stones,x,.01,z);
  }else{
    // Border pavers separate the drive from lawn without intruding into the tent.
    const pavers=[];for(const x of [-bounds.driveWidth/2-.5,bounds.driveWidth/2+.5])for(let z=-bounds.back-7;z<bounds.front;z+=1.5)pavers.push({x,y:.04,z});
    instances(group,new THREE.BoxGeometry(.85,.12,1.43),stones,pavers,{shadow:false});
  }
}

export function createPhotoEnvironment(tent) {
  const group=new THREE.Group();
  group.name='Venue photo shadow catcher';
  group.userData={setting:'photo',decorative:true,setNight:function(){}};
  const size=Math.max(180,Number(tent?.widthFt||0)+100,Number(tent?.lengthFt||0)+100);
  const shadow=new THREE.Mesh(
    new THREE.PlaneGeometry(size,size),
    new THREE.ShadowMaterial({color:0x0c1510,opacity:.16,depthWrite:false})
  );
  shadow.name='Venue photo shadow catcher';
  shadow.rotation.x=-Math.PI/2;
  shadow.position.y=-.025;
  shadow.receiveShadow=true;
  shadow.castShadow=false;
  group.add(shadow);
  return group;
}

export function createEnvironment(tent, surface) {
  const group=new THREE.Group(),setting=sceneSetting(tent,surface),bounds=environmentBounds(tent),nightMaterials=[];
  group.name=setting==='backyard'?'Backyard setting':'Paved driveway setting';
  group.userData={setting,decorative:true};
  const lawn=lawnTexture();lawn.repeat.set(bounds.ground/9,bounds.ground/9);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(bounds.ground,bounds.ground),material('#fff',{map:lawn}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.045;ground.receiveShadow=true;group.add(ground);
  if(setting==='driveway'){
    const length=bounds.front+bounds.back+7,map=pavingTexture();map.repeat.set(bounds.driveWidth/8,length/8);
    const drive=new THREE.Mesh(new THREE.PlaneGeometry(bounds.driveWidth,length),material('#fff',{map,roughness:.95}));
    drive.name='Paved tent surface';drive.rotation.x=-Math.PI/2;drive.position.set(0,-.02,(bounds.front-bounds.back-7)/2);drive.receiveShadow=true;group.add(drive);
  }
  fence(group,bounds);trees(group,bounds);house(group,bounds,setting,nightMaterials);gardenDetails(group,bounds,setting);
  group.userData.setNight = value => nightMaterials.forEach(m => {m.emissiveIntensity=value?.7:0;});
  return group;
}

export function disposeGroup(group) {
  const geometries=new Set(),materials=new Set(),textures=new Set();
  group.traverse(object=>{
    if(object.geometry)geometries.add(object.geometry);
    (Array.isArray(object.material)?object.material:[object.material]).filter(Boolean).forEach(mat=>{materials.add(mat);Object.values(mat).forEach(value=>{if(value?.isTexture)textures.add(value);});});
    if(object.isInstancedMesh)object.dispose();
  });
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());group.clear();
}
