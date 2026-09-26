// Production inflatable meshes and activity rigs; no WebGL or external service needed.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const threePath=require.resolve('three').replace('/build/three.cjs','/build/three.module.js'),THREE=await import(require('node:url').pathToFileURL(threePath));
 const draw=new Proxy({},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)}),context=vm.createContext({console,document:{createElement:()=>({width:0,height:0,getContext:()=>draw})}}),cache=new Map();
 const three=new vm.SyntheticModule(Object.keys(THREE),function(){for(const k of Object.keys(THREE))this.setExport(k,THREE[k]);},{context});
 function moduleFor(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});cache.set(file,m);return m;}
 async function load(file){const m=moduleFor(path.join(root,file));if(m.status==='unlinked')await m.link((s,r)=>s==='three'?three:moduleFor(s.startsWith('three/addons/')?path.resolve(path.dirname(threePath),'../examples/jsm',s.slice(13)):path.resolve(path.dirname(r.identifier),s)));if(m.status!=='evaluated')await m.evaluate();return m.namespace;}
 const data=await load('js/data/inflatables.js'),models=await load('js/ui/inflatable3d.js');
 const product=data.inflatableCatalog([{id:'qa-castle',name:'QA Bounce House',external_id:'test:castle',width_ft:12,length_ft:18,height_ft:14}],true)[0];data.INFLATABLES.push(product);
 const item=data.inflatableItem(product,'saved-castle',3,4),saved=JSON.stringify(item);
 const signature=model=>{model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(model);return [...box.min.toArray(),...box.max.toArray()];};
 const before=signature(models.createInflatable(item));
 Object.assign(product,{widthFt:30,depthFt:50,heightFt:28,style:'slide',colors:['#000000','#000000','#000000']});
 const after=models.createInflatable(item);assert.deepEqual(signature(after),before,'catalog changes cannot resize or reshape a saved inflatable');
 assert.equal(after.userData.profile.widthFt,12);assert.equal(after.userData.profile.heightFt,14);
 data.INFLATABLES.length=0;assert.deepEqual(signature(models.createInflatable(item)),before,'removed product keeps its saved visual model');
 const rotated=models.createInflatable({...item,widthFt:18,depthFt:12,rotationDeg:90});const rotatedBox=signature(rotated);
 assert.ok(Math.abs((rotatedBox[3]-rotatedBox[0])-(before[5]-before[2]))<1e-6,'quarter turn rotates local depth into world width once');
 const space={widthFt:50,lengthFt:50},activity=models.createInflatableActivity(space,[item]);assert.ok(activity.userData.activityCount>0,'saved activity remains available after catalog removal');
 const pose=model=>{const values=[];model.traverse(o=>values.push(...o.position.toArray(),...o.scale.toArray(),...o.rotation.toArray().slice(0,3)));return values;};
 activity.userData.update(2);const direct=pose(activity);activity.userData.update(2);assert.deepEqual(pose(activity),direct,'repeated absolute scene time cannot advance the rig');
 const stepped=models.createInflatableActivity(space,[item]);for(let t=0;t<=2;t+=.125)stepped.userData.update(t);assert.deepEqual(pose(stepped),direct,'pose depends on scene time, not frame count or accumulated absolute values');
 assert.equal(JSON.stringify(item),saved,'mesh and motion never alter saved placement');
 console.log('PASS inflatable meshes: saved profile/size survives catalog drift/removal, correct rotated envelope, saved guest rig, frame-rate-independent absolute animation clock.');
})().catch(error=>{console.error(error);process.exitCode=1;});
