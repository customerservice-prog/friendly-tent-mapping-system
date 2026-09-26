import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {equipmentAssetDescriptor,equipmentOperationProfile,EQUIPMENT_ASSET_VERSION} from '../js/data/asset-registry.js';
import {equipmentCatalog,equipmentItem,genericEquipment} from '../js/data/equipment.js';
import {accessoryCatalog,accessoryItem} from '../js/data/accessories.js';

test('catalog photo review and dimensional verification are separate evidence',()=>{
  const product={id:'foam',external_id:'fpr:foam-party-machine',width_ft:null,length_ft:null},asset=equipmentAssetDescriptor(product,'foam-machine');
  assert.equal(asset.fidelity,'photo-referenced-procedural');assert.match(asset.source.referenceUrl,/foam-party-machine$/);
  assert.equal(asset.version,EQUIPMENT_ASSET_VERSION);assert.equal(asset.dimensions.status,'unverified');assert.equal(asset.dimensions.independentlyVerified,false);
  assert.equal(equipmentAssetDescriptor({...product,width_ft:3,length_ft:4},'foam-machine').dimensions.status,'catalog-supplied');
  assert.equal(equipmentAssetDescriptor({...product,external_id:'another-company:foam'},'foam-machine').source.referenceUrl,null);
  assert.notEqual(equipmentAssetDescriptor({...product,external_id:'another-company:foam'},'foam-machine').fidelity,'photo-referenced-procedural');
});
test('operating previews are available only for equipment with a supported operation',()=>{
  for(const type of ['foam-machine','fan','popcorn','cotton-candy','snow-cone','chocolate-fountain'])assert.equal(equipmentOperationProfile(type).supported,true,type);
  for(const type of ['stanchion','cooler','fill-chill','trash-can','power-distribution','podium','cornhole','connect-four','tumbling-timbers','stage'])assert.equal(equipmentOperationProfile(type).supported,false,type);
});
test('asset version, source SKU, operation and original dimensions travel with a placed item',()=>{
  const source={id:'f',name:'Foam Machine',external_id:'fpr:foam-party-machine',category:'other',width_ft:3.2,length_ft:2.4,metadata:{heightFt:5},price_per_day:'175'},product=equipmentCatalog([source],true)[0],placed=equipmentItem(product,'placed',7,8);
  assert.equal(placed.asset.source.productId,'f');assert.equal(placed.asset.version,EQUIPMENT_ASSET_VERSION);assert.equal(placed.operationState,'running');assert.deepEqual([placed.widthFt,placed.depthFt,placed.heightFt],[3.2,2.4,5]);assert.equal(placed.productId,'f');
  const legacy=accessoryItem(accessoryCatalog([source],true)[0],'old',2,4);assert.equal(legacy.asset.version,EQUIPMENT_ASSET_VERSION);assert.equal(legacy.operationState,'running');
  const distribution=accessoryCatalog([{id:'power',name:'Power Distribution Box',category:'other'}])[0];assert.equal(distribution.accessoryType,'power-distribution');assert.equal(distribution.animated,false);
  assert.ok(genericEquipment().every(p=>p.asset.dimensions.status==='unverified'));
  const post=accessoryCatalog([{id:'post',name:'Crowd Control Stanchion',category:'other'}])[0];assert.equal(post.widthFt,1.2,'an unmeasured single stanchion is not assigned the former paired-post footprint');assert.equal(post.dimensionsConfirmed,false);
  assert.equal(accessoryCatalog([{id:'measured-post',name:'Crowd Control Stanchion',category:'other',width_ft:1.4,length_ft:1.4}])[0].widthFt,1.4,'catalog dimensions win over the illustrative model');
});
test('public visual library agrees with renderer asset versions and operating capabilities',()=>{
  let handler;const router={get:(_path,fn)=>handler=fn},context={module:{exports:{}},require:name=>{assert.equal(name,'express');return {Router:()=>router};}};
  vm.runInNewContext(fs.readFileSync(new URL('../server/src/routes/visualLibrary.js',import.meta.url),'utf8'),context);
  let response;handler({query:{category:'equipment'}},{json:value=>response=value});
  assert.ok(response.visuals.length>20);
  for(const visual of response.visuals){const expected=equipmentAssetDescriptor({},visual.id);assert.equal(visual.asset.version,expected.version,visual.id);assert.equal(visual.animated,expected.operation.supported,visual.id);assert.equal(visual.asset.operation.id,expected.operation.id,visual.id);assert.equal(visual.asset.fidelity,expected.fidelity,visual.id);assert.equal(visual.asset.dimensions.independentlyVerified,false);assert.equal(visual.asset.source.referenceUrl,null,'generic library has no SKU photo verification');}
});
