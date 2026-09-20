import {test} from 'node:test';
import assert from 'node:assert/strict';
import {partyLayout,activityPositions} from '../js/core/party-scene.js';
import {TABLES} from '../js/data/tables.js';
import {CHAIRS} from '../js/data/chairs.js';
import {LINENS} from '../js/data/linens.js';
import {chairPositions} from '../js/core/seating.js';
import {TENTS} from '../js/data/tents.js';
const tent={id:'pole-20x20',type:'pole',widthFt:20,lengthFt:20,centerPoles:[{x:10,y:10}]};
test('every tent gets seating inside its footprint, with larger tents receiving a fuller setup',()=>{
 for(const t of TENTS){
  const objects=partyLayout(t,{tables:TABLES,chairs:CHAIRS,linens:LINENS,danceAvailable:true});
  assert.ok(objects.some(o=>o.seatCount>0),t.name);
  for(const o of objects){assert.ok(o.x>=0&&o.y>=0&&o.x+o.widthFt<=t.widthFt&&o.y+o.depthFt<=t.lengthFt,t.name);for(const c of chairPositions(o,CHAIRS.find(c=>c.id===o.chairId)||{})){const x=o.x+o.widthFt/2+c.x,y=o.y+o.depthFt/2+c.y;assert.ok(x>=0&&y>=0&&x<=t.widthFt&&y<=t.lengthFt,t.name+' chair');}}
  if(t.widthFt===10&&t.lengthFt===10)assert.equal(objects.filter(o=>o.kind==='dance').length,0);
  if(t.widthFt===40&&t.lengthFt===100)assert.equal(objects.filter(o=>o.seatCount>0).length,12);
 }
});
test('party starter uses actual catalog items, preserves the exact tent and leaves room around the center pole',()=>{
 const before=JSON.stringify(tent),items=partyLayout(tent,{tables:TABLES,chairs:CHAIRS,linens:LINENS,danceAvailable:true});
 assert.equal(JSON.stringify(tent),before);assert.equal(items.filter(o=>o.kind==='dance').length,4);assert.equal(items.filter(o=>o.seatCount).length,2);assert.equal(items.filter(o=>o.tableId==='cocktail').length,1);assert.equal(items.reduce((n,o)=>n+(o.seatCount||0),0),16);
 for(const item of items){assert.ok(item.x>=0&&item.y>=0&&item.x+item.widthFt<=20&&item.y+item.depthFt<=20);assert.ok(!(10>item.x-.4&&10<item.x+item.widthFt+.4&&10>item.y-.4&&10<item.y+item.depthFt+.4));if(item.kind==='table'){assert.ok(TABLES.some(t=>t.id===item.tableId));assert.ok(CHAIRS.some(c=>c.id===item.chairId));if(item.linenId)assert.ok(LINENS.some(l=>l.id===item.linenId&&l.fitsTableIds.includes(item.tableId)));}}
});
test('party activities follow real chairs, cocktail tables and floor; walkers stay in an unobstructed aisle under the tent',()=>{
 const items=partyLayout(tent,{tables:TABLES,chairs:CHAIRS,linens:LINENS,danceAvailable:true}),people=activityPositions(tent,items,CHAIRS,24);
 assert.equal(people.filter(p=>p.seated).length,16);assert.equal(people.filter(p=>p.activity==='dance').length,2);assert.ok(people.some(p=>p.activity==='cocktail'));assert.ok(people.some(p=>p.activity==='walk'));
 assert.ok(people.every(p=>Math.abs(p.x)<10&&Math.abs(p.z)<10));
 const chairs=items.filter(o=>o.seatCount).flatMap(o=>chairPositions(o,CHAIRS.find(c=>c.id===o.chairId)).map(c=>({x:o.x+o.widthFt/2+c.x,z:o.y+o.depthFt/2+c.y})));
 for(const guest of people.filter(p=>p.route))for(const p of guest.route){const x=p.x+10,z=p.z+10;assert.ok(Math.hypot(x-10,z-10)>=1.3);assert.ok(!items.some(o=>x>o.x-.8&&x<o.x+o.widthFt+.8&&z>o.y-.8&&z<o.y+o.depthFt+.8));assert.ok(chairs.every(c=>Math.hypot(x-c.x,z-c.z)>=1.35));}
});
test('a different tenant never receives unavailable party products or decorative quote items',()=>{
 const ownTable={...TABLES.find(t=>t.id==='banquet-6ft'),id:'tenant-table'},ownChair={...CHAIRS[0],id:'tenant-chair'};
 const items=partyLayout(tent,{tables:[ownTable],chairs:[ownChair],linens:[],danceAvailable:false});
 assert.ok(items.length>0);assert.ok(items.every(o=>o.tableId==='tenant-table'&&o.chairId==='tenant-chair'&&!o.linenId));assert.deepEqual(partyLayout(tent,{tables:[],chairs:[ownChair]}),[]);
});
