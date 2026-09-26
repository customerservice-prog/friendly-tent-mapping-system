import test from 'node:test';
import assert from 'node:assert/strict';
import {inflatableCatalog,inflatableItem,resolvedInflatableDefinition,INFLATABLES} from '../js/data/inflatables.js';
import {equipmentCatalog,EQUIPMENT} from '../js/data/equipment.js';
import {equipmentAssetDescriptor} from '../js/data/asset-registry.js';
import {summarizeEvent} from '../js/core/eventSummary.js';
import {objectLocalDimensions,objectGroundFootprint} from '../js/core/world-space.js';
import {rectFromObject} from '../js/core/geometry.js';
import {photoPlanSnapshot,runPhotoPlanChecks} from '../js/core/photo-plan.js';
import {walkBlockingObstacles} from '../js/core/walk-navigation.js';
const product=inflatableCatalog([{id:'castle-sku',external_id:'tenant:castle',name:'Blue Castle Bounce House',width_ft:12,length_ft:18,height_ft:14,price_per_day:249}],true)[0];
const bounds=points=>({width:Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),depth:Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))});
const near=(actual,expected)=>{for(const key of Object.keys(expected))assert.ok(Math.abs(actual[key]-expected[key])<1e-7,key+': '+actual[key]);};

test('saved inflatable identity, visual profile and dimensions survive catalog changes/removal',()=>{
 const saved=JSON.parse(JSON.stringify(inflatableItem(product,'saved',3,4))),before=structuredClone(saved);
 assert.equal(saved.productId,'castle-sku');assert.equal(saved.externalId,'tenant:castle');assert.equal(saved.dimensionsConfirmed,true);assert.equal(saved.heightConfirmed,true);
 const changed={...product,widthFt:36,depthFt:42,heightFt:28,name:'Renamed catalog item',style:'slide',colors:['#000','#000','#000'],pricePerDay:300};
 const resolved=resolvedInflatableDefinition(saved,changed);
 assert.deepEqual([resolved.widthFt,resolved.depthFt,resolved.heightFt,resolved.name,resolved.style],[12,18,14,'Blue Castle Bounce House','castle']);
 assert.equal(resolved.pricePerDay,300,'current prices still come from the current catalog');
 const removed=resolvedInflatableDefinition(saved,null);assert.equal(removed.name,'Blue Castle Bounce House');assert.equal(removed.pricePerDay,null);assert.equal(removed.widthFt,12);
 const summary=summarizeEvent({objects:[saved,{...saved,id:'copy',inflatableId:'old-local-alias'}]},{inflatables:[]});
 assert.equal(summary.lines.length,1);assert.equal(summary.lines[0].qty,2);assert.equal(summary.lines[0].productId,'castle-sku');assert.equal(summary.lines[0].label,'Blue Castle Bounce House');assert.equal(summary.total,null,'removed inventory never keeps a stale quote price');
 assert.deepEqual(saved,before,'render and review resolution do not rewrite stored plans');
});
test('legacy and modern quarter-turn saves agree across footprint/photo/walk without a second rotation',()=>{
 for(const rotationDeg of [90,270])for(const modern of [false,true]){
  const item=modern?{...inflatableItem(product,'saved',3,4),widthFt:18,depthFt:12,rotationDeg}:{id:'legacy',kind:'inflatable',inflatableId:product.id,x:3,y:4,widthFt:18,depthFt:12,rotationDeg};
  assert.deepEqual(objectLocalDimensions(item),{widthFt:12,depthFt:18});
  near(rectFromObject(item),{x:3,y:4,width:18,depth:12});near(bounds(objectGroundFootprint(item)),{width:18,depth:12});
  const model=resolvedInflatableDefinition(item,product);assert.equal(model.widthFt,12);assert.equal(model.depthFt,18);
  const snapshot={backgroundPhoto:{url:'/fixture.jpg'},photoSite:{widthFt:70,lengthFt:70},tent:{isSite:true,widthFt:70,lengthFt:70},objects:[{...item,photoPlacement:{x:20,y:20,rotationDeg:0}}]};
  const photo=photoPlanSnapshot(snapshot).objects[0];assert.deepEqual(objectLocalDimensions(photo),{widthFt:12,depthFt:18});near(bounds(objectGroundFootprint(photo)),{width:12,depth:18});near(bounds(walkBlockingObstacles({items:snapshot.objects})[0].polygon),{width:12,depth:18});
 }
 const legacy={id:'old',kind:'inflatable',inflatableId:product.id};assert.equal(resolvedInflatableDefinition(legacy,product).widthFt,12,'a missing legacy dimension still falls back to the catalog');
});
test('photo overlap and boundary checks use saved sizes even after catalog dimensions change',()=>{
 const saved=inflatableItem(product,'saved',3,4),snapshot={backgroundPhoto:{url:'/fixture.jpg'},photoSite:{widthFt:50,lengthFt:50},tent:{isSite:true,widthFt:50,lengthFt:50},objects:[saved],surfaceType:'grass'};
 INFLATABLES.push({...product,widthFt:100,depthFt:100});
 EQUIPMENT.push({id:'equipment-current',widthFt:100,depthFt:100});
 try{
  const changed={...snapshot,objects:[saved,{id:'small-saved-equipment',kind:'equipment',equipmentId:'equipment-current',x:30,y:30,widthFt:2,depthFt:2,modelWidthFt:2,modelDepthFt:2,footprintOriented:true}]};
  assert.deepEqual(runPhotoPlanChecks(changed),[],'oversized live metadata cannot create false collisions/edge failures in a saved plan');
 }finally{INFLATABLES.length=0;EQUIPMENT.length=0;}
});
test('equipment asset provenance agrees with accepted staff dimensions and rejects non-finite sizes',()=>{
 const p=equipmentCatalog([{id:'fan',name:'Fan',metadata:{widthFt:3,depthFt:2}}],true)[0];
 assert.equal(p.dimensionsConfirmed,true);assert.equal(p.asset.dimensions.status,'catalog-supplied');assert.equal(p.asset.dimensions.independentlyVerified,false);
 const invalid=equipmentCatalog([{id:'bad',name:'Fan',width_ft:Infinity,length_ft:3}],true)[0];assert.equal(invalid.dimensionsConfirmed,false);assert.equal(invalid.asset.dimensions.status,'unverified');
 assert.equal(equipmentAssetDescriptor({width_ft:3,length_ft:2,dimensionsConfirmed:false},'fan').dimensions.status,'unverified','explicit unconfirmed provenance wins over nominal values');
});
