import assert from 'node:assert/strict';
import {test} from 'node:test';
import {liveCatalog} from '../js/data/catalog.js';
import {summarizeEvent} from '../js/core/eventSummary.js';
import {chairPositions} from '../js/core/seating.js';

test('live imported products replace duplicate seed cards; explicit product identity wins',()=>{
 const models=[{id:'pole-20x20',widthFt:20,lengthFt:20}],seed={id:'seed',category:'tent',external_id:'pole-20x20',visual_model_id:'pole-20x20',price_per_day:'250'},live={...seed,id:'live',external_id:'fpr:20x20-pole-tent'};
 for(const products of [[seed,live],[live,seed]]){
  const cards=liveCatalog('tent',models,products,true);
  assert.equal(cards.length,1);assert.equal(cards[0].productId,'live');
  assert.equal(liveCatalog('tent',models,products,true,'seed')[0].productId,'seed');
 }
 assert.equal(liveCatalog('tent',models,[{...live,price_per_day:null}],true)[0].pricePerDay,null);
 assert.equal(liveCatalog('tent',models,[live],false)[0].pricePerDay,null);
});
test('review includes tent, tables, chairs, linens, floor sections and lighting',()=>{
 const catalog={tents:[{id:'tent',name:'20×20 Pole',pricePerDay:250}],tables:[{id:'round',pricePerDay:15}],chairs:[{id:'resin',pricePerDay:4.75}],linens:[{id:'linen',name:'120" Round',pricePerDay:null}],lighting:[{id:'lights',pricePerDay:100}],danceSection:{pricePerDay:35},tentLightingPrice:()=>100};
 const scene={tentId:'tent',lightingId:'lights',objects:[{kind:'table',tableId:'round',chairId:'resin',seatCount:8,linenId:'linen',linenColor:'White'},{kind:'dance'},{kind:'dance'}]};
 const result=summarizeEvent(scene,catalog);
 assert.deepEqual(result.lines.map(x=>x.category),['tent','table','chair','linen','dance_floor','lighting']);
 assert.equal(result.lines.find(x=>x.category==='dance_floor').qty,2);
 assert.equal(result.lines.find(x=>x.category==='linen').amount,null);
 assert.equal(result.total,null);assert.equal(result.knownSubtotal,473);
 catalog.linens[0].pricePerDay=20;
 assert.equal(summarizeEvent(scene,catalog).total,493);
});
test('round and rectangular seat layouts produce the requested count outside the table',()=>{
 for(const shape of ['round','rect'])for(const count of [0,1,6,8,10]){
  const item={shape,widthFt:shape==='round'?5:8,depthFt:shape==='round'?5:2.5,seatCount:count};
  const positions=chairPositions(item,{seatDepthFt:1.5});
  assert.equal(positions.length,count);
  for(const p of positions)assert.ok(Math.abs(p.x)>item.widthFt/2 || Math.abs(p.y)>item.depthFt/2);
 }
});
