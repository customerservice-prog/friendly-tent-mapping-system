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
  const endOf=(steps,id)=>{const index=steps.findIndex(s=>s.id===id);assert.ok(index>=0,'missing setup phase '+id);return steps.slice(0,index+1).reduce((n,s)=>n+s.seconds,0);};

  for(const [widthFt,lengthFt] of [[20,20],[20,40],[30,60],[40,100]]){
    const tent={type:'pole',widthFt,lengthFt},scene=new THREE.Group(),original=api.makeTent(tent,'stake',[{side:'front',startFt:0,lengthFt:10,type:'solid'}]);scene.add(original);
    const source=original.getObjectByName('Continuous tensioned vinyl canopy'),before=source.geometry.attributes.position.array.slice();
    source.geometry.computeBoundingBox();const finishedPeak=source.geometry.boundingBox.max.y;
    let sourceDisposed=false;source.geometry.addEventListener('dispose',()=>sourceDisposed=true);
    const animation=api.createPoleTentSetup(original,tent),roof=animation.group.getObjectByName('Canopy lifted by installation poles'),steps=animation.steps;
    assert.equal(original.visible,false);
    assert.ok(steps.length>=11,'detailed pole walkthrough has at least eleven customer-visible phases');
    assert.deepEqual(steps.slice(0,5).map(s=>s.id),['measure','anchors','layout','ratchets','poles']);
    assert.ok(steps.every(s=>s.phase&&s.title&&s.detail&&s.why),'every detailed pole phase explains action and purpose');

    animation.update(endOf(steps,'measure'));
    const guide=animation.group.getObjectByName('Tent footprint and diagonal squaring guides');
    assert.ok(guide?.visible,'measurement/squaring guides are visible before the top is opened');
    assert.equal(roof.visible,false,'canopy stays packed during footprint measurement');

    animation.update(endOf(steps,'layout'));roof.geometry.computeBoundingBox();
    assert.ok(roof.visible&&roof.geometry.boundingBox.max.y<.4,'canopy is spread flat before poles are staged');

    animation.update(endOf(steps,'ratchets'));roof.geometry.computeBoundingBox();
    assert.ok(roof.geometry.boundingBox.max.y<.4,'loose-ratchet phase does not prematurely lift the canopy');

    animation.update(endOf(steps,'poles'));
    let stagedPoles=0;animation.group.traverse(o=>{if(o.isMesh&&o.geometry?.type==='CylinderGeometry'&&o.visible)stagedPoles++;});
    assert.ok(stagedPoles>4,'pole-staging phase makes the installation hardware visible');

    animation.update(endOf(steps,'corners'));roof.geometry.computeBoundingBox();
    assert.ok(roof.geometry.boundingBox.max.y<finishedPeak-1,'corner lift does not falsely show finished center peaks');

    animation.update(endOf(steps,'tension'));const actual=roof.geometry.attributes.position.array;
    for(let i=0;i<actual.length;i++)assert.ok(Math.abs(actual[i]-before[i])<.001,'fully tensioned roof matches selected tent');

    const total=api.setupDuration(steps);
    for(const reverse of [false,true])for(let time=0;time<=total;time+=.5){
      animation.update(time,reverse);
      animation.group.traverse(o=>{assert.ok([o.position.x,o.position.y,o.position.z,o.scale.x,o.scale.y,o.scale.z,o.quaternion.x,o.quaternion.y,o.quaternion.z,o.quaternion.w].every(Number.isFinite));});
      for(const v of roof.geometry.attributes.position.array)assert.ok(Number.isFinite(v));
    }
    animation.update(total,true);assert.equal(roof.visible,false,'breakdown ends without tent');
    animation.dispose();assert.equal(original.visible,true);assert.equal(scene.children.length,1);assert.equal(sourceDisposed,false);assert.deepEqual(source.geometry.attributes.position.array,before);
    const replay=api.createPoleTentSetup(original,tent);replay.update(endOf(replay.steps,'poles'));replay.dispose();assert.equal(scene.children.length,1,'replay leaves no duplicate models');
  }
  const steps=api.setupSteps(false),total=api.setupDuration(steps),forward=api.sampleSetup(20,steps),backward=api.sampleSetup(total-20,steps,true);
  assert.deepEqual(forward.progress,backward.progress,'takedown reverses the same construction state');
  assert.ok(steps.some(s=>s.id==='centerPrep')&&steps.some(s=>s.id==='ratchets')&&steps.some(s=>s.id==='check'),'detailed explanatory phases remain in the timeline');
  console.log('PASS: 4 pole tent sizes, detailed measurement/anchor/top/ratchet/pole/lift/tension phases, reversible playback, finite transforms and original geometry preservation');
})().catch(e=>{console.error(e);process.exitCode=1;});
