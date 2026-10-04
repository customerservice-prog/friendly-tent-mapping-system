import { makeTent } from './tent3d.js';
import { createPoleTentSetup } from './pole-tent-setup3d.js';
import { installPhotoProjectionParity } from './photo-projection-renderer.js';
import { createPhotoForegroundLayer } from './photo-foreground3d.js';
import { normalizePhotoComposition, foregroundMaskAt, photoLightingPosition } from '../core/photo-composition.js';
import { createEquipment } from './equipment-motion3d.js';
import { createInflatable, createInflatableActivity } from './inflatable3d.js';
import { createAccessory3d, updateAnimatedAccessories } from './accessory3d.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeTable as table, makeStandaloneChair, makeDanceFloor as dance, mergeParts } from './equipment3d.js';
import { createEnvironment, createPhotoEnvironment, disposeGroup } from './scene-environment.js';
import { createPhotoWorld360 } from './photo-world360.js';
import { createVenueScanWorld, disposeVenueScanWorld, hasMetricSpaceScan } from './venue-scan3d.js';
import { createFirstPersonWalk } from './first-person-walk.js';
import { createWeather } from './scene-weather.js';
import { createGuests } from './scene-guests.js';
import { createPartyStyling } from './party-styling.js';
import { sceneSetting } from './scene-setting.js';
import { lightingForTent } from '../data/lighting.js';
import { makeReferenceLighting } from './lighting-reference3d.js';
import { fitTentCamera } from './view3d-framing.js';
import { createMarketingDetails } from './marketing-details.js';
import { structuralProfile } from '../data/tentStructure.js';
import { normalizePhotoCalibration, normalizePhotoGeometry, photoCameraEstimate, photoProjection, photoImageRect, photoTentTransform, rentalPhotoPlacement } from '../core/photo-geometry.js';
import { measureWorldPoints } from '../core/measurement.js';
import { objectLocalDimensions } from '../core/world-space.js';
import { createTentSetupRig } from './tent-setup3d.js';

let active=null;
const UP=new THREE.Vector3(0,1,0);
function cyl(r,h,m,n=16){return new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,n),m)}
function box(w,h,d,m){return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m)}
function tube(a,b,r,m,n=10){const d=new THREE.Vector3().subVectors(b,a),q=cyl(r,d.length(),m,n);q.position.copy(a).add(b).multiplyScalar(.5);q.quaternion.setFromUnitVectors(UP,d.clone().normalize());return q}
function canvasTexture(draw,size=256){const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');draw(x,size);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;return t}
function sky(night,raining=false){const c=document.createElement('canvas');c.width=8;c.height=256;const x=c.getContext('2d'),gr=x.createLinearGradient(0,0,0,256);if(night){gr.addColorStop(0,'#07101e');gr.addColorStop(.55,'#16263d');gr.addColorStop(1,'#334257')}else if(raining){gr.addColorStop(0,'#586b7e');gr.addColorStop(.5,'#8e9ea9');gr.addColorStop(1,'#ced8d8')}else{gr.addColorStop(0,'#79b5df');gr.addColorStop(.5,'#c5e1ef');gr.addColorStop(1,'#edf2e8')}x.fillStyle=gr;x.fillRect(0,0,8,256);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}
function lighting(tent,id){return makeReferenceLighting(tent,lightingForTent(id,tent));}

export function init(container,callbacks={}) {
  const mobile=window.matchMedia?.('(max-width: 880px)').matches;
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,mobile?1.5:2));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.domElement.style.cursor='grab';renderer.domElement.setAttribute('aria-label','Interactive 3D event layout');
  container.replaceChildren(renderer.domElement);
  const scene=new THREE.Scene();scene.background=sky(false);scene.fog=new THREE.FogExp2(0xdde8df,.002);
  const restoreProjectionParity=installPhotoProjectionParity(renderer);
  const camera=new THREE.PerspectiveCamera(36,1,.1,1200),controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.065;controls.minDistance=8;controls.maxDistance=260;controls.maxPolarAngle=Math.PI*.48;controls.target.set(0,4,0);
  controls.touches.ONE=THREE.TOUCH.ROTATE;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  const furniture=new THREE.Group(),structure=new THREE.Group(),photoStage=new THREE.Group(),photoContinuation=new THREE.Group(),local360=new THREE.Group(),scanWorld=new THREE.Group(),measurementGroup=new THREE.Group();photoStage.name='Photo 360 stage';photoContinuation.name='Smart 360 continuation';local360.name='Local Smart 360 synthesis';scanWorld.name='Metric Space Scan';photoStage.visible=false;photoContinuation.visible=false;local360.visible=false;scanWorld.visible=false;measurementGroup.name='3D measurements';scene.add(photoContinuation,local360,scanWorld,photoStage,structure,furniture,measurementGroup);
  const rendered=new Map(),pointers=new Set();let state=null,night=false,raf=0,drag=null,danceMesh=null,environment=null,lightGroup=null;
  let inflatableActivity=null,styling=null,showStyling=true,stylingKey='',cameraMode='outside';
  let equipmentTime=0;
  let tentSetupAnimation=null,tentSetupElapsed=0,tentSetupPaused=false,tentSetupStep=-1,tentSetupMode='build';
  let weather=null,guests=null,ghost=new THREE.Group(),ghostKey='',guestKey='',weatherMode='clear',motion=true,showGuests=false,placementPointer=null,lastTime=0,animationTime=0;scene.add(ghost);
  const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let environmentKey='',structureKey='',furnitureKey='',lightingKey='',photoCameraKey='',photoStageKey='',photoContinuationKey='',local360Key='',scanWorldKey='',photoStageTexture=null,dirty=true,destroyed=false,animationFrame=0,itemAnimationFrame=0,chairAnimationFrame=0,cameraAnimationFrame=0,tentSetupRun=0,tentSetupTimers=[],tentSetupRig=null;
  let scanWorldSeq=0,scanWorldAbort=null;
  const photoCanvas=document.createElement('canvas'),photoCtx=photoCanvas.getContext('2d',{alpha:false});
  function newPhotoTexture(){const texture=new THREE.CanvasTexture(photoCanvas);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;return texture;}
  let photoTexture=newPhotoTexture();
  const photoForeground=createPhotoForegroundLayer();scene.add(photoForeground.mesh);
  let photoImage=null,photoUrl='',photoLoadSeq=0;
  let marketingFootprint=null,marketingDetails=null;
  // Do not make first paint wait for PMREM generation. Direct lights are enough
  // for the initial scene; add the environment map after the first visible frame.
  let env=null;
  const warmEnvironment=function(){
    if(destroyed||env)return;
    try{
      const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();
      env=pmrem.fromScene(room,.04);scene.environment=env.texture;room.dispose();pmrem.dispose();invalidate();
    }catch(_){}
  };
  if(typeof requestIdleCallback==='function')requestIdleCallback(warmEnvironment,{timeout:450});
  else setTimeout(warmEnvironment,80);
  const hemi=new THREE.HemisphereLight(0xeaf6ff,0x667052,1.65);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xfff3df,3.2);sun.position.set(-35,48,28);sun.castShadow=true;
  sun.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048);sun.shadow.bias=-.00015;sun.shadow.normalBias=.04;scene.add(sun);
  const fill=new THREE.DirectionalLight(0xcde3ff,.55);fill.position.set(30,18,-25);scene.add(fill);
  const selection=new THREE.Box3Helper(new THREE.Box3(),0x43775a);selection.visible=false;scene.add(selection);
  function invalidate(){dirty=true;}
  function hasVenuePhoto(){return !state?.photoLayoutModel&&!!(state?.backgroundPhoto&&/^https?:\/\//i.test(state.backgroundPhoto.url||''));}
  const walk=createFirstPersonWalk({
    camera,controls,domElement:renderer.domElement,container,mobile,
    getSite:()=>state?.photoSite||state?.tent||{widthFt:50,lengthFt:60},
    getObstacles:()=>[...(state?.photoGeometry||[]),...(state?.scanGeometry||[])],
    getItems:()=>state?(state.objects||[]).map(o=>({...o,...modelDimensionsFor(o),...photoPlacementFor(o)})):[],
    onChange:invalidate,
    onMode:value=>callbacks.onWalkMode?.(value)
  });
  function clearPhotoStage(){
    const geometries=new Set(),materials=new Set(),masks=new Set();
    photoStage.traverse(o=>{
      if(o.geometry)geometries.add(o.geometry);
      (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean).forEach(m=>{
        materials.add(m);
        if(m.alphaMap)masks.add(m.alphaMap);
      });
    });
    photoStage.clear();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());masks.forEach(t=>t.dispose());
    if(photoStageTexture){photoStageTexture.dispose();photoStageTexture=null;}
    photoStageKey='';
  }
  function photoUv(p){return [Math.max(0,Math.min(1,Number(p?.x)||0)),1-Math.max(0,Math.min(1,Number(p?.y)||0))];}
  function photoEvidenceMask(points,feather=11,size=256){
    const c=document.createElement('canvas'),shape=document.createElement('canvas');c.width=c.height=shape.width=shape.height=size;
    const out=c.getContext('2d'),x=shape.getContext('2d');
    out.fillStyle='#000';out.fillRect(0,0,size,size);
    x.fillStyle='#fff';x.beginPath();
    points.forEach((p,i)=>{
      const px=Math.max(0,Math.min(1,Number(p?.[0])||0))*size;
      const py=(1-Math.max(0,Math.min(1,Number(p?.[1])||0)))*size;
      if(i)x.lineTo(px,py);else x.moveTo(px,py);
    });
    x.closePath();x.fill();
    out.save();out.filter='blur('+Math.max(2,feather)+'px)';out.drawImage(shape,0,0);out.restore();
    const tex=new THREE.CanvasTexture(c);tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;tex.needsUpdate=true;return tex;
  }
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
    const groundMask=photoEvidenceMask([fl,fr,br,bl],10);
    const groundMat=new THREE.MeshStandardMaterial({map:tex,alphaMap:groundMask,roughness:1,metalness:0,side:THREE.DoubleSide,transparent:true,opacity:1,depthWrite:false,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
    const ground=photoQuad('Photo ground projection',[-w/2,-.04,-l/2,w/2,-.04,-l/2,w/2,-.04,l/2,-w/2,-.04,l/2],[...fl,...fr,...br,...bl],groundMat);
    ground.receiveShadow=true;ground.renderOrder=-7;ground.userData.photoEvidenceGround=true;ground.userData.baseOpacity=1;photoStage.add(ground);
    const estimate=photoCameraEstimate(site,cal),h=Math.max(18,Math.min(70,Math.max(l*.42,estimate.position[1]*1.3)));
    const backTop=.985,backMask=photoEvidenceMask([bl,br,[br[0],backTop],[bl[0],backTop]],12);
    const backMat=new THREE.MeshBasicMaterial({map:tex,alphaMap:backMask,side:THREE.DoubleSide,transparent:true,opacity:.98,depthWrite:false});
    const backdrop=photoQuad('Photo backdrop projection',[-w/2,0,l/2+.02,w/2,0,l/2+.02,w/2,h,l/2+.02,-w/2,h,l/2+.02],[...bl,...br,br[0],1,bl[0],1],backMat);
    backdrop.receiveShadow=false;backdrop.renderOrder=-6;backdrop.userData.photoEvidenceBackdrop=true;backdrop.userData.baseOpacity=.98;photoStage.add(backdrop);
    photoStage.userData={mode:'single-photo-2.5d',calibration:cal,coverage:'visible-ground-and-rear-view'};
    return true;
  }
  function immersivePhotoCamera(site,calibration){
    const estimate=photoCameraEstimate(site,calibration);
    const target=new THREE.Vector3(...estimate.target);target.y=3.25;
    const flat=new THREE.Vector3(estimate.position[0]-target.x,0,estimate.position[2]-target.z);
    if(flat.lengthSq()<1e-5)flat.set(0,0,-1);flat.normalize();
    const r=Math.max(Math.max(20,Number(site?.widthFt)||50),Math.max(20,Number(site?.lengthFt)||60));
    const radius=Math.max(26,Math.min(62,r*.62));
    const position=target.clone().addScaledVector(flat,radius);position.y=6.15;
    return {position,target,fov:46};
  }
  function updatePhotoStageViewFade(){
    if(!photoStage.visible||!state?.photoSite||!state?.photoCalibration)return;
    const estimate=immersivePhotoCamera(state.photoSite,state.photoCalibration);
    const reference=estimate.position.clone().sub(estimate.target).normalize();
    const current=camera.position.clone().sub(estimate.target).normalize();
    const alignment=THREE.MathUtils.clamp(reference.dot(current),-1,1);
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
    scene.fog.density=state?.photoLayoutModel?0:photo
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
  function clearScanWorld(){
    if(scanWorldAbort){scanWorldAbort.abort();scanWorldAbort=null;}
    disposeVenueScanWorld(scanWorld);scanWorldKey='';scanWorld.userData={ready:false};
  }
  function hasReadyMetricScan(){
    return !!(hasMetricSpaceScan(state?.venueScan)&&scanWorld.userData?.ready);
  }
  function rebuildVenueScanWorld(){
    if(!state?.photoSite||!hasMetricSpaceScan(state?.venueScan)){clearScanWorld();syncPhotoPresentation();return false;}
    const key=JSON.stringify([state.venueScan,state.photoSite.widthFt,state.photoSite.lengthFt,state.photoCalibration]);
    if(key===scanWorldKey&&(scanWorld.children.length||scanWorld.userData?.loading))return true;
    clearScanWorld();scanWorldKey=key;
    const seq=++scanWorldSeq,controller=new AbortController();scanWorldAbort=controller;
    scanWorld.userData={ready:false,loading:true,mode:'metric-stereo-scan'};
    callbacks.onScanReconstruction?.(scanWorld.userData);
    createVenueScanWorld({scan:state.venueScan,site:state.photoSite,calibration:state.photoCalibration,mobile,signal:controller.signal}).then(world=>{
      if(destroyed||controller.signal.aborted||seq!==scanWorldSeq)return;
      disposeVenueScanWorld(scanWorld);scanWorld.add(world);
      scanWorld.userData={...world.userData,loading:false};
      scanWorld.userData.setNight?.(night);
      callbacks.onScanReconstruction?.(scanWorld.userData);
      syncPhotoPresentation();
      if(cameraMode==='photo360'&&state?.tent)frame(state.photoSite||state.tent);
      invalidate();
    }).catch(err=>{
      if(err?.name==='AbortError')return;
      console.warn('[RentSketch] Space Scan reconstruction failed',err);
      scanWorld.userData={ready:false,loading:false,error:String(err?.message||err),validation:{status:'insufficient',label:'Check unavailable',reasons:['Depth reconstruction did not complete.'],scope:'held-out-segment-only',metric:false},measurementPolicy:{scope:'held-out-segment-only',siteDimensionsVerified:false,mayClaimMetricAccuracy:false}};
      callbacks.onScanReconstruction?.(scanWorld.userData);syncPhotoPresentation();invalidate();
    });
    return true;
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
    const photo=hasVenuePhoto(),immersive=photo&&(cameraMode==='photo360'||cameraMode==='walk'),matched=photo&&cameraMode==='outside',walking=walk.isActive(),metric=immersive&&hasReadyMetricScan();
    if(!matched)photoForeground.hide();
    // A completed Space Scan replaces the flat photo planes in immersive mode.
    // The single photo remains available for Matched View and as a fallback while
    // reconstruction is still loading.
    photoStage.visible=immersive&&!metric;photoContinuation.visible=false;local360.visible=immersive&&!metric;scanWorld.visible=metric;
    if(metric)scanWorld.userData.setPresentationMode?.(cameraMode);
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
    const p=state.backgroundPhoto,wCss=Math.max(1,container.clientWidth||800),hCss=Math.max(1,container.clientHeight||600),aspect=wCss/hCss;
    const w=Math.min(1920,Math.max(640,Math.round(wCss*(mobile?1.15:1.45)))),h=Math.max(1,Math.round(w/aspect));
    if(photoCanvas.width!==w||photoCanvas.height!==h){
      // WebGL texture storage cannot be resized in place after upload. Reusing
      // a resized CanvasTexture produced torn photo strips on phone viewports.
      const previous=photoTexture;photoCanvas.width=w;photoCanvas.height=h;photoTexture=newPhotoTexture();if(scene.background===previous)scene.background=photoTexture;previous.dispose();
    }
    const iw=photoImage.naturalWidth||photoImage.width,ih=photoImage.naturalHeight||photoImage.height;
    if(!iw||!ih)return false;
    const rect=photoImageRect(w,h,iw,ih,p);
    photoCtx.fillStyle='#17211d';photoCtx.fillRect(0,0,w,h);photoCtx.drawImage(photoImage,rect.x,rect.y,rect.width,rect.height);
    const baseShade=Math.max(0,Math.min(.45,Number(p.shade)||0)),shade=Math.min(.62,baseShade+(night?.16:0));
    if(shade>0){photoCtx.fillStyle='rgba(0,0,0,'+shade+')';photoCtx.fillRect(0,0,w,h);}
    photoTexture.needsUpdate=true;
    photoForeground.update({sourceCanvas:photoCanvas,rect,imageWidth:iw,composition:state.photoComposition,sourceKey:photoUrl+'|'+shade,visible:cameraMode==='outside'});
    if(cameraMode!=='photo360'&&cameraMode!=='walk'&&scene.background!==photoTexture){if(scene.background&&scene.background!==photoTexture)scene.background.dispose?.();scene.background=photoTexture;}
    return true;
  }
  function loadVenuePhoto(photo){
    const url=photo&&/^https?:\/\//i.test(photo.url||'')?photo.url:'';
    if(!url){photoUrl='';photoImage=null;photoForeground.hide();clearPhotoStage();clearLocal360();clearScanWorld();return;}
    if(url===photoUrl&&photoImage){paintVenuePhoto();rebuildPhotoStage();rebuildLocal360();rebuildVenueScanWorld();syncPhotoPresentation();return;}
    photoUrl=url;photoImage=null;photoForeground.hide();const seq=++photoLoadSeq,img=new Image();img.crossOrigin='anonymous';img.decoding='async';
    img.onload=function(){if(destroyed||seq!==photoLoadSeq||url!==photoUrl)return;photoImage=img;paintVenuePhoto();rebuildPhotoStage();rebuildLocal360();rebuildVenueScanWorld();syncPhotoPresentation();if(cameraMode==='outside')frame(state.photoSite||state.tent);invalidate();};
    img.onerror=function(){if(seq!==photoLoadSeq)return;console.warn('[RentSketch] venue background could not load');};
    img.src=url;
  }
  function generatedBackground(){
    if(hasVenuePhoto()&&cameraMode!=='photo360'&&cameraMode!=='walk'){paintVenuePhoto();return;}
    if(scene.background===photoTexture)scene.background=null;else scene.background?.dispose?.();
    scene.background=state?.photoLayoutModel?new THREE.Color(night?0x222a30:0xe8ece9):sky(night,weatherMode==='rain');
  }
  controls.addEventListener('change',()=>{updatePhotoStageViewFade();invalidate();});
  function shadows(t){const radius=Math.max(t.widthFt,t.lengthFt)/2+18;sun.shadow.camera.left=-radius;sun.shadow.camera.right=radius;sun.shadow.camera.top=radius;sun.shadow.camera.bottom=-radius;sun.shadow.camera.far=radius*4+120;sun.shadow.camera.updateProjectionMatrix();renderer.shadowMap.needsUpdate=true;}
  function frame(t){
    delete camera.userData.photoProjection;
    controls.minAzimuthAngle=-Infinity;controls.maxAzimuthAngle=Infinity;
    if(hasVenuePhoto()&&state?.photoCalibration&&cameraMode==='photo360'){
      const site=state.photoSite||t,r=Math.max(Math.max(20,site.widthFt),Math.max(20,site.lengthFt));
      if(hasReadyMetricScan()){
        const origin=scanWorld.userData.cameraOrigin||{x:0,y:5.6,z:-site.lengthFt/2-8};
        // 3D Scan is an overview, not a second Walk mode. Starting directly at
        // eye level on the reconstruction origin magnified every depth artifact
        // and made a good capture feel like a rough point-cloud demo.
        camera.fov=46;camera.updateProjectionMatrix();
        camera.position.set(origin.x,Math.max(9.5,origin.y+4.2),origin.z-2.5);
        controls.target.set(0,Math.min(4.2,origin.y*.58),Math.min(site.lengthFt*.20,12));
        controls.minDistance=6;controls.maxDistance=Math.max(82,r*1.35);controls.maxPolarAngle=Math.PI*.48;
        controls.update();
        // Captured geometry exists only in the photographed forward sector.
        // Keep the overview within that evidence instead of exposing an empty
        // or invented rear hemisphere.
        const theta=controls.getAzimuthalAngle?.()||0,half=(Number(scanWorld.userData.captureConeDeg)||118)*Math.PI/360;
        controls.minAzimuthAngle=theta-half;controls.maxAzimuthAngle=theta+half;
        syncPhotoPresentation();invalidate();return;
      }
      const view=immersivePhotoCamera(site,state.photoCalibration);
      // Open 360 World in the photographed direction at human eye height.
      // The real venue remains dominant here, then fades into reconstructed
      // geometry only after the user orbits away from the known camera view.
      camera.fov=view.fov;camera.updateProjectionMatrix();
      camera.position.copy(view.position);controls.target.copy(view.target);
      controls.minDistance=5.5;controls.maxDistance=Math.max(78,r*1.35);
      controls.maxPolarAngle=Math.PI*.49;controls.update();syncPhotoPresentation();updatePhotoStageViewFade();invalidate();return;
    }
    if(hasVenuePhoto()&&state?.photoCalibration&&cameraMode==='outside'){
      const site=state.photoSite||t,p=state.backgroundPhoto,iw=photoImage?.naturalWidth||p.widthPx||1600,ih=photoImage?.naturalHeight||p.heightPx||1000;
      const projection=photoProjection(site,state.photoCalibration,Math.max(1,container.clientWidth),Math.max(1,container.clientHeight),iw,ih,p),estimate=photoCameraEstimate(site,state.photoCalibration);
      camera.fov=estimate.fov;camera.position.set(...(projection.center||estimate.position));controls.target.set(0,0,0);
      controls.maxDistance=Math.max(260,camera.position.distanceTo(controls.target)*2.2);controls.update();camera.updateMatrixWorld(true);
      camera.projectionMatrix.set(...projection.matrix).multiply(camera.matrixWorld);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.userData.photoProjection={accuracy:'unverified',heightEstimated:true,mirrored:true};invalidate();return;
    }
    if(state?.photoLayoutModel&&cameraMode==='outside'){const box=new THREE.Box3().setFromObject(structure);box.union(new THREE.Box3().setFromObject(furniture));const center=box.isEmpty()?new THREE.Vector3():box.getCenter(new THREE.Vector3()),size=box.isEmpty()?new THREE.Vector3(t.widthFt,10,t.lengthFt):box.getSize(new THREE.Vector3());camera.fov=42;camera.updateProjectionMatrix();const fit=fitTentCamera({widthFt:Math.max(8,size.x),lengthFt:Math.max(8,size.z)},Math.max(6,size.y),camera.aspect,camera.fov,2);camera.position.set(...fit.position).add(center.clone().sub(new THREE.Vector3(...fit.target)));controls.target.copy(center);controls.maxDistance=260;controls.update();invalidate();return;}
    if((t.isSite||t.planningArea)&&(cameraMode==='outside'||cameraMode==='outsideWide')){const extraWide=cameraMode==='outsideWide';camera.fov=extraWide?(camera.aspect<1?54:47):42;camera.updateProjectionMatrix();const box=new THREE.Box3().setFromObject(furniture);if(t.planningArea)box.union(new THREE.Box3().setFromObject(structure));const center=box.isEmpty()?new THREE.Vector3(0,3,0):box.getCenter(new THREE.Vector3()),size=box.isEmpty()?new THREE.Vector3(t.widthFt,10,t.lengthFt):box.getSize(new THREE.Vector3());const margin=extraWide?(camera.aspect<1?1.48:1.30):1;const fit=fitTentCamera({widthFt:Math.max(8,size.x*margin),lengthFt:Math.max(8,size.z*margin)},Math.max(6,size.y*(extraWide?1.12:1)),camera.aspect,camera.fov,extraWide?4:2);const shift=center.clone().sub(new THREE.Vector3(...fit.target));camera.position.set(...fit.position).add(shift);if(extraWide)camera.position.y*=1.06;controls.target.copy(center);controls.maxDistance=Math.max(320,camera.position.distanceTo(controls.target)*2);controls.update();invalidate();return;}if(cameraMode==='receptionWide'){camera.fov=camera.aspect<1?54:44;camera.updateProjectionMatrix();camera.position.set(t.widthFt*.32,7.4,t.lengthFt*.58);controls.target.set(-t.widthFt*.05,2.7,-t.lengthFt*.05);controls.maxDistance=Math.max(260,camera.position.distanceTo(controls.target)*2);controls.update();invalidate();return;}if(cameraMode==='reception'){camera.fov=camera.aspect<1?65:52;camera.updateProjectionMatrix();camera.position.set(t.widthFt*.28,5.6,t.lengthFt*.46);controls.target.set(-t.widthFt*.08,2.2,-t.lengthFt*.18);if(state?.photoLayoutModel&&structure.children[0]){structure.children[0].updateMatrixWorld(true);camera.position.applyMatrix4(structure.children[0].matrixWorld);controls.target.applyMatrix4(structure.children[0].matrixWorld);}controls.update();invalidate();return;}if(cameraMode==='inside'){camera.fov=50;camera.updateProjectionMatrix();camera.position.set(t.widthFt*.28,5.6,t.lengthFt*.4);controls.target.set(-t.widthFt*.08,3.5,-t.lengthFt*.18);if(state?.photoLayoutModel&&structure.children[0]){structure.children[0].updateMatrixWorld(true);camera.position.applyMatrix4(structure.children[0].matrixWorld);controls.target.applyMatrix4(structure.children[0].matrixWorld);}controls.update();invalidate();return;}camera.fov=36;camera.updateProjectionMatrix();const p=structuralProfile(t.type,t.widthFt,t.lengthFt),anchor=state?.anchoringMethod||(t.type==='pole'?'stake':'ballast'),f=fitTentCamera(t,p.peakHeightFt,camera.aspect,camera.fov,anchor==='stake'?(t.installationClearanceFt||5):2);camera.position.set(...f.position);controls.target.set(...f.target);controls.maxDistance=Math.max(260,camera.position.distanceTo(controls.target)*1.8);controls.update();invalidate();}
  function makePhotoLayoutGround(site){
    const group=new THREE.Group();group.name='Dimensioned event model';
    const material=new THREE.MeshStandardMaterial({color:0xe6eae5,roughness:1}),ground=new THREE.Mesh(new THREE.PlaneGeometry(site.widthFt,site.lengthFt),material);
    ground.name='Model planning ground';ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;group.add(ground);
    const points=[],w=site.widthFt,l=site.lengthFt;
    for(let x=0;x<=w;x+=5)points.push(new THREE.Vector3(x-w/2,.018,-l/2),new THREE.Vector3(x-w/2,.018,l/2));
    for(let z=0;z<=l;z+=5)points.push(new THREE.Vector3(-w/2,.018,z-l/2),new THREE.Vector3(w/2,.018,z-l/2));
    const grid=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xa9b6ae,transparent:true,opacity:.48}));grid.name='Model 5 ft grid';group.add(grid);
    group.userData.setNight=value=>material.color.setHex(value?0x56625a:0xe6eae5);
    return group;
  }
  function rebuild(data){
    if(!data?.tent||destroyed)return;
    if(tentSetupRig||tentSetupAnimation){stopTentSetup(true);callbacks.onTentSetupStep?.({dismissed:true});}
    const previous=state?.tent,changed=!previous||previous.id!==data.tent.id||previous.widthFt!==data.tent.widthFt||previous.lengthFt!==data.tent.lengthFt;
    state={...data,objects:(data.objects||[]).map(o=>({...o}))};const t=state.tent;
    state.photoSite=state.photoSite||{id:'photo-site',isSite:true,type:'photo-site',name:'Photo venue',widthFt:Math.max(50,t.widthFt+20),lengthFt:Math.max(60,t.lengthFt+20)};
    state.photoCalibration=normalizePhotoCalibration(state.photoCalibration,state.photoSite,state.backgroundPhoto);
    state.photoGeometry=normalizePhotoGeometry(state.photoGeometry,state.photoSite);
    state.photoComposition=normalizePhotoComposition(state.photoComposition);
    const setting=sceneSetting(t,state.surfaceType),photoMode=!!state.backgroundPhoto?.url,nextEnvironment=JSON.stringify([state.photoLayoutModel?'model':photoMode?'photo':setting,t.widthFt,t.lengthFt,t.planningArea,state.photoSite?.widthFt,state.photoSite?.lengthFt,state.photoCalibration,state.photoGeometry]);
    state.photoMode=photoMode;
    hemi.groundColor.setHex(photoMode?0xb7b8b4:0x667052);sun.color.setHex(photoMode?0xfffbf5:0xfff3df);sun.position.set(-35,48,hasVenuePhoto()?-28:28);
    const sceneSpace=photoMode?(state.photoSite||t):t;
    const photoTent=state.photoTentPlacement||{x:Math.max(0,(sceneSpace.widthFt-t.widthFt)/2),y:Math.max(0,(sceneSpace.lengthFt-t.lengthFt)/2),rotationDeg:0};
    const mappedObjects=photoMode?state.objects.map(o=>rentalPhotoPlacement({...o,...modelDimensionsFor(o)},t,sceneSpace,photoTent)):state.objects;
    loadVenuePhoto(state.photoLayoutModel?null:state.backgroundPhoto);if(hasVenuePhoto()&&photoImage){rebuildPhotoStage();rebuildLocal360();rebuildVenueScanWorld();}else if(!photoMode)clearScanWorld();
    const nextContinuationKey=photoMode?JSON.stringify([state.photoSite?.widthFt,state.photoSite?.lengthFt,state.surfaceType]):'';
    if(nextContinuationKey!==photoContinuationKey){
      // The old generic RentSketch backyard conflicted visually with the customer's
      // reconstructed photo world. Keep this group empty: the new local photo world
      // provides ground, horizon continuation and parallax layers instead.
      disposeGroup(photoContinuation);photoContinuationKey=nextContinuationKey;
      photoContinuation.userData={generatedContinuation:false,replacedBy:'photo-world360'};
    }
    if(nextEnvironment!==environmentKey){if(environment){scene.remove(environment);disposeGroup(environment);}environment=state.photoLayoutModel?makePhotoLayoutGround(state.photoSite||t):photoMode?createPhotoEnvironment(state.photoSite||t,state.photoCalibration,state.photoGeometry):createEnvironment(t.planningArea?{...t,...t.planningArea}:t,state.surfaceType);if(!photoMode&&t.planningArea)environment.position.set((t.planningArea.widthFt-t.widthFt)/2,0,(t.planningArea.lengthFt-t.lengthFt)/2);environment.userData.setNight(night);const photoShadow=environment.getObjectByName('Venue photo shadow catcher');if(photoShadow)photoShadow.material.opacity=.28;scene.add(environment);environmentKey=nextEnvironment;if(weather){scene.remove(weather);disposeGroup(weather);}weather=createWeather(t,{mobile});weather.userData.setNight(night);weather.userData.setWeather(weatherMode);weather.userData.setPhotoMode?.(photoMode);scene.add(weather);}
    else weather?.userData.setPhotoMode?.(photoMode);
    applySceneLighting();
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
          tentMesh.traverse(part=>{if(part.isMesh)part.userData.photoTent=true;});
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
        if(!['table','inflatable','chair','equipment','accessory'].includes(o.kind))continue;
        const q=placedModel(o);
        q.position.set(o.x+o.widthFt/2-sceneSpace.widthFt/2,0,o.y+o.depthFt/2-sceneSpace.lengthFt/2);
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
        if(['equipment','accessory','chair','inflatable','table'].includes(items[0]?.kind))ghost.add(placedModel({...items[0],x:0,y:0}));
        else{const q=dance(items.map(o=>({...o,x:o.x-data.placement.x,y:o.y-data.placement.y})),{widthFt:data.placement.widthFt,lengthFt:data.placement.depthFt});if(q)ghost.add(q);}
        ghost.traverse(o=>{if(o.material){o.material.transparent=true;o.material.opacity=.64;o.material.depthWrite=false;}o.castShadow=false;});
      }ghostKey=nextGhost;
    }
    ghost.visible=!!data.placement;
    if(data.placement)ghost.position.set(data.placement.x+data.placement.widthFt/2-sceneSpace.widthFt/2,.06,data.placement.y+data.placement.depthFt/2-sceneSpace.lengthFt/2);
    syncPhotoPresentation();renderer.domElement.style.cursor=data.placement?'crosshair':(photoMode&&cameraMode==='outside'?'default':'grab');
    const nextLighting=[state.lightingId,t.id,t.widthFt,t.lengthFt].join(':');
    if(nextLighting!==lightingKey){if(lightGroup){scene.remove(lightGroup);disposeGroup(lightGroup);}lightGroup=lighting(t,state.lightingId);lightGroup.userData.setNight?.(night);scene.add(lightGroup);lightingKey=nextLighting;}
    if(lightGroup){lightGroup.position.set(photoMode?photoTent.x+t.widthFt/2-sceneSpace.widthFt/2:0,0,photoMode?photoTent.y+t.lengthFt/2-sceneSpace.lengthFt/2:0);lightGroup.rotation.y=photoMode?-photoTent.rotationDeg*Math.PI/180:0;}
    const selected=state.selectedPhotoId==='__photo_tent__'?structure.children[0]:(rendered.get(state.selectedId)||(danceMesh?.userData.itemIds.includes(state.selectedId)?danceMesh:null));
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
    const nextPhotoCameraKey=photoMode?JSON.stringify([state.photoLayoutModel,state.photoSite,state.photoCalibration,state.backgroundPhoto]):'';if(changed||nextPhotoCameraKey!==photoCameraKey){photoCameraKey=nextPhotoCameraKey;frame(photoMode?(state.photoSite||t):t);}invalidate();
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
    for(const item of state.objects){
      if(item.kind!=='inflatable')continue;
      stage(rendered.get(item.id),.91,.97,1.1);
    }
    if(styling)stage(styling,.79,.87,.15);
    if(lightGroup)stage(lightGroup,.84,.91,0);
    marketingDetails?.children.forEach(part=>stage(part,part.userData.marketingAt,part.userData.marketingAt+.055,.6));
    showGuests=p>=.9995;
    if(guests)guests.visible=showGuests;
    if(inflatableActivity)inflatableActivity.visible=showGuests;
    const t=state.tent;
    if(t.planningArea){
      cameraMode='outside';
      frame(t);
      controls.enabled=p>=1;
    }else{
      const c=level(.82,.98),e=c*c*(3-2*c);
      const altitude=Math.max(t.widthFt,t.lengthFt)*(camera.aspect<1?1.75:1.32);
      camera.fov=36+16*e;camera.updateProjectionMatrix();
      camera.position.set(t.widthFt*.28*e,altitude+(5.6-altitude)*e,.1+(t.lengthFt*.46-.1)*e);
      controls.target.set(-t.widthFt*.08*e,2.2*e,-t.lengthFt*.18*e);
      controls.enabled=p>=1;controls.update();
    }
    if(marketingFootprint)marketingFootprint.visible=p>.04&&p<.89;
    renderer.shadowMap.needsUpdate=true;invalidate();
  }
  function resize(){const w=Math.max(1,container.clientWidth||800),h=Math.max(1,container.clientHeight||600),aspect=w/h,changed=Math.abs(camera.aspect-aspect)>.01;camera.aspect=aspect;camera.updateProjectionMatrix();renderer.setSize(w,h,false);if(hasVenuePhoto())paintVenuePhoto();if(state?.tent&&(changed||hasVenuePhoto()&&cameraMode==='outside'))frame(state.tent);invalidate();}
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
      if(state?.photoMode&&!state?.photoLayoutModel){
        measureResult={...measureResult,estimated:true,verified:false,checkStatus:scanWorld.userData.validation?.status||'insufficient',measurementPolicy:scanWorld.userData.measurementPolicy||{scope:'held-out-segment-only',siteDimensionsVerified:false,mayClaimMetricAccuracy:false}};
        measureResult.formatted+=' · estimate';
      }
      const label=makeMeasureLabel(measureResult.formatted);label.position.copy(measureA).lerp(measureB,.5);label.position.y=.9;measurementGroup.add(label);
    }else measureResult=null;
    invalidate();
  }
  function clearMeasurement(){
    measureA=null;measureB=null;measureResult=null;renderMeasurement();callbacks.onMeasurement?.(null);
  }
  function setMeasureMode(value){
    const next=!!value;
    if(next&&state?.photoMode&&!state?.photoLayoutModel&&!hasReadyMetricScan())return false;
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
  function groundPoint(e,height=0){const v=new THREE.Vector3();groundPlane.constant=-height;return pointerRay(e).ray.intersectPlane(groundPlane,v)?v:null;}
  function hit(e){
    // Image masks hide rentals in this fixed viewpoint only. Do not select an
    // invisible rental through a traced fence/tree; no physical obstacle is made.
    if(hasVenuePhoto()&&cameraMode==='outside'&&photoImage){
      const r=renderer.domElement.getBoundingClientRect(),rect=photoImageRect(r.width,r.height,photoImage.naturalWidth||photoImage.width,photoImage.naturalHeight||photoImage.height,state.backgroundPhoto);
      if(foregroundMaskAt(state.photoComposition,{x:(e.clientX-r.left-rect.x)/rect.width,y:(e.clientY-r.top-rect.y)/rect.height}))return null;
    }
    scene.updateMatrixWorld(true);pointerRay(e);return raycaster.intersectObjects(state?.photoMode?[...furniture.children,...structure.children]:furniture.children,true).find(h=>h.object.userData.photoTent||h.object.userData.itemId||h.object.userData.kind==='danceGroup');}
  function photoPlacementFor(o){
    if(!o)return {x:0,y:0,rotationDeg:0};
    if(o.photoPlacement&&Number.isFinite(Number(o.photoPlacement.x))&&Number.isFinite(Number(o.photoPlacement.y))){
      return {x:Number(o.photoPlacement.x),y:Number(o.photoPlacement.y),rotationDeg:Number(o.photoPlacement.rotationDeg||0)||0};
    }
    const mapped=rentalPhotoPlacement(o,state.tent,state.photoSite||state.tent,state.photoTentPlacement);
    return {x:mapped.x,y:mapped.y,rotationDeg:mapped.rotationDeg};
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
          if(drag.kind==='tent')state.photoTentPlacement={...drag.origPhoto};
          else if(drag.kind==='item'){
            const o=state.objects.find(x=>x.id===drag.id);if(o)o.photoPlacement=drag.origPhoto?{...drag.origPhoto}:o.photoPlacement;
          }else for(const a of drag.origPhoto||[]){const o=state.objects.find(x=>x.id===a.id);if(o)o.photoPlacement={x:a.x,y:a.y,rotationDeg:a.rotationDeg||0};}
        }else{
          const originals=drag.kind==='item'?[drag.orig]:drag.orig;
          state.objects=state.objects.map(o=>({...o,...originals.find(a=>a.id===o.id)}));
        }
        furnitureKey='';
      }
      if(drag?.kind==='tent')structureKey='';drag=null;controls.enableRotate=true;rebuild(state);return;
    }
    if(state?.placement){
      placementPointer={id:e.pointerId,x:e.clientX,y:e.clientY};const p=groundPoint(e);
      const space=state.photoMode?(state.photoSite||state.tent):state.tent;
      if(p)callbacks.onPlacementMove?.(p.x+space.widthFt/2,p.z+space.lengthFt/2);return;
    }
    const h=hit(e);if(!h||!state)return;
    let point=groundPoint(e),dragHeight=0;
    if(hasVenuePhoto()){
      // A visible roof may sit above the horizon, where its ray never meets
      // ground. Translate on the horizontal plane through the hit instead:
      // the clicked surface point stays under the pointer as depth changes.
      point=h.point.clone();dragHeight=h.point.y;
    }
    if(!point)return;
    const u=h.object.userData,id=u.photoTent?'__photo_tent__':u.itemId||u.itemIds?.[0];
    if(u.photoTent){
      callbacks.onPhotoSelect?.(id);state.selectedPhotoId=id;
      drag={kind:'tent',start:point.clone(),origPhoto:photoTentTransform(state.tent,state.photoSite,state.photoTentPlacement),danceStart:danceMesh?.position.clone()};
    }else if(state.selectedId!==id){callbacks.onSelect?.(id);return;}
    else if(u.kind==='danceGroup'){
      const originals=state.objects.filter(o=>u.itemIds.includes(o.id)).map(o=>({...o}));
      drag={kind:'dance',ids:u.itemIds,start:point.clone(),orig:originals,origPhoto:state.photoMode?originals.map(o=>({id:o.id,...photoPlacementFor(o)})):null,mesh:danceMesh.position.clone()};
    }else{
      const o=state.objects.find(x=>x.id===id);if(!o)return;
      drag={kind:'item',id,start:point.clone(),orig:{...o},origPhoto:state.photoMode?photoPlacementFor(o):null};
    }
    drag.planeHeight=dragHeight;
    if(guests)guests.visible=false;if(styling)styling.visible=false;controls.enableRotate=false;renderer.domElement.setPointerCapture?.(e.pointerId);
  }
  function move(e){
    if(state?.placement&&pointers.size<2&&(e.pointerType==='mouse'||placementPointer)){
      const p=groundPoint(e),space=state.photoMode?(state.photoSite||state.tent):state.tent;
      if(p)callbacks.onPlacementMove?.(p.x+space.widthFt/2,p.z+space.lengthFt/2);return;
    }
    if(!drag||!state||pointers.size>1)return;
    const p=groundPoint(e,drag.planeHeight||0);if(!p)return;
    const t=state.tent,space=state.photoMode?(state.photoSite||t):t,dx=p.x-drag.start.x,dz=p.z-drag.start.z;
    if(drag.kind==='tent'){
      const a=drag.origPhoto,angle=a.rotationDeg*Math.PI/180,extentX=(Math.abs(Math.cos(angle))*t.widthFt+Math.abs(Math.sin(angle))*t.lengthFt)/2,extentY=(Math.abs(Math.sin(angle))*t.widthFt+Math.abs(Math.cos(angle))*t.lengthFt)/2;
      const cx=Math.max(extentX,Math.min(space.widthFt-extentX,a.x+t.widthFt/2+dx)),cy=Math.max(extentY,Math.min(space.lengthFt-extentY,a.y+t.lengthFt/2+dz));
      state.photoTentPlacement={x:cx-t.widthFt/2,y:cy-t.lengthFt/2,rotationDeg:a.rotationDeg};
      structure.children[0]?.position.set(cx-space.widthFt/2,0,cy-space.lengthFt/2);
      for(const o of state.objects)if(!o.photoPlacement){const q=rentalPhotoPlacement(o,t,space,state.photoTentPlacement);rendered.get(o.id)?.position.set(q.x+o.widthFt/2-space.widthFt/2,0,q.y+o.depthFt/2-space.lengthFt/2);}
      if(danceMesh&&drag.danceStart&&state.objects.filter(o=>o.kind==='dance').every(o=>!o.photoPlacement))danceMesh.position.copy(drag.danceStart).add(new THREE.Vector3(state.photoTentPlacement.x-a.x,0,state.photoTentPlacement.y-a.y));
      if(lightGroup)lightGroup.position.set(cx-space.widthFt/2,0,cy-space.lengthFt/2);
      selection.visible=true;selection.box.setFromObject(structure.children[0]).expandByScalar(.12);
    }else if(drag.kind==='item'){
      const o=state.objects.find(x=>x.id===drag.id);if(!o)return;
      if(state.photoMode){
        const a=drag.origPhoto,px=Math.max(0,Math.min(space.widthFt-o.widthFt,a.x+dx)),py=Math.max(0,Math.min(space.lengthFt-o.depthFt,a.y+dz));
        o.photoPlacement={x:px,y:py,rotationDeg:a.rotationDeg||0};
        rendered.get(o.id)?.position.set(px+o.widthFt/2-space.widthFt/2,0,py+o.depthFt/2-space.lengthFt/2);
      }else{
        const a=drag.orig,bounds=t.planningArea||t;o.x=Math.max(0,Math.min(bounds.widthFt-a.widthFt,a.x+dx));o.y=Math.max(0,Math.min(bounds.lengthFt-a.depthFt,a.y+dz));
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
        if(finished.kind==='tent')state.photoTentPlacement={...finished.origPhoto};
        else if(finished.kind==='item'){
          const o=state.objects.find(x=>x.id===finished.id);if(o)o.photoPlacement=finished.origPhoto?{...finished.origPhoto}:o.photoPlacement;
        }else for(const a of finished.origPhoto||[]){const o=state.objects.find(x=>x.id===a.id);if(o)o.photoPlacement={x:a.x,y:a.y,rotationDeg:a.rotationDeg||0};}
      }else{
        const originals=finished.kind==='item'?[finished.orig]:finished.orig;
        state.objects=state.objects.map(o=>({...o,...originals.find(a=>a.id===o.id)}));
      }
      if(finished.kind==='tent')structureKey='';furnitureKey='';rebuild(state);return;
    }
    if(state.photoMode){
      if(finished.kind==='tent')callbacks.onPhotoMove?.('__photo_tent__',{...state.photoTentPlacement});
      else if(finished.kind==='item'){
        const o=state.objects.find(x=>x.id===finished.id);if(o?.photoPlacement)callbacks.onPhotoMove?.(o.id,{...o.photoPlacement});
      }else{
        const o=state.objects.find(x=>x.id===finished.ids[0]);if(o?.photoPlacement)callbacks.onPhotoMove?.(o.id,{...o.photoPlacement});
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
  function modelDimensionsFor(item){
    const local=objectLocalDimensions(item);
    return {modelWidthFt:local.widthFt,modelDepthFt:local.depthFt};
  }
  function placedModel(item){
    const unrotated={...item,...modelDimensionsFor(item),rotationDeg:0};
    const model=item.kind==='equipment'?createEquipment(unrotated,{mobile}):item.kind==='accessory'?createAccessory3d(item):item.kind==='inflatable'?createInflatable(unrotated):item.kind==='chair'?makeStandaloneChair(unrotated):table(item);
    model.rotation.y=-(Number(item.rotationDeg)||0)*Math.PI/180;
    model.traverse(part=>{if(part.isMesh)part.userData.itemId=item.id;});
    return model;
  }
  function loop(now=0){
    if(destroyed)return;
    raf=requestAnimationFrame(loop);
    const dt=Math.min(.05,Math.max(0,(now-lastTime)/1000));lastTime=now;
    if(walk.isActive()){if(walk.update(dt))dirty=true;}else if(!(hasVenuePhoto()&&cameraMode==='outside'))controls.update();
    if(container.clientWidth&&container.clientHeight&&!document.hidden&&!document.body.classList.contains('table-studio-open')&&!document.body.classList.contains('rs-preview-expired')){
      if(tentSetupAnimation&&!tentSetupPaused){
        tentSetupElapsed+=dt;
        const info=tentSetupAnimation.update(tentSetupElapsed,tentSetupMode==='breakdown');
        if(info.index!==tentSetupStep||info.done){
          tentSetupStep=info.index;
          callbacks.onTentSetupStep?.({canPause:true,mode:tentSetupMode,index:info.index+1,total:tentSetupAnimation.steps.length,phase:info.done?'Complete':(info.step.phase||''),title:info.done?(tentSetupMode==='breakdown'?'Tent packed away':'Installation overview complete'):(tentSetupMode==='breakdown'?info.step.undo:info.step.title),detail:info.done?'Return to your layout whenever you are ready.':(tentSetupMode==='breakdown'?'The animated installation state is reversing through this phase as the crew removes the tent.':info.step.detail),why:info.done?'The walkthrough is a visual explanation; the real crew still verifies site conditions and anchoring.':(info.step.why||''),done:info.done});
        }
        if(info.done){tentSetupPaused=true;if(tentSetupMode==='build')stopTentSetup();}
        renderer.shadowMap.needsUpdate=true;dirty=true;
      }
      if(!motion||reducedMotion||drag||state?.placement)animationTime=0;else animationTime+=dt;
      if(motion&&!reducedMotion&&!drag&&!state?.placement&&animationTime>=1/30){
        equipmentTime+=animationTime;
        // A single traversal advances current equipment, saved accessories and
        // inflatable visuals exactly once, using a clock that pauses with motion.
        if(updateAnimatedAccessories(furniture,equipmentTime))renderer.shadowMap.needsUpdate=true;
        lightGroup?.userData.update?.(equipmentTime);
        weather?.userData.update(animationTime);
        if(showGuests){guests?.userData.update(animationTime);inflatableActivity?.userData.update(animationTime);renderer.shadowMap.needsUpdate=true;}
        animationTime=0;dirty=true;
      }
      if(dirty){updatePhotoStageViewFade();scanWorld.userData.updateView?.(camera);renderer.render(scene,camera);dirty=false;}
    }
  }
  loop();document.addEventListener('visibilitychange',invalidate);
  function applySceneLighting(){
    const photo=hasVenuePhoto(),light=normalizePhotoComposition(state?.photoComposition).lighting;
    hemi.groundColor.setHex(photo?0xb7b8b4:0x667052);sun.color.setHex(photo?0xfffbf5:0xfff3df);
    if(photo){const position=photoLightingPosition(light);sun.position.set(position.x,position.y,position.z);}
    else sun.position.set(-35,48,28);
    hemi.intensity=photo?light.ambient*(night?.38:1):night?.7:weatherMode==='rain'?1.25:1.65;
    sun.intensity=photo?light.intensity*(night?.104:weatherMode==='rain'?.27:1):night?.25:weatherMode==='rain'?.65:3.2;
    fill.intensity=photo?light.ambient*.46*(night?.47:1):night?.4:.7;
    // PCF supports a controllable filter radius; PCFSoft ignores radius.
    const shadowType=photo?THREE.PCFShadowMap:THREE.PCFSoftShadowMap;
    if(renderer.shadowMap.type!==shadowType){renderer.shadowMap.type=shadowType;scene.traverse(part=>{for(const material of (Array.isArray(part.material)?part.material:[part.material]))if(material)material.needsUpdate=true;});}
    sun.shadow.radius=photo?light.shadowSoftness:1;
    const catcher=environment?.getObjectByName('Venue photo shadow catcher');if(catcher)catcher.material.opacity=light.shadowOpacity;
    renderer.toneMappingExposure=night?1.18:1.05;renderer.shadowMap.needsUpdate=true;
  }
  function previewPhotoComposition(value){
    if(!state||destroyed)return;
    state={...state,photoComposition:normalizePhotoComposition(value)};applySceneLighting();paintVenuePhoto();invalidate();
  }
  function setNight(value){night=!!value;generatedBackground();syncPhotoFog();applySceneLighting();weather?.userData.setNight(night);weather?.userData.setPhotoMode?.(hasVenuePhoto()||state?.photoLayoutModel);environment?.userData.setNight(night);local360.userData.setNight?.(night);scanWorld.userData.setNight?.(night);lightGroup?.userData.setNight?.(night);invalidate();}
  function setScene(options={}){
    showStyling=options.styling!==false;if(styling)styling.visible=showStyling;
    weatherMode=options.weather==='rain'?'rain':'clear';showGuests=!!options.guests;motion=options.motion!==false;
    weather?.userData.setWeather(weatherMode);if(guests)guests.visible=showGuests;if(inflatableActivity)inflatableActivity.visible=showGuests;
    setNight(!!options.night);invalidate();
  }
  function stopWalk(){if(walk.isActive())walk.exit();}
  function inside(){if(hasVenuePhoto())return false;if(state?.tent){stopWalk();cameraMode='inside';syncPhotoPresentation();frame(state.tent);return true;}return false;}
  // An eye-level reception view for the public tour; other designer views keep their existing framing.
  function reception(){if(hasVenuePhoto())return false;if(state?.tent){stopWalk();cameraMode='reception';syncPhotoPresentation();frame(state.tent);return true;}return false;}
  function fitCamera(){if(state?.tent){if(measureMode)setMeasureMode(false);stopWalk();cameraMode='outside';syncPhotoPresentation();frame(state.tent);return true;}return false;}
  function outsideWide(){
    if(!state?.tent)return false;
    if(measureMode)setMeasureMode(false);
    stopWalk();
    cameraMode='outsideWide';
    syncPhotoPresentation();
    frame(state.tent);
    return true;
  }
  function wide(){return outsideWide();}
  function matchPhoto(){if(!state?.tent||!hasVenuePhoto())return false;if(measureMode)setMeasureMode(false);stopWalk();cameraMode='outside';syncPhotoPresentation();frame(state.photoSite||state.tent);return true;}
  function orbit360(){if(!state?.tent||!hasVenuePhoto()||!hasReadyMetricScan())return false;if(measureMode)setMeasureMode(false);stopWalk();cameraMode='photo360';rebuildPhotoStage();syncPhotoPresentation();frame(state.photoSite||state.tent);return true;}
  function walkWorld(){
    if(measureMode)setMeasureMode(false);
    if(!state?.tent||!hasVenuePhoto()||!hasReadyMetricScan())return false;
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
    const order={space:0,tent:1,tables:2,chairs:3,sweetheart:4,dance:5,style:6,lighting:7,waterslide:8,reception:9,evening:10};
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
  function clearTentSetupRig(){
    if(!tentSetupRig)return;
    scene.remove(tentSetupRig);disposeGroup(tentSetupRig);tentSetupRig=null;
  }
  function stopTentSetup(restore=true){
    if(tentSetupAnimation){tentSetupAnimation.dispose();tentSetupAnimation=null;}
    tentSetupPaused=false;
    tentSetupRun++;tentSetupTimers.forEach(clearTimeout);tentSetupTimers=[];clearTentSetupRig();
    const root=structure.children[0];
    if(root){root.visible=true;root.traverse(o=>{if(o.userData?.buildStage)o.visible=true;});}
    if(restore){
      structure.visible=true;furniture.visible=true;
      if(styling)styling.visible=showStyling&&!drag;
      if(guests)guests.visible=showGuests&&!drag;
      if(inflatableActivity)inflatableActivity.visible=showGuests&&!drag&&!state?.placement;
      if(lightGroup)lightGroup.visible=true;
    }
    renderer.shadowMap.needsUpdate=true;invalidate();
  }
  function playTentSetup(mode='build'){
    if(!state?.tent||state.tent.isSite||!structure.children[0])return false;
    stopTentSetup(false);
    if(state.tent.type==='pole'&&!reducedMotion){
      cancelAnimationFrame(animationFrame);structure.scale.y=1;structure.visible=true;
      furniture.visible=false;if(styling)styling.visible=false;if(guests)guests.visible=false;if(inflatableActivity)inflatableActivity.visible=false;if(lightGroup)lightGroup.visible=false;
      outsideWide();
      tentSetupAnimation=createPoleTentSetup(structure.children[0],state.tent);
      tentSetupElapsed=0;tentSetupPaused=false;tentSetupStep=-1;tentSetupMode=mode;
      tentSetupAnimation.update(0,mode==='breakdown');invalidate();return true;
    }
    const run=++tentSetupRun,root=structure.children[0],tent=state.tent,anchor=state.anchoringMethod||(tent.type==='pole'?'stake':sceneSetting(tent,state.surfaceType)==='driveway'?'ballast':'stake');
    const bucket={roof:[],frame:[],stakes:[],valance:[],sidewalls:[]};
    root.traverse(o=>{const stage=o.userData?.buildStage;if(stage&&bucket[stage]&&o.parent?.userData?.buildStage!==stage)bucket[stage].push(o);});
    const hasSidewalls=bucket.sidewalls.length>0,pole=tent.type==='pole',ballast=anchor==='ballast';
    tentSetupRig=createTentSetupRig(tent,anchor,root);scene.add(tentSetupRig);
    root.visible=false;structure.visible=true;tentSetupRig.userData.hide?.();
    furniture.visible=false;if(styling)styling.visible=false;if(guests)guests.visible=false;if(inflatableActivity)inflatableActivity.visible=false;if(lightGroup)lightGroup.visible=false;
    outsideWide();

    const build=pole
      ? [
          {rig:'measure',phase:'Layout',title:'Measure & square the footprint',detail:'The crew marks the four tent corners and checks both diagonals before the hardware is raised.',why:'Starting square keeps the canopy and pole lines aligned.'},
          {rig:'layout',phase:'Anchoring',title:'Pre-stake the perimeter',detail:'Perimeter stake locations are set around the tent footprint before the lift begins.',why:'Anchors installed early let the crew control the canopy as it rises.'},
          {rig:'pole-top-folded',phase:'Tent top',title:'Bring the folded top onto a drop cloth',detail:'The vinyl is carried into the footprint on a protective drop cloth instead of being dragged over the ground.',why:'The drop cloth protects the coated fabric from abrasion and pinholes.'},
          {rig:'top-ground',phase:'Tent top',title:'Unfold & orient the tent top',detail:'The canopy is opened flat and aligned to the four corners.',why:'Correct orientation prevents twisting the top after poles and straps are connected.'},
          {rig:'ratchets-loose',phase:'Loose anchoring',title:'Connect the ratchets with working slack',detail:'Ratchets or ropes are attached but left loose enough for the top to lift.',why:'The canopy stays controlled without fighting the workers during the lift.'},
          {rig:'poles-staged',phase:'Pole staging',title:'Stage the poles around the footprint',detail:'Poles are placed near the positions where the crew will use them.',why:'Staging keeps long poles out of the crew’s travel path once the tent is partly raised.'},
          {rig:'corner-poles',phase:'Corner lift',title:'Raise the corner poles',detail:'The four corners lift the outside edge while the center remains low.',why:'The corners establish the perimeter shape before the rest of the tent comes up.'},
          {rig:'center-assembled',phase:'Center poles',title:'Assemble & position the center poles',detail:'Center-pole sections and top pins are prepared under their lifting points.',why:'The connection must be positioned correctly before the peak is lifted.'},
          {rig:'center-up',phase:'Center lift',title:'Raise the center poles',detail:'The center poles lift the canopy into its peak shape.',why:'The center supports create the final roof height and pitch.'},
          {rig:'side-poles',phase:'Perimeter poles',title:'Install the remaining side poles',detail:'The crew works around the perimeter bringing each remaining bay to eave height.',why:'Even side-pole spacing keeps the valance level and distributes load.'},
          {rig:'pole-tension',phase:'Tension',title:'Straighten poles & work the ratchets',detail:'Poles are brought plumb while opposite ratchets are tightened progressively.',why:'Balanced tension keeps the tent square instead of pulling it toward one corner.'},
          {actual:'tension',phase:'Final tension',title:'Make the final perimeter tension pass',detail:'Every remaining ratchet is tightened and loose strap is secured.',why:'The final pass creates the stable finished roof shape.'},
          ...(hasSidewalls?[{actual:'sidewalls',phase:'Sidewalls',title:'Install the selected sidewalls',detail:'Wall panels are attached after the top is raised, anchored, and tensioned.',why:'Walls go on last so they do not add wind load during the lift.'}]:[])
        ]
      : [
          {rig:'measure',phase:'Layout',title:'Measure & square the frame-tent footprint',detail:'The crew marks the corners and checks both diagonals before tubing is laid out.',why:'A square footprint keeps the spreaders, corners, and legs aligned.'},
          {rig:'frame-parts',phase:'Parts layout',title:'Lay out the tubing, fittings & legs',detail:'Crowns, rafters, side tees, spreaders, corners, pins, and legs are placed near their assembly positions.',why:'A full parts layout catches missing hardware before the frame is half built.'},
          {rig:'frame-crown',phase:'Roof frame',title:'Assemble the crown fittings & hip rafters',detail:'The crown and hip-rafter assembly is pinned together while everything remains close to the ground.',why:'The crown establishes the roof geometry for the remaining rafters.'},
          {rig:'frame-perimeter',phase:'Roof frame',title:'Connect perimeter spreaders & corner fittings',detail:'Side tees, corner fittings, and spreaders close the perimeter and tie into the crown/rafter assembly.',why:'The perimeter locks the roof frame square before the vinyl top is installed.'},
          {rig:'frame-top',phase:'Roof frame',title:'Finish & inspect the complete low roof frame',detail:'The crew checks every pin, fitting, and connection while the entire roof frame is still low.',why:'Missing pins and misaligned fittings are safest to correct before the frame is raised.'},
          {rig:'frame-top-folded',phase:'Top protection',title:'Place the drop cloth & folded tent top',detail:'The folded vinyl is positioned beside the low frame on a protective drop cloth.',why:'This keeps the coated top off dirt and sharp surfaces.'},
          {rig:'frame-top-half',phase:'Top installation',title:'Pull the top halfway across the frame',detail:'Workers on opposite sides lift and pull the vinyl, keeping air beneath it instead of scraping it over tubing.',why:'Reducing friction protects the top as it passes over frame joints.'},
          {rig:'frame-covered',phase:'Top installation',title:'Center the top over the low frame',detail:'The vinyl is pulled fully into place and its corners are aligned before fastening.',why:'An off-center top will tension unevenly after the legs are raised.'},
          {rig:'frame-strapped',phase:'Top attachment',title:'Attach the perimeter & loop straps while low',detail:'Top straps and buckles are connected and snugged enough to hold the vinyl in place.',why:'The top should be secured before workers lift the roof frame to leg height.'},
          {rig:'frame-one-side',phase:'Leg lift',title:'Lift one whole side & insert that side’s legs',detail:'The crew lifts an entire side together and pins the leg poles into that side rather than raising one isolated corner.',why:'Raising a complete side reduces twist through the roof frame.'},
          {rig:'frame-raised',phase:'Leg lift',title:'Lift the opposite side & install the remaining legs',detail:'The second side is raised as a team until the full frame reaches working height.',why:'Keeping the roof level prevents side-loading fittings during the lift.'},
          {rig:'anchors',phase:'Anchoring',title:ballast?'Position & connect the ballast':'Drive stakes & connect the anchors',detail:ballast?'Ballast is placed at the planned anchor points and connected before final top tensioning.':'Stakes and ratchet assemblies are connected to restrain the raised frame before final top tensioning.',why:'The frame must be restrained before the top is pulled to final tension.'},
          {actual:'tension',phase:'Final tension',title:'Square the raised frame & tension every strap',detail:'The crew works around the perimeter tightening top straps and anchors evenly while checking every leg for plumb.',why:'Balanced tension creates the finished roof shape without pulling the frame out of square.'},
          ...(hasSidewalls?[{actual:'sidewalls',phase:'Sidewalls',title:'Install the selected sidewalls',detail:'Wall panels are attached only after the frame, anchoring, and top tension are complete.',why:'Installing walls last avoids extra wind load during setup.'}]:[])
        ];

    const strike=pole
      ? [
          ...(hasSidewalls?[{actual:'sidewalls',phase:'Strike',title:'Remove & fold the sidewalls first',detail:'Wall panels are removed before any tension or poles are released.',why:'Removing walls reduces wind load before the tent is lowered.'}]:[]),
          {actual:'tension',phase:'Strike',title:'Release perimeter tension in a controlled order',detail:'Ratchets are backed off progressively while the corners remain controlled.',why:'Releasing everything at once can let poles or the top shift unpredictably.'},
          {rig:'side-poles',phase:'Strike',title:'Remove the remaining side poles',detail:'Side poles come out in a controlled order while the canopy is still supported.',why:'The canopy stays controlled as its perimeter drops.'},
          {rig:'center-up',phase:'Strike',title:'Lower the center supports',detail:'Center poles are walked down carefully instead of allowing the peak to fall.',why:'Controlled lowering protects both the crew and the tent top.'},
          {rig:'top-ground',phase:'Strike',title:'Settle the top onto the drop cloth',detail:'The canopy is brought onto the protective cloth before straps and remaining hardware are packed.',why:'The top should never be dragged directly onto the event surface.'},
          {rig:'pole-top-folded',phase:'Strike',title:'Fold & roll the tent top',detail:'The vinyl is folded consistently and rolled for transport.',why:'Clean packing protects the top and speeds the next setup.'},
          {rig:'layout',phase:'Strike',title:'Pull stakes & clear the footprint',detail:'Stakes, ratchets, poles, and layout gear are counted and loaded last.',why:'Anchors stay available until the tent is safely on the ground.'}
        ]
      : [
          ...(hasSidewalls?[{actual:'sidewalls',phase:'Strike',title:'Remove all sidewalls first',detail:'Wall panels are unclipped, separated, folded, and moved out of the work area.',why:'This removes wind load before the structure is lowered.'}]:[]),
          {actual:'tension',phase:'Strike',title:'Release top tension & anchor ratchets',detail:'Top straps and anchor tension are reduced in a controlled perimeter sequence.',why:'Controlled release prevents the raised frame from shifting suddenly.'},
          {rig:'frame-one-side',phase:'Strike',title:'Lower one whole side & remove its legs',detail:'One complete side is lowered together and its legs are unpinned.',why:'Lowering a whole side limits twist through the roof frame.'},
          {rig:'frame-covered',phase:'Strike',title:'Lower the opposite side until the roof frame is low',detail:'The remaining legs are removed so the top and roof frame can be handled safely near the ground.',why:'Top removal and frame disassembly should happen low, not overhead.'},
          {rig:'frame-top-half',phase:'Strike',title:'Release straps & pull the vinyl onto the drop cloth',detail:'The top is lifted and pulled off the low frame rather than dragged across the tubing.',why:'Air under the fabric and the drop cloth protect its coating.'},
          {rig:'frame-top-folded',phase:'Strike',title:'Fold & roll the tent top',detail:'The vinyl is aligned, folded, and packed while it remains protected from the ground.',why:'Consistent folding prevents abrasion and makes the next setup faster.'},
          {rig:'frame-top',phase:'Strike',title:'Disassemble the roof frame while it is low',detail:'Spreaders, rafters, side tees, crowns, and corner fittings are unpinned and organized.',why:'Loose fittings are safest to handle at ground level.'},
          {rig:'frame-parts',phase:'Strike',title:'Stack, count & load the frame parts',detail:'Tubing, fittings, pins, legs, anchors, and straps are counted before leaving the site.',why:'The parts count keeps hardware from being left behind or mixed with another order.'},
          {rig:'measure',phase:'Strike',title:'Clear the installation footprint',detail:'The crew checks the area for stakes, pins, straps, drop cloths, or debris.',why:'The event site should be returned clear of installation hardware.'}
        ];

    const steps=mode==='breakdown'?strike:build;
    const actualVisible=(phase)=>{
      root.visible=true;structure.visible=true;
      bucket.roof.forEach(o=>o.visible=true);bucket.frame.forEach(o=>o.visible=true);bucket.valance.forEach(o=>o.visible=true);
      bucket.stakes.forEach(o=>o.visible=phase==='tension'||phase==='sidewalls'||(pole&&phase==='raise'));
      bucket.sidewalls.forEach(o=>o.visible=phase==='sidewalls');
    };
    const showStep=(index)=>{
      if(destroyed||run!==tentSetupRun)return;
      const step=steps[index];tentSetupRig.userData.hide?.();root.visible=false;
      if(step.rig)tentSetupRig.userData.show?.(step.rig);
      else{actualVisible(step.actual);}
      callbacks.onTentSetupStep?.({mode,index:index+1,total:steps.length+1,phase:step.phase||'',title:step.title,detail:step.detail,why:step.why||'',done:false});
      renderer.shadowMap.needsUpdate=true;invalidate();
    };
    if(reducedMotion){
      tentSetupRig.userData.hide?.();root.visible=true;root.traverse(o=>{if(o.userData?.buildStage)o.visible=true;});
      callbacks.onTentSetupStep?.({mode,index:steps.length+1,total:steps.length+1,phase:'Complete',title:mode==='breakdown'?'Tent strike complete':'Crew installation complete',detail:mode==='breakdown'?'The structure and hardware are packed and the installation footprint is cleared.':'The walkthrough shows the major installation order for this tent style; the crew still verifies the exact site, anchoring, weather, and manufacturer requirements on location.',why:'This visual walkthrough explains the work but does not replace trained installation or a site inspection.',done:true});
      clearTentSetupRig();furniture.visible=true;if(styling)styling.visible=showStyling;if(guests)guests.visible=showGuests;if(inflatableActivity)inflatableActivity.visible=showGuests;if(lightGroup)lightGroup.visible=true;invalidate();return true;
    }
    const dwell=2100;
    steps.forEach((step,index)=>tentSetupTimers.push(setTimeout(()=>showStep(index),index*dwell)));
    tentSetupTimers.push(setTimeout(()=>{
      if(destroyed||run!==tentSetupRun)return;
      clearTentSetupRig();root.visible=true;root.traverse(o=>{if(o.userData?.buildStage)o.visible=true;});
      furniture.visible=true;if(styling)styling.visible=showStyling&&!drag;if(guests)guests.visible=showGuests&&!drag;if(inflatableActivity)inflatableActivity.visible=showGuests&&!drag&&!state?.placement;if(lightGroup)lightGroup.visible=true;
      callbacks.onTentSetupStep?.({mode,index:steps.length+1,total:steps.length+1,phase:'Complete',title:mode==='breakdown'?'Tent strike complete':'Final crew safety check',detail:mode==='breakdown'?'All top/frame/pole components, anchors, ratchets, straps, and protective materials are accounted for and the footprint is cleared.':'Crew verifies every anchor or ballast point, fitting and pin, pole or leg, ratchet, top tension, selected wall attachment, and installation clearance before the tent is released for use.',why:'The final inspection is what turns an assembled tent into a completed installation.',done:true});
      renderer.shadowMap.needsUpdate=true;invalidate();
    },steps.length*dwell));
    return true;
  }
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
    if(hasVenuePhoto()){matchPhoto();return;}
    if(!state?.tent)return;
    const startPosition=camera.position.clone(),startTarget=controls.target.clone(),startFov=camera.fov;
    if(mode==='inside')inside();else if(mode==='outside')fitCamera();else if(mode==='outsideWide')outsideWide();else if(mode==='receptionWide'){cameraMode='receptionWide';frame(state.tent);}else reception();
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
    try{scanWorld.userData.updateView?.(camera);renderer.render(scene,camera);return renderer.domElement.toDataURL('image/jpeg',.9);}catch(_){return null;}
  }
  const api={stopTentSetup,toggleTentSetupPause(){tentSetupPaused=!tentSetupPaused;return tentSetupPaused;},inside,reception,outsideWide,wide,setScene,previewPhotoComposition,rebuild,update:rebuild,fitCamera,fitTentPreview:fitCamera,matchPhoto,orbit360,walkWorld,exitWalk,toggleWalk,isWalking,toggleMeasure,setMeasureMode,isMeasuring,clearMeasurement,getMeasurement,captureImage,night:setNight,playTimelapse,playTentSetup,playItemTimelapse,playChairTimelapse,transitionCamera,setMarketingBuildStage,setMarketingProgress,destroy(){stopTentSetup(false);destroyed=true;tentSetupRun++;tentSetupTimers.forEach(clearTimeout);tentSetupTimers=[];walk.destroy();cancelAnimationFrame(animationFrame);cancelAnimationFrame(itemAnimationFrame);cancelAnimationFrame(chairAnimationFrame);cancelAnimationFrame(cameraAnimationFrame);cancelAnimationFrame(raf);ro.disconnect();document.removeEventListener('visibilitychange',invalidate);controls.dispose();disposeGroup(structure);disposeGroup(furniture);disposeGroup(ghost);disposeMeasurementGroup();if(weather)disposeGroup(weather);if(guests)disposeGroup(guests);if(inflatableActivity)disposeGroup(inflatableActivity);if(styling)disposeGroup(styling);if(environment)disposeGroup(environment);clearPhotoStage();disposeGroup(photoContinuation);clearLocal360();clearScanWorld();if(lightGroup)disposeGroup(lightGroup);if(marketingFootprint)disposeGroup(marketingFootprint);if(marketingDetails)disposeGroup(marketingDetails);selection.geometry.dispose();selection.material.dispose();if(scene.background&&scene.background!==photoTexture)scene.background.dispose?.();photoTexture.dispose();photoForeground.dispose();sun.shadow.dispose();restoreProjectionParity();renderer.dispose();env?.dispose();container.replaceChildren();}};
  // A watch-only sample must not replace the real designer renderer.
  if(callbacks.registerActive !== false)active=api;return api;
}
export function update(s){active?.rebuild(s);}
export function rebuild(s){active?.rebuild(s);}
export function fitCamera(){active?.fitCamera();}
export function fitTentPreview(){active?.fitCamera();}
export function outsideWide(){active?.outsideWide();}
export function wide(){active?.wide();}
export function night(v){active?.night(v);}
export function previewPhotoComposition(value){active?.previewPhotoComposition(value);}
export function playTimelapse(mode){active?.playTimelapse(mode);}

export { lighting as makeLighting };
