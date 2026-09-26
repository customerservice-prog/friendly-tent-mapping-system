import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { partyLayout } from '../js/core/party-scene.js';
import { createLayoutStore } from '../js/core/layoutStore.js';
import { tablePositions } from '../js/core/suggested-layout.js';
import { objectLocalDimensions, objectGroundFootprint } from '../js/core/world-space.js';
import { rectFromObject } from '../js/core/geometry.js';
import { chairPositions } from '../js/core/seating.js';
import { byId as tableById } from '../js/data/tables.js';
import { byId as chairById } from '../js/data/chairs.js';

const table=tableById('sweetheart-half-round-60'),chair=chairById('crossback-natural');
const space={name:'Test venue',widthFt:30,lengthFt:30,centerPoles:[]};
const source=fs.readFileSync(new URL('../script.js',import.meta.url),'utf8');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

// Run the real editor handlers with a real store. Only DOM and layout context
// are supplied here, so a regression in rotation or either creation path fails.
function editor(objects=[]){
 const store=createLayoutStore({tentId:null,objects,zones:[],aisles:[]});
 let next=0;
 const context=vm.createContext({store,state:{chairId:chair.id,guestCount:4},TABLES:[table],CHAIRS:[chair],
  requireEventEditing:()=>true,layoutSpace:()=>space,tablePositions,
  chairVisualById:()=>chair,byId:(list,id)=>list.find(item=>item.id===id),
  newItemId:()=>`recommended-${++next}`,closeDrawer(){},showLayoutNotice(){},
  $:()=>({classList:{contains:()=>true}})});
 const rotateStart=source.indexOf('function handleEquipmentClick('),rotateEnd=source.indexOf('\nfunction handleEquipmentChange(',rotateStart);
 const recommendStart=source.indexOf('function pickDefaultRoundTable('),recommendEnd=source.indexOf('\nfunction showLayoutNotice(',recommendStart);
 assert.ok(rotateStart>=0&&rotateEnd>rotateStart&&recommendStart>=0&&recommendEnd>recommendStart);
 vm.runInContext(source.slice(rotateStart,rotateEnd)+'\n'+source.slice(recommendStart,recommendEnd),context);
 return {store,recommend:()=>context.useRecommendedLayout(),rotate:id=>context.handleEquipmentClick({target:{closest:()=>({dataset:{role:'insp-rotate',id}})}})};
}

function verifyTurns(harness){
 const original=harness.store.getState().objects[0];
 assert.ok(original,'layout places its only available seated table');
 const center={x:original.x+2.5,y:original.y+1.25};
 for(const angle of [0,90,180,270]){
  if(angle)harness.rotate(original.id);
  const item=JSON.parse(JSON.stringify(harness.store.getState())).objects[0];
  assert.equal(item.rotationDeg,angle);
  assert.deepEqual(objectLocalDimensions(item),{widthFt:5,depthFt:2.5},'canonical model dimensions survive rotation and save/reopen');
  assert.equal(item.footprintOriented,true);
  assert.equal(item.seatingLayout,'sweetheart');
  assert.deepEqual([item.widthFt,item.depthFt],angle%180?[2.5,5]:[5,2.5]);
  near(item.x+item.widthFt/2,center.x);near(item.y+item.depthFt/2,center.y);
  const corners=objectGroundFootprint(item),bounds=rectFromObject(item);
  near(Math.min(...corners.map(p=>p.x)),bounds.x);near(Math.min(...corners.map(p=>p.y)),bounds.y);
  near(Math.max(...corners.map(p=>p.x))-bounds.x,bounds.width);near(Math.max(...corners.map(p=>p.y))-bounds.y,bounds.depth);
  const seats=chairPositions(item,chair),radians=angle*Math.PI/180;
  assert.equal(seats.length,2);
  for(const seat of seats){
   const localY=-seat.x*Math.sin(radians)+seat.y*Math.cos(radians);
   near(localY,-1.25-chair.seatDepthFt/2-.35);
  }
 }
 harness.store.undo();assert.equal(harness.store.getState().objects[0].rotationDeg,180);
 harness.store.redo();assert.equal(harness.store.getState().objects[0].rotationDeg,270);
 harness.rotate(original.id);
 assert.deepEqual(harness.store.getState().objects[0],original,'four turns restore the original placement and metadata');
}

test('party starter with only half-round tables retains true dimensions through editor rotation and persistence',()=>{
 const objects=partyLayout(space,{tables:[table],chairs:[chair],linens:[]});
 assert.ok(objects.length);assert.ok(objects.every(item=>item.tableId===table.id));
 verifyTurns(editor(objects));
});

test('recommended layout with only half-round tables follows the same canonical placement contract',()=>{
 const harness=editor();harness.recommend();
 assert.equal(harness.store.getState().objects.length,2,'four guests receive two sweetheart tables');
 verifyTurns(harness);
});
