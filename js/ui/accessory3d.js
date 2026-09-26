import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const mat=(color,rough=.7,metal=.05)=>new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal});
const box=(w,h,d,color,rough=.7,metal=.05)=>{
  const m=new THREE.Mesh(new RoundedBoxGeometry(Math.max(.04,w),Math.max(.04,h),Math.max(.04,d),3,.05),mat(color,rough,metal));
  m.castShadow=m.receiveShadow=true;return m;
};
const cyl=(r,h,color,segments=24)=>{
  const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,segments),mat(color,.66,.08));m.castShadow=m.receiveShadow=true;return m;
};
const sphere=(r,color)=>{
  const m=new THREE.Mesh(new THREE.SphereGeometry(r,16,12),mat(color,.55,.03));m.castShadow=m.receiveShadow=true;return m;
};
function label(group,text,w=2.2,h=.6,y=1.4,z=.02){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#f8faf7';ctx.fillRect(0,0,512,128);
  ctx.fillStyle='#203529';ctx.font='800 44px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(text||'Rental').slice(0,22),256,64);
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));
  mesh.position.set(0,y,z);group.add(mesh);return mesh;
}
function wheels(group,w,d,y=.22){
  for(const x of [-w*.36,w*.36])for(const z of [-d*.37,d*.37]){
    const wh=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,.12,16),mat(0x222826,.8,.15));
    wh.rotation.z=Math.PI/2;wh.position.set(x,y,z);wh.castShadow=true;group.add(wh);
  }
}
function foamParticles(group){
  const particles=[];
  for(let i=0;i<22;i++){
    const r=.08+(i%4)*.025,s=sphere(r,i%3===0?0xdff8ff:0xffffff);s.castShadow=false;
    s.userData={seed:i*.73};
    group.add(s);particles.push(s);
  }
  return particles;
}
function createFoam(item){
  const g=new THREE.Group();g.name='Animated foam machine';
  const base=box(2.1,1.2,1.8,0x343a3f,.48,.35);base.position.y=.75;g.add(base);wheels(g,2.1,1.8);
  const barrel=cyl(.48,1.2,0x0d86c7);barrel.rotation.z=Math.PI/2;barrel.position.set(.45,1.55,0);g.add(barrel);
  const nozzle=new THREE.Mesh(new THREE.CylinderGeometry(.24,.38,.75,20),mat(0xd6dde1,.36,.55));nozzle.rotation.z=-Math.PI/2;nozzle.position.set(1.05,1.55,0);g.add(nozzle);
  label(g,item.name,1.65,.4,.75,-.91);
  const particles=foamParticles(g);
  g.userData.update=t=>{
    particles.forEach((p,i)=>{
      const s=p.userData.seed,u=(t*.22+s)%1;
      p.position.set(1.3+u*5.2,1.6+Math.sin((u+s)*12)*.45+u*.8,Math.sin((u*8+s)*2.4)*(1.25*u+.08));
      p.scale.setScalar(.4+u*.9);p.material.opacity=1-u*.7;p.material.transparent=true;
    });
    barrel.rotation.x=t*2.4;
  };return g;
}
function createFan(item){
  const g=new THREE.Group();g.name='Animated rental fan';
  const base=box(1.6,.18,1.25,0x44484c,.8,.25);base.position.y=.12;g.add(base);
  const pole=cyl(.12,3.3,0x777f83);pole.position.y=1.75;g.add(pole);
  const cage=new THREE.Mesh(new THREE.TorusGeometry(.82,.055,8,40),mat(0x697176,.45,.55));cage.position.y=3.15;cage.rotation.x=Math.PI/2;g.add(cage);
  const rotor=new THREE.Group();rotor.position.y=3.15;g.add(rotor);
  for(let i=0;i<4;i++){
    const blade=box(.62,.05,.22,0x26323a,.55,.18);blade.position.x=.37;blade.rotation.y=i*Math.PI/2;blade.rotateOnAxis(new THREE.Vector3(0,1,0),0);rotor.add(blade);
  }
  const hub=sphere(.16,0x1e2529);hub.position.y=3.15;g.add(hub);
  g.userData.update=t=>{rotor.rotation.y=t*9;};return g;
}
function createSpeaker(item){
  const g=new THREE.Group();g.name='Animated speaker';
  const cabinet=box(1.7,3.3,1.35,0x171a1c,.88,.05);cabinet.position.y=1.75;g.add(cabinet);
  const cone1=cyl(.48,.10,0x303539,28);cone1.rotation.x=Math.PI/2;cone1.position.set(0,2.15,-.71);g.add(cone1);
  const cone2=cyl(.32,.10,0x313639,24);cone2.rotation.x=Math.PI/2;cone2.position.set(0,1.25,-.71);g.add(cone2);
  label(g,item.name,1.45,.32,3.1,-.695);
  g.userData.update=t=>{const k=1+Math.max(0,Math.sin(t*8))*.045;cone1.scale.set(k,1,k);cone2.scale.set(k,1,k);};return g;
}
function createGenerator(item){
  const g=new THREE.Group();g.name='Animated generator';
  const frame=box(2.7,1.65,1.8,0xd65b28,.55,.28);frame.position.y=.95;g.add(frame);wheels(g,2.7,1.8);
  const top=box(2.1,.25,1.25,0x2c3133,.65,.35);top.position.y=1.85;g.add(top);
  const exhaust=cyl(.12,.8,0x555d60);exhaust.position.set(.9,2.2,.45);g.add(exhaust);
  label(g,item.name,1.85,.32,.95,-.91);
  g.userData.update=t=>{g.position.y=Math.sin(t*20)*.006;exhaust.rotation.y=t*.3;};return g;
}
function createCooler(item){
  const g=new THREE.Group();g.name='Cooler';
  const body=box(2.8,1.55,1.65,0xf5f7f3,.72,.03);body.position.y=.85;g.add(body);
  const lid=box(2.9,.22,1.75,0xd6dcdb,.63,.03);lid.position.y=1.72;g.add(lid);
  label(g,item.name,1.9,.34,.95,-.84);return g;
}
function createTrash(item){
  const g=new THREE.Group();g.name='Trash can';
  const body=new THREE.Mesh(new THREE.CylinderGeometry(.72,.62,2.5,24),mat(0x3c4b43,.9,.02));body.position.y=1.3;body.castShadow=body.receiveShadow=true;g.add(body);
  const lid=cyl(.77,.18,0x2d3933);lid.position.y=2.62;g.add(lid);return g;
}
function createStanchion(){
  const g=new THREE.Group();g.name='Stanchions';
  for(const x of [-2,2]){
    const base=cyl(.35,.08,0xc4a145);base.position.set(x,.06,0);g.add(base);
    const pole=cyl(.08,3.2,0xc4a145);pole.position.set(x,1.65,0);g.add(pole);
    const cap=sphere(.13,0xd8ba63);cap.position.set(x,3.27,0);g.add(cap);
  }
  const rope=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-2,3.0,0),new THREE.Vector3(0,2.65,0),new THREE.Vector3(2,3.0,0)]),24,.06,8,false),mat(0x8f1426,.85,.02));g.add(rope);return g;
}
function createRedCarpet(item){
  const g=new THREE.Group();g.name='Red carpet';
  const carpet=box(Math.max(2,item.widthFt),.06,Math.max(4,item.depthFt),0xa9182a,.95,.01);carpet.position.y=.035;g.add(carpet);return g;
}
function createCornhole(){
  const g=new THREE.Group();g.name='Cornhole game';
  for(const z of [-3.2,3.2]){
    const board=box(2,.18,4,0xc99b60,.82,.02);board.position.set(0,.55,z);board.rotation.x=(z>0?-1:1)*.12;g.add(board);
    const hole=new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,.05,20),new THREE.MeshBasicMaterial({color:0x171717}));hole.position.set(0,.68,z+(z>0?-1:1)*.8);g.add(hole);
  }return g;
}
function createConnectFour(){
  const g=new THREE.Group();g.name='Giant Connect Four';
  const frame=box(3.8,3.6,.3,0x194f9f,.68,.03);frame.position.y=2;g.add(frame);
  for(let r=0;r<4;r++)for(let c=0;c<5;c++){
    const chip=cyl(.23,.12,(r+c)%2?0xf5c339:0xd83732,16);chip.rotation.x=Math.PI/2;chip.position.set(-1.2+c*.6,.9+r*.65,-.2);g.add(chip);
  }return g;
}
function createBlocks(){
  const g=new THREE.Group();g.name='Animated tumbling blocks';
  const blocks=[];
  for(let layer=0;layer<10;layer++)for(let i=0;i<3;i++){
    const swap=layer%2===1,b=box(swap ? .7 : 2.1,.28,swap ? 2.1 : .7,0xd4a56d,.87,.02);
    b.position.set(swap?-.7+i*.7:0,.2+layer*.29,swap?0:-.7+i*.7);g.add(b);blocks.push(b);
  }
  g.userData.update=t=>{const top=blocks.slice(-6);top.forEach((b,i)=>b.rotation.y=Math.sin(t*.65+i)*.015);};return g;
}
function concessionBase(item,color=0xf4f2ea){
  const g=new THREE.Group();const body=box(2.2,2.4,1.8,color,.72,.06);body.position.y=1.45;g.add(body);wheels(g,2.2,1.8,.22);label(g,item.name,1.65,.28,1.55,-.91);return g;
}
function createCottonCandy(item){
  const g=concessionBase(item,0xf7bfda);g.name='Animated cotton candy machine';
  const bowl=cyl(.72,.26,0xc8d2d6);bowl.position.y=2.82;g.add(bowl);
  const floss=sphere(.34,0xffd4e9);floss.position.y=3.12;floss.scale.set(1.5,.85,1.5);g.add(floss);
  g.userData.update=t=>{bowl.rotation.y=t*5;floss.scale.set(1.45+Math.sin(t*2)*.08,.82,1.45+Math.cos(t*2)*.08);};return g;
}
function createPopcorn(item){
  const g=concessionBase(item,0xb42828);g.name='Animated popcorn machine';
  const glass=box(1.55,1.35,1.25,0xffe9b0,.15,.02);glass.material.transparent=true;glass.material.opacity=.42;glass.position.y=2.45;g.add(glass);
  const kernels=[];
  for(let i=0;i<14;i++){const k=sphere(.07,0xffe28a);g.add(k);kernels.push(k);}
  g.userData.update=t=>kernels.forEach((k,i)=>{const s=i*.41;k.position.set(Math.sin(s*3)*.55,2+((t*.9+s)%1)*1.05,Math.cos(s*2)*.42);});return g;
}
function createSnowCone(item){
  const g=concessionBase(item,0x5ea9d8);g.name='Animated snow cone machine';
  const dome=sphere(.72,0xcfefff);dome.scale.y=.65;dome.position.y=2.75;dome.material.transparent=true;dome.material.opacity=.55;g.add(dome);
  const blade=cyl(.42,.08,0x9aa7ad);blade.position.y=2.55;g.add(blade);g.userData.update=t=>{blade.rotation.y=t*9;};return g;
}
function createFountain(item){
  const g=concessionBase(item,0xf5efe4);g.name='Animated chocolate fountain';
  const flow=new THREE.Group();g.add(flow);
  for(let i=0;i<4;i++){const tray=cyl(.55-i*.1,.12,0x5b2f1f);tray.position.y=2.15+i*.45;flow.add(tray);}
  const center=cyl(.09,1.7,0x4c271c);center.position.y=2.75;flow.add(center);
  g.userData.update=t=>{flow.rotation.y=t*.8;flow.children.forEach((x,i)=>x.scale.setScalar(1+Math.sin(t*3+i)*.018));};return g;
}
function createPodium(){
  const g=new THREE.Group();g.name='Podium';
  const stem=box(.65,2.8,.55,0x704b31,.75,.05);stem.position.y=1.45;g.add(stem);
  const top=box(1.8,.18,1.1,0x8a5a37,.7,.05);top.position.y=2.85;top.rotation.x=-.18;g.add(top);
  const base=box(1.4,.12,.9,0x704b31,.75,.05);base.position.y=.08;g.add(base);return g;
}
function createPhotoBooth(item){
  const g=new THREE.Group();g.name='Animated photo booth';
  const stand=box(2.2,5.8,1.4,0x22272a,.74,.12);stand.position.y=3;g.add(stand);
  const screen=box(1.5,1.7,.08,0x101e28,.25,.15);screen.position.set(0,3.7,-.75);g.add(screen);
  const camera=sphere(.18,0x171717);camera.position.set(0,4.95,-.82);g.add(camera);
  const flash=sphere(.11,0xffffff);flash.position.set(.48,4.95,-.84);g.add(flash);
  label(g,item.name,1.7,.35,1.7,-.72);
  g.userData.update=t=>{const pulse=Math.sin(t*.8)>0.97?2.8:1;flash.scale.setScalar(pulse);};return g;
}
function createBar(item){
  const g=new THREE.Group();g.name='Event bar';
  const front=box(Math.max(4,item.widthFt),3.4,Math.max(2,item.depthFt),0x654329,.78,.04);front.position.y=1.75;g.add(front);
  const top=box(Math.max(4.2,item.widthFt+.2),.18,Math.max(2.2,item.depthFt+.2),0x30251e,.55,.1);top.position.y=3.5;g.add(top);return g;
}
function createStage(item){
  const g=new THREE.Group();g.name='Stage';
  const deck=box(Math.max(2,item.widthFt),Math.max(.3,item.heightFt||1.5),Math.max(2,item.depthFt),0x4a4a48,.8,.12);deck.position.y=(item.heightFt||1.5)/2;g.add(deck);return g;
}
function createBackdrop(item){
  const g=new THREE.Group();g.name='Backdrop';
  const panel=box(Math.max(4,item.widthFt),Math.max(5,item.heightFt),.3,0xe9e1d6,.9,.01);panel.position.y=Math.max(5,item.heightFt)/2;g.add(panel);return g;
}
function createGeneric(item){
  const g=new THREE.Group();g.name='Rental accessory';
  const body=box(Math.max(.8,item.widthFt*.78),Math.max(.5,Math.min(item.heightFt||3,5)),Math.max(.8,item.depthFt*.78),0x60786a,.8,.03);body.position.y=Math.max(.5,Math.min(item.heightFt||3,5))/2;g.add(body);label(g,item.name,Math.min(2.2,item.widthFt*.7),.34,Math.max(.6,Math.min(item.heightFt||3,5)*.65),-Math.max(.42,item.depthFt*.39));return g;
}

export function createAccessory3d(item){
  let g;
  switch(item.accessoryType){
    case 'foam-machine':g=createFoam(item);break;
    case 'fan':g=createFan(item);break;
    case 'speaker':g=createSpeaker(item);break;
    case 'generator':g=createGenerator(item);break;
    case 'cooler':g=createCooler(item);break;
    case 'trash-can':g=createTrash(item);break;
    case 'stanchion':g=createStanchion(item);break;
    case 'red-carpet':case 'floor-runner':g=createRedCarpet(item);break;
    case 'cornhole':g=createCornhole(item);break;
    case 'connect-four':g=createConnectFour(item);break;
    case 'tumbling-blocks':g=createBlocks(item);break;
    case 'cotton-candy':g=createCottonCandy(item);break;
    case 'popcorn':g=createPopcorn(item);break;
    case 'snow-cone':g=createSnowCone(item);break;
    case 'chocolate-fountain':case 'fountain':g=createFountain(item);break;
    case 'podium':case 'microphone':g=createPodium(item);break;
    case 'photo-booth':g=createPhotoBooth(item);break;
    case 'bar':case 'service-table':g=createBar(item);break;
    case 'stage':case 'stage-stair':case 'stage-ramp':g=createStage(item);break;
    case 'backdrop':g=createBackdrop(item);break;
    default:g=createGeneric(item);
  }
  g.userData.itemId=item.id;g.userData.kind='accessory';g.userData.animated=!!item.animated;
  return g;
}

export function updateAnimatedAccessories(root,time){
  if(!root)return false;let changed=false;
  root.traverse(o=>{if(typeof o.userData?.update==='function'){o.userData.update(time);changed=true;}});
  return changed;
}
