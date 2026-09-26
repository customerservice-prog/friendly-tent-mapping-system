import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chairPositions} from '../js/core/seating.js';
import {chairPlanSvg} from '../js/ui/equipment-symbols.js';
import {chairVisual,tableVisual,tableCard,tableControls,chairsDrawer,equipmentPreview,orderEquipment} from '../js/ui/equipment-controls.js';
import {byId as tableById} from '../js/data/tables.js';
import {byId as chairById} from '../js/data/chairs.js';
const table=tableById('sweetheart-half-round-60'),chair=chairById('crossback-natural');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
function placed(rotationDeg=0){const turned=rotationDeg%180!==0;return {id:'sweetheart-placement',kind:'table',tableId:table.id,shape:table.shape,widthFt:turned?2.5:5,depthFt:turned?5:2.5,modelWidthFt:5,modelDepthFt:2.5,footprintOriented:true,rotationDeg,seatCount:2,chairId:chair.id};}

test('sweetheart seats stay together on the straight edge through every quarter turn',()=>{
 for(const angle of [0,90,180,270]){
  const item=placed(angle),before=structuredClone(item),positions=chairPositions(item,chair),a=angle*Math.PI/180;
  assert.equal(positions.length,2);
  for(const p of positions){const x=p.x*Math.cos(a)+p.y*Math.sin(a),y=-p.x*Math.sin(a)+p.y*Math.cos(a);near(y,-1.25-chair.seatDepthFt/2-.35);assert.ok(Math.abs(x)<2.5);near(p.angle,-Math.PI/2+a);}
  assert.deepEqual(item,before,'seating cannot rewrite saved dimensions or coordinates');
 }
 for(const count of [0,1,2,8])assert.equal(chairPositions({...placed(),seatCount:count},chair).length,Math.min(2,count),'sweetheart model supports at most two seats');
});

test('crossback has its own crossed-rail symbol and fallback, preserving actual chair identity',()=>{
 const svg=chairPlanSvg('crossback');assert.notEqual(svg,chairPlanSvg('folding'));assert.notEqual(svg,chairPlanSvg('chiavari'));assert.match(svg,/M19 70L81 91M81 70L19 91/);
 assert.match(chairVisual({...chair,id:'fallback',photoUrl:null}),/M30 34L68 65M70 34L32 65/);
 const sku={...chair,id:'crossback-natural--actual-product',visualModelId:chair.id,productId:'actual-product'};
 assert.match(chairsDrawer([sku],sku.id,[]),/data-id="crossback-natural--actual-product"/);assert.match(chairsDrawer([sku],sku.id,[]),/dimensions approximate/);
 assert.match(equipmentPreview(chair.id),/crossback-natural\.png/);assert.match(equipmentPreview(table.id),/sweetheart-half-round-60\.png/);
});

test('sweetheart card and inspector keep the D-shaped tabletop, chair count, and estimated dimensions',()=>{
 for(const angle of [0,90,180,270]){const visual=tableVisual(table,chair,placed(angle));assert.match(visual,/data-table-shape="half-round"/);assert.match(visual,/M-2\.5 -1\.25H2\.5A2\.5 2\.5 0 0 1 -2\.5 -1\.25Z/);assert.match(visual,new RegExp('transform="rotate\\('+angle+'\\)"'));}
 const card=tableCard(table,chair,0);assert.match(card,/Table \+ 2 chairs/);assert.match(card,/approximate dimensions/);assert.match(card,/Confirm pricing/);
 const controls=tableControls(placed(),table,[chair],[]);assert.match(controls,/data-dimension-status="estimated"/);assert.match(controls,/30-inch depth is inferred/);assert.match(controls,/data-chair-dimension-status="estimated"/);assert.match(controls,/dimensions are illustrative/);
});

test('an alternate plastic table SKU retains plastic material and its own product selection',()=>{
 const original=tableById('banquet-6ft'),sku={...original,id:'banquet-6ft--actual-uuid',visualModelId:'banquet-6ft',productId:'actual-uuid'};
 assert.match(tableVisual(sku,{}),/class="table-surface" fill="#eeeee5"/);assert.doesNotMatch(tableVisual(sku,{}),/stroke="#6e451f"/,'plastic does not inherit wood grain');
 assert.match(tableCard(sku,chair,0),/data-id="banquet-6ft--actual-uuid"/);
 assert.deepEqual(orderEquipment([table,sku]).map(p=>p.id),[sku.id,table.id]);
});
