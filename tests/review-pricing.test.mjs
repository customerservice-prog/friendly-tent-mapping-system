import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{reviewPricing}=require('../server/src/reviewPricing.js');
const {reviewTotals}=await import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL('../js/core/reviewTotals.js',import.meta.url),'utf8')).toString('base64'));
test('review uses checkout tax on rentals plus delivery with cent rounding',async()=>{
 const calls=[];const fetcher=async url=>{calls.push(url);return {ok:true,json:async()=>url.includes('tax-rate')?{rate:{rate:8,isActive:true}}:{fee:49.99,distance:12}};};
 const rates=await reviewPricing({slug:'friendly',show_prices:true},'13090',fetcher);
 const totals=reviewTotals([{amount:250},{amount:15},{amount:20}],rates);
 assert.equal(totals.taxAmount,26.80);assert.equal(totals.total,361.79);assert.equal(totals.zip,'13090');
 assert.deepEqual(calls.sort(),['https://www.friendlypartyrental.com/api/delivery-fee?zip=13090','https://www.friendlypartyrental.com/api/tax-rate']);
});
test('missing prices, invalid ZIP response and unavailable tax never become a zero-cost complete estimate',async()=>{
 const rates={taxRate:8,deliveryFee:49.99,taxDelivery:true};
 assert.equal(reviewTotals([{amount:null},{amount:250}],rates).total,null);
 assert.equal(reviewTotals([{amount:250}],{...rates,deliveryFee:null}).total,null);
 assert.equal(reviewTotals([{amount:250}],{...rates,taxRate:null}).total,null);
 assert.equal(reviewTotals([{amount:250}],{...rates,deliveryFee:0}).total,270);
 const failed=await reviewPricing({slug:'friendly'},'99999',async()=>({ok:false}));
 assert.equal(failed.deliveryFee,null);assert.equal(failed.taxRate,null);
});
test('other tenants and hidden-price catalogs never call Friendly pricing',async()=>{
 const noFetch=()=>{throw Error('Cross-tenant pricing leak');};
 assert.equal((await reviewPricing({slug:'second'},'13090',noFetch)).available,false);
 assert.equal((await reviewPricing({slug:'friendly',show_prices:false},'13090',noFetch)).available,false);
});
