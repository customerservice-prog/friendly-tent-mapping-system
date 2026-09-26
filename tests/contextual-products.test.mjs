import test from 'node:test';import assert from 'node:assert/strict';
import {contextualProducts,applyTableProduct,lightingCompatibility,sidewallPanelCount,exactSidewallSegments} from '../js/core/contextual-products.js';
import {summarizeEvent} from '../js/core/eventSummary.js';
import {computeSidewallSegments} from '../js/data/tentStructure.js';
import {buildBookingHandoff} from '../js/core/bookingHandoff.js';
const products=[{id:'plate-gold',name:'Gold charger plate',category:'accessory',price_per_day:2,external_id:'fpr:gold-plate'},{id:'linen-a',name:'120 Round White Linen',category:'linen',external_id:'fpr:white-linen'},{id:'lighting-a',name:'20×20 Tent Lighting A',category:'lighting',visual_model_id:'lighting-tent',width_ft:20,length_ft:20,price_per_day:95,external_id:'fpr:lighting-a'},{id:'lighting-b',name:'20×20 Tent Lighting B',category:'lighting',visual_model_id:'lighting-tent',width_ft:20,length_ft:20,price_per_day:125,external_id:'fpr:lighting-b'},{id:'wall20',name:'Solid 20 ft Sidewall',category:'sidewall',width_ft:20,price_per_day:60,external_id:'fpr:solid-wall20'}];
const catalog={products,tents:[{id:'tent',name:'Tent',widthFt:20,lengthFt:30}],tables:[],chairs:[],tabletop:[{id:'plate-gold',productId:'plate-gold',name:'Gold plate',perSeat:true,pricePerDay:2}],linens:[{id:'linen-round',productId:'linen-a',name:'White linen',fitsTableIds:['round-5ft'],colors:['White'],pricePerDay:24}],lighting:[{id:'lighting-tent',visual:'perimeter-eave'}]};
const table={id:'table',kind:'table',tableId:'round-5ft',seatCount:8,widthFt:5,depthFt:5,linenColor:'Blue'};

test('context products retain variants, enforce compatibility, and apply exact identities idempotently',()=>{
 const context=contextualProducts(catalog),plate=context.find(p=>p.id==='plate-gold'),linen=context.find(p=>p.id==='linen-a');
 assert.equal(context.filter(p=>p.kind==='lighting').length,2,'same visual does not collapse distinct SKUs');
 const patch=applyTableProduct(table,plate);assert.deepEqual(patch,{tabletop:[{productId:'plate-gold',qty:1,perSeat:true}]});assert.deepEqual(applyTableProduct({...table,...patch},plate),patch,'repeat apply does not silently double quantities');
 assert.equal(applyTableProduct({...table,seatCount:0},plate),null);assert.equal(applyTableProduct({...table,tableId:'banquet-6ft'},linen),null);
 assert.deepEqual(applyTableProduct(table,linen),{linenId:'linen-round',linenProductId:'linen-a',linenColor:'White'});
 assert.equal(lightingCompatibility(context.find(p=>p.id==='lighting-b'),{widthFt:20,lengthFt:30}),false);
 assert.ok(contextualProducts({...catalog,showPrices:false}).every(p=>p.pricePerDay==null));
});

test('one physical 20ft wall remains one SKU quantity across two rendered10ft sections',()=>{
 const tent=catalog.tents[0],context=contextualProducts(catalog),wall=context.find(p=>p.id==='wall20');
 assert.equal(sidewallPanelCount(wall,tent,'front'),1);assert.equal(sidewallPanelCount(wall,tent,'left'),0,'a30ft side cannot purchase1.5 panels');
 const walls=exactSidewallSegments(wall,tent,'front',computeSidewallSegments(20,30));assert.equal(walls.length,2);assert.equal(new Set(walls.map(w=>w.panelId)).size,1);
 const scene={tentId:'tent',objects:[{...table,...applyTableProduct(table,context.find(p=>p.id==='plate-gold')),...applyTableProduct(table,context.find(p=>p.id==='linen-a'))}],sidewalls:walls,lightingId:'lighting-tent',lightingProductId:'lighting-b'};
 const summary=summarizeEvent(scene,{...catalog,contextual:context});const selected=summary.lines.filter(l=>['tabletop','linen','sidewall','lighting'].includes(l.category));
 assert.deepEqual(selected.map(l=>[l.productId,l.qty,l.amount]),[['wall20',1,60],['linen-a',1,24],['plate-gold',8,16],['lighting-b',1,125]]);
 const payload=buildBookingHandoff({tenant:'friendly',lines:selected,products});assert.deepEqual(payload.items.map(x=>[x.slug,x.quantity]),[['solid-wall20',1],['white-linen',1],['gold-plate',8],['lighting-b',1]]);
 const removed=summarizeEvent(scene,{...catalog,contextual:[]});assert.equal(removed.lines.find(l=>l.category==='lighting').amount,null);assert.equal(removed.lines.find(l=>l.category==='lighting').productId,'lighting-b','removedSKU cannot silently become variantA');
 assert.throws(()=>buildBookingHandoff({tenant:'friendly',lines:removed.lines.filter(l=>l.category==='lighting'),products}),/staff confirmation/);
});


test('linen fit follows the physical model without changing a variant SKU',()=>{
 const product={kind:'linen',productId:'linen-six',sourceId:'linen-spandex-6ft',fitsTableIds:['banquet-6ft'],colors:['White']};
 const variant={...table,tableId:'banquet-6ft--plastic-sku',shape:'rect',widthFt:6,depthFt:2.5};
 assert.deepEqual(applyTableProduct(variant,product),{linenId:'linen-spandex-6ft',linenProductId:'linen-six',linenColor:'White'});
 assert.equal(variant.tableId,'banquet-6ft--plastic-sku');
 assert.equal(applyTableProduct({...variant,tableId:'sweetheart-half-round-60'},product),null,'do not promise banquet linen fits the new half-round table');
 assert.equal(applyTableProduct({...variant,tableId:'banquet-8ft--other-sku'},product),null);
});
