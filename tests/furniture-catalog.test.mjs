import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {liveCatalog} from '../js/data/catalog.js';
import {inferVisualModel,catalogProductCategory} from '../js/data/visualResolver.js';
import {TABLES} from '../js/data/tables.js';
import {CHAIRS} from '../js/data/chairs.js';
import {equipmentCatalog} from '../js/data/equipment.js';
import {summarizeEvent} from '../js/core/eventSummary.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/friendly-furniture-20260926.json',import.meta.url),'utf8')).products;
function syncHelpers(){
 const module={exports:{}},source=fs.readFileSync(new URL('../server/src/friendlyCatalogSync.js',import.meta.url),'utf8');
 vm.runInNewContext(source,{module,exports:module.exports,require:id=>{assert.equal(id,'./db');return {query:()=>{throw Error('No writes in mapping tests');}};},URL,console,process:{env:{}}});
 return module.exports._test;
}
const expected={'fpr:6ft-plastic-folding-table':['table','banquet-6ft',13],'fpr:cross-back-farmhouse-chair':['chair','crossback-natural',14],'fpr:sweetheart-table-60in-half-round':['table','sweetheart-half-round-60',35]};
test('actual miscategorized Friendly rows become exact furniture selections before category filtering',()=>{
 const before=structuredClone(fixture),tables=liveCatalog('table',TABLES,fixture,true),chairs=liveCatalog('chair',CHAIRS,fixture,true),mapped=[...tables,...chairs];
 assert.equal(tables.length,2);assert.equal(chairs.length,1);
 for(const source of fixture){
  const [category,model,price]=expected[source.external_id],resolved=mapped.find(p=>p.productId===source.id);
  assert.equal(source.category,'other');assert.equal(source.visual_model_id,null);
  assert.equal(catalogProductCategory(source),category);assert.equal(inferVisualModel(source),model);
  assert.equal(resolved.id,model);assert.equal(resolved.pricePerDay,price);assert.equal(resolved.photoUrl,source.photo_url);assert.equal(resolved.externalId,source.external_id);assert.equal(resolved.dimensionsConfirmed,false);assert.match(resolved.dimensionsNote,/confirm measurements/i);
 }
 assert.equal(equipmentCatalog(fixture,true,new Set(mapped.map(p=>p.productId))).length,0,'furniture no longer appears again as generic floor equipment');
 assert.deepEqual(fixture,before,'read-only inference does not rewrite source rows');
 const sweetheart=tables.find(p=>p.id==='sweetheart-half-round-60');assert.equal(sweetheart.shape,'half-round');assert.equal(sweetheart.seatingLayout,'sweetheart');assert.deepEqual(sweetheart.seatsOptions,[0,2]);assert.equal(sweetheart.seatsDefault,2);assert.deepEqual([sweetheart.widthFt,sweetheart.depthFt],[5,2.5]);assert.equal(sweetheart.dimensionProvenance,'named-span-and-derived-half-round');
 const scene={objects:[{id:'head',kind:'table',tableId:sweetheart.id,seatCount:2,chairId:chairs[0].id},{id:'banquet',kind:'table',tableId:'banquet-6ft',seatCount:0}]},summary=summarizeEvent(scene,{tables,chairs});
 assert.equal(summary.total,76);assert.equal(summary.seats,2);assert.equal(summary.lines.find(l=>l.category==='chair').productId,chairs[0].productId);assert.deepEqual(summary.lines.map(l=>l.productId).sort(),fixture.map(p=>p.id).sort());
});
test('fallback is tenant-neutral, narrow and never overrides explicit mappings or unrelated categories',()=>{
 for(const p of fixture){const other={...p,id:'another-tenant-'+p.id,external_id:'another-company:'+p.external_id.split(':')[1]};assert.equal(inferVisualModel(other),expected[p.external_id][1]);}
 const blocked=[
  {category:'other',name:'Cross-Back Farmhouse Chair Cushion'},
  {category:'other',name:'6ft Plastic Folding Table Cover'},
  {category:'other',name:'Sweetheart Table (60in Half-Round) Package'},
  {category:'other',name:'Sweetheart Table (72in Half-Round)'},
  {category:'other',name:'Sweetheart Table (60in Full Round)'},
  {category:'linen',name:'6ft Plastic Folding Table'},
  {category:'package',name:'Cross-Back Farmhouse Chair'},
 ];
 for(const p of blocked)assert.equal(inferVisualModel(p),null,p.name+' / '+p.category);
 const explicit={...fixture[0],visual_model_id:'admin-custom-unsupported'};assert.equal(inferVisualModel(explicit),'admin-custom-unsupported');assert.equal(liveCatalog('table',TABLES,[explicit],true).length,0,'an explicit unsupported mapping is not silently substituted');
 const existing={id:'round',category:'table',name:'5ft Round Table',visual_model_id:'round-5ft',price_per_day:20};assert.equal(liveCatalog('table',TABLES,[existing],true)[0].id,'round-5ft');
 assert.equal(inferVisualModel({category:'table',name:'Sweetheart Table (72in Half-Round)'}),null,'unsupported half-round sizes cannot fall through into a full round model');
});
test('variants retain separate pricing and identity and hidden prices stay hidden',()=>{
 const source=fixture.find(p=>p.external_id==='fpr:cross-back-farmhouse-chair'),variant={...source,id:'second-chair',external_id:'other:chair',price_per_day:'19.00'};
 const visible=liveCatalog('chair',CHAIRS,[source,variant],true);assert.equal(visible.length,2);assert.equal(new Set(visible.map(p=>p.id)).size,2);assert.deepEqual(visible.map(p=>p.pricePerDay).sort(),[14,19]);assert.deepEqual(visible.map(p=>p.productId).sort(),[source.id,variant.id].sort());
 assert.ok(liveCatalog('chair',CHAIRS,[source,variant],false).every(p=>p.pricePerDay===null));
});
test('Friendly import assigns supported families and profiles without inventing API dimensions',()=>{
 const {refineCategory,visualModel,parse}=syncHelpers(),library=fs.readFileSync(new URL('../server/src/routes/visualLibrary.js',import.meta.url),'utf8');
 for(const source of fixture){
  const [category,model]=expected[source.external_id];assert.equal(refineCategory(source.name,'other'),category);assert.equal(visualModel({...source,category}),model);
  const html='<script type="application/ld+json">'+JSON.stringify({'@type':'Product',name:source.name,image:source.photo_url,offers:{price:source.price_per_day}})+'</script>';
  const parsed=parse('https://www.friendlypartyrental.com/items/'+source.external_id.split(':')[1],html);
  assert.equal(parsed.category,category);assert.equal(parsed.visualModelId,model);assert.equal(parsed.price,Number(source.price_per_day));assert.equal(parsed.widthFt,null);assert.equal(parsed.lengthFt,null,'a shape-derived dimension never becomes imported measured data');assert.ok(library.includes("id: '"+model+"'"));
 }
 assert.equal(visualModel({name:'Sweetheart Table (60in Half-Round) Package',category:'table'}),null);
 assert.equal(visualModel({name:'Sweetheart Table (72in Half-Round)',category:'table'}),null);
});
