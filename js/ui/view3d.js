import { createInflatable, createInflatableActivity } from './inflatable3d.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeTable as table, makeStandaloneChair, makeDanceFloor as dance, mergeParts } from './equipment3d.js';
import { createEnvironment, disposeGroup } from './scene-environment.js';
import { createWeather } from './scene-weather.js';
import { createGuests } from './scene-guests.js';
import { createPartyStyling } from './party-styling.js';
import { sceneSetting } from './scene-setting.js';
import { byId as lightingById } from '../data/lighting.js';
import { fitTentCamera } from './view3d-framing.js';
import { createMarketingDetails } from './marketing-details.js';
import { structuralProfile, computePerimeterStations } from '../data/tentStructure.js';

let active=null;
const UP=new THREE.Vector3(0,1,0);
function cyl(r,h,m,n=16){return new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,n),m)}
function box(w,h,d,m){return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m)}
function tube(a,b,r,m,n=10){const d=new THREE.Vector3().subVectors(b,a),q=cyl(r,d.length(),m,n);q.position.copy(a).add(b).multiplyScalar(.5);q.quaternion.setFromUnitVectors(UP,d.clone().normalize());return q}
function canvasTexture(draw,size=256){const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');draw(x,size);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;return t}
function vinylTexture(){const t=canvasTexture((x,s)=>{x.fillStyle='#fffdf7';x.fillRect(0,0,s,s);for(let i=0;i<s;i+=16){x.strokeStyle='rgba(90,95,100,.045)';x.lineWidth=1;x.beginPath();x.moveTo(i,0);x.lineTo(i,s);x.stroke()}for(let i=0;i<700;i++){const px=(i*47)%s,py=(i*83)%s;x.fillStyle='rgba(80,70,55,.025)';x.fillRect(px,py,1,1)}},256);t.repeat.set(2,2);return t}
function peakPoints(t){const W=t.widthFt,L=t.lengthFt,a=(t.centerPoles||[]).map(p=>new THREE.Vector2((p.x??W/2)-W/2,(p.y??L/2)-L/2));return a.length?a:[new THREE.Vector2(0,0)]}
function membraneHeight(t,p,x,z){const hw=t.widthFt/2,hl=t.lengthFt/2,e=p.eaveHeightFt,peak=p.peakHeightFt;if(t.type!=='pole'){const nx=Math.min(1,Math.abs(x)/hw);return e+(peak-e)*Math.pow(1-nx,1.16)}const ps=peakPoints(t);let best=0;for(const q of ps){const bayHalf=Math.max(8,ps.length>1?t.lengthFt/(ps.length*1.85):hl);const dx=Math.abs(x-q.x)/hw,dz=Math.abs(z-q.y)/bayHalf,r=Math.min(1,Math.sqrt(dx*dx+dz*dz));let v=Math.pow(Math.max(0,1-r),1.48);v-=.055*Math.sin(Math.PI*Math.min(1,r))*Math.sin(Math.PI*Math.min(1,Math.abs(x-q.x)/hw));best=Math.max(best,v)}let y=e+(peak-e)*Math.max(0,best);const edge=Math.max(0,Math.min(hw-Math.abs(x),hl-Math.abs(z)));const pull=THREE.MathUtils.smoothstep(edge,0,1.4);return THREE.MathUtils.lerp(e,y,pull)}
function makeRoof(t,p,vinyl){const segX=Math.max(40,Math.round(t.widthFt*2)),segZ=Math.max(40,Math.round(t.lengthFt*1.5));const g=new THREE.PlaneGeometry(t.widthFt,t.lengthFt,segX,segZ),a=g.attributes.position;for(let i=0;i<a.count;i++)a.setZ(i,membraneHeight(t,p,a.getX(i),a.getY(i)));g.rotateX(-Math.PI/2);g.computeVertexNormals();const m=new THREE.MeshPhysicalMaterial({color:0xfffdf8,map:vinyl,roughness:.58,metalness:0,clearcoat:.08,clearcoatRoughness:.7,side:THREE.DoubleSide});const q=new THREE.Mesh(g,m);q.castShadow=q.receiveShadow=true;q.userData.buildStage='roof';return q}
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
function makeTent(t,anchor,sidewalls=[]){const p=structuralProfile(t.type,t.widthFt,t.lengthFt),g=new THREE.Group(),hw=t.widthFt/2,hl=t.lengthFt/2,vinyl=vinylTexture();g.userData.kind='tent';const roof=makeRoof(t,p,vinyl);g.add(roof);const steel=new THREE.MeshStandardMaterial({color:0xb8bec3,roughness:.24,metalness:.82}),black=new THREE.MeshStandardMaterial({color:0x303236,roughness:.62}),strap=new THREE.MeshStandardMaterial({color:0xe5dfd0,roughness:.92}),val=new THREE.MeshPhysicalMaterial({color:0xfffdf8,map:vinyl,roughness:.65,side:THREE.DoubleSide});const stations=computePerimeterStations(t.widthFt,t.lengthFt).map(s=>[s.x-hw,s.y-hl]);stations.forEach(([x,z])=>{const pole=cyl(p.sidePoleDiameterFt/2,p.eaveHeightFt,steel,16);pole.position.set(x,p.eaveHeightFt/2,z);pole.castShadow=true;pole.userData.buildStage='frame';g.add(pole);const foot=cyl(.15,.035,black,16);foot.position.set(x,.018,z);g.add(foot)});if(t.type==='pole')peakPoints(t).forEach(q=>{const cp=cyl(p.centerPoleDiameterFt/2,p.peakHeightFt+.12,steel,20);cp.position.set(q.x,(p.peakHeightFt+.12)/2,q.y);cp.castShadow=true;cp.userData.buildStage='frame';g.add(cp);const cap=cyl(.13,.12,steel,20);cap.position.set(q.x,p.peakHeightFt+.12,q.y);g.add(cap)});const drop=p.valanceDropFt;[[0,-hl,t.widthFt,.045],[0,hl,t.widthFt,.045],[-hw,0,.045,t.lengthFt],[hw,0,.045,t.lengthFt]].forEach(v=>{const q=box(v[2],drop,v[3],val);q.position.set(v[0],p.eaveHeightFt-drop/2,v[1]);q.castShadow=true;q.userData.buildStage='valance';g.add(q)});g.add(makeSidewalls(t,p,sidewalls));const seamMat=new THREE.MeshStandardMaterial({color:0xd6d2c8,roughness:.72});for(let x=-hw+10;x<hw-.1;x+=10){const pts=[];for(let z=-hl;z<=hl+.01;z+=1)pts.push(new THREE.Vector3(x,membraneHeight(t,p,x,z)+.015,z));const seam=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),Math.max(12,pts.length),.018,5,false),seamMat);g.add(seam)}if(t.type!=='pole'){for(let z=-hl;z<=hl+.01;z+=Math.min(10,t.lengthFt)){for(const side of [-1,1]){g.add(tube(new THREE.Vector3(side*hw,p.eaveHeightFt,z),new THREE.Vector3(0,p.peakHeightFt,z),.065,steel));}g.add(tube(new THREE.Vector3(-hw,p.eaveHeightFt,z),new THREE.Vector3(hw,p.eaveHeightFt,z),.04,steel));}g.add(tube(new THREE.Vector3(0,p.peakHeightFt,-hl),new THREE.Vector3(0,p.peakHeightFt,hl),.065,steel));}if(anchor==='ballast'){const ballast=new THREE.MeshStandardMaterial({color:0xd4d0c7,roughness:.95});stations.forEach(([x,z])=>{const bx=x+Math.sign(x)*.85,bz=z+Math.sign(z)*.85;const weight=box(1.1,1.5,1.1,ballast);weight.name='Concrete ballast block';weight.userData.kind='concrete-ballast';weight.position.set(bx,.75,bz);weight.castShadow=weight.receiveShadow=true;g.add(weight);g.add(tube(new THREE.Vector3(x,p.eaveHeightFt-.1,z),new THREE.Vector3(bx,1.45,bz),.018,strap,8));});}if(anchor==='stake'){const c=t.installationClearanceFt||p.stakeClearanceFt;stations.forEach(([x,z])=>{const edgeX=Math.abs(x)>hw-.1,edgeZ=Math.abs(z)>hl-.1;if(!edgeX&&!edgeZ)return;const anchors=edgeX&&edgeZ?[[x+Math.sign(x)*c,z],[x,z+Math.sign(z)*c]]:[[x+(edgeX?Math.sign(x)*c:0),z+(edgeZ?Math.sign(z)*c:0)]];anchors.forEach(([ox,oz])=>{const a=new THREE.Vector3(x,p.eaveHeightFt-.08,z),b=new THREE.Vector3(ox,.12,oz);const s=tube(a,b,.018,strap,8);s.castShadow=true;s.userData.buildStage='stakes';g.add(s);const stake=cyl(.025,.7,black,8);stake.position.set(ox,.08,oz);stake.rotation.z=.18;g.add(stake);const rat=box(.2,.12,.08,steel);rat.position.copy(a.clone().lerp(b,.58));rat.lookAt(b);g.add(rat);})})}return g}
function sky(night,raining=false){const c=document.createElement('canvas');c.width=8;c.height=256;const x=c.getContext('2d'),gr=x.createLinearGradient(0,0,0,256);if(night){gr.addColorStop(0,'#07101e');gr.addColorStop(.55,'#16263d');gr.addColorStop(1,'#334257')}else if(raining){gr.addColorStop(0,'#586b7e');gr.addColorStop(.5,'#8e9ea9');gr.addColorStop(1,'#ced8d8')}else{gr.addColorStop(0,'#79b5df');gr.addColorStop(.5,'#c5e1ef');gr.addColorStop(1,'#edf2e8')}x.fillStyle=gr;x.fillRect(0,0,8,256);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}
function lighting(tent, id) {
  const option=lightingById(id),group=new THREE.Group();
  if(!option||option.visual==='none')return group;
  const profile=structuralProfile(tent.type,tent.widthFt,tent.lengthFt);
  const wire=new THREE.MeshStandardMaterial({color:0x383d35,roughness:.8});
  const bulb=new THREE.MeshStandardMaterial({color:0xffedcb,emissive:0xffc77a,emissiveIntensity:.25,roughness:.32});
  const crystal=new THREE.MeshPhysicalMaterial({color:0xf2ead9,metalness:.08,roughness:.12,transparent:true,opacity:.82});
  const h=profile.eaveHeightFt-.45,hw=tent.widthFt/2,hl=tent.lengthFt/2;
  const lines=option.visual==='bistro-cross-runs'?profile.lighting.bistro:profile.lighting.perimeter;
  if(option.visual==='chandelier'){
    const center=tent.type==='pole'?2.4:0;
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.85,.035,8,36),wire);ring.rotation.x=Math.PI/2;ring.position.set(center,h-.1,0);group.add(ring);
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4,x=Math.cos(a),z=Math.sin(a);
      const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(center,h+.35,0),new THREE.Vector3(center+x*.45,h-.2,z*.45),new THREE.Vector3(center+x*.85,h,z*.85)]);
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve,12,.035,6,false),wire));
      const candle=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,.24,10),crystal);candle.position.set(center+x*.85,h+.12,z*.85);group.add(candle);
      const q=new THREE.Mesh(new THREE.SphereGeometry(.10,10,8),bulb);q.scale.y=1.6;q.position.set(center+x*.85,h+.31,z*.85);group.add(q);
      for(const r of [.43,.8]){const drop=new THREE.Mesh(new THREE.OctahedronGeometry(.095,0),crystal);drop.scale.y=2.1;drop.position.set(center+x*r,h-.3,z*r);group.add(drop);}
    }
    group.add(tube(new THREE.Vector3(center,h+.3,0),new THREE.Vector3(center,profile.peakHeightFt-1,0),.025,wire));
  }else if(option.visual.startsWith('uplight')){
    const count=option.visual==='uplight-single'?1:12;
    for(let i=0;i<count;i++){const a=i/count*Math.PI*2,x=Math.cos(a)*(hw-.5),z=Math.sin(a)*(hl-.5),q=box(.5,.65,.5,wire);q.position.set(x,.325,z);group.add(q);const bracket=box(.65,.06,.65,wire);bracket.position.set(x,.04,z);group.add(bracket);for(let n=0;n<6;n++){const a=n*Math.PI/3,lamp=new THREE.Mesh(new THREE.CircleGeometry(.062,8),bulb);lamp.rotation.x=-Math.PI/2;lamp.position.set(x+Math.cos(a)*.13,.66,z+Math.sin(a)*.13);group.add(lamp);}}
  }else{
    lines.forEach(line=>{
      const a=new THREE.Vector3(line.from.x-hw,h,line.from.y-hl),b=new THREE.Vector3(line.to.x-hw,h,line.to.y-hl),pts=[];
      for(let i=0;i<=24;i++){const f=i/24,p=a.clone().lerp(b,f);p.y-=Math.sin(f*Math.PI)*.45;pts.push(p);}
      group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),24,.014,5,false),wire));
      const count=Math.max(2,Math.ceil(a.distanceTo(b)/2.5));
      for(let i=0;i<=count;i++){const f=i/count,p=a.clone().lerp(b,f);p.y-=Math.sin(f*Math.PI)*.45+.12;const socket=new THREE.Mesh(new THREE.CylinderGeometry(.043,.052,.12,8),wire);socket.position.copy(p);socket.position.y+=.07;group.add(socket);const q=new THREE.Mesh(new THREE.SphereGeometry(.085,10,8),bulb);q.scale.y=1.3;q.position.copy(p);q.position.y-=.035;group.add(q);}
    });
  }
  mergeParts(group);
  const lights=[];
  const rows=Math.min(3,Math.max(1,Math.ceil(tent.lengthFt/20))),cols=tent.widthFt>16?2:1;
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const glow=new THREE.PointLight(0xffdfb0,0,Math.max(22,Math.max(tent.widthFt,tent.lengthFt)/rows*1.8),1.3);
    glow.position.set((col+.5)/cols*tent.widthFt-hw,h-1,(row+.5)/rows*tent.lengthFt-hl);group.add(glow);lights.push(glow);
  }
  group.userData.setNight=value=>{lights.forEach(glow=>{glow.intensity=value?165:12;});bulb.emissiveIntensity=value?7:.7;};
  return group;
}

export function init(container,callbacks={}) {
  const mobile=window.matchMedia?.('(max-width: 880px)').matches;
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,mobile?1.5:2));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.domElement.style.cursor='grab';renderer.domElement.setAttribute('aria-label','Interactive 3D event layout');
  container.replaceChildren(renderer.domElement);
  const scene=new THREE.Scene();scene.background=sky(false);scene.fog=new THREE.FogExp2(0xdde8df,.002);
  const camera=new THREE.PerspectiveCamera(36,1,.1,1200),controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.065;controls.minDistance=8;controls.maxDistance=260;controls.maxPolarAngle=Math.PI*.48;controls.target.set(0,4,0);
  controls.touches.ONE=THREE.TOUCH.ROTATE;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  const furniture=new THREE.Group(),structure=new THREE.Group();scene.add(structure,furniture);
  const rendered=new Map(),pointers=new Set();let state=null,night=false,raf=0,drag=null,danceMesh=null,environment=null,lightGroup=null;
  let inflatableActivity=null,styling=null,showStyling=true,stylingKey='',cameraMode='outside';
  let weather=null,guests=null,ghost=new THREE.Group(),ghostKey='',guestKey='',weatherMode='clear',motion=true,showGuests=false,placementPointer=null,lastTime=0,animationTime=0;scene.add(ghost);
  const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let environmentKey='',structureKey='',furnitureKey='',lightingKey='',dirty=true,destroyed=false,animationFrame=0,itemAnimationFrame=0,chairAnimationFrame=0,cameraAnimationFrame=0;
  let marketingFootprint=null,marketingDetails=null;
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04);
  scene.environment=env.texture;room.dispose();pmrem.dispose();
  const hemi=new THREE.HemisphereLight(0xeaf6ff,0x667052,1.65);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xfff3df,3.2);sun.position.set(-35,48,28);sun.castShadow=true;
  sun.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048);sun.shadow.bias=-.00015;sun.shadow.normalBias=.04;scene.add(sun);
  const fill=new THREE.DirectionalLight(0xcde3ff,.55);fill.position.set(30,18,-25);scene.add(fill);
  const selection=new THREE.Box3Helper(new THREE.Box3(),0x43775a);selection.visible=false;scene.add(selection);
  function invalidate(){dirty=true;}
  controls.addEventListener('change',invalidate);
  function shadows(t){const radius=Math.max(t.widthFt,t.lengthFt)/2+18;sun.shadow.camera.left=-radius;sun.shadow.camera.right=radius;sun.shadow.camera.top=radius;sun.shadow.camera.bottom=-radius;sun.shadow.camera.far=radius*4+120;sun.shadow.camera.updateProjectionMatrix();renderer.shadowMap.needsUpdate=true;}
  function frame(t){if(t.isSite){camera.fov=42;camera.updateProjectionMatrix();const box=new THREE.Box3().setFromObject(furniture);const center=box.isEmpty()?new THREE.Vector3(0,3,0):box.getCenter(new THREE.Vector3()),size=box.isEmpty()?new THREE.Vector3(t.widthFt,10,t.lengthFt):box.getSize(new THREE.Vector3());const fit=fitTentCamera({widthFt:Math.max(8,size.x),lengthFt:Math.max(8,size.z)},Math.max(6,size.y),camera.aspect,camera.fov,2);const shift=center.clone().sub(new THREE.Vector3(...fit.target));camera.position.set(...fit.position).add(shift);controls.target.copy(center);controls.maxDistance=Math.max(260,camera.position.distanceTo(controls.target)*1.8);controls.update();invalidate();return;}if(cameraMode==='reception'){camera.fov=camera.aspect<1?65:52;camera.updateProjectionMatrix();camera.position.set(t.widthFt*.28,5.6,t.lengthFt*.46);controls.target.set(-t.widthFt*.08,2.2,-t.lengthFt*.18);controls.update();invalidate();return;}if(cameraMode==='inside'){camera.fov=50;camera.updateProjectionMatrix();const f=fitTentCamera(t,7,camera.aspect,camera.fov,0);camera.position.set(f.position[0],5.6,f.position[2]);controls.target.set(0,3.5,0);controls.update();invalidate();return;}camera.fov=36;camera.updateProjectionMatrix();const p=structuralProfile(t.type,t.widthFt,t.lengthFt),anchor=state?.anchoringMethod||(t.type==='pole'?'stake':'ballast'),f=fitTentCamera(t,p.peakHeightFt,camera.aspect,camera.fov,anchor==='stake'?(t.installationClearanceFt||5):2);camera.position.set(...f.position);controls.target.set(...f.target);controls.maxDistance=Math.max(260,camera.position.distanceTo(controls.target)*1.8);controls.update();invalidate();}
  function rebuild(data){
    if(!data?.tent||destroyed)return;
    const previous=state?.tent,changed=!previous||previous.id!==data.tent.id||previous.widthFt!==data.tent.widthFt||previous.lengthFt!==data.tent.lengthFt;
    state={...data,objects:(data.objects||[]).map(o=>({...o}))};const t=state.tent;
    const setting=sceneSetting(t,state.surfaceType),nextEnvironment=[setting,t.widthFt,t.lengthFt].join(':');
    if(nextEnvironment!==environmentKey){if(environment){scene.remove(environment);disposeGroup(environment);}environment=createEnvironment(t,state.surfaceType);environment.userData.setNight(night);scene.add(environment);environmentKey=nextEnvironment;if(weather){scene.remove(weather);disposeGroup(weather);}weather=createWeather(t,{mobile});weather.userData.setNight(night);weather.userData.setWeather(weatherMode);scene.add(weather);}
    const anchor=state.anchoringMethod||(t.type==='pole'?'stake':setting==='driveway'?'ballast':'stake');
    const nextStructure=JSON.stringify([t.id,t.type,t.widthFt,t.lengthFt,t.centerPoles,anchor,state.sidewalls||[]]);
    if(nextStructure!==structureKey){disposeGroup(structure);if(!t.isSite)structure.add(makeTent(t,anchor,state.sidewalls||[]));structureKey=nextStructure;shadows(t);}
    const nextFurniture=JSON.stringify([t.widthFt,t.lengthFt,state.objects]);
    if(nextFurniture!==furnitureKey){
      disposeGroup(furniture);rendered.clear();const df=[];
      for(const o of state.objects){if(o.kind==='dance'){df.push(o);continue;}if(!['table','inflatable','chair'].includes(o.kind))continue;const q=o.kind==='inflatable'?createInflatable(o):o.kind==='chair'?makeStandaloneChair(o):table(o);q.position.set(o.x+o.widthFt/2-t.widthFt/2,0,o.y+o.depthFt/2-t.lengthFt/2);furniture.add(q);rendered.set(o.id,q);}
      danceMesh=dance(df,t);if(danceMesh)furniture.add(danceMesh);furnitureKey=nextFurniture;renderer.shadowMap.needsUpdate=true;
    }
    if(stylingKey!==nextFurniture){if(styling){scene.remove(styling);disposeGroup(styling);}styling=createPartyStyling(t,state.objects);scene.add(styling);stylingKey=nextFurniture;}
    if(styling)styling.visible=showStyling&&!drag;
    const nextGuests=nextFurniture;
    if(nextGuests!==guestKey){if(guests){scene.remove(guests);disposeGroup(guests);}guests=createGuests(t,state.objects,{mobile});guests.visible=showGuests;scene.add(guests);guestKey=nextGuests;if(inflatableActivity){scene.remove(inflatableActivity);disposeGroup(inflatableActivity);}inflatableActivity=createInflatableActivity(t,state.objects,{mobile});scene.add(inflatableActivity);}
    if(guests)guests.visible=showGuests&&!drag;if(inflatableActivity)inflatableActivity.visible=showGuests&&!drag&&!state.placement;
    const nextGhost=JSON.stringify(data.placement?.objects?.map(({x,y,...rest})=>rest)||[]);
    if(nextGhost!==ghostKey){
      disposeGroup(ghost);
      if(data.placement){
        const items=data.placement.objects;
        if(items[0]?.kind==='chair')ghost.add(makeStandaloneChair(items[0]));else if(items[0]?.kind==='inflatable')ghost.add(createInflatable(items[0]));else if(items[0]?.kind==='table')ghost.add(table({...items[0],x:0,y:0}));
        else{const q=dance(items.map(o=>({...o,x:o.x-data.placement.x,y:o.y-data.placement.y})),{widthFt:data.placement.widthFt,lengthFt:data.placement.depthFt});if(q)ghost.add(q);}
        ghost.traverse(o=>{if(o.material){o.material.transparent=true;o.material.opacity=.64;o.material.depthWrite=false;}o.castShadow=false;});
      }ghostKey=nextGhost;
    }
    ghost.visible=!!data.placement;
    if(data.placement)ghost.position.set(data.placement.x+data.placement.widthFt/2-t.widthFt/2,.06,data.placement.y+data.placement.depthFt/2-t.lengthFt/2);
    controls.enableRotate=!data.placement;renderer.domElement.style.cursor=data.placement?'crosshair':'grab';
    const nextLighting=[state.lightingId,t.id,t.widthFt,t.lengthFt].join(':');
    if(nextLighting!==lightingKey){if(lightGroup){scene.remove(lightGroup);disposeGroup(lightGroup);}lightGroup=lighting(t,state.lightingId);lightGroup.userData.setNight?.(night);scene.add(lightGroup);lightingKey=nextLighting;}
    const selected=rendered.get(state.selectedId)||(danceMesh?.userData.itemIds.includes(state.selectedId)?danceMesh:null);
    selection.visible=!!selected;if(selected)selection.box.setFromObject(selected).expandByScalar(.12);
    if(callbacks.marketingOnly&&changed){
      if(marketingFootprint){scene.remove(marketingFootprint);disposeGroup(marketingFootprint);}
      if(marketingDetails){scene.remove(marketingDetails);disposeGroup(marketingDetails);}
      marketingFootprint=new THREE.Group();marketingFootprint.name='Marketing footprint';
      const fill=new THREE.Mesh(new THREE.PlaneGeometry(t.widthFt,t.lengthFt),new THREE.MeshBasicMaterial({color:0x5c86de,transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide}));
      fill.rotation.x=-Math.PI/2;fill.position.y=.035;marketingFootprint.add(fill);
      const edge=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(t.widthFt,.03,t.lengthFt)),new THREE.LineBasicMaterial({color:0x2f66c9}));edge.position.y=.05;marketingFootprint.add(edge);
      scene.add(marketingFootprint);
      marketingDetails=createMarketingDetails(t);scene.add(marketingDetails);
    }
    if(changed)frame(t);invalidate();
  }
  // Read-only marketing playback uses the same geometry and layout as the
  // designer. This API is available only to the isolated public sample.
  function setMarketingProgress(raw){
    if(!callbacks.marketingOnly||!state?.tent)return;
    const p=Math.max(0,Math.min(1,raw)),smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
    const level=(start,end)=>smooth((p-start)/(end-start));
    const stage=(object,start,end,rise=1.5)=>{
      if(!object)return;const k=level(start,end);object.visible=k>.005;
      if(object.userData.marketingBaseY===undefined)object.userData.marketingBaseY=object.position.y;
      object.position.y=object.userData.marketingBaseY+(1-k)*rise;
      object.scale.setScalar(Math.max(.03,k));
    };
    if(marketingFootprint)stage(marketingFootprint,.04,.10,.1);
    const tent=structure.children[0];
    if(tent){
      tent.children.forEach(child=>{
        if(child.userData.buildStage==='roof'||child.userData.buildStage==='valance'){
          // Keep the tent open to the overhead planning camera; complete it
          // only as the camera drops into the furnished reception.
          stage(child,.91,.98,0);
        }else stage(child,.12,.22,1.4);
      });
    }
    if(danceMesh)stage(danceMesh,.49,.56,.5);
    let n=0;
    for(const item of state.objects){
      if(item.kind!=='table')continue;const group=rendered.get(item.id);if(!group)continue;
      const guest=item.id.startsWith('wedding-table-');
      const first=guest?.26+(n++%8)*.013:item.id==='wedding-sweetheart'?.45:item.id==='wedding-dj'?.57:item.id==='wedding-bar'?.62:item.id.startsWith('wedding-buffet-')?.65:.69;
      stage(group,first,first+.035,.6);
      // Chair geometry and linen are separate material batches in the real
      // table model, so guests can watch them arrive after the tabletops.
      group.children.forEach(child=>{
        if(/Chair frame|Seat cushion|Non-marking feet/.test(child.name))stage(child,guest?.39:.48,guest?.48:.54,.3);
        else if(child.name==='Linen fabric')stage(child,.74,.80,.2);
      });
    }
    if(styling)stage(styling,.79,.87,.15);
    if(lightGroup)stage(lightGroup,.84,.91,0);
    marketingDetails?.children.forEach(part=>stage(part,part.userData.marketingAt,part.userData.marketingAt+.055,.6));
    if(guests)guests.visible=false;
    if(inflatableActivity)inflatableActivity.visible=false;
    const c=level(.82,.98),e=c*c*(3-2*c),t=state.tent;
    const altitude=Math.max(t.widthFt,t.lengthFt)*(camera.aspect<1?1.75:1.32);
    camera.fov=36+16*e;camera.updateProjectionMatrix();
    camera.position.set(t.widthFt*.28*e,altitude+(5.6-altitude)*e,.1+(t.lengthFt*.46-.1)*e);
    controls.target.set(-t.widthFt*.08*e,2.2*e,-t.lengthFt*.18*e);
    controls.enabled=p>=1;controls.update();
    if(marketingFootprint)marketingFootprint.visible=p>.04&&p<.89;
    renderer.shadowMap.needsUpdate=true;invalidate();
  }
  function resize(){const w=Math.max(1,container.clientWidth||800),h=Math.max(1,container.clientHeight||600),aspect=w/h,changed=Math.abs(camera.aspect-aspect)>.01;camera.aspect=aspect;camera.updateProjectionMatrix();renderer.setSize(w,h,false);if(changed&&state?.tent)frame(state.tent);invalidate();}
  function pointerRay(e){const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1);raycaster.setFromCamera(pointer,camera);return raycaster;}
  function groundPoint(e){const v=new THREE.Vector3();return pointerRay(e).ray.intersectPlane(groundPlane,v)?v:null;}
  function hit(e){pointerRay(e);return raycaster.intersectObjects(furniture.children,true).find(h=>h.object.userData.itemId||h.object.userData.kind==='danceGroup');}
  function down(e){
    if(callbacks.marketingOnly)return;
    if(e.button!==undefined&&e.button!==0)return;
    pointers.add(e.pointerId);
    if(pointers.size>1){placementPointer=null;if(drag){const originals=drag.kind==='item'?[drag.orig]:drag.orig;state.objects=state.objects.map(o=>({...o,...originals.find(a=>a.id===o.id)}));furnitureKey='';}drag=null;controls.enableRotate=true;rebuild(state);return;}
    if(state?.placement){placementPointer={id:e.pointerId,x:e.clientX,y:e.clientY};const p=groundPoint(e);if(p)callbacks.onPlacementMove?.(p.x+state.tent.widthFt/2,p.z+state.tent.lengthFt/2);return;}
    const h=hit(e),point=groundPoint(e);if(!h||!point||!state)return;
    const u=h.object.userData;
    // Select first; dragging an already selected item avoids stealing one-finger orbit.
    const id=u.itemId||u.itemIds?.[0];
    if(state.selectedId!==id){callbacks.onSelect?.(id);return;}
    if(u.kind==='danceGroup')drag={kind:'dance',ids:u.itemIds,start:point.clone(),orig:state.objects.filter(o=>u.itemIds.includes(o.id)).map(o=>({...o})),mesh:danceMesh.position.clone()};
    else{const o=state.objects.find(x=>x.id===id);if(!o)return;drag={kind:'item',id,start:point.clone(),orig:{...o}};}
    if(guests)guests.visible=false;if(styling)styling.visible=false;controls.enableRotate=false;renderer.domElement.setPointerCapture?.(e.pointerId);
  }
  function move(e){
    if(state?.placement&&pointers.size<2&&(e.pointerType==='mouse'||placementPointer)){const p=groundPoint(e);if(p)callbacks.onPlacementMove?.(p.x+state.tent.widthFt/2,p.z+state.tent.lengthFt/2);return;}
    if(!drag||!state||pointers.size>1)return;
    const p=groundPoint(e);if(!p)return;const t=state.tent,dx=p.x-drag.start.x,dz=p.z-drag.start.z;
    if(drag.kind==='item'){const o=state.objects.find(x=>x.id===drag.id),a=drag.orig;o.x=Math.max(0,Math.min(t.widthFt-a.widthFt,a.x+dx));o.y=Math.max(0,Math.min(t.lengthFt-a.depthFt,a.y+dz));rendered.get(o.id)?.position.set(o.x+o.widthFt/2-t.widthFt/2,0,o.y+o.depthFt/2-t.lengthFt/2);selection.box.setFromObject(rendered.get(o.id)).expandByScalar(.12);}
    else{
      const minX=Math.min(...drag.orig.map(o=>o.x)),minY=Math.min(...drag.orig.map(o=>o.y)),maxX=Math.max(...drag.orig.map(o=>o.x+o.widthFt)),maxY=Math.max(...drag.orig.map(o=>o.y+o.depthFt));
      const x=Math.max(-minX,Math.min(t.widthFt-maxX,dx)),y=Math.max(-minY,Math.min(t.lengthFt-maxY,dz));
      for(const a of drag.orig){const o=state.objects.find(item=>item.id===a.id);o.x=a.x+x;o.y=a.y+y;}
      danceMesh.position.set(drag.mesh.x+x,drag.mesh.y,drag.mesh.z+y);selection.box.setFromObject(danceMesh).expandByScalar(.12);
    }
    renderer.shadowMap.needsUpdate=true;invalidate();
  }
  function up(e){
    pointers.delete(e.pointerId);if(placementPointer?.id===e.pointerId){placementPointer=null;if(e.type!=='pointercancel'){const p=groundPoint(e);if(p){callbacks.onPlacementMove?.(p.x+state.tent.widthFt/2,p.z+state.tent.lengthFt/2);callbacks.onPlace?.();}}return;}if(!drag)return;const finished=drag;drag=null;if(guests)guests.visible=showGuests;if(inflatableActivity)inflatableActivity.visible=showGuests;if(styling)styling.visible=showStyling;controls.enableRotate=true;
    if(e.type==='pointercancel'){const originals=finished.kind==='item'?[finished.orig]:finished.orig;state.objects=state.objects.map(o=>({...o,...originals.find(a=>a.id===o.id)}));furnitureKey='';rebuild(state);return;}
    if(finished.kind==='item'){const o=state.objects.find(x=>x.id===finished.id);if(o)callbacks.onMove?.(o.id,o.x,o.y);}
    else{const updates=state.objects.filter(o=>finished.ids.includes(o.id)).map(o=>({id:o.id,x:o.x,y:o.y}));const first=updates[0];if(first)callbacks.onMove?.(first.id,first.x,first.y);}
    try{renderer.domElement.releasePointerCapture?.(e.pointerId);}catch{}
  }
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',up);
  const ro=new ResizeObserver(resize);ro.observe(container);resize();
  function loop(now=0){if(destroyed)return;raf=requestAnimationFrame(loop);const dt=Math.min(.05,Math.max(0,(now-lastTime)/1000));lastTime=now;controls.update();if(container.clientWidth&&container.clientHeight&&!document.hidden&&!document.body.classList.contains('table-studio-open')&&!document.body.classList.contains('rs-preview-expired')){if(!motion||reducedMotion||drag||state?.placement)animationTime=0;else animationTime+=dt;if(motion&&!reducedMotion&&!drag&&!state?.placement&&animationTime>=1/30){weather?.userData.update(animationTime);if(showGuests){guests?.userData.update(animationTime);inflatableActivity?.userData.update(animationTime);renderer.shadowMap.needsUpdate=true;}animationTime=0;dirty=true;}if(dirty){renderer.render(scene,camera);dirty=false;}}}
  loop();document.addEventListener('visibilitychange',invalidate);
  function setNight(value){night=!!value;scene.background?.dispose?.();scene.background=sky(night,weatherMode==='rain');scene.fog.color.set(night?0x203044:weatherMode==='rain'?0x9eafb5:0xdde8df);scene.fog.density=weatherMode==='rain'?.004:.002;hemi.intensity=night?.7:weatherMode==='rain'?1.25:1.65;sun.intensity=night?.25:weatherMode==='rain'?.65:3.2;fill.intensity=night?.4:.7;renderer.toneMappingExposure=night?1.18:1.05;weather?.userData.setNight(night);environment?.userData.setNight(night);lightGroup?.userData.setNight?.(night);renderer.shadowMap.needsUpdate=true;invalidate();}
  function setScene(options={}){
    showStyling=options.styling!==false;if(styling)styling.visible=showStyling;
    weatherMode=options.weather==='rain'?'rain':'clear';showGuests=!!options.guests;motion=options.motion!==false;
    weather?.userData.setWeather(weatherMode);if(guests)guests.visible=showGuests;if(inflatableActivity)inflatableActivity.visible=showGuests;
    setNight(!!options.night);invalidate();
  }
  function inside(){if(state?.tent){cameraMode='inside';frame(state.tent);}}
  // An eye-level reception view for the public tour; other designer views keep their existing framing.
  function reception(){if(state?.tent){cameraMode='reception';frame(state.tent);}}
  function fitCamera(){if(state?.tent){cameraMode='outside';frame(state.tent);return true;}return false;}
  function setMarketingBuildStage(key){
    const order={space:0,tent:1,tables:2,chairs:3,sweetheart:4,dance:5,style:6,lighting:7,reception:8,evening:9};
    const stage=order[key] ?? 9;
    structure.visible=stage>=1;
    if(stage<1)structure.scale.y=1;
    for(const [id,group] of rendered){
      const guestTable=id.startsWith('wedding-table-');
      const marketingItem=id.startsWith('wedding-');
      if(guestTable)group.visible=stage>=2;
      else if(marketingItem)group.visible=stage>=4;
      else group.visible=true;
      if(guestTable){
        group.traverse(child=>{
          if(child.userData?.role==='chairs')child.visible=stage>=3;
        });
      }
    }
    if(danceMesh)danceMesh.visible=stage>=5;
    if(styling)styling.visible=stage>=6;
    if(lightGroup)lightGroup.visible=stage>=7;
    showStyling=stage>=6;
    showGuests=stage>=9;
    motion=false;
    if(guests)guests.visible=stage>=9;
    if(inflatableActivity)inflatableActivity.visible=false;
    setNight(stage>=9);
    if(lightGroup)lightGroup.visible=stage>=7;
    renderer.shadowMap.needsUpdate=true;invalidate();
  }
  function playTimelapse(){cancelAnimationFrame(animationFrame);if(reducedMotion){structure.scale.y=1;invalidate();return;}const start=performance.now();structure.visible=true;structure.scale.y=.02;function tick(now){if(destroyed)return;const k=Math.min(1,(now-start)/1800),e=1-Math.pow(1-k,3);structure.scale.y=Math.max(.02,e);renderer.shadowMap.needsUpdate=true;invalidate();if(k<1)animationFrame=requestAnimationFrame(tick);else structure.scale.y=1;}animationFrame=requestAnimationFrame(tick);}
  function playItemTimelapse(ids=[],duration=720){
    cancelAnimationFrame(itemAnimationFrame);
    if(reducedMotion||!ids.length)return;
    const seen=new Set(),targets=[];
    for(const id of ids){
      let q=rendered.get(id);
      if(!q&&danceMesh?.userData?.itemIds?.includes(id))q=danceMesh;
      if(!q||seen.has(q))continue;
      seen.add(q);targets.push({q,position:q.position.clone(),scale:q.scale.clone()});
    }
    if(!targets.length)return;
    targets.forEach(({q,position,scale})=>{q.position.y=position.y+.7;q.scale.set(scale.x*.84,scale.y*.04,scale.z*.84);});
    const start=performance.now(),stagger=targets.length>1?Math.min(90,420/targets.length):0,total=duration+stagger*Math.max(0,targets.length-1);
    function tick(now){
      if(destroyed)return;
      const elapsed=now-start;
      targets.forEach(({q,position,scale},index)=>{
        const k=Math.max(0,Math.min(1,(elapsed-index*stagger)/duration)),e=1-Math.pow(1-k,3);
        q.position.y=position.y+(1-e)*.7;
        q.scale.set(scale.x*(.84+.16*e),scale.y*(.04+.96*e),scale.z*(.84+.16*e));
      });
      renderer.shadowMap.needsUpdate=true;invalidate();
      if(elapsed<total)itemAnimationFrame=requestAnimationFrame(tick);
      else targets.forEach(({q,position,scale})=>{q.position.copy(position);q.scale.copy(scale);});
    }
    itemAnimationFrame=requestAnimationFrame(tick);
  }
  function playChairTimelapse(ids=[],duration=650){
    cancelAnimationFrame(chairAnimationFrame);
    if(reducedMotion||!ids.length)return;
    const targets=[];
    for(const id of ids){
      const tableGroup=rendered.get(id);
      if(!tableGroup)continue;
      for(const child of tableGroup.children){
        if(!child.isInstancedMesh)continue;
        targets.push({q:child,position:child.position.clone(),scale:child.scale.clone()});
      }
    }
    if(!targets.length)return;
    targets.forEach(({q,position,scale})=>{
      q.position.y=position.y+.55;
      q.scale.set(scale.x*.92,scale.y*.04,scale.z*.92);
    });
    const start=performance.now();
    function tick(now){
      if(destroyed)return;
      const k=Math.min(1,(now-start)/duration),e=1-Math.pow(1-k,3);
      targets.forEach(({q,position,scale})=>{
        q.position.y=position.y+(1-e)*.55;
        q.scale.set(scale.x*(.92+.08*e),scale.y*(.04+.96*e),scale.z*(.92+.08*e));
      });
      renderer.shadowMap.needsUpdate=true;invalidate();
      if(k<1)chairAnimationFrame=requestAnimationFrame(tick);
      else targets.forEach(({q,position,scale})=>{q.position.copy(position);q.scale.copy(scale);});
    }
    chairAnimationFrame=requestAnimationFrame(tick);
  }
  function transitionCamera(mode='reception',duration=1250){
    cancelAnimationFrame(cameraAnimationFrame);
    if(!state?.tent)return;
    const startPosition=camera.position.clone(),startTarget=controls.target.clone(),startFov=camera.fov;
    if(mode==='inside')inside();else if(mode==='outside')fitCamera();else reception();
    const endPosition=camera.position.clone(),endTarget=controls.target.clone(),endFov=camera.fov;
    if(reducedMotion){invalidate();return;}
    camera.position.copy(startPosition);controls.target.copy(startTarget);camera.fov=startFov;camera.updateProjectionMatrix();controls.update();
    const started=performance.now();
    function tick(now){
      if(destroyed)return;
      const k=Math.min(1,(now-started)/duration),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
      camera.position.lerpVectors(startPosition,endPosition,e);
      controls.target.lerpVectors(startTarget,endTarget,e);
      camera.fov=THREE.MathUtils.lerp(startFov,endFov,e);camera.updateProjectionMatrix();controls.update();invalidate();
      if(k<1)cameraAnimationFrame=requestAnimationFrame(tick);
    }
    cameraAnimationFrame=requestAnimationFrame(tick);
  }
  const api={inside,reception,setScene,rebuild,update:rebuild,fitCamera,fitTentPreview:fitCamera,night:setNight,playTimelapse,playItemTimelapse,playChairTimelapse,transitionCamera,setMarketingBuildStage,setMarketingProgress,destroy(){destroyed=true;cancelAnimationFrame(animationFrame);cancelAnimationFrame(itemAnimationFrame);cancelAnimationFrame(chairAnimationFrame);cancelAnimationFrame(cameraAnimationFrame);cancelAnimationFrame(raf);ro.disconnect();document.removeEventListener('visibilitychange',invalidate);controls.dispose();disposeGroup(structure);disposeGroup(furniture);disposeGroup(ghost);if(weather)disposeGroup(weather);if(guests)disposeGroup(guests);if(inflatableActivity)disposeGroup(inflatableActivity);if(styling)disposeGroup(styling);if(environment)disposeGroup(environment);if(lightGroup)disposeGroup(lightGroup);if(marketingFootprint)disposeGroup(marketingFootprint);if(marketingDetails)disposeGroup(marketingDetails);selection.geometry.dispose();selection.material.dispose();scene.background?.dispose?.();sun.shadow.dispose();renderer.dispose();env.dispose();container.replaceChildren();}};
  // A watch-only sample must not replace the real designer renderer.
  if(callbacks.registerActive !== false)active=api;return api;
}
export function update(s){active?.rebuild(s);}
export function rebuild(s){active?.rebuild(s);}
export function fitCamera(){active?.fitCamera();}
export function fitTentPreview(){active?.fitCamera();}
export function night(v){active?.night(v);}
export function playTimelapse(mode){active?.playTimelapse(mode);}

export { lighting as makeLighting };
