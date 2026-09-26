// Focused real-venue photo rendering regression. Uses Three geometry with a renderer/image stub; no network.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),root=path.resolve(__dirname,'..');
(async()=>{
 const threePath=require.resolve('three').replace('/build/three.cjs','/build/three.module.js'),THREE=await import(require('node:url').pathToFileURL(threePath));
 const dom=new JSDOM('<!doctype html><div id="scene"></div>',{pretendToBeVisual:true}),w=dom.window,container=w.document.getElementById('scene');
 let draws=0;
 const ctx=new Proxy({
  createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),
  drawImage(){draws++;},fillRect(){},strokeRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},clearRect(){},save(){},restore(){},translate(){},rotate(){},scale(){},setTransform(){},measureText:()=>({width:20})
 },{get:(t,k)=>t[k]||(()=>{})});
 w.HTMLCanvasElement.prototype.getContext=()=>ctx;w.matchMedia=()=>({matches:false});
 let viewportWidth=900,viewportHeight=600,resizeScene;
 Object.defineProperties(container,{clientWidth:{get:()=>viewportWidth},clientHeight:{get:()=>viewportHeight}});
 let renderer,control,clock=0,frames=new Map(),photoMoves=[];
 class Renderer{
  constructor(){renderer=this;this.domElement=w.document.createElement('canvas');this.domElement.getBoundingClientRect=()=>({left:0,top:0,width:viewportWidth,height:viewportHeight});this.domElement.toDataURL=()=> 'data:image/jpeg;base64,venue-fixture';this.shadowMap={};}
  setPixelRatio(){}setSize(){}render(scene,camera){this.scene=scene;this.camera=camera;}dispose(){this.disposed=true;}
 }
 class Controls{
  constructor(camera){control=this;this.camera=camera;this.target=new THREE.Vector3();this.touches={};}
  addEventListener(){}update(){this.camera.lookAt(this.target);this.camera.updateMatrixWorld(true);}dispose(){}
 }
 class PMREM{fromScene(){return{texture:new THREE.Texture(),dispose(){}};}dispose(){}}
 class FakeImage{
  constructor(){this.naturalWidth=1600;this.naturalHeight=1000;this.width=1600;this.height=1000;this.decoding='async';}
  set src(v){this._src=v;this.onload?.();}
  get src(){return this._src;}
 }
 const context=vm.createContext({
  console,document:w.document,window:w,Image:FakeImage,
  ResizeObserver:class{constructor(fn){this.fn=fn;resizeScene=fn;}observe(){}disconnect(){}},
  requestAnimationFrame:fn=>{frames.set(++clock,fn);return clock;},cancelAnimationFrame:id=>frames.delete(id),performance:{now:()=>0}
 }),cache=new Map();
 const overrides={WebGLRenderer:Renderer,PMREMGenerator:PMREM};
 const three=new vm.SyntheticModule(Object.keys(THREE),function(){for(const key of Object.keys(THREE))this.setExport(key,overrides[key]||THREE[key]);},{context});
 const orbit=new vm.SyntheticModule(['OrbitControls'],function(){this.setExport('OrbitControls',Controls);},{context});
 function moduleFor(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});cache.set(file,m);return m;}
 async function load(file){const m=moduleFor(file);if(m.status==='unlinked')await m.link((s,ref)=>s==='three'?three:s.endsWith('/OrbitControls.js')?orbit:moduleFor(s.startsWith('three/addons/')?path.resolve(path.dirname(threePath),'../examples/jsm',s.slice(13)):path.resolve(path.dirname(ref.identifier),s)));return m;}
 const mod=await load(path.join(root,'js/ui/view3d.js'));await mod.evaluate();
 const view=mod.namespace.init(container,{onPhotoMove:(id,p)=>photoMoves.push({id,...p})});
 const data={tent:{id:'frame-20x20',type:'frame',widthFt:20,lengthFt:20,centerPoles:[]},surfaceType:'grass',objects:[],lightingId:'lighting-none'};
 const photoSite={id:'photo-site',isSite:true,type:'photo-site',name:'Photo venue',widthFt:70,lengthFt:90};
 const photoCalibration={version:1,horizonY:.34,frontLeft:{x:.06,y:.95},frontRight:{x:.94,y:.95},backRight:{x:.72,y:.47},backLeft:{x:.28,y:.47},autoEstimated:false};
 const photoGeometry=[
  {id:'house-1',type:'house',x:18,y:56,widthFt:30,depthFt:10,heightFt:12,rotationDeg:0},
  {id:'fence-1',type:'fence',x:4,y:40,widthFt:40,depthFt:.4,heightFt:6,rotationDeg:0},
  {id:'tree-1',type:'tree',x:52,y:34,widthFt:5,depthFt:5,heightFt:18,rotationDeg:0}
 ];
 view.rebuild({...data,photoSite,photoCalibration,photoGeometry,photoTentPlacement:{x:24,y:28,rotationDeg:15},backgroundPhoto:{id:'p1',url:'https://api.test/background-photo/p1?t=cap',focusX:24,focusY:72,zoom:1.2,shade:.12}});
 view.setScene({night:false,weather:'clear',guests:false,motion:false});
 const scene=renderer.scene;
 assert.ok(scene.getObjectByName('Venue photo shadow catcher'),'photo mode uses a transparent shadow-catching ground');
 assert.ok(scene.getObjectByName('Photo geometry house'),'traced house becomes 3D proxy geometry');
 assert.ok(scene.getObjectByName('Photo geometry fence'),'traced fence becomes 3D proxy geometry');
 assert.ok(scene.getObjectByName('Photo geometry tree'),'traced tree becomes 3D proxy geometry');
 assert.equal(scene.getObjectByName('Venue photo geometry').userData.calibration.horizonY,.34,'3D environment receives photo calibration');
 const continuation=scene.getObjectByName('Smart 360 continuation');
 assert.ok(continuation&&!continuation.visible,'the old generic generated yard is disabled in photo mode');
 assert.equal(scene.getObjectByName('Backyard setting'),undefined,'photo mode no longer mixes in the unrelated stock RentSketch yard');
 assert.equal(scene.getObjectByName('Visible sun').visible,false,'generated sky decorations do not cover the customer photo');
 assert.equal(scene.fog.density,.00015,'photo mode keeps only minimal depth haze');
 assert.ok(scene.background?.isCanvasTexture,'Matched View uses the uploaded photo as the camera-matched background');
 const matchedBackground=scene.background,photoStage=scene.getObjectByName('Photo 360 stage'),local360=scene.getObjectByName('Local Smart 360 synthesis');
 assert.ok(photoStage&&!photoStage.visible,'world-space photo stage stays hidden in Matched View');
 assert.ok(local360&&!local360.visible,'photo-derived 360 world stays hidden in exact Matched View');
 assert.equal(local360.userData.noExternalApi,true,'360 world reconstruction is explicitly local and API-free');
 assert.equal(local360.userData.mode,'illustrative-photo-context','single-photo surroundings are explicitly illustrative');assert.equal(local360.userData.accuracy,'unverified');
 assert.equal(local360.userData.antiSmear,true,'360 world explicitly disables whole-photo wrap synthesis');
 assert.ok(scene.getObjectByName('Photo world solid ground'),'360 world builds a procedural color-matched ground instead of tiling the venue photo');
 assert.ok(scene.getObjectByName('Photo world horizon shell'),'360 world builds a low-detail horizon shell without recognizable photo duplication');
 assert.equal(scene.getObjectByName('Photo world boundary vegetation'),undefined,'single-photo mode does not invent property vegetation');
 assert.ok(scene.getObjectByName('Photo world edge transition left'),'360 world only uses a narrow blurred left photo edge to soften the trusted-view seam');
 assert.ok(scene.getObjectByName('Photo world edge transition right'),'360 world only uses a narrow blurred right photo edge to soften the trusted-view seam');
 assert.equal(scene.getObjectByName('Photo world panoramic shell'),undefined,'the old whole-photo panorama cylinder is gone');
 assert.equal(scene.getObjectByName('Photo world parallax layer'),undefined,'the old repeated photo cutout cards are gone');
 assert.equal(local360.userData.layers.panorama,false,'world metadata confirms no whole-photo panorama wrap');
 assert.equal(local360.userData.layers.solidContext,0,'unseen structures are not invented from a photo');
 assert.equal(control.enabled,false,'Matched View locks orbit controls so the tent cannot slide against a flat photo');
 assert.equal(control.enableRotate,false,'Matched View specifically disables camera rotation');
 assert.ok(scene.getObjectByName('Photo ground projection'),'calibrated photo pixels are projected onto a 3D ground mesh');
 assert.ok(scene.getObjectByName('Photo backdrop projection'),'upper photo pixels are projected onto a rear world-space backdrop');
 assert.equal(view.orbit360(),false,'a single venue photo cannot enter 3D Scan without metric multi-view depth');
 assert.equal(view.walkWorld(),false,'Walk Mode is not offered for a single flat photo');
 assert.equal(view.setMeasureMode(true),false,'metric measurement is not offered for a single photo property');
 assert.equal(photoStage.visible,false,'single-photo mode keeps projected photo planes hidden from free camera movement');
 assert.equal(local360.visible,false,'single-photo mode does not expose the old synthesized pseudo-360 world');
 assert.equal(continuation.visible,false,'single-photo mode keeps the obsolete generic continuation hidden');
 assert.equal(control.enabled,false,'single-photo Matched View remains camera-locked');
 assert.equal(scene.background,matchedBackground,'single-photo view keeps the trusted photo pinned to its calibrated camera');
 // Compare actual renderer projection with the SVG photo mapping, including
 // off-centre crops and narrow screens. Merely checking camera state missed this.
 const geometry=await load(path.join(root,'js/core/photo-geometry.js'));await geometry.evaluate();
 for(const [vw,vh] of [[900,600],[1900,740],[360,640]]){
   const previousPhotoTexture=scene.background,previousPhotoSize=[previousPhotoTexture.image.width,previousPhotoTexture.image.height].join(':');let previousDisposed=false;previousPhotoTexture.addEventListener('dispose',()=>{previousDisposed=true;});
   viewportWidth=vw;viewportHeight=vh;resizeScene();
   if([scene.background.image.width,scene.background.image.height].join(':')!==previousPhotoSize){assert.notEqual(scene.background,previousPhotoTexture,'resize allocates new GPU photo storage');assert.equal(previousDisposed,true,'superseded photo texture is disposed');}
   const rect=geometry.namespace.photoImageRect(vw,vh,1600,1000,{focusX:24,focusY:72,zoom:1.2});
   for(const [x,z] of [[0,0],[70,0],[70,90],[0,90],[35,45],[24,28],[44,48]]){
     const photo=geometry.namespace.worldToPhoto(x,z,photoSite,photoCalibration),actual=new THREE.Vector3(x-35,0,z-45).project(renderer.camera);
     assert.ok(Math.abs((actual.x+1)*vw/2-(rect.x+photo.x*rect.width))<.01,'3D ground X agrees with the photo to <0.01px at '+vw);
     assert.ok(Math.abs((1-actual.y)*vh/2-(rect.y+photo.y*rect.height))<.01,'3D ground Y agrees with the photo to <0.01px at '+vw);
   }
 }
 viewportWidth=900;viewportHeight=600;resizeScene();
 const lockedMatrix=renderer.camera.projectionMatrix.toArray();
 assert.equal(view.inside(),false,'interior camera cannot be entered behind a flat photograph');
 assert.equal(view.reception(),false,'automatic party view cannot move the fixed-photo camera');
 assert.deepEqual(renderer.camera.projectionMatrix.toArray(),lockedMatrix);
 let tentMesh;scene.traverse(o=>{if(o.userData.kind==='tent')tentMesh=o;});scene.updateMatrixWorld(true);
 const roof=tentMesh.children[0],roofCenter=new THREE.Box3().setFromObject(roof).getCenter(new THREE.Vector3()).project(renderer.camera);
 const px=(roofCenter.x+1)*450,py=(1-roofCenter.y)*300;
 function pointer(type,x,y){const event=new w.MouseEvent(type,{clientX:x,clientY:y,button:0});Object.defineProperties(event,{pointerId:{value:1},pointerType:{value:'mouse'}});renderer.domElement.dispatchEvent(event);}
 pointer('pointerdown',px,py);pointer('pointermove',px+40,py+10);pointer('pointerup',px+40,py+10);
 assert.ok(photoMoves.some(p=>p.id==='__photo_tent__'&&(Math.abs(p.x-24)>1||Math.abs(p.y-28)>1)),'dragging the visible tent itself persists its changed photo placement');
 const placed=tentMesh.position.clone(),committed=photoMoves.length;
 scene.updateMatrixWorld(true);const nextPoint=new THREE.Box3().setFromObject(roof).getCenter(new THREE.Vector3()).project(renderer.camera),cx=(nextPoint.x+1)*450,cy=(1-nextPoint.y)*300;
 pointer('pointerdown',cx,cy);pointer('pointermove',cx-60,cy+20);pointer('pointercancel',cx-60,cy+20);
 let restoredTent;scene.traverse(o=>{if(o.userData.kind==='tent')restoredTent=o;});
 assert.ok(restoredTent.position.distanceTo(placed)<.001,'cancelled tent drag restores its visible position');assert.equal(photoMoves.length,committed,'cancel never commits a tent move');
 const photoGround=scene.getObjectByName('Photo ground projection'),photoBackdrop=scene.getObjectByName('Photo backdrop projection');
 assert.ok(photoGround.material.alphaMap?.isCanvasTexture,'photo evidence still carries a soft mask for metric-scan fallback');
 assert.equal(photoGround.material.depthWrite,false,'transparent photo evidence does not occlude future metric geometry');
 assert.ok(photoBackdrop.material.alphaMap?.isCanvasTexture,'venue backdrop keeps a feather mask for fallback rendering');
 assert.equal(photoBackdrop.material.depthWrite,false,'transparent backdrop does not write invisible depth');
 const orbitCamera=renderer.camera.position.clone();
 assert.equal(view.matchPhoto(),true,'Matched View remains available');
 assert.equal(photoStage.visible,false,'returning to Matched View hides the projected 3D photo stage');
 assert.equal(local360.visible,false,'returning to Matched View hides the reconstructed surround');
 assert.equal(continuation.visible,false,'returning to Matched View keeps the obsolete continuation hidden');
 assert.equal(control.enabled,false,'returning to Matched View locks the camera again');
 assert.ok(scene.background?.isCanvasTexture,'Matched View restores the exact photo background');
 assert.deepEqual(renderer.camera.position.toArray(),orbitCamera.toArray(),'failed free-camera requests never disturb the calibrated single-photo camera');
 assert.ok(draws>0,'uploaded photo is drawn into the background texture');assert.match(view.captureImage(),/^data:image\/jpeg/,'print/review capture includes the WebGL composition');
 const before=draws,cameraBefore=renderer.camera.position.clone();
 view.rebuild({...data,photoSite,photoGeometry,photoCalibration:{...photoCalibration,horizonY:.25,backLeft:{x:.34,y:.42},backRight:{x:.66,y:.42}},backgroundPhoto:{id:'p1',url:'https://api.test/background-photo/p1?t=cap',focusX:80,focusY:30,zoom:1.5,shade:.2}});
 assert.ok(draws>before,'crop/focus changes repaint the photo without replacing the layout');
 assert.notDeepEqual(renderer.camera.position.toArray(),cameraBefore.toArray(),'photo calibration reframes the 3D camera');
 // Switching away from the photograph changes presentation, not the event.
 const modelData={...data,photoSite,photoCalibration,photoGeometry,photoTentPlacement:{x:24,y:28,rotationDeg:15},backgroundPhoto:{id:'p1',url:'https://api.test/background-photo/p1?t=cap'}};
 view.rebuild(modelData);scene.updateMatrixWorld(true);
 let photoTent;scene.traverse(o=>{if(o.userData.kind==='tent')photoTent=o;});
 const photoPosition=photoTent.position.clone(),photoRotation=photoTent.rotation.y;
 view.rebuild({...modelData,photoLayoutModel:true});scene.updateMatrixWorld(true);
 let modelTent;scene.traverse(o=>{if(o.userData.kind==='tent')modelTent=o;});
 assert.ok(modelTent.position.distanceTo(photoPosition)<1e-9,'3D model preserves the tent placement from Photo View');
 assert.equal(modelTent.rotation.y,photoRotation,'3D model preserves photo rotation');
 assert.equal(control.enabled,true,'model has an independent orbitable camera');
 assert.equal(view.setMeasureMode(true),true,'dimensioned model measurement is available without claiming a metric photo scan');view.setMeasureMode(false);
 assert.equal(view.inside(),true);const localEye=modelTent.worldToLocal(renderer.camera.position.clone());assert.ok(Math.abs(localEye.x-5.6)<1e-7&&Math.abs(localEye.z-8)<1e-7&&Math.abs(localEye.y-5.6)<1e-7,'Inside Tent camera is inside the rotated and moved tent');view.fitCamera();
 assert.ok(scene.getObjectByName('Model planning ground'),'model uses a neutral planning ground');
 assert.equal(scene.getObjectByName('Backyard setting'),undefined,'model never invents a photographed property');
 assert.equal(scene.background.isCanvasTexture,undefined,'model does not use the flat photograph as a 3D backdrop');
 const modelPoint=new THREE.Box3().setFromObject(modelTent.children[0]).getCenter(new THREE.Vector3()).project(renderer.camera),mx=(modelPoint.x+1)*450,my=(1-modelPoint.y)*300;
 const moveCount=photoMoves.length;pointer('pointerdown',mx,my);pointer('pointermove',mx+38,my+8);pointer('pointerup',mx+38,my+8);
 assert.ok(photoMoves.length>moveCount,'a real model tent drag commits through shared photo placement');
 const modelPlacement=photoMoves.at(-1);view.rebuild({...modelData,photoTentPlacement:modelPlacement});
 let returnedTent;scene.traverse(o=>{if(o.userData.kind==='tent')returnedTent=o;});
 assert.ok(Math.abs(returnedTent.position.x-(modelPlacement.x+10-35))<1e-8,'returning to Photo View retains the model edit');
 assert.ok(Math.abs(returnedTent.position.z-(modelPlacement.y+10-45))<1e-8,'returning to Photo View retains model depth');
 const composed={...modelData,photoComposition:{version:1,foregroundMasks:[{id:'full-source',points:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],featherPx:0}],lighting:{azimuthDeg:90,elevationDeg:45,intensity:3,ambient:1,shadowSoftness:4,shadowOpacity:.4}}};
 view.rebuild(composed);view.setScene({night:false,weather:'clear',guests:false,motion:false});
 const maskLayer=scene.getObjectByName('Manually traced photo foreground');assert.equal(maskLayer.visible,true);assert.equal(maskLayer.userData.geometryInferred,false);assert.equal(maskLayer.material.userData.photoClipSpace,true);assert.equal(maskLayer.material.depthWrite,false);
 const directSun=scene.children.find(o=>o.isDirectionalLight&&o.castShadow);assert.ok(directSun.position.x>40&&Math.abs(directSun.position.z)<1e-8);assert.equal(directSun.shadow.radius,4);assert.equal(scene.getObjectByName('Venue photo shadow catcher').material.opacity,.4);
 const countBeforeMask=photoMoves.length;pointer('pointerdown',px,py);pointer('pointermove',px+45,py+10);pointer('pointerup',px+45,py+10);assert.equal(photoMoves.length,countBeforeMask,'covered rentals cannot be selected through foreground photo pixels');
 const priorMaskTexture=maskLayer.material.uniforms.map.value;let maskDisposed=false;priorMaskTexture.addEventListener('dispose',()=>{maskDisposed=true;});viewportWidth=390;viewportHeight=644;resizeScene();assert.notEqual(maskLayer.material.uniforms.map.value,priorMaskTexture);assert.equal(maskDisposed,true,'foreground texture is recreated instead of resized in uploaded GPU storage');
 assert.match(view.captureImage(),/^data:image\/jpeg/);view.rebuild({...composed,photoLayoutModel:true});assert.equal(maskLayer.visible,false,'a manual image outline never becomes a 3D occluder');
 view.rebuild(data);view.setScene({night:false,weather:'clear',guests:false,motion:false});
 assert.ok(scene.getObjectByName('Backyard setting'),'removing the photo restores generated scenery');
 assert.equal(scene.getObjectByName('Venue photo shadow catcher'),undefined);
 assert.ok(scene.getObjectByName('Visible sun').visible,'generated weather decorations return with generated scenery');
 view.destroy();assert.ok(renderer.disposed);assert.equal(container.children.length,0);assert.equal(frames.size,0);
 dom.window.close();
 console.log('PASS venue photo renderer: a single photo stays camera-matched; free 3D, Walk and Measure require a successful estimated multi-view preview; uncertainty remains explicit.');
})().catch(e=>{console.error(e);process.exitCode=1;});
