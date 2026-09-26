// Production mesh, motion and version-contract checks; GPU captures run separately.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const threePath=require.resolve('three').replace('/build/three.cjs','/build/three.module.js'),THREE=await import(require('node:url').pathToFileURL(threePath));
 const draw=new Proxy({},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)}),context=vm.createContext({console,document:{createElement:()=>({width:0,height:0,getContext:()=>draw})}}),cache=new Map();
 const three=new vm.SyntheticModule(Object.keys(THREE),function(){for(const k of Object.keys(THREE))this.setExport(k,THREE[k]);},{context});
 function moduleFor(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});cache.set(file,m);return m;}
 async function load(file){const m=moduleFor(path.join(root,file));if(m.status==='unlinked')await m.link((s,r)=>s==='three'?three:moduleFor(s.startsWith('three/addons/')?path.resolve(path.dirname(threePath),'../examples/jsm',s.slice(13)):path.resolve(path.dirname(r.identifier),s)));if(m.status!=='evaluated')await m.evaluate();return m.namespace;}
 const data=await load('js/data/equipment.js'),models=await load('js/ui/equipment-motion3d.js'),legacy=await load('js/ui/accessory3d.js'),registry=await load('js/data/asset-registry.js');
 data.EQUIPMENT.push(...data.genericEquipment());
 const physicalBounds=model=>{model.updateMatrixWorld(true);const bounds=new THREE.Box3();model.traverse(o=>{if(!o.isMesh||o.userData.effect)return;o.geometry.computeBoundingBox();bounds.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));});return bounds;};
 const pose=model=>{const values=[];model.traverse(o=>{values.push(...o.position.toArray(),...o.rotation.toArray().slice(0,3));if(o.isInstancedMesh)values.push(...o.instanceMatrix.array);});return values;};
 for(const type of registry.HERO_EQUIPMENT_TYPES){
  const p=data.EQUIPMENT.find(p=>p.type===type),item=data.equipmentItem(p,'qa-'+type,7,9),original=JSON.stringify(item),model=models.createEquipment(item,{mobile:true}),bounds=physicalBounds(model);
  assert.ok(bounds.min.y>=-.012,type+' stays on the ground: '+bounds.min.y);assert.ok(bounds.max.y<=p.heightFt*1.025,type+' stays within physical height: '+bounds.max.y);
  assert.ok(bounds.max.x-bounds.min.x<=p.widthFt*1.025,type+' width envelope');assert.ok(bounds.max.z-bounds.min.z<=p.depthFt*1.025,type+' depth envelope');
  let triangles=0,draws=0;model.traverse(o=>{if(!o.isMesh)return;draws++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);for(const v of o.geometry.attributes.position.array)assert.ok(Number.isFinite(v));assert.equal(o.userData.itemId,item.id);});
  assert.ok(draws<=24,type+' draws '+draws);assert.ok(triangles<80000,type+' triangles '+triangles);
  const before=pose(model);for(let i=0;i<20;i++)model.userData.update?.(i/30);const after=pose(model);
  if(model.userData.operation.supported)assert.notDeepEqual(after,before,type+' has operating motion');else assert.deepEqual(after,before,type+' stays stationary');
  model.userData.setOperating('off');const off=pose(model);for(let i=20;i<40;i++)model.userData.update?.(i/30);assert.deepEqual(pose(model),off,type+' operation off freezes model');
  model.traverse(o=>{if(o.userData.effect)assert.equal(o.visible,false,type+' stops its emitted effects');});
  assert.equal(JSON.stringify(item),original,type+' does not mutate placement or catalog');
  const old=legacy.createAccessory3d({...item,kind:'accessory',accessoryType:type,modelWidthFt:p.widthFt,modelDepthFt:p.depthFt,rotationDeg:90});assert.equal(old.userData.kind,'accessory');assert.ok(old.userData.asset.version);assert.equal(old.rotation.y,0,'legacy placement renderer owns rotation');
  console.log('PASS '+type+': '+draws+' draws, '+triangles+' triangles; footprint, operation stop and legacy identity');
 }
 for(const type of ['stanchion','cooler','trash-can','power-distribution','cornhole','connect-four','tumbling-timbers','stage']){
  const p=data.EQUIPMENT.find(p=>p.type===type),model=models.createEquipment(data.equipmentItem(p,'idle-'+type,0,0));assert.equal(model.userData.operation.supported,false,type+' has no spontaneous animation');assert.equal(model.userData.update,undefined);
 }
 const operation=await load('js/ui/equipment-operation.js'),parent=new THREE.Group(),controlled=new THREE.Group(),effect=new THREE.Group(),times=[];parent.add(controlled);controlled.add(effect);
 operation.attachEquipmentOperation(controlled,'foam-machine',{},t=>times.push(t),{effects:[effect]});
 controlled.userData.update(0);controlled.userData.update(.1);const visibleTime=times.at(-1),count=times.length;
 parent.visible=false;assert.equal(controlled.userData.update(10),false);assert.equal(times.length,count,'hidden ancestors pause operating previews');
 parent.visible=true;controlled.userData.update(10.1);assert.ok(Math.abs(times.at(-1)-visibleTime-.1)<1e-8,'resuming visibility excludes hidden duration');
 controlled.userData.setOperating('off');assert.equal(effect.visible,false);assert.equal(controlled.userData.update(20),false);const stoppedTime=times.at(-1);
 controlled.userData.setOperating('running');assert.equal(effect.visible,true);controlled.userData.update(30);assert.equal(times.at(-1),stoppedTime,'restarting operation does not jump');
 console.log('PASS operation lifecycle: hidden ancestor pause, emitter off/on, and stable restart');
})().catch(e=>{console.error(e);process.exitCode=1;});
