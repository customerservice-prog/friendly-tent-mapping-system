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
 const context=vm.createContext({console,document:w.document,window:w,ResizeObserver:class{constructor(fn){resizeScene=fn;}observe(){}disconnect(){}},requestAnimationFrame:fn=>{frames.set(++clock,fn);return clock;},cancelAnimationFrame:id=>frames.delete(id),performance:{now:()=>0}}),cache=new Map();
 const overrides={WebGLRenderer:Renderer,PMREMGenerator:PMREM};
 const three=new vm.SyntheticModule(Object.keys(THREE),function(){for(const key of Object.keys(THREE))this.setExport(key,overrides[key]||THREE[key]);},{context});
 const orbit=new vm.SyntheticModule(['OrbitControls'],function(){this.setExport('OrbitControls',Controls);},{context});
 function moduleFor(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});cache.set(file,m);return m;}
 async function load(file){const m=moduleFor(file);if(m.status==='unlinked')await m.link((s,ref)=>s==='three'?three:s.endsWith('/OrbitControls.js')?orbit:moduleFor(s.startsWith('three/addons/')?path.resolve(path.dirname(threePath),'../examples/jsm',s.slice(13)):path.resolve(path.dirname(ref.identifier),s)));return m;}
 const data=await load(path.join(root,'js/data/tabletop.js'));await data.evaluate();
 const products=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/friendly-tabletop-20260920.json'),'utf8')).products;data.namespace.TABLETOP.push(...data.namespace.tabletopCatalog(products,true));
 const module=await load(path.join(root,'js/ui/tableStudio3d.js'));await module.evaluate();let failed=false;const view=module.namespace.createTableView(container,()=>{failed=true;});
 const selected=names=>names.map(name=>({productId:data.namespace.TABLETOP.find(p=>p.name===name).id,perSeat:data.namespace.TABLETOP.find(p=>p.name===name).perSeat,qty:1,color:'Sage Green'}));
 const table={id:'detailed',kind:'table',tableId:'round-5ft',shape:'round',widthFt:5,depthFt:5,seatCount:8,chairId:'chiavari-gold',linenId:'linen-round-120',linenColor:'Ivory',tabletop:selected(['Gold Beaded Charger Plate','10-5/8 Dinner Plate','Dinner Fork','Dinner Knife','8.5 oz Wine Glass','Matching Napkins','Rustic Lantern Table Centerpiece'])};
 for(const [width,height] of [[360,190],[640,580],[900,300]]){
  viewportWidth=width;viewportHeight=height;resizeScene();view.update({...table,seatCount:width===900?10:8});view.fit();
  const model=renderer.scene.getObjectByName('Selected tabletop rentals');assert.ok(model);renderer.scene.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(model.parent);
  for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const projected=new THREE.Vector3(x,y,z).project(renderer.camera);assert.ok(Math.abs(projected.x)<=1.02&&Math.abs(projected.y)<=1.02,'whole table and chairs fit '+width+'x'+height);}
  assert.ok(model.children.length<20,'tabletop geometry batches draw calls');assert.ok(!renderer.scene.getObjectByName('Tent'));
 }
 // Every offered product has finite, non-empty 3D geometry and overhead artwork.
 const symbols=await load(path.join(root,'js/ui/tabletop-symbols.js'));await symbols.evaluate();
 for(const p of data.namespace.TABLETOP){view.update({...table,tabletop:[{productId:p.id,perSeat:p.perSeat,qty:1}]});const model=renderer.scene.getObjectByName('Selected tabletop rentals');assert.ok(model.children.length,p.name);model.traverse(o=>{if(o.geometry)assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite),p.name);});assert.ok(symbols.namespace.tabletopSvg({...table,tabletop:[{productId:p.id,qty:1}]}).includes('<g'),p.name);}
 view.update({...table,tabletop:[]});assert.ok(!renderer.scene.getObjectByName('Selected tabletop rentals'),'removing items removes them from the model');
 view.update(table);view.destroy();assert.ok(renderer.disposed);assert.equal(container.children.length,0);assert.equal(failed,false);
 console.log('PASS focused table 3D: real geometry for all 50 catalog extras; portrait/desktop/landscape camera fit; batched draws; remove/update and renderer cleanup. Renderer stub, not GPU visual QA.');w.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
