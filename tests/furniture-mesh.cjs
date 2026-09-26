// Actual production Three.js meshes. This checks shape/scale/placement contracts;
// the dimensions remain planning estimates unless the catalog verifies them.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
  const threePath=require.resolve('three').replace('/build/three.cjs','/build/three.module.js'),THREE=await import(require('node:url').pathToFileURL(threePath));
  const draw=new Proxy({},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)}),context=vm.createContext({console,document:{createElement:()=>({width:0,height:0,getContext:()=>draw})}}),cache=new Map();
  const three=new vm.SyntheticModule(Object.keys(THREE),function(){for(const k of Object.keys(THREE))this.setExport(k,THREE[k]);},{context});
  function moduleFor(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});cache.set(file,m);return m;}
  async function load(file){const m=moduleFor(path.join(root,file));if(m.status==='unlinked')await m.link((s,r)=>s==='three'?three:moduleFor(s.startsWith('three/addons/')?path.resolve(path.dirname(threePath),'../examples/jsm',s.slice(13)):path.resolve(path.dirname(r.identifier),s)));if(m.status!=='evaluated')await m.evaluate();return m.namespace;}
  const models=await load('js/ui/equipment3d.js'),chairs=await load('js/data/chairs.js'),tables=await load('js/data/tables.js'),disposal=await load('js/ui/scene-environment.js');
  const inspect=(model,maxDraws,maxTriangles)=>{
    model.updateMatrixWorld(true);let draws=0,triangles=0;
    model.traverse(o=>{if(!o.isMesh)return;draws++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);for(const v of o.geometry.attributes.position.array)assert.ok(Number.isFinite(v));assert.ok(o.matrixWorld.elements.every(Number.isFinite));});
    assert.ok(draws<=maxDraws,`${model.name}: ${draws} draws`);assert.ok(triangles<maxTriangles,`${model.name}: ${triangles} triangles`);return new THREE.Box3().setFromObject(model);
  };
  const hit=(model,x,y,z,direction=[0,-1,0])=>new THREE.Raycaster(new THREE.Vector3(x,y,z),new THREE.Vector3(...direction)).intersectObject(model,true);
  const close=(actual,expected,note)=>assert.ok(Math.abs(actual-expected)<.001,`${note}: ${actual} != ${expected}`);
  const chairDef=chairs.byId('crossback-natural');assert.ok(chairDef,'real catalog exposes Cross-Back Farmhouse Chair');
  const chair=models.makeChair(chairDef),bounds=inspect(chair,3,15000);
  assert.equal(chair.userData.silhouette,'crossback');assert.ok(bounds.min.y>=-.005);assert.ok(bounds.max.y<=chairDef.backHeightFt+.02);
  assert.ok(bounds.max.x-bounds.min.x<=chairDef.seatWidthFt+.01);assert.ok(bounds.max.z-bounds.min.z<=chairDef.seatDepthFt+.01);
  assert.equal(hit(chair,0,1.8,0)[0]?.object.material.name,'Cross-back solid wood','seat is timber, not an invented cushion or woven pad');
  const crossY=(1.48+.08+chairDef.backHeightFt-.24)/2;
  assert.ok(hit(chair,0,crossY,1,[0,0,-1]).some(h=>h.object.material.name==='Cross-back solid wood'),'X rails intersect behind their center fastener');
  assert.ok(hit(chair,.28,crossY+.3,1,[0,0,-1]).length,'upper-right X arm is physical geometry');
  assert.ok(hit(chair,-.28,crossY+.3,1,[0,0,-1]).length,'upper-left X arm is physical geometry');
  assert.equal(hit(chair,0,chairDef.backHeightFt-.4,1,[0,0,-1]).length,0,'open X back retains space above its crossing, not a solid back panel');
  assert.ok(chair.children.every(o=>o.material.metalness<.5),'timber is not gold or metallic');
  const sweetheartDef=tables.byId('sweetheart-half-round-60');assert.ok(sweetheartDef,'real catalog exposes half-round sweetheart table');
  const item={id:'sweetheart-mesh',kind:'table',tableId:sweetheartDef.id,shape:'half-round',widthFt:5,depthFt:2.5,modelWidthFt:5,modelDepthFt:2.5,seatCount:0,chairId:chairDef.id};
  const table=models.makeTable(item),tableBounds=inspect(table,5,15000);close(tableBounds.min.y,0,'folding leg feet on ground');
  close(tableBounds.max.x-tableBounds.min.x,5.006,'nominal 60-inch tabletop plus narrow metal rim');close(tableBounds.max.z-tableBounds.min.z,2.506,'half-round depth plus narrow metal rim');
  close(hit(table,0,5,0)[0].point.y,2.5,'planning tabletop height');
  assert.ok(hit(table,2.35,5,-1.16).length,'straight diameter retains the back corners');
  assert.ok(hit(table,0,5,1.2).length,'curved front reaches the center of its bounding depth');
  assert.equal(hit(table,2.3,5,1.05).length,0,'curved corner is empty, never a full rectangle');
  assert.ok(table.children.some(o=>o.material.name==='Silver table edge and fasteners'));
  assert.ok(table.children.some(o=>o.material.name==='Folding table supports'&&o.material.metalness>.5));
  const dressed=models.makeTable({...item,linenId:'linen-round-120',linenColor:'Ivory'});inspect(dressed,6,21000);
  const cloth=dressed.children.filter(o=>o.material.isMeshPhysicalMaterial);assert.ok(cloth.length);assert.ok(hit(dressed,0,5,0).some(h=>h.object.material.isMeshPhysicalMaterial),'saved linen renders a top');
  assert.equal(hit(dressed,2.3,5,1.05).length,0,'saved linen follows D-shaped top rather than creating rectangular corners');
  // Canonical model dimensions survive a saved 90-degree oriented box. The
  // placement renderer rotates the entire table exactly once after this build.
  const rotatedItem={...item,widthFt:2.5,depthFt:5,rotationDeg:90,footprintOriented:true,seatCount:2},saved=JSON.stringify(rotatedItem),seated=models.makeTable(rotatedItem);
  inspect(seated,7,45000);const batches=seated.children.filter(o=>o.isInstancedMesh);assert.equal(batches.length,2);assert.ok(batches.every(b=>b.count===2));
  const matrix=new THREE.Matrix4(),centers=[];
  for(let i=0;i<2;i++){
    batches[0].getMatrixAt(i,matrix);const position=new THREE.Vector3().setFromMatrixPosition(matrix),back=new THREE.Vector3(0,0,-1).transformDirection(matrix);centers.push(position);
    assert.ok(position.z<-1.25,'both sweetheart chairs sit on the flat side');assert.ok(back.z<-.99,'both sweetheart chairs face the curved front');
  }
  assert.ok(centers[0].x*centers[1].x<0,'sweetheart guests sit next to one another');
  seated.rotation.y=-Math.PI/2;seated.updateMatrixWorld(true);
  const bareRotated=models.makeTable({...rotatedItem,seatCount:0});bareRotated.rotation.y=-Math.PI/2;
  const rotatedBounds=new THREE.Box3().setFromObject(bareRotated);close(rotatedBounds.max.x-rotatedBounds.min.x,2.506,'rotated tabletop width');close(rotatedBounds.max.z-rotatedBounds.min.z,5.006,'rotated tabletop depth');assert.equal(JSON.stringify(rotatedItem),saved,'mesh never mutates saved placement');
  // Selected place settings and centerpieces remain in the same table-local
  // coordinates when a saved scene stores an oriented bounding box.
  const tabletop=await load('js/data/tabletop.js');
  tabletop.TABLETOP.push({id:'mesh-plate',productId:'mesh-plate',type:'plate',name:'Dinner Plate',perSeat:true},{id:'mesh-floral',productId:'mesh-floral',type:'centerpiece',name:'Floral Centerpiece',perSeat:false});
  const extras=[{productId:'mesh-plate',perSeat:true},{productId:'mesh-floral',qty:3}],decorated=models.makeTable({...item,seatCount:2,tabletop:extras}),decoratedRotated=models.makeTable({...rotatedItem,tabletop:extras});
  const decorationGeometry=model=>model.getObjectByName('Selected tabletop rentals').children.map(mesh=>Array.from(mesh.geometry.attributes.position.array));
  assert.deepEqual(decorationGeometry(decoratedRotated),decorationGeometry(decorated),'rotated saved box cannot clamp place settings onto a swapped tabletop');
  const settings=decorated.getObjectByName('Selected tabletop rentals');settings.updateMatrixWorld(true);
  assert.ok(hit(settings,-5/6,6,-.69).length,'left guest place setting sits in front of the left sweetheart seat');
  assert.ok(hit(settings,5/6,6,-.69).length,'right guest place setting sits in front of the right sweetheart seat');
  tabletop.TABLETOP.splice(-2);disposal.disposeGroup(decorated);disposal.disposeGroup(decoratedRotated);
  // Independent tenant SKUs can share the known plastic model without sharing
  // identity or pricing. Both canonical and suffixed IDs must use white plastic.
  const plastic=tables.byId('banquet-6ft'),duplicate={...plastic,id:'banquet-6ft--tenant-second-sku',pricePerDay:37.25};tables.TABLES.push(duplicate);
  for(const definition of [plastic,duplicate]){
    const model=models.makeTable({id:definition.id,tableId:definition.id,shape:'rect',widthFt:6,depthFt:2.5,seatCount:0}),b=inspect(model,4,10000);
    close(b.max.x-b.min.x,6,'plastic table width');close(b.max.z-b.min.z,2.5,'plastic table depth');
    assert.ok(model.children.some(o=>o.material.name==='White plastic folding tabletop'));
    assert.ok(!model.children.some(o=>o.material.name==='Wood tabletop'),'plastic duplicate is never rendered as timber');
    const supports=model.children.find(o=>o.material.name==='Folding table supports');assert.ok(supports.material.color.r<.1,'official plastic table has dark supports');
    assert.equal(hit(model,0,5,0)[0]?.object.material.name,undefined,'folding seam remains visible between top halves');
    assert.equal(model.userData.itemId,definition.id);disposal.disposeGroup(model);
  }
  assert.equal(tables.byId(duplicate.id).pricePerDay,37.25);assert.equal(tables.byId(plastic.id).pricePerDay,plastic.pricePerDay);tables.TABLES.pop();
  for(const model of [chair,table,dressed,seated,bareRotated])disposal.disposeGroup(model);
  console.log('PASS furniture meshes: solid-wood X back, open rails, half-round edge/linen, same-side seating, canonical rotation, plastic SKU identity, feet units and bounded geometry');
})().catch(e=>{console.error(e);process.exitCode=1;});
