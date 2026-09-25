import { createInflatable, createInflatableActivity } from './inflatable3d.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeTable as table, makeStandaloneChair, makeDanceFloor as dance, mergeParts } from './equipment3d.js';
import { createEnvironment, createPhotoEnvironment, disposeGroup } from './scene-environment.js';
import { createPhotoWorld360 } from './photo-world360.js';
import { createFirstPersonWalk } from './first-person-walk.js';
import { createWeather } from './scene-weather.js';
import { createGuests } from './scene-guests.js';
import { createPartyStyling } from './party-styling.js';
import { sceneSetting } from './scene-setting.js';
import { byId as lightingById } from '../data/lighting.js';
import { fitTentCamera } from './view3d-framing.js';
import { createMarketingDetails } from './marketing-details.js';
import { structuralProfile, computePerimeterStations } from '../data/tentStructure.js';
import { normalizePhotoCalibration, normalizePhotoGeometry, photoCameraEstimate } from '../core/photo-geometry.js';
import { measureWorldPoints } from '../core/measurement.js';

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
  const furniture=new THREE.Group(),structure=new THREE.Group(),photoStage=new THREE.Group(),photoContinuation=new THREE.Group(),local360=new THREE.Group(),measurementGroup=new THREE.Group();photoStage.name='Photo 360 stage';photoContinuation.name='Smart 360 continuation';local360.name='Local Smart 360 synthesis';photoStage.visible=false;photoContinuation.visible=false;local360.visible=false;measurementGroup.name='3D measurements';scene.add(photoContinuation,local360,photoStage,structure,furniture,measurementGroup);
  const rendered=new Map(),pointers=new Set();let state=null,night=false,raf=0,drag=null,danceMesh=null,environment=null,lightGroup=null;
  let inflatableActivity=null,styling=null,showStyling=true,stylingKey='',cameraMode='outside';
  let weather=null,guests=null,ghost=new THREE.Group(),ghostKey='',guestKey='',weatherMode='clear',motion=true,showGuests=false,placementPointer=null,lastTime=0,animationTime=0;scene.add(ghost);
  const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let environmentKey='',structureKey='',furnitureKey='',lightingKey='',photoCameraKey='',photoStageKey='',photoContinuationKey='',local360Key='',photoStageTexture=null,dirty=true,destroyed=false,animationFrame=0,itemAnimationFrame=0,chairAnimationFrame=0,cameraAnimationFrame=0;
  const photoCanvas=document.createElement('canvas'),photoCtx=photoCanvas.getContext('2d',{alpha:false}),photoTexture=new THREE.CanvasTexture(photoCanvas);
  photoTexture.colorSpace=THREE.SRGBColorSpace;photoTexture.minFilter=THREE.LinearFilter;photoTexture.magFilter=THREE.LinearFilter;
  let photoImage=null,photoUrl='',photoLoadSeq=0;
  let marketingFootprint=null,marketingDetails=null;
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04);
  scene.environment=env.texture;room.dispose();pmrem.dispose();
  const hemi=new THREE.HemisphereLight(0xeaf6ff,0x667052,1.65);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xfff3df,3.2);sun.position.set(-35,48,28);sun.castShadow=true;
  sun.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048);sun.shadow.bias=-.00015;sun.shadow.normalBias=.04;scene.add(sun);
  const fill=new THREE.DirectionalLight(0xcde3ff,.55);fill.position.set(30,18,-25);scene.add(fill);
  const selection=new THREE.Box3Helper(new THREE.Box3(),0x43775a);selection.visible=false;scene.add(selection);
  function invalidate(){dirty=true;}
  function hasVenuePhoto(){return !!(state?.backgroundPhoto&&/^https?:\/\//i.test(state.backgroundPhoto.url||''));}
  const walk=createFirstPersonWalk({
    camera,controls,domElement:renderer.domElement,container,mobile,
    getSite:()=>state?.photoSite||state?.tent||{widthFt:50,lengthFt:60},
    getObstacles:()=>state?.photoGeometry||[],
    getItems:()=>state?(state.objects||[]).map(o=>({...o,...photoPlacementFor(o)})):[],
    onChange:invalidate,
    onMode:value=>callbacks.onWalkMode?.(value)
  });
  function clearPhotoStage(){
    const geometries=new Set(),materials=new Set();
    photoStage.traverse(o=>{
      if(o.geometry)geometries.add(o.geometry);
      (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean).forEach(m=>materials.add(m));
    });
    photoStage.clear();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
    if(photoStageTexture){photoStageTexture.dispose();photoStageTexture=null;}
    photoStageKey='';
  }
  function photoUv(p){return [Math.max(0,Math.min(1,Number(p?.x)||0)),1-Math.max(0,Math.min(1,Number(p?.y)||0))];}
  function photoQuad(name,positions,uvs,material){
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();
    const mesh=new THREE.Mesh(g,material);mesh.name=name;return mesh;
  }
  function rebuildPhotoStage(){
    if(!hasVenuePhoto()||!photoImage||!state?.photoSite||!state?.photoCalibration){clearPhotoStage();return false;}
    const site=state.photoSite,cal=normalizePhotoCalibration(state.photoCalibration,site),key=JSON.stringify([photoUrl,site.widthFt,site.lengthFt,cal]);
    if(key===photoStageKey&&photoStage.children.length)return true;
    clearPhotoStage();photoStageKey=key;
    const tex=new THREE.Texture(photoImage);tex.needsUpdate=true;tex.colorSpace=THREE.SRGBColorSpace;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;photoStageTexture=tex;
    const w=Math.max(1,Number(site.widthFt)||50),l=Math.max(1,Number(site.lengthFt)||60),fl=photoUv(cal.frontLeft),fr=photoUv(cal.frontRight),br=photoUv(cal.backRight),bl=photoUv(cal.backLeft);
    const groundMat=new THREE.MeshStandardMaterial({map:tex,roughness:1,metalness:0,side:THREE.DoubleSide,transparent:true,opacity:1,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
    const ground=photoQuad('Photo ground projection',[-w/2,-.04,-l/2,w/2,-.04,-l/2,w/2,-.04,l/2,-w/2,-.04,l/2],[...fl,...fr,...br,...bl],groundMat);
    ground.receiveShadow=true;ground.userData.photoEvidenceGround=true;ground.userData.baseOpacity=1;photoStage.add(ground);
    const estimate=photoCameraEstimate(site,cal),h=Math.max(18,Math.min(70,Math.max(l*.42,estimate.position[1]*1.3)));
    const backMat=new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide,transparent:true,opacity:.98,depthWrite:true});
    const backdrop=photoQuad('Photo backdrop projection',[-w/2,0,l/2+.02,w/2,0,l/2+.02,w/2,h,l/2+.02,-w/2,h,l/2+.02],[...bl,...br,br[0],1,bl[0],1],backMat);
    backdrop.receiveShadow=false;backdrop.userData.photoEvidenceBackdrop=true;backdrop.userData.baseOpacity=.98;photoStage.add(backdrop);
    photoStage.userData={mode:'single-photo-2.5d',calibration:cal,coverage:'visible-ground-and-rear-view'};
    return true;
  }
  function updatePhotoStageViewFade(){
    if(!photoStage.visible||!state?.photoSite||!state?.photoCalibration)return;
    const estimate=photoCameraEstimate(state.photoSite,state.photoCalibration);
    const reference=new THREE.Vector3(...estimate.position).sub(new THREE.Vector3(...estimate.target)).normalize();
    const current=camera.position.clone().sub(new THREE.Vector3(...estimate.target)).normalize();
    const alignment=THREE.MathUtils.clamp(reference.dot(current),-1,1);
    // Keep the real photo dominant near the original calibrated camera direction.
    // Fade it only as the user leaves the direction that was actually photographed.
    const confidence=THREE.MathUtils.smoothstep(alignment,.20,.94);
    for(const evidence of photoStage.children){
      if(!evidence.userData?.photoEvidenceBackdrop&&!evidence.userData?.photoEvidenceGround)continue;
      const base=evidence.userData.baseOpacity??1;
      const k=evidence.userData.photoEvidenceGround?Math.pow(confidence,1.25):confidence;
      if(evidence.material)evidence.material.opacity=base*k;
      evidence.visible=k>.018;
    }
  }
  function syncPhotoFog(){
    const photo=hasVenuePhoto(),immersive=photo&&(cameraMode==='photo360'||cameraMode==='walk');
    scene.fog.color.set(night?0x203044:weatherMode==='rain'?0x9eafb5:0xdde8df);
    scene.fog.density=photo
      ? (immersive?(weatherMode==='rain'?.0020:.00105):(weatherMode==='rain'?.0012:.00015))
      : (weatherMode==='rain'?.004:.002);
  }
  function clearLocal360(){
    const geometries=new Set(),materials=new Set(),textures=new Set();
    local360.traverse(o=>{
      if(o.geometry)geometries.add(o.geometry);
      (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean).forEach(m=>{
        materials.add(m);
        if(m.map)textures.add(m.map);
      });
    });
    local360.clear();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());local360Key='';
  }
  function rgbCss(c){return 'rgb('+Math.round(c[0])+','+Math.round(c[1])+','+Math.round(c[2])+')';}
  function mixRgb(a,b,t){return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
  function sampleLocal360Style(){
    const fallback={sky:[142,190,219],sky2:[207,226,234],ground:[68,102,55],ground2:[104,127,82],structure:[112,118,112],left:[78,95,72],right:[78,95,72],green:true};
    if(!photoImage)return fallback;
    try{
      const c=document.createElement('canvas'),w=96,h=72;c.width=w;c.height=h;
      const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(photoImage,0,0,w,h);
      const image=x.getImageData?.(0,0,w,h),data=image?.data;if(!data||!data.length)return fallback;
      const avg=(x0,y0,x1,y1)=>{
        x0=Math.max(0,Math.floor(x0*w));x1=Math.min(w,Math.ceil(x1*w));
        y0=Math.max(0,Math.floor(y0*h));y1=Math.min(h,Math.ceil(y1*h));
        let r=0,g=0,b=0,n=0;
        for(let yy=y0;yy<y1;yy+=2)for(let xx=x0;xx<x1;xx+=2){const i=(yy*w+xx)*4,a=data[i+3]/255;if(a<.2)continue;r+=data[i]*a;g+=data[i+1]*a;b+=data[i+2]*a;n+=a;}
        return n?[r/n,g/n,b/n]:[120,130,120];
      };
      const horizon=Math.max(.18,Math.min(.65,Number(state?.photoCalibration?.horizonY)||.34));
      const sky=avg(.1,.02,.9,Math.max(.12,horizon*.58)),sky2=avg(.05,Math.max(.08,horizon*.45),.95,Math.max(.18,horizon*.95));
      const ground=avg(.08,.72,.92,.98),ground2=avg(.08,Math.min(.62,horizon+.17),.92,.78);
      const structure=avg(.18,Math.max(.18,horizon*.9),.82,.62),left=avg(0,.18,.14,.78),right=avg(.86,.18,1,.78);
      const green=ground[1]>ground[0]*1.05&&ground[1]>ground[2]*1.08;
      return {sky,sky2,ground,ground2,structure,left,right,green};
    }catch(_){return fallback;}
  }
  function makeLocal360Canvas(side,style){
    const c=document.createElement('canvas'),w=mobile?384:640,h=mobile?320:480;c.width=w;c.height=h;const x=c.getContext('2d');
    const horizon=Math.round(h*.48);
    const sky=x.createLinearGradient(0,0,0,horizon);sky.addColorStop(0,rgbCss(mixRgb(style.sky,[255,255,255],.12)));sky.addColorStop(1,rgbCss(style.sky2));x.fillStyle=sky;x.fillRect(0,0,w,horizon+4);
    const ground=x.createLinearGradient(0,horizon,0,h);ground.addColorStop(0,rgbCss(style.ground2));ground.addColorStop(1,rgbCss(mixRgb(style.ground,[20,30,18],.12)));x.fillStyle=ground;x.fillRect(0,horizon,w,h-horizon);
    // Copy a narrow real edge into the nearest part of each side wall, then blur/fade it.
    if(photoImage){
      const iw=photoImage.naturalWidth||photoImage.width,ih=photoImage.naturalHeight||photoImage.height,strip=Math.max(8,Math.round(iw*.16));
      const sx=side==='left'?0:side==='right'?Math.max(0,iw-strip):Math.max(0,Math.round((iw-strip)/2));
      x.save();x.globalAlpha=.44;x.filter='blur(2px) saturate(.92)';
      for(let i=0;i<4;i++){
        const segW=w*.18,dx=side==='left'?w-i*segW-segW:side==='right'?i*segW:(i%2?0:w-segW);
        x.globalAlpha=.38-i*.065;
        x.drawImage(photoImage,sx,0,strip,ih,dx,0,segW,h);
      }
      x.restore();
    }
    // Horizon/fence continuation.
    x.fillStyle='rgba('+Math.round(style.structure[0])+','+Math.round(style.structure[1])+','+Math.round(style.structure[2])+',.55)';
    const fenceY=horizon+Math.round(h*.055);
    x.fillRect(0,fenceY,w,Math.max(3,Math.round(h*.018)));
    for(let px=12;px<w;px+=32){x.fillRect(px,fenceY-Math.round(h*.07),5,Math.round(h*.14));}
    // Local deterministic foliage/structure silhouettes based on the sampled photo palette.
    const seed=side==='left'?13:side==='right'?29:47;
    for(let i=0;i<8;i++){
      const px=((i*97+seed*31)%w),r=18+((i*13+seed)%24),py=fenceY-r*.65;
      x.fillStyle='rgba('+Math.round(style.green?style.ground[0]*.75:style.left[0])+','+Math.round(style.green?style.ground[1]*.72:style.left[1])+','+Math.round(style.green?style.ground[2]*.68:style.left[2])+',.82)';
      x.beginPath();x.arc(px,py,r,0,Math.PI*2);x.fill();
      x.fillStyle='rgba(80,66,49,.7)';x.fillRect(px-3,py+r*.55,6,Math.max(8,r*.9));
    }
    // Subtle texture/noise so the continuation does not look like a flat solid wall.
    for(let yy=horizon;yy<h;yy+=6)for(let xx=0;xx<w;xx+=7){
      const n=((xx*17+yy*31+seed*19)%23)/23,base=style.ground;
      x.fillStyle='rgba('+Math.round(base[0]*(.82+n*.25))+','+Math.round(base[1]*(.82+n*.25))+','+Math.round(base[2]*(.82+n*.25))+',.12)';
      x.fillRect(xx,yy,2,2);
    }
    return c;
  }
  function addLocal360Wall(name,canvas,width,height,x,y,z,rotY){
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;
    const mat=new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide,depthWrite:true});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),mat);mesh.name=name;mesh.position.set(x,y,z);mesh.rotation.y=rotY;local360.add(mesh);return mesh;
  }
  function rebuildLocal360(){
    if(!hasVenuePhoto()||!photoImage||!state?.photoSite){clearLocal360();return false;}
    const site=state.photoSite,cal=normalizePhotoCalibration(state.photoCalibration,site);
    const key=JSON.stringify([photoUrl,site.widthFt,site.lengthFt,state.surfaceType,cal,state.photoGeometry||[]]);
    if(key===local360Key&&local360.children.length)return true;
    clearLocal360();local360Key=key;
    const world=createPhotoWorld360({
      image:photoImage,
      site,
      calibration:cal,
      photoGeometry:state.photoGeometry||[],
      surfaceType:state.surfaceType,
      mobile
    });
    local360.add(world);
    local360.userData={...world.userData,sourcePhoto:photoUrl};
    local360.userData.setNight?.(night);
    return !!world.userData?.ready;
  }
  function syncPhotoPresentation(){
    const photo=hasVenuePhoto(),immersive=photo&&(cameraMode==='photo360'||cameraMode==='walk'),matched=photo&&cameraMode==='outside',walking=walk.isActive();
    photoStage.visible=immersive;photoContinuation.visible=false;local360.visible=immersive;
    // Matched View is an exact camera registration. Walk Mode owns the camera directly.
    controls.enabled=!matched&&!walking;
    controls.enablePan=!matched&&!walking;
    controls.enableZoom=!matched&&!walking;
    controls.enableRotate=!matched&&!walking&&!state?.placement;
    environment?.userData.setImmersive?.(immersive);
    syncPhotoFog();
    if(immersive){
      if(scene.background===photoTexture)scene.background=null;
      scene.background=sky(night,weatherMode==='rain');
    }else if(photo)paintVenuePhoto();
    else generatedBackground();
    invalidate();
  }
  function paintVenuePhoto(){
    if(!hasVenuePhoto()||!photoImage||photoUrl!==state.backgroundPhoto.url)return false;
    const p=state.backgroundPhoto,wCss=Math.max(320,container.clientWidth||800),hCss=Math.max(240,container.clientHeight||600),aspect=wCss/hCss;
    const w=Math.min(1920,Math.max(640,Math.round(wCss*(mobile?1.15:1.45)))),h=Math.max(360,Math.round(w/aspect));
    if(photoCanvas.width!==w||photoCanvas.height!==h){photoCanvas.width=w;photoCanvas.height=h;}
    const iw=photoImage.naturalWidth||photoImage.width,ih=photoImage.naturalHeight||photoImage.height;
    if(!iw||!ih)return false;
    const zoom=Math.max(1,Math.min(1.8,Number(p.zoom)||1)),scale=Math.max(w/iw,h/ih)*zoom,dw=iw*scale,dh=ih*scale;
    const fx=Math.max(0,Math.min(1,(Number(p.focusX)||50)/100)),fy=Math.max(0,Math.min(1,(Number(p.focusY)||50)/100));
    const x=-(dw-w)*fx,y=-(dh-h)*fy;
    photoCtx.fillStyle='#d8ddd8';photoCtx.fillRect(0,0,w,h);photoCtx.drawImage(photoImage,x,y,dw,dh);
    const baseShade=Math.max(0,Math.min(.45,Number(p.shade)||0)),shade=Math.min(.62,baseShade+(night?.16:0));
    if(shade>0){photoCtx.fillStyle='rgba(0,0,0,'+shade+')';photoCtx.fillRect(0,0,w,h);}
    photoTexture.needsUpdate=true;
    if(cameraMode!=='photo360'&&cameraMode!=='walk'&&scene.background!==photoTexture){if(scene.background&&scene.background!==photoTexture)scene.background.dispose?.();scene.background=photoTexture;}
    return true;
  }
  function loadVenuePhoto(photo){
    const url=photo&&/^https?:\/\//i.test(photo.url||'')?photo.url:'';
    if(!url){photoUrl='';photoImage=null;clearPhotoStage();clearLocal360();return;}
    if(url===photoUrl&&photoImage){paintVenuePhoto();rebuildPhotoStage();rebuildLocal360();syncPhotoPresentation();return;}
    photoUrl=url;photoImage=null;const seq=++photoLoadSeq,img=new Image();img.crossOrigin='anonymous';img.decoding='async';
    img.onload=function(){if(destroyed||seq!==photoLoadSeq||url!==photoUrl)return;photoImage=img;paintVenuePhoto();rebuildPhotoStage();rebuildLocal360();syncPhotoPresentation();invalidate();};
    img.onerror=function(){if(seq!==photoLoadSeq)return;console.warn('[RentSketch] venue background could not load');};
    img.src=url;
  }
  function generatedBackground(){
    if(hasVenuePhoto()&&cameraMode!=='photo360'&&cameraMode!=='walk'){paintVenuePhoto();return;}
    if(scene.background===photoTexture)scene.background=null;else scene.background?.dispose?.();
    scene.background=sky(night,weatherMode==='rain');
  }
  controls.addEventListener('change',()=>{updatePhotoStageViewFade();invalidate();});
  function shadows(t){const radius=Math.max(t.widthFt,t.lengthFt)/2+18;sun.shadow.camera.left=-radius;sun.shadow.camera.right=radius;sun.shadow.camera.top=radius;sun.shadow.camera.bottom=-radius;sun.shadow.camera.far=radius*4+120;sun.shadow.camera.updateProjectionMatrix();renderer.shadowMap.needsUpdate=true;}
  function frame(t){
    if(hasVenuePhoto()&&state?.photoCalibration&&cameraMode==='photo360'){
      const site=state.photoSite||t,r=Math.max(Math.max(20,site.widthFt),Math.max(20,site.lengthFt));
      const estimate=photoCameraEstimate(site,state.photoCalibration);
      // 360 World now begins from the same calibrated camera that matches the
      // customer's real photo. Orbiting then transitions into the reconstructed
      // side/rear world instead of immediately replacing the real venue.
      camera.fov=estimate.fov;camera.updateProjectionMatrix();
      camera.position.set(...estimate.position);controls.target.set(...estimate.target);
      controls.minDistance=5.5;controls.maxDistance=Math.max(78,Math.min(r*1.45,camera.position.distanceTo(controls.target)*1.5));
      controls.maxPolarAngle=Math.PI*.49;controls.update();syncPhotoPresentation();updatePhotoStageViewFade();invalidate();return;
    }
    if(hasVenuePhoto()&&state?.photoCalibration&&cameraMode==='outside'){
      const site=state.photoSite||t,estimate=photoCameraEstimate(site,state.photoCalibration);
      camera.fov=estimate.fov;camera.updateProjectionMatrix();
      camera.position.set(...estimate.position);controls.target.set(...estimate.target);
      controls.maxDistance=Math.max(260,camera.position.distanceTo(controls.target)*2.2);controls.update();invalidate();return;
    }
    if(t.isSite){camera.fov=42;camera.updateProjectionMatrix();const box=new THREE.Box3().setFromObject(furniture);const center=box.isEmpty()?new THREE.Vector3(0,3,0):box.getCenter(new THREE.Vector3()),size=box.isEmpty()?new THREE.Vector3(t.widthFt,10,t.lengthFt):box.getSize(new THREE.Vector3());const fit=fitTentCamera({widthFt:Math.max(8,size.x),lengthFt:Math.max(8,size.z)},Math.max(6,size.y),camera.aspect,camera.fov,2);const shift=center.clone().sub(new THREE.Vector3(...fit.target));camera.position.set(...fit.position).add(shift);controls.target.copy(center);controls.maxDistance=Math.max(260,camera.position.distanceTo(controls.target)*1.8);controls.update();invalidate();return;}if(cameraMode==='reception'){camera.fov=camera.aspect<1?65:52;camera.updateProjectionMatrix();camera.position.set(t.widthFt*.28,5.6,t.lengthFt*.46);controls.target.set(-t.widthFt*.08,2.2,-t.lengthFt*.18);controls.update();invalidate();return;}if(cameraMode==='inside'){camera.fov=50;camera.updateProjectionMatrix();const f=fitTentCamera(t,7,camera.aspect,camera.fov,0);camera.position.set(f.position[0],5.6,f.position[2]);controls.target.set(0,3.5,0);controls.update();invalidate();return;}camera.fov=36;camera.updateProjectionMatrix();const p=structuralProfile(t.type,t.widthFt,t.lengthFt),anchor=state?.anchoringMethod||(t.type==='pole'?'stake':'ballast'),f=fitTentCamera(t,p.peakHeightFt,camera.aspect,camera.fov,anchor==='stake'?(t.installationClearanceFt||5):2);camera.position.set(...f.position);controls.target.set(...f.target);controls.maxDistance=Math.max(260,camera.position.distanceTo(controls.target)*1.8);controls.update();invalidate();}
  function rebuild(data){
    if(!data?.tent||destroyed)return;
    const previous=state?.tent,changed=!previous||previous.id!==data.tent.id||previous.widthFt!==data.tent.widthFt||previous.lengthFt!==data.tent.lengthFt;
    state={...data,objects:(data.objects||[]).map(o=>({...o}))};const t=state.tent;
    state.photoSite=state.photoSite||{id:'photo-site',isSite:true,type:'photo-site',name:'Photo venue',widthFt:Math.max(50,t.widthFt+20),lengthFt:Math.max(60,t.lengthFt+20)};
    state.photoCalibration=normalizePhotoCalibration(state.photoCalibration,state.photoSite);
    state.photoGeometry=normalizePhotoGeometry(state.photoGeometry,state.photoSite);
    const setting=sceneSetting(t,state.surfaceType),photoMode=!!state.backgroundPhoto?.url,nextEnvironment=JSON.stringify([photoMode?'photo':setting,t.widthFt,t.lengthFt,state.photoSite?.widthFt,state.photoSite?.lengthFt,state.photoCalibration,state.photoGeometry]);
    state.photoMode=photoMode;
    const sceneSpace=photoMode?(state.photoSite||t):t;
    const photoTent=state.photoTentPlacement||{x:Math.max(0,(sceneSpace.widthFt-t.widthFt)/2),y:Math.max(0,(sceneSpace.lengthFt-t.lengthFt)/2),rotationDeg:0};
    const mappedObjects=photoMode?state.objects.map(o=>{
      const pp=o.photoPlacement;
      return {...o,
        x:pp&&Number.isFinite(Number(pp.x))?Number(pp.x):(t.isSite?Number(o.x||0):Number(photoTent.x||0)+Number(o.x||0)),
        y:pp&&Number.isFinite(Number(pp.y))?Number(pp.y):(t.isSite?Number(o.y||0):Number(photoTent.y||0)+Number(o.y||0)),
        rotationDeg:pp&&Number.isFinite(Number(pp.rotationDeg))?Number(pp.rotationDeg):(Number(o.rotationDeg||0)+Number(photoTent.rotationDeg||0))
      };
    }):state.objects;
    loadVenuePhoto(state.backgroundPhoto);if(photoMode&&photoImage){rebuildPhotoStage();rebuildLocal360();}
    const nextContinuationKey=photoMode?JSON.stringify([state.photoSite?.widthFt,state.photoSite?.lengthFt,state.surfaceType]):'';
    if(nextContinuationKey!==photoContinuationKey){
      // The old generic RentSketch backyard conflicted visually with the customer's
      // reconstructed photo world. Keep this group empty: the new local photo world
      // provides ground, horizon continuation and parallax layers instead.
      disposeGroup(photoContinuation);photoContinuationKey=nextContinuationKey;
      photoContinuation.userData={generatedContinuation:false,replacedBy:'photo-world360'};
    }
    if(nextEnvironment!==environmentKey){if(environment){scene.remove(environment);disposeGroup(environment);}environment=photoMode?createPhotoEnvironment(state.photoSite||t,state.photoCalibration,state.photoGeometry):createEnvironment(t,state.surfaceType);environment.userData.setNight(night);scene.add(environment);environmentKey=nextEnvironment;if(weather){scene.remove(weather);disposeGroup(weather);}weather=createWeather(t,{mobile});weather.userData.setNight(night);weather.userData.setWeather(weatherMode);weather.userData.setPhotoMode?.(photoMode);scene.add(weather);}
    else weather?.userData.setPhotoMode?.(photoMode);
    if(photoMode)syncPhotoPresentation();else generatedBackground();
    const anchor=state.anchoringMethod||(t.type==='pole'?'stake':setting==='driveway'?'ballast':'stake');
    const nextStructure=JSON.stringify([t.id,t.type,t.widthFt,t.lengthFt,t.centerPoles,anchor,state.sidewalls||[],photoMode?state.photoTentPlacement:null,photoMode?state.photoSite:null]);
    if(nextStructure!==structureKey){
      disposeGroup(structure);
      if(!t.isSite){
        const tentMesh=makeTent(t,anchor,state.sidewalls||[]);
        if(photoMode){
          const site=state.photoSite||t,tp=state.photoTentPlacement||{x:Math.max(0,(site.widthFt-t.widthFt)/2),y:Math.max(0,(site.lengthFt-t.lengthFt)/2),rotationDeg:0};
          tentMesh.position.set(Number(tp.x||0)+t.widthFt/2-site.widthFt/2,0,Number(tp.y||0)+t.lengthFt/2-site.lengthFt/2);
          tentMesh.rotation.y=-Number(tp.rotationDeg||0)*Math.PI/180;
        }
        structure.add(tentMesh);
      }
      structureKey=nextStructure;shadows(photoMode?(state.photoSite||t):t);
    }
    const nextFurniture=JSON.stringify([sceneSpace.widthFt,sceneSpace.lengthFt,mappedObjects,photoMode?state.photoTentPlacement:null]);
    if(nextFurniture!==furnitureKey){
      disposeGroup(furniture);rendered.clear();const df=[];
      for(const o of mappedObjects){
        if(o.kind==='dance'){df.push(o);continue;}
        if(!['table','inflatable','chair'].includes(o.kind))continue;
        const q=o.kind==='inflatable'?createInflatable(o):o.kind==='chair'?makeStandaloneChair(o):table(o);
        q.position.set(o.x+o.widthFt/2-sceneSpace.widthFt/2,0,o.y+o.depthFt/2-sceneSpace.lengthFt/2);
        q.rotation.y=-(Number(o.rotationDeg||0)||0)*Math.PI/180;
        furniture.add(q);rendered.set(o.id,q);
      }
      danceMesh=dance(df,sceneSpace);if(danceMesh)furniture.add(danceMesh);furnitureKey=nextFurniture;renderer.shadowMap.needsUpdate=true;
    }
    if(stylingKey!==nextFurniture){
      if(styling){scene.remove(styling);disposeGroup(styling);}
      styling=createPartyStyling(sceneSpace,mappedObjects);scene.add(styling);stylingKey=nextFurniture;
    }
    if(styling)styling.visible=showStyling&&!drag;
    const nextGuests=nextFurniture;
    if(nextGuests!==guestKey){
      if(guests){scene.remove(guests);disposeGroup(guests);}
      guests=createGuests(sceneSpace,mappedObjects,{mobile});guests.visible=showGuests;scene.add(guests);guestKey=nextGuests;
      if(inflatableActivity){scene.remove(inflatableActivity);disposeGroup(inflatableActivity);}
      inflatableActivity=createInflatableActivity(sceneSpace,mappedObjects,{mobile});scene.add(inflatableActivity);
    }
    if(guests)guests.visible=showGuests&&!drag;
    if(inflatableActivity)inflatableActivity.visible=showGuests&&!drag&&!state.placement;
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
    syncPhotoPresentation();renderer.domElement.style.cursor=data.placement?'crosshair':(photoMode&&cameraMode==='outside'?'default':'grab');
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
    const nextPhotoCameraKey=photoMode?JSON.stringify([state.photoSite,state.photoCalibration]):'';if(changed||nextPhotoCameraKey!==photoCameraKey){photoCameraKey=nextPhotoCameraKey;frame(photoMode?(state.photoSite||t):t);}invalidate();
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
  function resize(){const w=Math.max(1,container.clientWidth||800),h=Math.max(1,container.clientHeight||600),aspect=w/h,changed=Math.abs(camera.aspect-aspect)>.01;camera.aspect=aspect;camera.updateProjectionMatrix();renderer.setSize(w,h,false);if(hasVenuePhoto())paintVenuePhoto();if(changed&&state?.tent)frame(state.tent);invalidate();}
  let measureMode=false,measureA=null,measureB=null,measureResult=null;
  function makeMeasureLabel(text){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const ctx=canvas.getContext('2d');ctx.clearRect(0,0,512,128);
    ctx.fillStyle='rgba(20,31,24,.92)';ctx.beginPath();ctx.roundRect?.(10,18,492,92,22);if(ctx.roundRect)ctx.fill();else ctx.fillRect(10,18,492,92);
    ctx.fillStyle='#ffffff';ctx.font='800 44px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,64);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false});
    const sprite=new THREE.Sprite(mat);sprite.name='Measurement label';sprite.scale.set(8,2,1);return sprite;
  }
  function disposeMeasurementGroup(){
    const geometries=new Set(),materials=new Set(),textures=new Set();
    measurementGroup.traverse(o=>{if(o.geometry)geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).filter(Boolean).forEach(m=>{materials.add(m);if(m.map)textures.add(m.map);});});
    measurementGroup.clear();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
  }
  function renderMeasurement(){
    disposeMeasurementGroup();
    const markerMat=new THREE.MeshBasicMaterial({color:0xffd54f,depthTest:false});
    const addMarker=(p,name)=>{if(!p)return;const m=new THREE.Mesh(new THREE.SphereGeometry(.22,16,10),markerMat.clone());m.position.copy(p).y=.18;m.name=name;measurementGroup.add(m);};
    addMarker(measureA,'Measurement point A');addMarker(measureB,'Measurement point B');
    if(measureA&&measureB){
      const pts=[measureA.clone().setY(.14),measureB.clone().setY(.14)];
      const geo=new THREE.BufferGeometry().setFromPoints(pts),mat=new THREE.LineBasicMaterial({color:0xffd54f,depthTest:false});
      const line=new THREE.Line(geo,mat);line.name='Measurement line';line.renderOrder=50;measurementGroup.add(line);
      measureResult=measureWorldPoints({x:measureA.x,y:measureA.y,z:measureA.z},{x:measureB.x,y:measureB.y,z:measureB.z});
      const label=makeMeasureLabel(measureResult.formatted);label.position.copy(measureA).lerp(measureB,.5);label.position.y=.9;measurementGroup.add(label);
    }else measureResult=null;
    invalidate();
  }
  function clearMeasurement(){
    measureA=null;measureB=null;measureResult=null;renderMeasurement();callbacks.onMeasurement?.(null);
  }
  function setMeasureMode(value){
    const next=!!value;
    if(next&&walk.isActive())exitWalk();
    measureMode=next;
    if(measureMode){controls.enabled=false;controls.enableRotate=false;controls.enablePan=false;controls.enableZoom=false;renderer.domElement.style.cursor='crosshair';}
    else{syncPhotoPresentation();renderer.domElement.style.cursor=state?.placement?'crosshair':'grab';}
    callbacks.onMeasureMode?.(measureMode);invalidate();return measureMode;
  }
  function toggleMeasure(){return setMeasureMode(!measureMode);}
  function isMeasuring(){return measureMode;}
  function getMeasurement(){return measureResult?{...measureResult,pointA:measureA?{x:measureA.x,y:measureA.y,z:measureA.z}:null,pointB:measureB?{x:measureB.x,y:measureB.y,z:measureB.z}:null}:null;}
  function pointerRay(e){const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1);raycaster.setFromCamera(pointer,camera);return raycaster;}
  function groundPoint(e){const v=new THREE.Vector3();return pointerRay(e).ray.intersectPlane(groundPlane,v)?v:null;}
  function hit(e){pointerRay(e);return raycaster.intersectObjects(furniture.children,true).find(h=>h.object.userData.itemId||h.object.userData.kind==='danceGroup');}
  function photoPlacementFor(o){
    if(!o)return {x:0,y:0,rotationDeg:0};
    if(o.photoPlacement&&Number.isFinite(Number(o.photoPlacement.x))&&Number.isFinite(Number(o.photoPlacement.y))){
      return {x:Number(o.photoPlacement.x),y:Number(o.photoPlacement.y),rotationDeg:Number(o.photoPlacement.rotationDeg||0)||0};
    }
    const t=state.tent,site=state.photoSite||t,tp=state.photoTentPlacement||{x:Math.max(0,(site.widthFt-t.widthFt)/2),y:Math.max(0,(site.lengthFt-t.lengthFt)/2),rotationDeg:0};
    return {x:t.isSite?Number(o.x||0):Number(tp.x||0)+Number(o.x||0),y:t.isSite?Number(o.y||0):Number(tp.y||0)+Number(o.y||0),rotationDeg:Number(o.rotationDeg||0)+Number(tp.rotationDeg||0)};
  }
  function down(e){
    if(callbacks.marketingOnly)return;
    if(e.button!==undefined&&e.button!==0)return;
    if(measureMode){
      const p=groundPoint(e);if(!p)return;
      if(!measureA||measureB){measureA=p.clone();measureB=null;}else measureB=p.clone();
      renderMeasurement();callbacks.onMeasurement?.(getMeasurement());
      e.preventDefault?.();e.stopPropagation?.();return;
    }
    pointers.add(e.pointerId);
    if(pointers.size>1){
      placementPointer=null;
      if(drag){
        if(state.photoMode){
          if(drag.kind==='item'){
            const o=state.objects.find(x=>x.id===drag.id);if(o)o.photoPlacement=drag.origPhoto?{...drag.origPhoto}:o.photoPlacement;
          }else for(const a of drag.origPhoto||[]){const o=state.objects.find(x=>x.id===a.id);if(o)o.photoPlacement={x:a.x,y:a.y,rotationDeg:a.rotationDeg||0};}
        }else{
          const originals=drag.kind==='item'?[drag.orig]:drag.orig;
          state.objects=state.objects.map(o=>({...o,...originals.find(a=>a.id===o.id)}));
        }
        furnitureKey='';
      }
      drag=null;controls.enableRotate=true;rebuild(state);return;
    }
    if(state?.placement){
      placementPointer={id:e.pointerId,x:e.clientX,y:e.clientY};const p=groundPoint(e);
      const space=state.photoMode?(state.photoSite||state.tent):state.tent;
      if(p)callbacks.onPlacementMove?.(p.x+space.widthFt/2,p.z+space.lengthFt/2);return;
    }
    const h=hit(e),point=groundPoint(e);if(!h||!point||!state)return;
    const u=h.object.userData,id=u.itemId||u.itemIds?.[0];
    if(state.selectedId!==id){callbacks.onSelect?.(id);return;}
    if(u.kind==='danceGroup'){
      const originals=state.objects.filter(o=>u.itemIds.includes(o.id)).map(o=>({...o}));
      drag={kind:'dance',ids:u.itemIds,start:point.clone(),orig:originals,origPhoto:state.photoMode?originals.map(o=>({id:o.id,...photoPlacementFor(o)})):null,mesh:danceMesh.position.clone()};
    }else{
      const o=state.objects.find(x=>x.id===id);if(!o)return;
      drag={kind:'item',id,start:point.clone(),orig:{...o},origPhoto:state.photoMode?photoPlacementFor(o):null};
    }
    if(guests)guests.visible=false;if(styling)styling.visible=false;controls.enableRotate=false;renderer.domElement.setPointerCapture?.(e.pointerId);
  }
  function move(e){
    if(state?.placement&&pointers.size<2&&(e.pointerType==='mouse'||placementPointer)){
      const p=groundPoint(e),space=state.photoMode?(state.photoSite||state.tent):state.tent;
      if(p)callbacks.onPlacementMove?.(p.x+space.widthFt/2,p.z+space.lengthFt/2);return;
    }
    if(!drag||!state||pointers.size>1)return;
    const p=groundPoint(e);if(!p)return;
    const t=state.tent,space=state.photoMode?(state.photoSite||t):t,dx=p.x-drag.start.x,dz=p.z-drag.start.z;
    if(drag.kind==='item'){
      const o=state.objects.find(x=>x.id===drag.id);if(!o)return;
      if(state.photoMode){
        const a=drag.origPhoto,px=Math.max(0,Math.min(space.widthFt-o.widthFt,a.x+dx)),py=Math.max(0,Math.min(space.lengthFt-o.depthFt,a.y+dz));
        o.photoPlacement={x:px,y:py,rotationDeg:a.rotationDeg||0};
        rendered.get(o.id)?.position.set(px+o.widthFt/2-space.widthFt/2,0,py+o.depthFt/2-space.lengthFt/2);
      }else{
        const a=drag.orig;o.x=Math.max(0,Math.min(t.widthFt-a.widthFt,a.x+dx));o.y=Math.max(0,Math.min(t.lengthFt-a.depthFt,a.y+dz));
        rendered.get(o.id)?.position.set(o.x+o.widthFt/2-t.widthFt/2,0,o.y+o.depthFt/2-t.lengthFt/2);
      }
      selection.box.setFromObject(rendered.get(o.id)).expandByScalar(.12);
    }else if(state.photoMode){
      const originals=drag.origPhoto||[],minX=Math.min(...originals.map(o=>o.x)),minY=Math.min(...originals.map(o=>o.y));
      const maxX=Math.max(...originals.map(a=>{const o=state.objects.find(x=>x.id===a.id);return a.x+(o?.widthFt||0);})),maxY=Math.max(...originals.map(a=>{const o=state.objects.find(x=>x.id===a.id);return a.y+(o?.depthFt||0);}));
      const sx=Math.max(-minX,Math.min(space.widthFt-maxX,dx)),sy=Math.max(-minY,Math.min(space.lengthFt-maxY,dz));
      for(const a of originals){const o=state.objects.find(item=>item.id===a.id);if(o)o.photoPlacement={x:a.x+sx,y:a.y+sy,rotationDeg:a.rotationDeg||0};}
      danceMesh.position.set(drag.mesh.x+sx,drag.mesh.y,drag.mesh.z+sy);selection.box.setFromObject(danceMesh).expandByScalar(.12);
    }else{
      const minX=Math.min(...drag.orig.map(o=>o.x)),minY=Math.min(...drag.orig.map(o=>o.y)),maxX=Math.max(...drag.orig.map(o=>o.x+o.widthFt)),maxY=Math.max(...drag.orig.map(o=>o.y+o.depthFt));
      const x=Math.max(-minX,Math.min(t.widthFt-maxX,dx)),y=Math.max(-minY,Math.min(t.lengthFt-maxY,dz));
      for(const a of drag.orig){const o=state.objects.find(item=>item.id===a.id);o.x=a.x+x;o.y=a.y+y;}
      danceMesh.position.set(drag.mesh.x+x,drag.mesh.y,drag.mesh.z+y);selection.box.setFromObject(danceMesh).expandByScalar(.12);
    }
    renderer.shadowMap.needsUpdate=true;invalidate();
  }
  function up(e){
    pointers.delete(e.pointerId);
    if(placementPointer?.id===e.pointerId){
      placementPointer=null;
      if(e.type!=='pointercancel'){
        const p=groundPoint(e),space=state.photoMode?(state.photoSite||state.tent):state.tent;
        if(p){callbacks.onPlacementMove?.(p.x+space.widthFt/2,p.z+space.lengthFt/2);callbacks.onPlace?.();}
      }
      return;
    }
    if(!drag)return;
    const finished=drag;drag=null;
    if(guests)guests.visible=showGuests;if(inflatableActivity)inflatableActivity.visible=showGuests;if(styling)styling.visible=showStyling;controls.enableRotate=true;
    if(e.type==='pointercancel'){
      if(state.photoMode){
        if(finished.kind==='item'){
          const o=state.objects.find(x=>x.id===finished.id);if(o)o.photoPlacement=finished.origPhoto?{...finished.origPhoto}:o.photoPlacement;
        }else for(const a of finished.origPhoto||[]){const o=state.objects.find(x=>x.id===a.id);if(o)o.photoPlacement={x:a.x,y:a.y,rotationDeg:a.rotationDeg||0};}
      }else{
        const originals=finished.kind==='item'?[finished.orig]:finished.orig;
        state.objects=state.objects.map(o=>({...o,...originals.find(a=>a.id===o.id)}));
      }
      furnitureKey='';rebuild(state);return;
    }
    if(state.photoMode){
      if(finished.kind==='item'){
        const o=state.objects.find(x=>x.id===finished.id);if(o?.photoPlacement)callbacks.onPhotoMove?.(o.id,{...o.photoPlacement});
      }else{
        for(const id of finished.ids){const o=state.objects.find(x=>x.id===id);if(o?.photoPlacement)callbacks.onPhotoMove?.(o.id,{...o.photoPlacement});}
      }
    }else if(finished.kind==='item'){
      const o=state.objects.find(x=>x.id===finished.id);if(o)callbacks.onMove?.(o.id,o.x,o.y);
    }else{
      const updates=state.objects.filter(o=>finished.ids.includes(o.id)).map(o=>({id:o.id,x:o.x,y:o.y}));const first=updates[0];if(first)callbacks.onMove?.(first.id,first.x,first.y);
    }
    try{renderer.domElement.releasePointerCapture?.(e.pointerId);}catch{}
  }
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',up);
  const ro=new ResizeObserver(resize);ro.observe(container);resize();
  function loop(now=0){if(destroyed)return;raf=requestAnimationFrame(loop);const dt=Math.min(.05,Math.max(0,(now-lastTime)/1000));lastTime=now;if(walk.isActive()){if(walk.update(dt))dirty=true;}else controls.update();if(container.clientWidth&&container.clientHeight&&!document.hidden&&!document.body.classList.contains('table-studio-open')&&!document.body.classList.contains('rs-preview-expired')){if(!motion||reducedMotion||drag||state?.placement)animationTime=0;else animationTime+=dt;if(motion&&!reducedMotion&&!drag&&!state?.placement&&animationTime>=1/30){weather?.userData.update(animationTime);if(showGuests){guests?.userData.update(animationTime);inflatableActivity?.userData.update(animationTime);renderer.shadowMap.needsUpdate=true;}animationTime=0;dirty=true;}if(dirty){updatePhotoStageViewFade();renderer.render(scene,camera);dirty=false;}}}
  loop();document.addEventListener('visibilitychange',invalidate);
  function setNight(value){night=!!value;generatedBackground();syncPhotoFog();hemi.intensity=night?.7:weatherMode==='rain'?1.25:1.65;sun.intensity=night?.25:weatherMode==='rain'?.65:3.2;fill.intensity=night?.4:.7;renderer.toneMappingExposure=night?1.18:1.05;weather?.userData.setNight(night);weather?.userData.setPhotoMode?.(hasVenuePhoto());environment?.userData.setNight(night);local360.userData.setNight?.(night);lightGroup?.userData.setNight?.(night);renderer.shadowMap.needsUpdate=true;invalidate();}
  function setScene(options={}){
    showStyling=options.styling!==false;if(styling)styling.visible=showStyling;
    weatherMode=options.weather==='rain'?'rain':'clear';showGuests=!!options.guests;motion=options.motion!==false;
    weather?.userData.setWeather(weatherMode);if(guests)guests.visible=showGuests;if(inflatableActivity)inflatableActivity.visible=showGuests;
    setNight(!!options.night);invalidate();
  }
  function stopWalk(){if(walk.isActive())walk.exit();}
  function inside(){if(state?.tent){stopWalk();cameraMode='inside';syncPhotoPresentation();frame(state.tent);}}
  // An eye-level reception view for the public tour; other designer views keep their existing framing.
  function reception(){if(state?.tent){stopWalk();cameraMode='reception';syncPhotoPresentation();frame(state.tent);}}
  function fitCamera(){if(state?.tent){if(measureMode)setMeasureMode(false);stopWalk();cameraMode='outside';syncPhotoPresentation();frame(state.tent);return true;}return false;}
  function matchPhoto(){if(!state?.tent||!hasVenuePhoto())return false;if(measureMode)setMeasureMode(false);stopWalk();cameraMode='outside';syncPhotoPresentation();frame(state.photoSite||state.tent);return true;}
  function orbit360(){if(!state?.tent||!hasVenuePhoto())return false;if(measureMode)setMeasureMode(false);stopWalk();cameraMode='photo360';rebuildPhotoStage();syncPhotoPresentation();frame(state.photoSite||state.tent);return true;}
  function walkWorld(){
    if(measureMode)setMeasureMode(false);
    if(!state?.tent||!hasVenuePhoto())return false;
    cameraMode='walk';rebuildPhotoStage();syncPhotoPresentation();
    const ok=walk.enter();syncPhotoPresentation();invalidate();return ok;
  }
  function exitWalk(){
    if(!walk.isActive())return false;
    walk.exit();cameraMode='photo360';syncPhotoPresentation();invalidate();return true;
  }
  function toggleWalk(){if(walk.isActive()){exitWalk();return false;}return walkWorld();}
  function isWalking(){return walk.isActive();}
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
  function captureImage(){
    if(destroyed||!state?.tent)return null;
    try{renderer.render(scene,camera);return renderer.domElement.toDataURL('image/jpeg',.9);}catch(_){return null;}
  }
  const api={inside,reception,setScene,rebuild,update:rebuild,fitCamera,fitTentPreview:fitCamera,matchPhoto,orbit360,walkWorld,exitWalk,toggleWalk,isWalking,toggleMeasure,setMeasureMode,isMeasuring,clearMeasurement,getMeasurement,captureImage,night:setNight,playTimelapse,playItemTimelapse,playChairTimelapse,transitionCamera,setMarketingBuildStage,setMarketingProgress,destroy(){destroyed=true;walk.destroy();cancelAnimationFrame(animationFrame);cancelAnimationFrame(itemAnimationFrame);cancelAnimationFrame(chairAnimationFrame);cancelAnimationFrame(cameraAnimationFrame);cancelAnimationFrame(raf);ro.disconnect();document.removeEventListener('visibilitychange',invalidate);controls.dispose();disposeGroup(structure);disposeGroup(furniture);disposeGroup(ghost);disposeMeasurementGroup();if(weather)disposeGroup(weather);if(guests)disposeGroup(guests);if(inflatableActivity)disposeGroup(inflatableActivity);if(styling)disposeGroup(styling);if(environment)disposeGroup(environment);clearPhotoStage();disposeGroup(photoContinuation);clearLocal360();if(lightGroup)disposeGroup(lightGroup);if(marketingFootprint)disposeGroup(marketingFootprint);if(marketingDetails)disposeGroup(marketingDetails);selection.geometry.dispose();selection.material.dispose();if(scene.background&&scene.background!==photoTexture)scene.background.dispose?.();photoTexture.dispose();sun.shadow.dispose();renderer.dispose();env.dispose();container.replaceChildren();}};
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
