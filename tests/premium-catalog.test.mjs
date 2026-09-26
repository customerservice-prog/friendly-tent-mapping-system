import test from 'node:test';
import assert from 'node:assert/strict';
import {equipmentCatalog,equipmentItem} from '../js/data/equipment.js';
import {liveCatalog} from '../js/data/catalog.js';
import {summarizeEvent} from '../js/core/eventSummary.js';
import {createLayoutStore} from '../js/core/layoutStore.js';
import {rectFromObject} from '../js/core/geometry.js';
import {assessCaptureFrames} from '../js/core/capture-quality.js';
import {normalizeVenueScan} from '../js/ui/venue-photo.js';
import {buildBookingHandoff} from '../js/core/bookingHandoff.js';
test('distinct products sharing a chair model keep independent identity and price',()=>{
 const source=[{id:'a',category:'chair',name:'White resin A',visual_model_id:'resin',price_per_day:4},{id:'b',category:'chair',name:'White resin B',visual_model_id:'resin',price_per_day:6}];
 const rows=liveCatalog('chair',[{id:'resin'}],source,true);assert.equal(rows.length,2);assert.equal(new Set(rows.map(p=>p.id)).size,2);assert.deepEqual(rows.map(p=>p.productId),['a','b']);
});
test('foam, fan and unknown physical products survive catalog through save/review; missing prices block booking',()=>{
 const products=[{id:'foam',name:'Foam machine',category:'other',external_id:'fpr:foam-machine',price_per_day:75},{id:'fan',name:'20 inch fan',category:'accessory',price_per_day:null},{id:'unknown',name:'Special rental',category:'other',price_per_day:4},{id:'disabled',name:'Generator',active:false}];
 const equipment=equipmentCatalog(products,true,new Set());assert.equal(equipment.length,3);assert.equal(equipment[0].type,'foam-machine');assert.equal(equipment[2].visualFidelity,'footprint');assert.equal(equipment[0].dimensionsConfirmed,false);
 const store=createLayoutStore({tentId:null,objects:[],zones:[],aisles:[]});equipment.forEach((p,i)=>store.addObject(equipmentItem(p,'item'+i,i*5,0)));store.undo();store.redo();
 const saved=JSON.parse(JSON.stringify(store.getState())),summary=summarizeEvent(saved,{equipment});assert.equal(summary.lines.length,3);assert.equal(summary.lines[0].productId,'foam');assert.equal(summary.total,null);assert.equal(summary.knownSubtotal,79);
 const stale=summarizeEvent(saved,{equipment:[]});assert.equal(stale.lines[0].label,'Foam machine');assert.equal(stale.lines[0].productId,'foam');assert.equal(stale.total,null);
 assert.throws(()=>buildBookingHandoff({tenant:'friendly',lines:summary.lines,products}),/confirmation/);
});
test('oriented equipment footprint is not rotated twice in clearance checks',()=>{assert.deepEqual(rectFromObject({x:3,y:5,widthFt:10,depthFt:3,rotationDeg:90,footprintOriented:true}),{x:3,y:5,width:10,depth:3});});
test('duplicate and blank scan frames do not pass capture quality checks',()=>{
 const data=new Uint8ClampedArray(16*16*4).fill(128),image={data,width:16,height:16};assert.equal(assessCaptureFrames([image,image,image]).usable,false);
 const scan=normalizeVenueScan({frames:['left','center','right'].map(role=>({role,url:'https://example.com/same.jpg'}))});assert.notEqual(scan.status,'ready');assert.equal(scan.accuracy,'unverified');
});
test('legacy seeds, consumables, packages and tabletop items never become fake floor equipment',()=>{
 const products=[{id:'seed',name:'White Resin Chair',category:'chair',external_id:'resin-white',visual_model_id:'resin-white'},{id:'plate',name:'Dinner Plate',category:'other'},{id:'sugar',name:'Cotton Candy Floss Sugar - Grape',category:'other'},{id:'pkg',name:'Foam Party Package',category:'package'},{id:'machine',name:'Cotton Candy Machine/Floss Maker',category:'other'},{id:'booth4',name:'Photobooth (4-Hour) With Attendant',category:'other'},{id:'booth6',name:'Photobooth (6-Hour) No Attendant',category:'other'},{id:'extra',name:'Photobooth Extra Hour (Attended)',category:'other'}];
 const rows=equipmentCatalog(products,false,new Set());assert.deepEqual(rows.map(p=>p.productId),['machine','booth4','booth6']);assert.equal(rows[0].type,'cotton-candy');assert.equal(rows[1].type,'photobooth');assert.equal(rows[2].type,'photobooth');
});


test('operating effects animate while unattended games remain stationary',()=>{
 const products=[
  {id:'bubble',name:'Bubble Machine',category:'other'},
  {id:'fog',name:'Fog Machine',category:'other'},
  {id:'confetti',name:'Confetti Launcher Machine',category:'other'},
  {id:'heater',name:'Patio Heater',category:'other'},
  {id:'karaoke',name:'Karaoke System',category:'other'},
  {id:'screen',name:'Projection Screen',category:'other'},
  {id:'cornhole',name:'Cornhole',category:'other'},
  {id:'connect4',name:'Giant Connect Four',category:'other'},
 ];
 const rows=equipmentCatalog(products,false,new Set()),byId=id=>rows.find(r=>r.productId===id);
 assert.equal(byId('bubble').type,'bubble-machine');
 assert.equal(byId('fog').type,'fog-machine');
 assert.equal(byId('confetti').type,'confetti-machine');
 assert.equal(byId('heater').type,'heater');
 assert.equal(byId('karaoke').type,'karaoke');
 assert.equal(byId('screen').type,'screen');
 for(const row of rows)assert.equal(row.animated,!['cornhole','connect4'].includes(row.productId),row.name+' motion must follow its supported operation');
});
