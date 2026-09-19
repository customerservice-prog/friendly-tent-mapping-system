import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { linenColorHex } from '../data/linens.js';
import { chairPositions } from '../core/seating.js';
import { byId as chairById } from '../data/chairs.js';
import { createEnvironment, disposeGroup } from './scene-environment.js';
import { sceneSetting } from './scene-setting.js';
import { byId as lightingById } from '../data/lighting.js';
import { fitTentCamera } from './view3d-framing.js';
import { structuralProfile, computePerimeterStations } from '../data/tentStructure.js';

let active=null;
const UP=new THREE.Vector3(0,1,0);
const COLORS={White:0xf7f5ee,Ivory:0xeee4cf,Champagne:0xd9c39d,Gold:0xb58b42,Black:0x18191b,Silver:0xaeb3b8,'Navy Blue':0x172c52,'Royal Blue':0x2350a2,Burgundy:0x681f2d,Red:0xa72b2c,Blush:0xe4bbb7,'Dusty Rose':0xb97c7c,Pink:0xe4a9bd,Purple:0x76538f,'Sage Green':0x8b9b79,'Hunter Emerald Green':0x285d49};
const colorFor=(n,f=0xf7f5ee)=>COLORS[n]||f;
function cyl(r,h,m,n=16){return new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,n),m)}
function box(w,h,d,m){return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m)}
function tube(a,b,r,m,n=10){const d=new THREE.Vector3().subVectors(b,a),q=cyl(r,d.length(),m,n);q.position.copy(a).add(b).multiplyScalar(.5);q.quaternion.setFromUnitVectors(UP,d.clone().normalize());return q}
function canvasTexture(draw,size=256){const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');draw(x,size);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;return t}
function vinylTexture(){const t=canvasTexture((x,s)=>{x.fillStyle='#fffdf7';x.fillRect(0,0,s,s);for(let i=0;i<s;i+=16){x.strokeStyle='rgba(90,95,100,.045)';x.lineWidth=1;x.beginPath();x.moveTo(i,0);x.lineTo(i,s);x.stroke()}for(let i=0;i<700;i++){const px=(i*47)%s,py=(i*83)%s;x.fillStyle='rgba(80,70,55,.025)';x.fillRect(px,py,1,1)}},256);t.repeat.set(2,2);return t}
function linenTexture(){const t=canvasTexture((x,s)=>{x.fillStyle='#fff';x.fillRect(0,0,s,s);for(let i=0;i<s;i+=5){x.strokeStyle='rgba(80,80,80,.035)';x.beginPath();x.moveTo(i,0);x.lineTo(i,s);x.stroke();x.beginPath();x.moveTo(0,i);x.lineTo(s,i);x.stroke()}},128);t.repeat.set(5,5);return t}
function peakPoints(t){const W=t.widthFt,L=t.lengthFt,a=(t.centerPoles||[]).map(p=>new THREE.Vector2((p.x??W/2)-W/2,(p.y??L/2)-L/2));return a.length?a:[new THREE.Vector2(0,0)]}
function membraneHeight(t,p,x,z){const hw=t.widthFt/2,hl=t.lengthFt/2,e=p.eaveHeightFt,peak=p.peakHeightFt;if(t.type!=='pole'){const nx=Math.min(1,Math.abs(x)/hw);return e+(peak-e)*Math.pow(1-nx,1.16)}const ps=peakPoints(t);let best=0;for(const q of ps){const bayHalf=Math.max(8,ps.length>1?t.lengthFt/(ps.length*1.85):hl);const dx=Math.abs(x-q.x)/hw,dz=Math.abs(z-q.y)/bayHalf,r=Math.min(1,Math.sqrt(dx*dx+dz*dz));let v=Math.pow(Math.max(0,1-r),1.48);v-=.055*Math.sin(Math.PI*Math.min(1,r))*Math.sin(Math.PI*Math.min(1,Math.abs(x-q.x)/hw));best=Math.max(best,v)}let y=e+(peak-e)*Math.max(0,best);const edge=Math.max(0,Math.min(hw-Math.abs(x),hl-Math.abs(z)));const pull=THREE.MathUtils.smoothstep(edge,0,1.4);return THREE.MathUtils.lerp(e,y,pull)}
function makeRoof(t,p,vinyl){const segX=Math.max(40,Math.round(t.widthFt*2)),segZ=Math.max(40,Math.round(t.lengthFt*1.5));const g=new THREE.PlaneGeometry(t.widthFt,t.lengthFt,segX,segZ),a=g.attributes.position;for(let i=0;i<a.count;i++)a.setZ(i,membraneHeight(t,p,a.getX(i),a.getY(i)));g.rotateX(-Math.PI/2);g.computeVertexNormals();const m=new THREE.MeshPhysicalMaterial({color:0xfffdf8,map:vinyl,roughness:.58,metalness:0,clearcoat:.08,clearcoatRoughness:.7,side:THREE.DoubleSide});const q=new THREE.Mesh(g,m);q.castShadow=q.receiveShadow=true;q.userData.buildStage='roof';return q}
function makeTent(t,anchor){const p=structuralProfile(t.type,t.widthFt,t.lengthFt),g=new THREE.Group(),hw=t.widthFt/2,hl=t.lengthFt/2,vinyl=vinylTexture();g.userData.kind='tent';const roof=makeRoof(t,p,vinyl);g.add(roof);const steel=new THREE.MeshStandardMaterial({color:0xb8bec3,roughness:.24,metalness:.82}),black=new THREE.MeshStandardMaterial({color:0x303236,roughness:.62}),strap=new THREE.MeshStandardMaterial({color:0xe5dfd0,roughness:.92}),val=new THREE.MeshPhysicalMaterial({color:0xfffdf8,map:vinyl,roughness:.65,side:THREE.DoubleSide});const stations=computePerimeterStations(t.widthFt,t.lengthFt).map(s=>[s.x-hw,s.y-hl]);stations.forEach(([x,z])=>{const pole=cyl(p.sidePoleDiameterFt/2,p.eaveHeightFt,steel,16);pole.position.set(x,p.eaveHeightFt/2,z);pole.castShadow=true;pole.userData.buildStage='frame';g.add(pole);const foot=cyl(.15,.035,black,16);foot.position.set(x,.018,z);g.add(foot)});if(t.type==='pole')peakPoints(t).forEach(q=>{const cp=cyl(p.centerPoleDiameterFt/2,p.peakHeightFt+.12,steel,20);cp.position.set(q.x,(p.peakHeightFt+.12)/2,q.y);cp.castShadow=true;cp.userData.buildStage='frame';g.add(cp);const cap=cyl(.13,.12,steel,20);cap.position.set(q.x,p.peakHeightFt+.12,q.y);g.add(cap)});const drop=p.valanceDropFt;[[0,-hl,t.widthFt,.045],[0,hl,t.widthFt,.045],[-hw,0,.045,t.lengthFt],[hw,0,.045,t.lengthFt]].forEach(v=>{const q=box(v[2],drop,v[3],val);q.position.set(v[0],p.eaveHeightFt-drop/2,v[1]);q.castShadow=true;q.userData.buildStage='valance';g.add(q)});const seamMat=new THREE.MeshStandardMaterial({color:0xd6d2c8,roughness:.72});for(let x=-hw+10;x<hw-.1;x+=10){const pts=[];for(let z=-hl;z<=hl+.01;z+=1)pts.push(new THREE.Vector3(x,membraneHeight(t,p,x,z)+.015,z));const seam=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),Math.max(12,pts.length),.018,5,false),seamMat);g.add(seam)}if(t.type!=='pole'){for(let z=-hl;z<=hl+.01;z+=Math.min(10,t.lengthFt)){for(const side of [-1,1]){g.add(tube(new THREE.Vector3(side*hw,p.eaveHeightFt,z),new THREE.Vector3(0,p.peakHeightFt,z),.065,steel));}g.add(tube(new THREE.Vector3(-hw,p.eaveHeightFt,z),new THREE.Vector3(hw,p.eaveHeightFt,z),.04,steel));}g.add(tube(new THREE.Vector3(0,p.peakHeightFt,-hl),new THREE.Vector3(0,p.peakHeightFt,hl),.065,steel));}if(anchor==='ballast'){const ballast=new THREE.MeshStandardMaterial({color:0xd4d0c7,roughness:.95});stations.forEach(([x,z])=>{const bx=x+Math.sign(x)*.85,bz=z+Math.sign(z)*.85;const weight=box(1.1,1.5,1.1,ballast);weight.position.set(bx,.75,bz);weight.castShadow=weight.receiveShadow=true;g.add(weight);g.add(tube(new THREE.Vector3(x,p.eaveHeightFt-.1,z),new THREE.Vector3(bx,1.45,bz),.018,strap,8));});}if(anchor==='stake'){const c=t.installationClearanceFt||p.stakeClearanceFt;stations.forEach(([x,z])=>{const edgeX=Math.abs(x)>hw-.1,edgeZ=Math.abs(z)>hl-.1;if(!edgeX&&!edgeZ)return;const anchors=edgeX&&edgeZ?[[x+Math.sign(x)*c,z],[x,z+Math.sign(z)*c]]:[[x+(edgeX?Math.sign(x)*c:0),z+(edgeZ?Math.sign(z)*c:0)]];anchors.forEach(([ox,oz])=>{const a=new THREE.Vector3(x,p.eaveHeightFt-.08,z),b=new THREE.Vector3(ox,.12,oz);const s=tube(a,b,.018,strap,8);s.castShadow=true;s.userData.buildStage='stakes';g.add(s);const stake=cyl(.025,.7,black,8);stake.position.set(ox,.08,oz);stake.rotation.z=.18;g.add(stake);const rat=box(.2,.12,.08,steel);rat.position.copy(a.clone().lerp(b,.58));rat.lookAt(b);g.add(rat);})})}return g}
function chair(def={}){const g=new THREE.Group(),w=def.seatWidthFt||1.5,d=def.seatDepthFt||1.5,h=def.backHeightFt||2.6,frame=new THREE.MeshStandardMaterial({color:def.frameColor||'#f2f1ec',roughness:.5}),seatMat=new THREE.MeshStandardMaterial({color:def.accentColor||def.frameColor||'#f2f1ec',roughness:.65});const seat=box(w,.11,d,seatMat);seat.position.y=1.45;g.add(seat);const back=box(w,h-1.5,.10,frame);back.position.set(0,1.5+(h-1.5)/2,-d/2+.05);g.add(back);if(def.silhouette==='chiavari'){back.scale.y=.2;back.position.y=h-.1;for(let x=-1;x<=1;x++){const spindle=cyl(.035,h-1.55,frame,8);spindle.position.set(x*w*.3,1.55+(h-1.55)/2,-d/2+.05);g.add(spindle)}}for(const x of [-w*.4,w*.4])for(const z of [-d*.4,d*.4]){const leg=cyl(.04,1.42,frame,10);leg.position.set(x,.71,z);g.add(leg)}g.traverse(o=>{if(o.isMesh)o.castShadow=true});return g}
function table(o){const g=new THREE.Group(),w=o.widthFt||5,d=o.depthFt||5,h=2.5,round=o.shape==='round'||Math.abs(w-d)<.2,hasLinen=!!(o.linenId||o.linenColor),c=linenColorHex(o.linenColor||o.color||'White'),linen=new THREE.MeshPhysicalMaterial({color:c,map:linenTexture(),roughness:.86,sheen:1,sheenRoughness:.9}),wood=new THREE.MeshStandardMaterial({color:0x9b6a43,roughness:.68}),metal=new THREE.MeshStandardMaterial({color:0x9da2a5,roughness:.3,metalness:.72});if(round){const r=w/2;if(hasLinen){const skirt=new THREE.Mesh(new THREE.CylinderGeometry(r,r*.92,h-.06,48,8,true),linen);skirt.position.y=(h-.06)/2;g.add(skirt)}else{const leg=cyl(.075,h-.08,metal,14);leg.position.y=(h-.08)/2;g.add(leg)}const top=cyl(r,.08,hasLinen?linen:wood,48);top.position.y=h;g.add(top)}else{if(hasLinen){const skirt=box(w,h-.04,d,linen);skirt.position.y=(h-.04)/2;g.add(skirt)}else{const top=box(w,.09,d,wood);top.position.y=h;g.add(top);[[w/2-.15,d/2-.15],[-w/2+.15,d/2-.15],[w/2-.15,-d/2+.15],[-w/2+.15,-d/2+.15]].forEach(([x,z])=>{const l=box(.08,h,.08,metal);l.position.set(x,h/2,z);g.add(l)})}}const chairDef=chairById(o.chairId)||{};for(const p of chairPositions(o,chairDef)){const q=chair(chairDef);q.position.set(p.x,0,p.y);q.rotation.y=-p.angle-Math.PI/2;g.add(q)}g.userData={itemId:o.id,kind:'table'};g.traverse(q=>{if(q.isMesh){q.castShadow=true;q.receiveShadow=true}q.userData.itemId=o.id});return g}
function dance(items,t){if(!items.length)return null;let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const o of items){minX=Math.min(minX,o.x);minY=Math.min(minY,o.y);maxX=Math.max(maxX,o.x+o.widthFt);maxY=Math.max(maxY,o.y+o.depthFt)}const w=maxX-minX,d=maxY-minY,g=new THREE.Group(),base=box(w,.1,d,new THREE.MeshStandardMaterial({color:0x3d3027,roughness:.55}));base.position.y=.05;g.add(base);const light=new THREE.MeshStandardMaterial({color:0xc99558,roughness:.45}),dark=new THREE.MeshStandardMaterial({color:0x81522e,roughness:.5});for(let x=-w/2;x<w/2;x+=3)for(let z=-d/2;z<d/2;z+=3){const pw=Math.min(3,w-(x+w/2)),pd=Math.min(3,d-(z+d/2)),q=box(pw-.025,.045,pd-.025,((Math.round(x/3)+Math.round(z/3))&1)?dark:light);q.position.set(x+pw/2,.125,z+pd/2);q.receiveShadow=true;g.add(q)}g.position.set((minX+maxX)/2-t.widthFt/2,0,(minY+maxY)/2-t.lengthFt/2);g.userData={kind:'danceGroup',itemIds:items.map(o=>o.id)};g.traverse(q=>{q.userData.kind='danceGroup';q.userData.itemIds=g.userData.itemIds});return g}
function sky(night){const c=document.createElement('canvas');c.width=8;c.height=256;const x=c.getContext('2d'),gr=x.createLinearGradient(0,0,0,256);if(night){gr.addColorStop(0,'#07101e');gr.addColorStop(.55,'#16263d');gr.addColorStop(1,'#334257')}else{gr.addColorStop(0,'#79b5df');gr.addColorStop(.5,'#c5e1ef');gr.addColorStop(1,'#edf2e8')}x.fillStyle=gr;x.fillRect(0,0,8,256);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}
function lighting(tent, id) {
  const option=lightingById(id),group=new THREE.Group();
  if(!option||option.visual==='none')return group;
  const profile=structuralProfile(tent.type,tent.widthFt,tent.lengthFt);
  const wire=new THREE.MeshStandardMaterial({color:0x383d35,roughness:.8});
  const bulb=new THREE.MeshStandardMaterial({color:0xffedcb,emissive:0xffc77a,emissiveIntensity:1.4,roughness:.4});
  const h=profile.eaveHeightFt-.45,hw=tent.widthFt/2,hl=tent.lengthFt/2;
  const lines=option.visual==='bistro-cross-runs'?profile.lighting.bistro:profile.lighting.perimeter;
  if(option.visual==='chandelier'){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.8,.045,8,24),wire);ring.rotation.x=Math.PI/2;ring.position.y=h;group.add(ring);
    for(let i=0;i<8;i++){const a=i*Math.PI/4,q=new THREE.Mesh(new THREE.SphereGeometry(.13,8,6),bulb);q.position.set(Math.cos(a)*.8,h,Math.sin(a)*.8);group.add(q);}
    group.add(tube(new THREE.Vector3(0,h,0),new THREE.Vector3(0,profile.peakHeightFt-.2,0),.025,wire));
  }else if(option.visual.startsWith('uplight')){
    const count=option.visual==='uplight-single'?1:12;
    for(let i=0;i<count;i++){const a=i/count*Math.PI*2,x=Math.cos(a)*(hw-.5),z=Math.sin(a)*(hl-.5),q=box(.5,.65,.5,wire);q.position.set(x,.325,z);group.add(q);const lamp=new THREE.Mesh(new THREE.CircleGeometry(.22,12),bulb);lamp.rotation.x=-Math.PI/2;lamp.position.set(x,.66,z);group.add(lamp);}
  }else{
    lines.forEach(line=>{
      const a=new THREE.Vector3(line.from.x-hw,h,line.from.y-hl),b=new THREE.Vector3(line.to.x-hw,h,line.to.y-hl),pts=[];
      for(let i=0;i<=24;i++){const f=i/24,p=a.clone().lerp(b,f);p.y-=Math.sin(f*Math.PI)*.45;pts.push(p);}
      group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),24,.014,5,false),wire));
      const count=Math.max(2,Math.ceil(a.distanceTo(b)/2.5));
      for(let i=0;i<=count;i++){const f=i/count,p=a.clone().lerp(b,f);p.y-=Math.sin(f*Math.PI)*.45+.12;const q=new THREE.Mesh(new THREE.SphereGeometry(.075,8,6),bulb);q.position.copy(p);group.add(q);}
    });
  }
  const glow=new THREE.PointLight(0xffd19a,0,Math.max(tent.widthFt,tent.lengthFt)*1.5,1.3);glow.position.set(0,h-1,0);group.add(glow);
  group.userData.setNight=value=>{glow.intensity=value?65:0;bulb.emissiveIntensity=value?3:1.4;};
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
  let environmentKey='',structureKey='',furnitureKey='',lightingKey='',dirty=true,destroyed=false;
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
  function frame(t){const p=structuralProfile(t.type,t.widthFt,t.lengthFt),anchor=state?.anchoringMethod||(t.type==='pole'?'stake':'ballast'),f=fitTentCamera(t,p.peakHeightFt,camera.aspect,camera.fov,anchor==='stake'?(t.installationClearanceFt||5):2);camera.position.set(...f.position);controls.target.set(...f.target);controls.update();invalidate();}
  function rebuild(data){
    if(!data?.tent||destroyed)return;
    const previous=state?.tent,changed=!previous||previous.id!==data.tent.id||previous.widthFt!==data.tent.widthFt||previous.lengthFt!==data.tent.lengthFt;
    state={...data,objects:(data.objects||[]).map(o=>({...o}))};const t=state.tent;
    const setting=sceneSetting(t,state.surfaceType),nextEnvironment=[setting,t.widthFt,t.lengthFt].join(':');
    if(nextEnvironment!==environmentKey){if(environment){scene.remove(environment);disposeGroup(environment);}environment=createEnvironment(t,state.surfaceType);environment.userData.setNight(night);scene.add(environment);environmentKey=nextEnvironment;}
    const anchor=state.anchoringMethod||(t.type==='pole'?'stake':setting==='driveway'?'ballast':'stake');
    const nextStructure=JSON.stringify([t.id,t.type,t.widthFt,t.lengthFt,t.centerPoles,anchor]);
    if(nextStructure!==structureKey){disposeGroup(structure);structure.add(makeTent(t,anchor));structureKey=nextStructure;shadows(t);}
    const nextFurniture=JSON.stringify([t.widthFt,t.lengthFt,state.objects]);
    if(nextFurniture!==furnitureKey){
      disposeGroup(furniture);rendered.clear();const df=[];
      for(const o of state.objects){if(o.kind==='dance'){df.push(o);continue;}if(o.kind!=='table')continue;const q=table(o);q.position.set(o.x+o.widthFt/2-t.widthFt/2,0,o.y+o.depthFt/2-t.lengthFt/2);furniture.add(q);rendered.set(o.id,q);}
      danceMesh=dance(df,t);if(danceMesh)furniture.add(danceMesh);furnitureKey=nextFurniture;renderer.shadowMap.needsUpdate=true;
    }
    const nextLighting=[state.lightingId,t.id,t.widthFt,t.lengthFt].join(':');
    if(nextLighting!==lightingKey){if(lightGroup){scene.remove(lightGroup);disposeGroup(lightGroup);}lightGroup=lighting(t,state.lightingId);lightGroup.userData.setNight?.(night);scene.add(lightGroup);lightingKey=nextLighting;}
    const selected=rendered.get(state.selectedId)||(danceMesh?.userData.itemIds.includes(state.selectedId)?danceMesh:null);
    selection.visible=!!selected;if(selected)selection.box.setFromObject(selected).expandByScalar(.12);
    if(changed)frame(t);invalidate();
  }
  function resize(){const w=Math.max(1,container.clientWidth||800),h=Math.max(1,container.clientHeight||600),aspect=w/h,changed=Math.abs(camera.aspect-aspect)>.01;camera.aspect=aspect;camera.updateProjectionMatrix();renderer.setSize(w,h,false);if(changed&&state?.tent)frame(state.tent);invalidate();}
  function pointerRay(e){const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1);raycaster.setFromCamera(pointer,camera);return raycaster;}
  function groundPoint(e){const v=new THREE.Vector3();return pointerRay(e).ray.intersectPlane(groundPlane,v)?v:null;}
  function hit(e){pointerRay(e);return raycaster.intersectObjects(furniture.children,true).find(h=>h.object.userData.itemId||h.object.userData.kind==='danceGroup');}
  function down(e){
    if(e.button!==undefined&&e.button!==0)return;
    pointers.add(e.pointerId);
    if(pointers.size>1){if(drag){const originals=drag.kind==='item'?[drag.orig]:drag.orig;state.objects=state.objects.map(o=>({...o,...originals.find(a=>a.id===o.id)}));furnitureKey='';}drag=null;controls.enableRotate=controls.enablePan=true;rebuild(state);return;}
    const h=hit(e),point=groundPoint(e);if(!h||!point||!state)return;
    const u=h.object.userData;
    // Select first; dragging an already selected item avoids stealing one-finger orbit.
    const id=u.itemId||u.itemIds?.[0];
    if(state.selectedId!==id){callbacks.onSelect?.(id);return;}
    if(u.kind==='danceGroup')drag={kind:'dance',ids:u.itemIds,start:point.clone(),orig:state.objects.filter(o=>u.itemIds.includes(o.id)).map(o=>({...o})),mesh:danceMesh.position.clone()};
    else{const o=state.objects.find(x=>x.id===id);if(!o)return;drag={kind:'item',id,start:point.clone(),orig:{...o}};}
    controls.enableRotate=controls.enablePan=false;renderer.domElement.setPointerCapture?.(e.pointerId);
  }
  function move(e){
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
    pointers.delete(e.pointerId);if(!drag)return;const finished=drag;drag=null;controls.enableRotate=controls.enablePan=true;
    if(finished.kind==='item'){const o=state.objects.find(x=>x.id===finished.id);if(o)callbacks.onMove?.(o.id,o.x,o.y);}
    else{const updates=state.objects.filter(o=>finished.ids.includes(o.id)).map(o=>({id:o.id,x:o.x,y:o.y}));updates.forEach(o=>callbacks.onMove?.(o.id,o.x,o.y));}
    try{renderer.domElement.releasePointerCapture?.(e.pointerId);}catch{}
  }
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',up);
  const ro=new ResizeObserver(resize);ro.observe(container);resize();
  function loop(){if(destroyed)return;raf=requestAnimationFrame(loop);controls.update();if(dirty&&container.clientWidth&&container.clientHeight&&!document.hidden){renderer.render(scene,camera);dirty=false;}}
  loop();document.addEventListener('visibilitychange',invalidate);
  function setNight(value){night=!!value;scene.background?.dispose?.();scene.background=sky(night);scene.fog.color.set(night?0x203044:0xdde8df);hemi.intensity=night?.4:1.65;sun.intensity=night?.15:3.2;fill.intensity=night?.2:.55;renderer.toneMappingExposure=night?.9:1.05;environment?.userData.setNight(night);lightGroup?.userData.setNight?.(night);renderer.shadowMap.needsUpdate=true;invalidate();}
  function fitCamera(){if(state?.tent){frame(state.tent);return true;}return false;}
  const api={rebuild,update:rebuild,fitCamera,fitTentPreview:fitCamera,night:setNight,playTimelapse(){fitCamera();},destroy(){destroyed=true;cancelAnimationFrame(raf);ro.disconnect();document.removeEventListener('visibilitychange',invalidate);controls.dispose();disposeGroup(structure);disposeGroup(furniture);if(environment)disposeGroup(environment);if(lightGroup)disposeGroup(lightGroup);selection.geometry.dispose();selection.material.dispose();scene.background?.dispose?.();sun.shadow.dispose();renderer.dispose();env.dispose();container.replaceChildren();}};
  active=api;return api;
}
export function update(s){active?.rebuild(s);}
export function rebuild(s){active?.rebuild(s);}
export function fitCamera(){active?.fitCamera();}
export function fitTentPreview(){active?.fitCamera();}
export function night(v){active?.night(v);}
export function playTimelapse(mode){active?.playTimelapse(mode);}
