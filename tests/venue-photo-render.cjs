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
 Object.defineProperties(container,{clientWidth:{get:()=>900},clientHeight:{get:()=>600}});
 let renderer,clock=0,frames=new Map();
 class Renderer{
  constructor(){renderer=this;this.domElement=w.document.createElement('canvas');this.domElement.getBoundingClientRect=()=>({left:0,top:0,width:900,height:600});this.domElement.toDataURL=()=> 'data:image/jpeg;base64,venue-fixture';this.shadowMap={};}
  setPixelRatio(){}setSize(){}render(scene,camera){this.scene=scene;this.camera=camera;}dispose(){this.disposed=true;}
 }
 class Controls{
  constructor(camera){this.camera=camera;this.target=new THREE.Vector3();this.touches={};}
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
  ResizeObserver:class{constructor(fn){this.fn=fn;}observe(){}disconnect(){}},
  requestAnimationFrame:fn=>{frames.set(++clock,fn);return clock;},cancelAnimationFrame:id=>frames.delete(id),performance:{now:()=>0}
 }),cache=new Map();
 const overrides={WebGLRenderer:Renderer,PMREMGenerator:PMREM};
 const three=new vm.SyntheticModule(Object.keys(THREE),function(){for(const key of Object.keys(THREE))this.setExport(key,overrides[key]||THREE[key]);},{context});
 const orbit=new vm.SyntheticModule(['OrbitControls'],function(){this.setExport('OrbitControls',Controls);},{context});
 function moduleFor(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});cache.set(file,m);return m;}
 async function load(file){const m=moduleFor(file);if(m.status==='unlinked')await m.link((s,ref)=>s==='three'?three:s.endsWith('/OrbitControls.js')?orbit:moduleFor(s.startsWith('three/addons/')?path.resolve(path.dirname(threePath),'../examples/jsm',s.slice(13)):path.resolve(path.dirname(ref.identifier),s)));return m;}
 const mod=await load(path.join(root,'js/ui/view3d.js'));await mod.evaluate();
 const view=mod.namespace.init(container,{});
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
 assert.equal(scene.getObjectByName('Backyard setting'),undefined,'generated house/fence/yard are removed in photo mode');
 assert.equal(scene.getObjectByName('Visible sun').visible,false,'generated sky decorations do not cover the customer photo');
 assert.equal(scene.fog.density,.00015,'photo mode keeps only minimal depth haze');
 assert.ok(scene.background?.isCanvasTexture,'Matched View uses the uploaded photo as the camera-matched background');
 const matchedBackground=scene.background,photoStage=scene.getObjectByName('Photo 360 stage');
 assert.ok(photoStage&&!photoStage.visible,'world-space photo stage stays hidden in Matched View');
 assert.ok(scene.getObjectByName('Photo ground projection'),'calibrated photo pixels are projected onto a 3D ground mesh');
 assert.ok(scene.getObjectByName('Photo backdrop projection'),'upper photo pixels are projected onto a rear world-space backdrop');
 assert.equal(view.orbit360(),true,'360 mode is available when a venue photo exists');
 assert.equal(photoStage.visible,true,'360 View reveals world-space photo geometry');
 assert.notEqual(scene.background,matchedBackground,'360 View stops pinning the original photo to the camera');
 const orbitCamera=renderer.camera.position.clone();
 assert.equal(view.matchPhoto(),true,'Matched View can be restored');
 assert.equal(photoStage.visible,false,'returning to Matched View hides the 2.5D projection stage');
 assert.ok(scene.background?.isCanvasTexture,'Matched View restores the exact photo background');
 assert.notDeepEqual(renderer.camera.position.toArray(),orbitCamera.toArray(),'Matched View restores the calibrated camera');
 assert.ok(draws>0,'uploaded photo is drawn into the background texture');assert.match(view.captureImage(),/^data:image\/jpeg/,'print/review capture includes the WebGL composition');
 const before=draws,cameraBefore=renderer.camera.position.clone();
 view.rebuild({...data,photoSite,photoGeometry,photoCalibration:{...photoCalibration,horizonY:.25,backLeft:{x:.34,y:.42},backRight:{x:.66,y:.42}},backgroundPhoto:{id:'p1',url:'https://api.test/background-photo/p1?t=cap',focusX:80,focusY:30,zoom:1.5,shade:.2}});
 assert.ok(draws>before,'crop/focus changes repaint the photo without replacing the layout');
 assert.notDeepEqual(renderer.camera.position.toArray(),cameraBefore.toArray(),'photo calibration reframes the 3D camera');
 view.rebuild(data);view.setScene({night:false,weather:'clear',guests:false,motion:false});
 assert.ok(scene.getObjectByName('Backyard setting'),'removing the photo restores generated scenery');
 assert.equal(scene.getObjectByName('Venue photo shadow catcher'),undefined);
 assert.ok(scene.getObjectByName('Visible sun').visible,'generated weather decorations return with generated scenery');
 view.destroy();assert.ok(renderer.disposed);assert.equal(container.children.length,0);assert.equal(frames.size,0);
 dom.window.close();
 console.log('PASS venue photo renderer: Matched View, world-space 360 photo ground/backdrop, calibrated camera, traced geometry and generated-setting restore.');
})().catch(e=>{console.error(e);process.exitCode=1;});
