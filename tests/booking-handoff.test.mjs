import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {buildBookingHandoff,friendlyBookingUrl}=await import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL('../js/core/bookingHandoff.js',import.meta.url),'utf8')).toString('base64'));
const products=[{id:'tent-id',external_id:'fpr:20x20-pole-tent',active:true},{id:'linen-id',external_id:'fpr:120-inch-round-polyester-tablecloth',active:true}];
const lines=[{productId:'tent-id',label:'20x20 Pole Tent',qty:1,amount:250,category:'tent'},{productId:'linen-id',label:'White linen',qty:4,amount:80,category:'linen',selectedColor:'White'},{productId:'linen-id',label:'Ivory linen',qty:2,amount:40,category:'linen',selectedColor:'Ivory'}];
test('booking carries exact imported products and separate colors without contact or quoted fee data',()=>{
 const p=buildBookingHandoff({tenant:'friendly',lines:[...lines,{category:'tax',amount:29.6},{category:'delivery',amount:49.99}],products,designId:'isolated-design',eventDate:'2027-06-01'});
 assert.deepEqual(p.items,[{slug:'20x20-pole-tent',quantity:1},{slug:'120-inch-round-polyester-tablecloth',quantity:4,selectedColor:'White'},{slug:'120-inch-round-polyester-tablecloth',quantity:2,selectedColor:'Ivory'}]);
 const url=new URL(friendlyBookingUrl(p));assert.equal(url.origin,'https://www.friendlypartyrental.com');assert.equal(url.pathname,'/design-your-event/book');
 assert.deepEqual(JSON.parse(new URLSearchParams(url.hash.slice(1)).get('layout')),p);assert.equal('amount' in p.items[0],false);
});
test('unknown items and ballast require a quote instead of disappearing from checkout',()=>{
 assert.throws(()=>buildBookingHandoff({tenant:'friendly',lines:[...lines,{label:'Concrete ballast setup',amount:null,qty:1}],products}),/Concrete ballast setup.*Request a Quote/);
 assert.throws(()=>buildBookingHandoff({tenant:'friendly',lines:[{productId:'unknown',label:'Unknown chair',amount:120,qty:1}],products}),/Unknown chair/);
 assert.throws(()=>buildBookingHandoff({tenant:'friendly',lines:[{...lines[0],qty:1.5}],products}),/quantity/);
 assert.throws(()=>buildBookingHandoff({tenant:'different-business',lines,products}),/Friendly/);
});
