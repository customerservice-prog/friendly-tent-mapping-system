// Exercise the actual lazy-loaded table detail through customer controls.
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dom=new JSDOM(fs.readFileSync(path.join(root,'designer/index.html'),'utf8'),{url:'https://rentsketch.com/designer/?tenant=friendly',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,d=w.document;
// Isolated paid-event context; no real payment or entitlement is created.
w.RentSketchEventPass={canEdit:()=>true,hasPaidEvent:()=>false};
w.ResizeObserver=class{observe(){}disconnect(){}};w.ACTIVE_TENANT={slug:'friendly',name:'Friendly Party Rental'};

// jsdom has no top-layer layout; real modal layout/focus trapping is checked in Browser.
if(!w.HTMLDialogElement.prototype.showModal)w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
if(!w.HTMLDialogElement.prototype.close)w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
const context=dom.getInternalVMContext(),cache=new Map();
function moduleFor(file){
 if(cache.has(file))return cache.get(file);
 const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file,initializeImportMeta(meta){meta.url=require('node:url').pathToFileURL(file).href;},importModuleDynamically:async(spec,ref)=>{const dep=await load(path.resolve(path.dirname(ref.identifier),spec));if(dep.status!=='evaluated')await dep.evaluate();return dep;}});
 cache.set(file,m);return m;
}
async function load(file){const m=moduleFor(file);if(m.status==='unlinked')await m.link((spec,ref)=>moduleFor(path.resolve(path.dirname(ref.identifier),spec)));return m;}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const click=selector=>{const el=d.querySelector(selector);assert.ok(el,selector);el.focus();el.click();};
const change=(role,value)=>{const el=d.querySelector(`.ts-dialog [data-role="${role}"]`);el.focus();el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
(async()=>{
 const calls=[];w.RENTSKETCH_API_URL='https://api.test';w.RENTSKETCH_TENANT_SLUG='friendly';w.alert=()=>{};
 w.fetch=async(url,options={})=>{calls.push({url,options});if(url.includes('/review-pricing'))return{ok:true,json:async()=>({available:true,zip:new URL(url).searchParams.get('zip'),deliveryFee:new URL(url).searchParams.has('zip')?49.99:null,taxRate:8,taxDelivery:true})};if(url.includes('/quote-requests'))return{ok:true,json:async()=>({id:'isolated-quote',notificationSent:true})};throw Error('Unexpected network call '+url);};
 await(await load(path.join(root,'script.js'))).evaluate();const b=w.FriendlyBridge;
 const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/friendly-equipment-20260920.json'),'utf8'));
 const catalog=(await load(path.join(root,'js/data/catalog.js'))).namespace;
 for(const [type,list] of [['tent',b.TENTS],['table',b.TABLES],['chair',b.CHAIRS]])list.splice(0,list.length,...catalog.liveCatalog(type,list,fixture.products,true));
 w.dispatchEvent(new w.CustomEvent('rentsketch:catalogReady',{detail:{tenant:{slug:'friendly',showPrices:true},products:fixture.products}}));
 const table={id:'dining',kind:'table',tableId:'round-5ft',shape:'round',widthFt:5,depthFt:5,x:2,y:2,seatCount:8,chairId:'plastic-white',linenId:null};
 b.loadScene({tentId:'frame-20x20',objects:[table],surfaceType:'notSure',guestCount:8});
 click('#sceneSettingLabel');assert.equal(b.state.activeDrawer,'site');click('[data-surface="concrete"]');assert.equal(b.getScene().surfaceType,'concrete');assert.match(d.getElementById('sceneSettingLabel').textContent,/Paved/);assert.equal(d.querySelectorAll('.plan2d-anchor-ballast').length,4);assert.ok(b.computeLineItems().some(l=>l.category==='installation'&&l.amount===null));
 click('[data-surface="grass"]');assert.equal(b.getScene().surfaceType,'grass');assert.ok(!b.computeLineItems().some(l=>l.category==='installation'));
 click('[data-drawer="chairs"]');assert.equal(d.querySelector('[data-role="chair-card"][data-id="throne-king"]'),null);assert.ok(d.querySelector('[data-role="accent-chair"][data-id="throne-king"]'));click('[data-role="accent-chair"][data-id="throne-king"]');assert.equal(b.getScene().objects.length,1);click('#placementConfirm');const throne=b.getScene().objects.at(-1);assert.equal(throne.kind,'chair');assert.equal(b.getScene().objects[0].chairId,'plastic-white');assert.ok(d.querySelector('[data-item-id="'+throne.id+'"] .plan-accent-chair'));assert.equal(b.computeLineItems().find(l=>/King Throne/.test(l.label)).qty,1);assert.equal(b.computeLineItems().find(l=>/King Throne/.test(l.label)).amount,120);
 click('[data-role="insp-rotate"]');assert.equal(b.getScene().objects.at(-1).rotationDeg,90);click('[data-role="insp-duplicate"]');assert.equal(b.computeLineItems().find(l=>/King Throne/.test(l.label)).qty,2);click('#btnUndo');assert.equal(b.computeLineItems().find(l=>/King Throne/.test(l.label)).qty,1);
 b.state.selectedId='dining';b.refreshAll();assert.ok(!d.querySelector('[data-role="insp-chair"] option[value="throne-king"]'));click('[data-role="insp-design-table"]');await settle();await settle();assert.ok(!d.querySelector('.ts-dialog [data-ts="chair"][data-id="throne-king"]'));click('.ts-dialog [data-ts="close"]');
 click('[data-drawer="lighting"]');click('[data-role="lighting-card"][data-id="lighting-tent"]');assert.equal(b.state.viewMode,'3d');assert.equal(d.getElementById('view3dDayNight').getAttribute('aria-pressed'),'true');assert.equal(b.state.activeDrawer,null);let light=b.computeLineItems().find(l=>l.category==='lighting');assert.equal(light.amount,100);assert.equal(light.productId,fixture.products.find(p=>p.external_id==='fpr:tent-lighting-20x20').id);click('#view3dDayNight');assert.equal(d.getElementById('view3dDayNight').getAttribute('aria-pressed'),'false');
 const before=JSON.stringify(b.getScene().objects);click('#btnDesignerHelp');assert.ok(d.querySelector('.designer-help').open);click('[data-help-action="plan"]');assert.equal(b.state.viewMode,'plan');assert.equal(JSON.stringify(b.getScene().objects),before);assert.ok(!d.querySelector('.designer-help').open);
 click('#btnToReview');await settle();const input=d.querySelector('[name="deliveryZip"]');input.value='13090';input.dispatchEvent(new w.Event('input',{bubbles:true}));d.querySelector('.review-location').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();await settle();const totals=b.currentReviewPricing();const rentals=b.computeLineItems().reduce((n,l)=>n+l.amount,0);assert.equal(totals.taxAmount,Math.round((rentals+49.99)*8)/100);assert.equal(totals.total,Math.round((rentals+49.99+totals.taxAmount)*100)/100);assert.match(d.querySelector('.review-grand-total').textContent,new RegExp(totals.total.toFixed(2).replace('.','\\.')));
 w.RentSketchAutosave={flush:async()=> 'isolated-design',getSessionId:()=> 'isolated-owner'};w.eval(fs.readFileSync(path.join(root,'js/ui/review-actions.js'),'utf8'));d.getElementById('customerName').value='Isolated test';d.getElementById('customerEmail').value='test@example.invalid';d.getElementById('customerDate').value='2027-06-01';click('#btnEmailQuote');await settle();await settle();const quote=calls.find(c=>c.url.includes('/quote-requests'));assert.ok(quote);const payload=JSON.parse(quote.options.body);assert.equal(payload.estimateTotal,totals.total);assert.equal(payload.designId,'isolated-design');assert.equal(payload.lineItems.find(l=>l.category==='delivery').amount,49.99);assert.equal(payload.lineItems.find(l=>l.category==='tax').amount,totals.taxAmount);
 input.value='13116';input.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(b.currentReviewPricing().total,null,'editing ZIP invalidates stale charges');
 // Pole tents do not offer pavement ballast as a valid selection.
 click('#btnBackToDesigner');b.loadScene({tentId:'pole-20x20',objects:[table],surfaceType:'grass'});click('#sceneSettingLabel');assert.ok(d.querySelector('[data-surface="concrete"]').disabled);
 console.log('PASS customer experience: real surface controls and ballast, standalone throne placement/rotate/duplicate/undo/prices, dining exclusions, lighting night switch and exact product IDs, optional help preserves layout, delivery/tax review and isolated quote payload, stale ZIP invalidation. No live writes.');w.close();
})().catch(e=>{console.error(e);w.close();process.exitCode=1;});
