// Geometry/material validation runs without a GPU; this is not visual WebGL QA.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const threePath=process.env.RENTSKETCH_THREE_MODULE || require.resolve('three').replace('/build/three.cjs','/build/three.module.js');
 const THREE=await import(require('node:url').pathToFileURL(threePath));
 const draw=new Proxy({createLinearGradient:()=>({addColorStop(){}})},{get:(t,k)=>t[k]||(()=>{}),set:(t,k,v)=>(t[k]=v,true)});
 const context=vm.createContext({console,document:{createElement:()=>({width:0,height:0,getContext:()=>draw})}}),cache=new Map();
 const three=new vm.SyntheticModule(Object.keys(THREE),function(){for(const key of Object.keys(THREE))this.setExport(key,THREE[key]);},{context});
 async function load(file){if(cache.has(file))return cache.get(file);const source=fs.readFileSync(file,'utf8')+(file.endsWith('/ui/view3d.js')?'\nexport {table as buildTableForTest};':'');const module=new vm.SourceTextModule(source,{context,identifier:file});cache.set(file,module);await module.link((specifier,ref)=>specifier==='three'?three:load(specifier.startsWith('three/addons/')?path.resolve(path.dirname(threePath),'../examples/jsm',specifier.slice('three/addons/'.length)):path.resolve(path.dirname(ref.identifier),specifier)));return module;}
 const module=await load(path.join(root,'js/ui/scene-environment.js'));await module.evaluate();
 for(const tent of [{type:'pole',widthFt:20,lengthFt:20},{type:'frame',widthFt:20,lengthFt:20},{type:'pole',widthFt:40,lengthFt:100}]){
  const env=module.namespace.createEnvironment(tent,'notSure');env.updateMatrixWorld(true);let draws=0,triangles=0,disposed=0;
  env.traverse(o=>{if(!o.isMesh)return;draws++;const a=o.geometry.attributes.position.array;assert.ok(Array.from(a).every(Number.isFinite));assert.ok(o.matrixWorld.elements.every(Number.isFinite));triangles+=(o.geometry.index?.count||a.length/3)/3*(o.isInstancedMesh?o.count:1);o.geometry.addEventListener('dispose',()=>disposed++);});
  assert.ok(draws<160,'scenery draw-call budget: '+draws);assert.ok(triangles<50000,'scenery triangle budget: '+triangles);
  assert.equal(env.userData.setting,tent.type==='pole'?'backyard':'driveway');
  assert.equal(!!env.getObjectByName('Paved tent surface'),tent.type==='frame');
  const home=env.getObjectByName('Background home');assert.ok(home.position.z<-tent.lengthFt/2-10);
  env.userData.setNight(true);env.userData.setNight(false);module.namespace.disposeGroup(env);assert.ok(disposed>0);assert.equal(env.children.length,0);
  console.log('PASS '+tent.type+' '+tent.widthFt+'×'+tent.lengthFt+': finite geometry, '+draws+' draw calls, '+triangles+' triangles, correct surface, clear tent footprint, disposable resources');
 }
 // Exercise the real table builder with Three.js geometry, without a WebGL context.
 const view=await load(path.join(root,'js/ui/view3d.js'));await view.evaluate();
 for(const shape of ['round','rect']) {
  const item={id:'test-table',shape,widthFt:5,depthFt:shape==='round'?5:2.5,seatCount:0,linenId:null,linenColor:'Navy Blue'};
  const bare=view.namespace.buildTableForTest(item),dressed=view.namespace.buildTableForTest({...item,linenId:'linen-round-120'});
  assert.ok(!bare.children.some(o=>o.material?.isMeshPhysicalMaterial),'No linen must not render a cloth even with a saved color');
  const cloth=dressed.children.filter(o=>o.material?.isMeshPhysicalMaterial);
  assert.ok(cloth.length>0);assert.ok(cloth.every(o=>o.material.color.getHexString()==='172c52'));
  module.namespace.disposeGroup(bare);module.namespace.disposeGroup(dressed);
 }
 console.log('PASS 3D table geometry: removing linen removes cloth; selected linen uses its exact color on round and rectangular tables (not visual GPU QA)');

})().catch(e=>{console.error(e);process.exitCode=1;});
