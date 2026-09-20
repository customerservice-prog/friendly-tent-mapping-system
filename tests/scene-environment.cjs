// Geometry/material validation runs without a GPU; this is not visual WebGL QA.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const threePath=process.env.RENTSKETCH_THREE_MODULE || require.resolve('three').replace('/build/three.cjs','/build/three.module.js');
 const THREE=await import(require('node:url').pathToFileURL(threePath));
 const draw=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(t,k)=>t[k]||(()=>{}),set:(t,k,v)=>(t[k]=v,true)});
 const context=vm.createContext({console,document:{createElement:()=>({width:0,height:0,getContext:()=>draw})}}),cache=new Map();
 const three=new vm.SyntheticModule(Object.keys(THREE),function(){for(const key of Object.keys(THREE))this.setExport(key,THREE[key]);},{context});
 function moduleFor(file){if(cache.has(file))return cache.get(file);const source=fs.readFileSync(file,'utf8')+(file.endsWith('/ui/view3d.js')?'\nexport {table as buildTableForTest};':'');const module=new vm.SourceTextModule(source,{context,identifier:file});cache.set(file,module);return module;}
 async function load(file){const module=moduleFor(file);if(module.status==='unlinked')await module.link((specifier,ref)=>specifier==='three'?three:moduleFor(specifier.startsWith('three/addons/')?path.resolve(path.dirname(threePath),'../examples/jsm',specifier.slice('three/addons/'.length)):path.resolve(path.dirname(ref.identifier),specifier)));return module;}
 const module=await load(path.join(root,'js/ui/scene-environment.js'));await module.evaluate();
 for(const tent of [{type:'pole',widthFt:20,lengthFt:20},{type:'frame',widthFt:20,lengthFt:20},{type:'pole',widthFt:40,lengthFt:100}]){
  const env=module.namespace.createEnvironment(tent,'notSure');env.updateMatrixWorld(true);let draws=0,triangles=0,disposed=0;
  env.traverse(o=>{if(!o.isMesh)return;draws++;const a=o.geometry.attributes.position.array;assert.ok(Array.from(a).every(Number.isFinite));assert.ok(o.matrixWorld.elements.every(Number.isFinite));triangles+=(o.geometry.index?.count||a.length/3)/3*(o.isInstancedMesh?o.count:1);o.geometry.addEventListener('dispose',()=>disposed++);});
  assert.ok(draws<160,'scenery draw-call budget: '+draws);assert.ok(triangles<50000,'scenery triangle budget: '+triangles);
  assert.equal(env.userData.setting,tent.type==='pole'?'backyard':'driveway');
  assert.equal(!!env.getObjectByName('Paved tent surface'),tent.type==='frame');
  const trees=env.getObjectByName('Backyard boundary trees');assert.equal(trees.children.length,6);
  const installation=new THREE.Box3(new THREE.Vector3(-tent.widthFt/2-5,0,-tent.lengthFt/2-5),new THREE.Vector3(tent.widthFt/2+5,35,tent.lengthFt/2+5));
  for(const tree of trees.children){
    const leaves=tree.getObjectByName('Individual broadleaf sprays');
    assert.ok(leaves?.isInstancedMesh && Array.from(leaves.instanceMatrix.array).every(Number.isFinite),'foliage transforms must be renderable');
    assert.ok(!new THREE.Box3().setFromObject(tree).intersectsBox(installation),'trees must stay outside the tent and its anchoring clearance');
  }
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
 // Real mesh interaction and scale checks for the upgraded furniture.
 const equipment=await load(path.join(root,'js/ui/equipment3d.js'));await equipment.evaluate();
 const chairs=(await load(path.join(root,'js/data/chairs.js'))).namespace.CHAIRS;
 const counts=new Set();
 for(const definition of chairs){
  const chair=equipment.namespace.makeChair(definition),bounds=new THREE.Box3().setFromObject(chair);
  assert.ok(bounds.min.y>=-.01 && bounds.max.y>2.4 && bounds.max.y<5.5,definition.id+' has believable chair height');
  let vertices=0;chair.traverse(o=>{if(!o.isMesh)return;vertices+=o.geometry.attributes.position.count;assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));});
  counts.add(vertices);assert.ok(chair.children.length<=3,'chair details consolidated into at most three draws');
  module.namespace.disposeGroup(chair);
 }
 assert.ok(counts.size>=4,'folding, resin, Chiavari and throne have distinct geometry');
 const item={id:'seated',tableId:'round-5ft',shape:'round',widthFt:5,depthFt:5,seatCount:8,chairId:'resin-white'};
 const seated=equipment.namespace.makeTable(item),batches=seated.children.filter(o=>o.isInstancedMesh);
 assert.equal(batches.length,3);assert.ok(batches.every(o=>o.count===8 && o.userData.itemId==='seated'));
 const matrix=new THREE.Matrix4();batches[0].getMatrixAt(0,matrix);
 const seatPosition=new THREE.Vector3().setFromMatrixPosition(matrix),backDirection=new THREE.Vector3(0,0,-1).transformDirection(matrix);
 assert.ok(backDirection.dot(seatPosition.clone().normalize())>.99,'chairs face the table, with their backs outward');
 seated.updateMatrixWorld(true);
 const hit=new THREE.Raycaster(new THREE.Vector3(seatPosition.x,5,seatPosition.z),new THREE.Vector3(0,-1,0)).intersectObject(seated,true);
 assert.equal(hit[0]?.object.userData.itemId,'seated','tapping instanced chairs selects their actual table');
 assert.ok(seated.children.length<=7,'four fully seated tables fit within 28 furniture draws');
 const profile=equipment.namespace.tableProfile;
 assert.equal(profile({...item,linenId:'linen-round-90'}).drop,1.25);
 assert.equal(profile({...item,linenId:'linen-round-120'}).drop,2.44);
 assert.equal(profile({...item,tableId:'cocktail'}).height,3.5);
 for(const linenId of ['linen-runner-9ft','linen-napkins']){
  const table=equipment.namespace.makeTable({...item,seatCount:0,linenId});
  const cloth=table.children.find(o=>o.material?.isMeshPhysicalMaterial);cloth.geometry.computeBoundingBox();
  assert.ok(cloth.geometry.boundingBox.min.y>.45,'partial linens never become a floor-length tablecloth');
  module.namespace.disposeGroup(table);
 }
 const floor=equipment.namespace.makeDanceFloor([{id:'a',x:0,y:0,widthFt:3,depthFt:3},{id:'b',x:6,y:0,widthFt:3,depthFt:3}],{widthFt:9,lengthFt:3});floor.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(new THREE.Vector3(0,5,0),new THREE.Vector3(0,-1,0));
 assert.equal(ray.intersectObject(floor,true).length,0,'a gap between floor sections must stay empty');
 ray.set(new THREE.Vector3(-3,5,0),new THREE.Vector3(0,-1,0));assert.ok(ray.intersectObject(floor,true).length>0);
 assert.equal(floor.children.length,5);
 const light=view.namespace.makeLighting({id:'pole-20x20',type:'pole',widthFt:20,lengthFt:20},'lighting-chandelier');
 const bulb=light.children.find(o=>o.material?.emissive?.getHex());assert.ok(bulb);
 light.userData.setNight(true);assert.equal(bulb.material.emissiveIntensity,5);light.userData.setNight(false);assert.equal(bulb.material.emissiveIntensity,.7);
 for(const group of [seated,floor,light])module.namespace.disposeGroup(group);
 const weatherModule=await load(path.join(root,'js/ui/scene-weather.js'));await weatherModule.evaluate();
 const guestModule=await load(path.join(root,'js/ui/scene-guests.js'));await guestModule.evaluate();
 const framing=await load(path.join(root,'js/ui/view3d-framing.js'));await framing.evaluate();
 const tent={type:'pole',widthFt:20,lengthFt:20};
 const weather=weatherModule.namespace.createWeather(tent,{mobile:true});
 assert.ok(weather.getObjectByName('Visible sun').visible);assert.ok(!weather.getObjectByName('Moon').visible);
 for(const aspect of [390/550,1440/740]){
  const fit=framing.namespace.fitTentCamera(tent,16,aspect,36,5),camera=new THREE.PerspectiveCamera(36,aspect,.1,1200);camera.position.set(...fit.position);camera.lookAt(new THREE.Vector3(...fit.target));camera.updateMatrixWorld(true);
  const point=weather.getObjectByName('Visible sun').position.clone().project(camera);assert.ok(Math.abs(point.x)<1&&Math.abs(point.y)<1,'sun is in the opening view: '+JSON.stringify(point));
 }
 weather.userData.setNight(true);assert.ok(weather.getObjectByName('Moon').visible);assert.ok(!weather.getObjectByName('Visible sun').visible);
 weather.userData.setWeather('rain');weather.userData.update(.033);
 const rain=weather.getObjectByName('Rain outside the canopy');assert.ok(rain.visible);assert.equal(rain.geometry.attributes.position.count,720);
 const drops=rain.geometry.attributes.position;for(let i=0;i<drops.count;i+=2){assert.ok([drops.getX(i),drops.getY(i),drops.getZ(i)].every(Number.isFinite));assert.ok(drops.getY(i)<0||Math.abs(drops.getX(i))>=11.5||Math.abs(drops.getZ(i))>=11.5,'no rain through the roof');}
 weather.userData.setWeather('clear');assert.ok(!rain.visible&&weather.getObjectByName('Moon').visible);
 const guestObjects=[{...item,kind:'table',x:2,y:2}],beforeGuests=JSON.stringify(guestObjects),guests=guestModule.namespace.createGuests(tent,guestObjects,{mobile:true});
 assert.ok(guests.children.length<=10);assert.equal(guests.userData.people.filter(p=>p.seated).length,8);
 assert.ok(guests.userData.people.every(p=>Math.abs(p.x)<tent.widthFt/2&&Math.abs(p.z)<tent.lengthFt/2),'party guests stay under the tent');
 const matrices=Array.from(guests.children[0].instanceMatrix.array);guests.userData.update(.1);assert.notDeepEqual(Array.from(guests.children[0].instanceMatrix.array),matrices);
 for(const batch of guests.children){assert.ok(batch.isInstancedMesh);assert.ok(Array.from(batch.instanceMatrix.array).every(Number.isFinite));assert.ok(batch.count<=batch.instanceMatrix.count);}
 assert.equal(JSON.stringify(guestObjects),beforeGuests,'decorative guests never mutate rental objects');
 assert.ok(light.children.filter(o=>o.isPointLight).length<=6,'event lighting remains bounded on mobile');
 for(const group of [weather,guests])module.namespace.disposeGroup(group);
 console.log('PASS sky/guests: visible initial sun, day/moon/rain transitions, dry canopy, bounded guest draws, finite animated transforms, unchanged rental data');
 console.log('PASS furniture: distinct chair geometry, seating orientation and selectable instances, scale/linen length, floor gaps, bounded draw calls, day/night lighting, disposal');
 console.log('PASS 3D table geometry: removing linen removes cloth; selected linen uses its exact color on round and rectangular tables (not visual GPU QA)');

})().catch(e=>{console.error(e);process.exitCode=1;});
