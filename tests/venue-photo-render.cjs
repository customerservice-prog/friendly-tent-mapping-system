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
  constructor(){renderer=this;this.domElement=w.document.createElement('canvas');this.domElement.getBoundingClientRect=()=>({left:0,top:0,width:900,height:600});this.shadowMap={};}
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
 view.rebuild({...data,backgroundPhoto:{id:'p1',url:'https://api.test/background-photo/p1?t=cap',focusX:24,focusY:72,zoom:1.2,shade:.12}});
 view.setScene({night:false,weather:'clear',guests:false,motion:false});
 const scene=renderer.scene;
 assert.ok(scene.getObjectByName('Venue photo shadow catcher'),'photo mode uses a transparent shadow-catching ground');
 assert.equal(scene.getObjectByName('Backyard setting'),undefined,'generated house/fence/yard are removed in photo mode');
 assert.equal(scene.getObjectByName('Visible sun').visible,false,'generated sky decorations do not cover the customer photo');
 assert.equal(scene.fog.density,.00015,'photo mode keeps only minimal depth haze');
 assert.ok(scene.background?.isCanvasTexture,'photo is rendered into the WebGL background so captured output includes it');
 assert.ok(draws>0,'uploaded photo is drawn into the background texture');
 const before=draws;
 view.rebuild({...data,backgroundPhoto:{id:'p1',url:'https://api.test/background-photo/p1?t=cap',focusX:80,focusY:30,zoom:1.5,shade:.2}});
 assert.ok(draws>before,'crop/focus changes repaint the photo without replacing the layout');
 view.rebuild(data);view.setScene({night:false,weather:'clear',guests:false,motion:false});
 assert.ok(scene.getObjectByName('Backyard setting'),'removing the photo restores generated scenery');
 assert.equal(scene.getObjectByName('Venue photo shadow catcher'),undefined);
 assert.ok(scene.getObjectByName('Visible sun').visible,'generated weather decorations return with generated scenery');
 view.destroy();assert.ok(renderer.disposed);assert.equal(container.children.length,0);assert.equal(frames.size,0);
 dom.window.close();
 console.log('PASS venue photo renderer: real photo background, no fake yard/sky overlay, crop repaint, shadow catcher and generated-setting restore.');
})().catch(e=>{console.error(e);process.exitCode=1;});
