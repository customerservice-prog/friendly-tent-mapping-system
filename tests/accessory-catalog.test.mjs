import test from 'node:test';
import assert from 'node:assert/strict';
import { accessoryCatalog } from '../js/data/accessories.js';
import { summarizeEvent } from '../js/core/eventSummary.js';

const products=[
  {id:'foam1',category:'other',name:'Foam Machine',price_per_day:'175.00',photo_url:'https://example.test/foam.jpg',active:true},
  {id:'speaker1',category:'other',name:'550W Bluetooth Speaker',price_per_day:'75.00',active:true},
  {id:'stage1',category:'dance_floor',name:'Stage Section',price_per_day:'125.00',active:true},
  {id:'bounce1',category:'other',name:'Crayon Bounce House',price_per_day:'199.00',active:true},
  {id:'dance1',category:'dance_floor',name:'Dance Floor 3x3 Section',price_per_day:'35.00',active:true},
  {id:'fan1',category:'other',name:'20 inch Fan',price_per_day:'45.00',active:true},
  {id:'fountain1',category:'other',name:'Chocolate Fountain',price_per_day:'85.00',active:true},
];

test('live accessory catalog includes missing rental families and excludes duplicates',()=>{
  const items=accessoryCatalog(products,true);
  const names=items.map(x=>x.name);
  assert.ok(names.includes('Foam Machine'));
  assert.ok(names.includes('550W Bluetooth Speaker'));
  assert.ok(names.includes('Stage Section'),'stage products sharing dance_floor category stay placeable');
  assert.ok(names.includes('20 inch Fan'));
  assert.ok(names.includes('Chocolate Fountain'));
  assert.ok(!names.includes('Crayon Bounce House'),'inflatables remain in the inflatable catalog');
  assert.ok(!names.includes('Dance Floor 3x3 Section'),'dance floor stays in its dedicated drawer');
  const foam=items.find(x=>x.name==='Foam Machine');
  assert.equal(foam.accessoryType,'foam-machine');
  assert.equal(foam.visualCategory,'Effects');
  assert.equal(foam.animated,true);
  assert.equal(foam.pricePerDay,175);
  assert.ok(foam.widthFt>0&&foam.depthFt>0&&foam.heightFt>0);
});

test('placed accessory rentals appear in event summary and pricing',()=>{
  const accessories=accessoryCatalog(products,true);
  const foam=accessories.find(x=>x.name==='Foam Machine');
  const speaker=accessories.find(x=>x.name==='550W Bluetooth Speaker');
  const scene={objects:[
    {id:'a',kind:'accessory',accessoryId:foam.id},
    {id:'b',kind:'accessory',accessoryId:foam.id},
    {id:'c',kind:'accessory',accessoryId:speaker.id},
  ]};
  const summary=summarizeEvent(scene,{accessories,tents:[],inflatables:[],tables:[],chairs:[],linens:[],lighting:[],tabletop:[],danceSection:null});
  const foamLine=summary.lines.find(x=>x.label==='Foam Machine');
  const speakerLine=summary.lines.find(x=>x.label==='550W Bluetooth Speaker');
  assert.equal(foamLine.qty,2);
  assert.equal(foamLine.amount,350);
  assert.equal(speakerLine.qty,1);
  assert.equal(speakerLine.amount,75);
  assert.equal(summary.total,425);
});
