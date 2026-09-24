// Run the production 3D controller against real Three geometry and a renderer stub.
// This verifies state/gestures/resources, not GPU shading or the rendered appearance.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),root=path.resolve(__dirname,'..');
(async()=>{
 const threePath=require.resolve('three').replace('/build/three.cjs','/build/three.module.js'),THREE=await import(require('node:url').pathToFileURL(threePath));
 const dom=new JSDOM('<!doctype html><div id="scene"></div>',{pretendToBeVisual:true}),w=dom.window,container=w.document.getElementById('scene');
 const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(t,k)=>t[k]||(()=>{})});
 w.HTMLCanvasElement.prototype.getContext=()=>ctx;w.matchMedia=()=>({matches:false});
 let viewportWidth=800,viewportHeight=600;Object.defineProperties(container,{clientWidth:{get:()=>viewportWidth},clientHeight:{get:()=>viewportHeight}});
 let renderer,control,clock=0,callbacks=[],frames=new Map(),resizeScene;
 class Renderer{constructor(){renderer=this;this.domElement=w.document.createElement('canvas');this.domElement.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600});this.shadowMap={};}setPixelRatio(){}setSize(){}render(scene,camera){this.scene=scene;this.camera=camera;}dispose(){this.disposed=true;}}
 class Controls{constructor(camera){control=this;this.camera=camera;this.target=new THREE.Vector3();this.touches={};}addEventListener(){}update(){this.camera.lookAt(this.target);this.camera.updateMatrixWorld(true);}dispose(){}}
 class PMREM{fromScene(){return{texture:new THREE.Texture(),dispose(){}};}dispose(){}}
 const context=vm.createContext({console,document:w.document,window:w,Image:w.Image,ResizeObserver:class{constructor(fn){resizeScene=fn;}observe(){}disconnect(){}},requestAnimationFrame:fn=>{frames.set(++clock,fn);return clock;},cancelAnimationFrame:id=>frames.delete(id),performance:{now:()=>0}}),cache=new Map();
 const overrides={WebGLRenderer:Renderer,PMREMGenerator:PMREM};
 const three=new vm.SyntheticModule(Object.keys(THREE),function(){for(const key of Object.keys(THREE))this.setExport(key,overrides[key]||THREE[key]);},{context});
 const orbit=new vm.SyntheticModule(['OrbitControls'],function(){this.setExport('OrbitControls',Controls);},{context});
 function moduleFor(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});cache.set(file,m);return m;}
 async function load(file){const m=moduleFor(file);if(m.status==='unlinked')await m.link((s,ref)=>s==='three'?three:s.endsWith('/OrbitControls.js')?orbit:moduleFor(s.startsWith('three/addons/')?path.resolve(path.dirname(threePath),'../examples/jsm',s.slice(13)):path.resolve(path.dirname(ref.identifier),s)));return m;}
 const mod=await load(path.join(root,'js/ui/view3d.js'));await mod.evaluate();
 const view=mod.namespace.init(container,{onPlacementMove:(x,y)=>callbacks.push(['move',x,y]),onPlace:()=>callbacks.push(['place']),onPhotoMove:(id,p)=>callbacks.push(['photoMove',id,p])});
 const table={id:'t1',kind:'table',tableId:'round-5ft',shape:'round',widthFt:5,depthFt:5,x:1,y:1,seatCount:8,chairId:'resin-white'};
 const data={tent:{id:'pole-20x20',type:'pole',widthFt:20,lengthFt:20,centerPoles:[{x:10,y:10}]},surfaceType:'notSure',objects:[table],lightingId:'lighting-bistro'};
 view.rebuild(data);view.setScene({night:true,weather:'rain',guests:true,motion:true});
 const scene=renderer.scene;assert.equal(scene.fog.density,.004,'rain softens the background');
 assert.ok(scene.getObjectByName('Preview guests').visible);assert.ok(scene.getObjectByName('Rain outside the canopy').visible);assert.ok(!scene.getObjectByName('Visible sun').visible);
 assert.ok(scene.children.flatMap(g=>g.children).filter(o=>o.isPointLight).every(o=>o.intensity>65));
 view.setScene({night:true,weather:'clear',guests:false,motion:false});assert.equal(scene.fog.density,.002);assert.ok(scene.getObjectByName('Moon').visible);assert.ok(!scene.getObjectByName('Preview guests').visible);
 view.inside();assert.equal(renderer.camera.position.y,5.6);assert.equal(renderer.camera.fov,50);view.fitCamera();assert.equal(renderer.camera.fov,36);
 view.rebuild({...data,objects:[{...table,x:2}]});assert.ok(scene.getObjectByName('Moon').visible);assert.ok(!scene.getObjectByName('Preview guests').visible,'editing preserves scene preferences');
 assert.ok(scene.getObjectByName('Party table styling'));view.setScene({styling:false,guests:false});assert.equal(scene.getObjectByName('Party table styling').visible,false);view.rebuild(data);assert.equal(scene.getObjectByName('Party table styling').visible,false);
 // Accent chairs are independently rendered and selectable, not table seating.
 const accent={id:'king-accent',kind:'chair',chairId:'throne-king',widthFt:2.4,depthFt:2.6,x:12,y:12,rotationDeg:90};
 view.rebuild({...data,objects:[table,accent]});const renderedChair=scene.getObjectByName('King Throne Chair');assert.ok(renderedChair);assert.equal(renderedChair.userData.itemId,accent.id);assert.equal(renderedChair.rotation.y,-Math.PI/2);assert.ok(renderedChair.children.every(o=>o.userData.itemId===accent.id));
 const pavedTent={id:'frame-20x20',type:'frame',widthFt:20,lengthFt:20,centerPoles:[]};view.rebuild({...data,tent:pavedTent,surfaceType:'concrete',anchoringMethod:'ballast',objects:[accent]});assert.ok(scene.getObjectByName('Paved driveway setting'));let blocks=0;scene.traverse(o=>{if(o.userData.kind==='concrete-ballast')blocks++;});assert.equal(blocks,8);view.rebuild({...data,tent:pavedTent,surfaceType:'grass',anchoringMethod:'stake',objects:[accent]});assert.ok(scene.getObjectByName('Backyard setting'));assert.ok(!scene.getObjectByName('Concrete ballast block'));view.rebuild(data);
 const placement={x:10,y:10,widthFt:5,depthFt:5,objects:[{...table,id:'pending',x:10,y:10}]};view.rebuild({...data,placement});assert.equal(control.enableRotate,false);
 const canvas=renderer.domElement;
 function pointer(type,id=1){const event=new w.MouseEvent(type,{clientX:400,clientY:350,button:0});Object.defineProperties(event,{pointerId:{value:id},pointerType:{value:'touch'}});canvas.dispatchEvent(event);}
 pointer('pointerdown');pointer('pointercancel');assert.ok(callbacks.some(c=>c[0]==='move'));assert.ok(!callbacks.some(c=>c[0]==='place'));
 callbacks=[];pointer('pointerdown');pointer('pointerdown',2);pointer('pointerup',2);pointer('pointerup');assert.ok(!callbacks.some(c=>c[0]==='place'),'pinch does not place');
 callbacks=[];pointer('pointerdown');pointer('pointerup');assert.equal(callbacks.filter(c=>c[0]==='place').length,1);
 view.rebuild(data);assert.equal(control.enableRotate,true);

 // In Photo Match mode, dragging in 360 writes photo-space placement rather than
 // mutating the old tent-floor x/y coordinates.
 callbacks=[];
 const photoSite={id:'photo-site',isSite:true,type:'photo-site',name:'Photo venue',widthFt:70,lengthFt:90};
 const photoCalibration={version:1,horizonY:.34,frontLeft:{x:.06,y:.95},frontRight:{x:.94,y:.95},backRight:{x:.72,y:.47},backLeft:{x:.28,y:.47},autoEstimated:false};
 const photoTable={...table,photoPlacement:{x:18,y:24,rotationDeg:10}};
 view.rebuild({...data,objects:[photoTable],selectedId:'t1',photoSite,photoCalibration,photoGeometry:[],photoTentPlacement:{x:20,y:20,rotationDeg:0},backgroundPhoto:{id:'p',url:'https://api.test/photo?t=x'}});
 view.fitCamera();
 let hitMesh=null;scene.traverse(o=>{if(!hitMesh&&o.isMesh&&o.userData?.itemId==='t1')hitMesh=o;});assert.ok(hitMesh,'photo table is raycastable');
 const hitBox=new THREE.Box3().setFromObject(hitMesh),center=hitBox.getCenter(new THREE.Vector3()).project(renderer.camera);
 const sx=(center.x+1)*400,sy=(1-center.y)*300;
 function pointerAt(type,x,y,id=7){const event=new w.MouseEvent(type,{clientX:x,clientY:y,button:0});Object.defineProperties(event,{pointerId:{value:id},pointerType:{value:'mouse'}});canvas.dispatchEvent(event);}
 pointerAt('pointerdown',sx,sy);pointerAt('pointermove',sx+90,sy-25);pointerAt('pointerup',sx+90,sy-25);
 const photoMove=callbacks.find(c=>c[0]==='photoMove'&&c[1]==='t1');assert.ok(photoMove,'360 drag emits photo placement save callback');
 assert.ok(Math.abs(photoMove[2].x-18)>.05||Math.abs(photoMove[2].y-24)>.05,'360 drag changes photo-space coordinates');
 assert.equal(photoTable.x,1,'source floor-plan x remains unchanged by 360 Photo Match drag');
 assert.equal(photoTable.y,1,'source floor-plan y remains unchanged by 360 Photo Match drag');

 const catalog=await load(path.join(root,'js/data/tents.js'));await catalog.evaluate();
 const partyModule=await load(path.join(root,'js/core/party-scene.js'));await partyModule.evaluate();
 const tableModule=await load(path.join(root,'js/data/tables.js'));await tableModule.evaluate();
 const chairModule=await load(path.join(root,'js/data/chairs.js'));await chairModule.evaluate();
 for(const width of [320,1280]){
  viewportWidth=width;viewportHeight=width===320?640:760;resizeScene();
  for(const tent of catalog.namespace.TENTS){
   const objects=partyModule.namespace.partyLayout(tent,{tables:tableModule.namespace.TABLES,chairs:chairModule.namespace.CHAIRS,danceAvailable:true});
   view.rebuild({...data,tent,objects});view.fitCamera();
   assert.ok(renderer.camera.position.distanceTo(control.target)<control.maxDistance,tent.id+' camera limit');
   const height=tent.type==='pole'?(tent.widthFt<=20?14.5:17.5):7+Math.max(4,tent.widthFt*.24);
   for(const x of [-tent.widthFt/2,tent.widthFt/2])for(const y of [0,height])for(const z of [-tent.lengthFt/2,tent.lengthFt/2]){
    const point=new THREE.Vector3(x,y,z).project(renderer.camera);assert.ok(Math.abs(point.x)<1&&Math.abs(point.y)<1,tent.id+' fits '+width);
   }
   assert.ok(scene.getObjectByName('Party table styling'));
  }
 }
 const inflatableModule=await load(path.join(root,'js/data/inflatables.js'));await inflatableModule.evaluate();
 const inflatable3d=await load(path.join(root,'js/ui/inflatable3d.js'));await inflatable3d.evaluate();
 const {products}=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/friendly-inflatables-20260920.json'),'utf8'));
 const inflated=inflatableModule.namespace.inflatableCatalog(products,true);inflatableModule.namespace.INFLATABLES.push(...inflated);
 for(const width of [320,1280]){
  viewportWidth=width;viewportHeight=width===320?640:760;resizeScene();
  for(const p of inflated)for(const rotation of [0,90]){
   const object=inflatableModule.namespace.inflatableItem(p,'inflatable-test',8,8);object.rotationDeg=rotation;if(rotation){object.widthFt=p.depthFt;object.depthFt=p.widthFt;}
   const site={id:'outdoor-space',type:'outdoor',isSite:true,widthFt:object.widthFt+16,lengthFt:object.depthFt+16,centerPoles:[]};
   view.rebuild({tent:site,objects:[object],surfaceType:'notSure',lightingId:'lighting-none'});view.setScene({guests:true,motion:true});view.fitCamera();
   let tentMeshes=0;scene.traverse(o=>{if(o.userData.kind==='tent')tentMeshes++;});assert.equal(tentMeshes,0,p.name+' has no tent geometry');
   const model=scene.getObjectByName(p.name);assert.ok(model,p.name+' rendered');model.updateWorldMatrix(true,true);const box=new THREE.Box3().setFromObject(model);
   assert.ok(!box.isEmpty());for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const pt=new THREE.Vector3(x,y,z).project(renderer.camera);assert.ok(Math.abs(pt.x)<1&&Math.abs(pt.y)<1,p.name+' fits '+width+' at '+rotation);}
   const children=scene.getObjectByName('Children playing · illustrative activity');assert.ok(children.userData.activityCount>=2);assert.ok(children.visible);
   const before=children.children[0].children[0].position.clone();children.userData.update(.5);const after=children.children[0].children[0].position;assert.ok(before.distanceTo(after)>.001,p.name+' child moves');
   view.setScene({guests:false,motion:false});assert.equal(children.visible,false);
  }
 }
 const jump={x:0,z:0,w:10,d:10,floor:1.35};for(let t=0;t<12;t+=.1){const pose=inflatable3d.namespace.childPose(jump,'jump',0,t);assert.ok(pose.y+pose.jump>=jump.floor);assert.ok(Math.abs(pose.x)<jump.w/2&&Math.abs(pose.z)<jump.d/2);}
 console.log('PASS all 11 inflatable models: no tent geometry, camera fits both rotations at phone/desktop sizes, child motion and visibility controls.');
 view.destroy();assert.equal(container.children.length,0);assert.ok(renderer.disposed);assert.equal(frames.size,0);
 console.log('PASS 3D controller: all 16 tent sizes at phone/desktop dimensions, actual scene assembly, day/night/rain/guest preferences survive edits, placement/cancel/pinch gestures, cleanup (renderer stub, not GPU QA)');w.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
