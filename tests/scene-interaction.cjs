// Run the production 3D controller against real Three geometry and a renderer stub.
// This verifies state/gestures/resources, not GPU shading or the rendered appearance.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),root=path.resolve(__dirname,'..');
(async()=>{
 const threePath=require.resolve('three').replace('/build/three.cjs','/build/three.module.js'),THREE=await import(require('node:url').pathToFileURL(threePath));
 const dom=new JSDOM('<!doctype html><div id="scene"></div>',{pretendToBeVisual:true}),w=dom.window,container=w.document.getElementById('scene');
 const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(t,k)=>t[k]||(()=>{})});
 w.HTMLCanvasElement.prototype.getContext=()=>ctx;w.matchMedia=()=>({matches:false});
 Object.defineProperties(container,{clientWidth:{value:800},clientHeight:{value:600}});
 let renderer,control,clock=0,callbacks=[],frames=new Map();
 class Renderer{constructor(){renderer=this;this.domElement=w.document.createElement('canvas');this.domElement.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600});this.shadowMap={};}setPixelRatio(){}setSize(){}render(scene,camera){this.scene=scene;this.camera=camera;}dispose(){this.disposed=true;}}
 class Controls{constructor(camera){control=this;this.camera=camera;this.target=new THREE.Vector3();this.touches={};}addEventListener(){}update(){this.camera.lookAt(this.target);this.camera.updateMatrixWorld(true);}dispose(){}}
 class PMREM{fromScene(){return{texture:new THREE.Texture(),dispose(){}};}dispose(){}}
 const context=vm.createContext({console,document:w.document,window:w,ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:fn=>{frames.set(++clock,fn);return clock;},cancelAnimationFrame:id=>frames.delete(id),performance:{now:()=>0}}),cache=new Map();
 const overrides={WebGLRenderer:Renderer,PMREMGenerator:PMREM};
 const three=new vm.SyntheticModule(Object.keys(THREE),function(){for(const key of Object.keys(THREE))this.setExport(key,overrides[key]||THREE[key]);},{context});
 const orbit=new vm.SyntheticModule(['OrbitControls'],function(){this.setExport('OrbitControls',Controls);},{context});
 async function load(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});cache.set(file,m);await m.link((s,ref)=>s==='three'?three:s.endsWith('/OrbitControls.js')?orbit:load(s.startsWith('three/addons/')?path.resolve(path.dirname(threePath),'../examples/jsm',s.slice(13)):path.resolve(path.dirname(ref.identifier),s)));return m;}
 const mod=await load(path.join(root,'js/ui/view3d.js'));await mod.evaluate();
 const view=mod.namespace.init(container,{onPlacementMove:(x,y)=>callbacks.push(['move',x,y]),onPlace:()=>callbacks.push(['place'])});
 const table={id:'t1',kind:'table',tableId:'round-5ft',shape:'round',widthFt:5,depthFt:5,x:1,y:1,seatCount:8,chairId:'resin-white'};
 const data={tent:{id:'pole-20x20',type:'pole',widthFt:20,lengthFt:20,centerPoles:[{x:10,y:10}]},surfaceType:'notSure',objects:[table],lightingId:'lighting-bistro'};
 view.rebuild(data);view.setScene({night:true,weather:'rain',guests:true,motion:true});
 const scene=renderer.scene;assert.equal(scene.fog.density,.004,'rain softens the background');
 assert.ok(scene.getObjectByName('Preview guests').visible);assert.ok(scene.getObjectByName('Rain outside the canopy').visible);assert.ok(!scene.getObjectByName('Visible sun').visible);
 assert.ok(scene.children.flatMap(g=>g.children).filter(o=>o.isPointLight).every(o=>o.intensity>65));
 view.setScene({night:true,weather:'clear',guests:false,motion:false});assert.equal(scene.fog.density,.002);assert.ok(scene.getObjectByName('Moon').visible);assert.ok(!scene.getObjectByName('Preview guests').visible);
 view.rebuild({...data,objects:[{...table,x:2}]});assert.ok(scene.getObjectByName('Moon').visible);assert.ok(!scene.getObjectByName('Preview guests').visible,'editing preserves scene preferences');
 const placement={x:10,y:10,widthFt:5,depthFt:5,objects:[{...table,id:'pending',x:10,y:10}]};view.rebuild({...data,placement});assert.equal(control.enableRotate,false);
 const canvas=renderer.domElement;
 function pointer(type,id=1){const event=new w.MouseEvent(type,{clientX:400,clientY:350,button:0});Object.defineProperties(event,{pointerId:{value:id},pointerType:{value:'touch'}});canvas.dispatchEvent(event);}
 pointer('pointerdown');pointer('pointercancel');assert.ok(callbacks.some(c=>c[0]==='move'));assert.ok(!callbacks.some(c=>c[0]==='place'));
 callbacks=[];pointer('pointerdown');pointer('pointerdown',2);pointer('pointerup',2);pointer('pointerup');assert.ok(!callbacks.some(c=>c[0]==='place'),'pinch does not place');
 callbacks=[];pointer('pointerdown');pointer('pointerup');assert.equal(callbacks.filter(c=>c[0]==='place').length,1);
 view.rebuild(data);assert.equal(control.enableRotate,true);view.destroy();assert.equal(container.children.length,0);assert.ok(renderer.disposed);assert.equal(frames.size,0);
 console.log('PASS 3D controller: actual scene assembly, day/night/rain/guest preferences survive edits, placement/cancel/pinch gestures, cleanup (renderer stub, not GPU QA)');w.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
