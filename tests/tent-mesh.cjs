// Production Three.js geometry/material invariants. Real WebGL visual proof is
// captured separately; this test protects dimensions, stage metadata and budgets.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
  const threePath=require.resolve('three').replace('/build/three.cjs','/build/three.module.js'),THREE=await import(require('node:url').pathToFileURL(threePath));
  const draw=new Proxy({},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
  const context=vm.createContext({console,document:{createElement:()=>({width:0,height:0,getContext:()=>draw})}}),cache=new Map();
  const three=new vm.SyntheticModule(Object.keys(THREE),function(){for(const key of Object.keys(THREE))this.setExport(key,THREE[key]);},{context});
  function moduleFor(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});cache.set(file,m);return m;}
  const module=moduleFor(path.join(root,'js/ui/tent3d.js'));
  await module.link((s,ref)=>s==='three'?three:moduleFor(s.startsWith('three/addons/')?path.resolve(path.dirname(threePath),'../examples/jsm',s.slice(13)):path.resolve(path.dirname(ref.identifier),s)));
  await module.evaluate();
  for(const type of ['pole','frame','canopy'])for(const [widthFt,lengthFt] of [[20,20],[30,45],[40,100]]){
    const tent=module.namespace.makeTent({type,widthFt,lengthFt},'stake'),roof=tent.children[0];
    assert.equal(roof.userData.buildStage,'roof');roof.geometry.computeBoundingBox();
    assert.equal(roof.geometry.boundingBox.max.x-roof.geometry.boundingBox.min.x,widthFt);assert.equal(roof.geometry.boundingBox.max.z-roof.geometry.boundingBox.min.z,lengthFt);
    assert.equal(roof.material.clearcoat,0);assert.ok(roof.material.roughness>=.8);assert.ok(roof.material.envMapIntensity<.5);assert.ok(roof.material.color.r>.9&&roof.material.color.g>.9&&roof.material.color.b>.9);
    let draws=0,triangles=0;tent.traverse(o=>{if(!o.isMesh)return;draws++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;for(const v of o.geometry.attributes.position.array)assert.ok(Number.isFinite(v));});
    assert.ok(draws<=10,`tent draw budget ${type} ${widthFt}×${lengthFt}: ${draws}`);assert.ok(triangles<60000,`triangle budget ${triangles}`);
    for(const stage of ['roof','valance','frame','stakes'])assert.ok(tent.children.some(c=>c.userData.buildStage===stage));
  }
  const ballasted=module.namespace.makeTent({type:'frame',widthFt:20,lengthFt:20},'ballast',[{side:'front',startFt:0,lengthFt:10,type:'window'}]);
  let blocks=0,walls=0;ballasted.traverse(o=>{if(o.userData.kind==='concrete-ballast')blocks++;if(o.userData.kind==='sidewall')walls++;});
  assert.equal(blocks,8);assert.ok(walls>0,'window sidewalls remain attached');
  console.log('PASS tent meshes: actual feet, neutral vinyl, finite geometry, bounded draws, build stages, concrete ballast and window sidewalls');
})().catch(e=>{console.error(e);process.exitCode=1;});
