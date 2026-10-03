const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
  const threePath=require.resolve('three').replace('/build/three.cjs','/build/three.module.js'),THREE=await import(require('node:url').pathToFileURL(threePath));
  const draw=new Proxy({},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
  const context=vm.createContext({console,document:{createElement:()=>({width:0,height:0,getContext:()=>draw})}}),cache=new Map();
  const three=new vm.SyntheticModule(Object.keys(THREE),function(){for(const key of Object.keys(THREE))this.setExport(key,THREE[key]);},{context});
  function get(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});cache.set(file,m);return m;}
  const entry=new vm.SourceTextModule("export {makeTent} from './js/ui/tent3d.js';export {createPoleTentSetup} from './js/ui/pole-tent-setup3d.js';export {sampleSetup,setupSteps,setupDuration} from './js/core/tent-setup-timeline.js';",{context,identifier:path.join(root,'test-entry.js')});
  await entry.link((s,ref)=>s==='three'?three:get(s.startsWith('three/addons/')?path.resolve(path.dirname(threePath),'../examples/jsm',s.slice(13)):path.resolve(path.dirname(ref.identifier),s)));
  await entry.evaluate();const api=entry.namespace;
  for(const [widthFt,lengthFt] of [[20,20],[20,40],[30,60],[40,100]]){
    const tent={type:'pole',widthFt,lengthFt},scene=new THREE.Group(),original=api.makeTent(tent,'stake',[{side:'front',startFt:0,lengthFt:10,type:'solid'}]);scene.add(original);
    const source=original.getObjectByName('Continuous tensioned vinyl canopy'),before=source.geometry.attributes.position.array.slice();
    let sourceDisposed=false;source.geometry.addEventListener('dispose',()=>sourceDisposed=true);
    const animation=api.createPoleTentSetup(original,tent),roof=animation.group.getObjectByName('Canopy lifted by installation poles');
    assert.equal(original.visible,false);
    animation.update(5);roof.geometry.computeBoundingBox();assert.ok(roof.geometry.boundingBox.max.y<.2,'canopy begins flat on ground');
    animation.update(18);roof.geometry.computeBoundingBox();assert.ok(roof.geometry.boundingBox.max.y<7.2,'corners do not raise center peaks');
    animation.update(39);const actual=roof.geometry.attributes.position.array;
    for(let i=0;i<actual.length;i++)assert.ok(Math.abs(actual[i]-before[i])<.001,'tensioned roof matches selected tent');
    const total=api.setupDuration(animation.steps);
    for(const reverse of [false,true])for(let time=0;time<=total;time+=.5){
      animation.update(time,reverse);
      animation.group.traverse(o=>{assert.ok([o.position.x,o.position.y,o.position.z,o.scale.x,o.scale.y,o.scale.z,o.quaternion.x,o.quaternion.y,o.quaternion.z,o.quaternion.w].every(Number.isFinite));});
      for(const v of roof.geometry.attributes.position.array)assert.ok(Number.isFinite(v));
    }
    animation.update(total,true);assert.equal(roof.visible,false,'breakdown ends without tent');
    animation.dispose();assert.equal(original.visible,true);assert.equal(scene.children.length,1);assert.equal(sourceDisposed,false);assert.deepEqual(source.geometry.attributes.position.array,before);
    const replay=api.createPoleTentSetup(original,tent);replay.update(12);replay.dispose();assert.equal(scene.children.length,1,'replay leaves no duplicate models');
  }
  const steps=api.setupSteps(false);const forward=api.sampleSetup(20,steps),backward=api.sampleSetup(api.setupDuration(steps)-20,steps,true);
  assert.deepEqual(forward.progress,backward.progress,'takedown reverses the same construction state');
  console.log('PASS: 4 tent sizes, ground canopy, corner-first lift, full-height geometry, reverse sequence, finite transforms, cancellation/replay and original geometry preservation');
})().catch(e=>{console.error(e);process.exitCode=1;});
