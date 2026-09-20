// Exercise the actual lazy-loaded table detail through customer controls.
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dom=new JSDOM(fs.readFileSync(path.join(root,'designer/index.html'),'utf8'),{url:'https://rentsketch.com/designer/?tenant=friendly',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,d=w.document;
// Isolated paid-event context; no real payment or entitlement is created.
w.RentSketchEventPass={canEdit:()=>true,hasPaidEvent:()=>false};
w.ResizeObserver=class{observe(){}disconnect(){}};w.ACTIVE_TENANT={slug:'friendly',name:'Friendly Party Rental'};
w.fetch=()=>{throw new Error('No network calls permitted');};
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
 await(await load(path.join(root,'script.js'))).evaluate();await(await load(path.join(root,'js/ui/intake.js'))).evaluate();
 const b=w.FriendlyBridge,top=(await load(path.join(root,'js/data/tabletop.js'))).namespace,linen=(await load(path.join(root,'js/data/linens.js'))).namespace;
 const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/friendly-tabletop-20260920.json'),'utf8'));
 w.dispatchEvent(new w.CustomEvent('rentsketch:catalogReady',{detail:{tenant:{slug:'friendly',showPrices:true},products:fixture.products}}));
 assert.equal(top.TABLETOP.length,50);assert.ok(linen.LINENS.some(l=>/Satin/.test(l.name)));assert.ok(linen.LINENS.some(l=>/90x156/.test(l.name)));
 b.TABLES.find(t=>t.id==='round-5ft').pricePerDay=15;b.CHAIRS.find(c=>c.id==='plastic-white').pricePerDay=2.5;
 const product=name=>top.TABLETOP.find(p=>p.name===name),plate=product('10-5/8 Dinner Plate'),napkin=product('Matching Napkins'),runner=product('9ft Table Runner'),lantern=product('Rustic Lantern Table Centerpiece');
 const add=p=>{click('.ts-dialog [data-ts="category"][data-category="'+p.group+'"]');click('.ts-dialog [data-ts="add"][data-product="'+p.id+'"]');};
 const openDraft=async()=>{if(!d.querySelector('[data-role="table-style"]'))click('[data-drawer="tables"]');click('[data-role="table-style"][data-id="round-5ft"]');await settle();await settle();};
 const objectCount=b.getScene().objects.length;
 await openDraft();let dialog=d.querySelector('.ts-dialog');assert.ok(dialog.open);assert.equal(b.getScene().objects.length,objectCount,'style first does not create a rental');
 add(plate);add(napkin);add(runner);add(lantern);
 change('insp-linen','linen-round-120');
 assert.equal(b.getScene().objects.length,objectCount,'all draft styling remains outside the event');
 click('.ts-dialog [data-ts="close"]');assert.equal(b.getScene().objects.length,objectCount,'closing a draft adds no rentals');
 await openDraft();add(plate);click('.ts-dialog [data-ts="done"]');assert.equal(b.getScene().objects.length,objectCount);assert.ok(!d.getElementById('placementBar').hidden);click('#placementCancel');assert.equal(b.getScene().objects.length,objectCount,'cancelling styled placement adds no rentals');
 await openDraft();add(plate);add(napkin);add(runner);add(lantern);change('insp-linen','linen-round-120');
 click('.ts-dialog [data-role="insp-seats"][data-delta="-1"]');
 click('.ts-dialog [data-ts="done"]');click('#placementConfirm');let placed=b.getScene().objects.at(-1);assert.equal(placed.seatCount,7);assert.equal(placed.tabletop.length,4);
 let lines=b.computeLineItems();assert.equal(lines.find(l=>l.productId===plate.id).qty,7);assert.equal(lines.find(l=>l.productId===napkin.id).qty,7);assert.equal(lines.find(l=>l.productId===runner.id).qty,1);assert.equal(lines.find(l=>l.productId===plate.id).amount,10.5);assert.equal(lines.find(l=>l.productId===napkin.id).amount,14);
 assert.ok(d.querySelector('[data-item-id="'+placed.id+'"] .plan-tabletop svg'),'the 2D plan shows selected rentals');
 click('[data-role="insp-design-table"]');await settle();await settle();assert.ok(dialog.open);assert.equal(dialog.dataset.view,'2d','failed WebGL import leaves usable overhead controls');
 click('.ts-dialog [data-ts="category"][data-category="Napkins & runners"]');click('.ts-dialog [data-ts="quantity"][data-product="'+napkin.id+'"][data-delta="1"]');
 click('.ts-dialog [data-role="insp-seats"][data-delta="1"]');lines=b.computeLineItems();assert.equal(lines.find(l=>l.productId===plate.id).qty,8);assert.equal(lines.find(l=>l.productId===napkin.id).qty,8,'manual count is preserved');
 click('.ts-dialog [data-role="insp-seats"][data-delta="1"]');assert.equal(b.computeLineItems().find(l=>l.productId===napkin.id).qty,8);assert.equal(b.computeLineItems().find(l=>l.productId===plate.id).qty,9);
 const color=d.querySelector('[data-ts="top-color"][data-product="'+napkin.id+'"]');color.value='Sage Green';color.dispatchEvent(new w.Event('change',{bubbles:true}));assert.match(b.computeLineItems().find(l=>l.productId===napkin.id).label,/Sage Green/);
 // Repeated accessory edits keep focus and the horizontal category position.
 click('.ts-dialog [data-ts="category"][data-category="selected"]');assert.equal(dialog.querySelectorAll('.ts-product').length,4);
 dialog.querySelector('.ts-category-tabs').scrollLeft=123;
 for(let n=0;n<2;n++){click('.ts-dialog [data-ts="quantity"][data-product="'+runner.id+'"][data-delta="1"]');assert.equal(d.activeElement.dataset.ts,'quantity');assert.equal(d.activeElement.dataset.product,runner.id);assert.equal(d.activeElement.dataset.delta,'1');}
 assert.equal(dialog.querySelector('.ts-category-tabs').scrollLeft,123);
 click('.ts-dialog [data-ts="undo"]');click('.ts-dialog [data-ts="undo"]');
 const inputSearch=(value,caret=value.length)=>{const el=dialog.querySelector('[data-ts="search"]');el.focus();el.value=value;el.setSelectionRange(caret,caret);el.dispatchEvent(new w.Event('input',{bubbles:true}));};
 const searchInput=dialog.querySelector('[data-ts="search"]'),beforeSearch=JSON.stringify(b.getScene());inputSearch('LANTERN',3);assert.equal(d.activeElement,searchInput,'typing keeps the same input mounted for the mobile keyboard');assert.equal(d.activeElement.dataset.ts,'search');assert.equal(d.activeElement.selectionStart,3);assert.equal(dialog.querySelectorAll('.ts-product').length,1);assert.match(dialog.querySelector('.ts-product h4').textContent,/Lantern/);assert.equal(JSON.stringify(b.getScene()),beforeSearch,'search never mutates rentals');
 inputSearch('no matching rental');assert.equal(dialog.querySelectorAll('.ts-product').length,0);click('.ts-dialog [data-ts="clear-search"]');assert.equal(d.activeElement.dataset.ts,'search');assert.equal(dialog.querySelectorAll('.ts-product').length,4);
 click('.ts-dialog [data-ts="category"][data-category="Serving & drinks"]');inputSearch('Dinner Plate');assert.match(dialog.querySelector('.ts-product h4').textContent,/Dinner Plate/,'search finds items across categories');
 click('.ts-dialog [data-ts="category"][data-category="selected"]');
 // Copy the whole setup across matching tables with differing seat counts.
 const original=JSON.parse(JSON.stringify(b.getScene())),source=original.objects.find(o=>o.id===placed.id),scene=JSON.parse(JSON.stringify(original));
 scene.objects.push({...source,id:'matching-six',seatCount:6,x:12,y:13,rotation:45,linenId:null,tabletop:[{productId:plate.id,qty:1,perSeat:false}]},{...source,id:'matching-standing',seatCount:0,x:17,y:10,rotation:90,tabletop:[]},{...source,id:'other-size',tableId:'banquet-6ft',shape:'rect',widthFt:6,depthFt:2.5,seatCount:6,x:3,y:4,tabletop:[]});
 click('.ts-dialog [data-ts="done"]');b.loadScene(scene);b.state.selectedId=placed.id;b.refreshAll();click('[data-role="insp-design-table"]');await settle();await settle();
 assert.match(dialog.querySelector('[data-ts="apply-setup"]').textContent,/2 other tables/);const beforeCopy=JSON.parse(JSON.stringify(b.getScene()));click('.ts-dialog [data-ts="apply-setup"]');
 let copied=JSON.parse(JSON.stringify(b.getScene()));for(const id of ['matching-six','matching-standing']){const before=beforeCopy.objects.find(o=>o.id===id),after=copied.objects.find(o=>o.id===id);for(const key of ['id','x','y','rotation','widthFt','depthFt','seatCount'])assert.equal(after[key],before[key],key+' remains unchanged');assert.deepEqual(after.tabletop,source.tabletop);assert.equal(after.linenColor,source.linenColor);}
 assert.deepEqual(copied.objects.find(o=>o.id==='other-size'),beforeCopy.objects.find(o=>o.id==='other-size'),'different table types are untouched');
 assert.equal(b.computeLineItems().find(l=>l.productId===plate.id).qty,15,'per-seat selections follow 9 + 6 + 0 seats');assert.equal(b.computeLineItems().find(l=>l.productId===napkin.id).qty,24,'manual quantities stay 8 per matching table');
 click('.ts-dialog [data-ts="undo"]');assert.deepEqual(JSON.parse(JSON.stringify(b.getScene())),beforeCopy,'one undo restores the complete prior setup');assert.equal(dialog.querySelector('.ts-message').textContent,'');click('.ts-dialog [data-ts="redo"]');assert.deepEqual(JSON.parse(JSON.stringify(b.getScene())),copied);
 click('.ts-dialog [data-ts="quantity"][data-product="'+napkin.id+'"][data-delta="1"]');assert.equal(b.getScene().objects.find(o=>o.id==='matching-six').tabletop.find(e=>e.productId===napkin.id).qty,8,'later edits do not change copied tables');
 // Previously saved items remain removable even if their catalog entry disappears.
 click('.ts-dialog [data-ts="done"]');const stale=JSON.parse(JSON.stringify(original));stale.objects.find(o=>o.id===placed.id).tabletop.push({productId:'removed-product',qty:2,perSeat:false});b.loadScene(stale);b.state.selectedId=placed.id;b.refreshAll();click('[data-role="insp-design-table"]');await settle();await settle();assert.match(dialog.querySelector('.ts-top-controls').textContent,/Unavailable item/);assert.equal(dialog.querySelector('.ts-total').textContent,'Confirm pricing');click('.ts-dialog [data-ts="remove"][data-product="removed-product"]');assert.equal(d.activeElement.dataset.ts,'category');assert.equal(b.getScene().objects.find(o=>o.id===placed.id).tabletop.length,4);assert.doesNotMatch(dialog.querySelector('.ts-top-controls').textContent,/Unavailable item/);
 click('.ts-dialog [data-ts="done"]');b.loadScene(original);b.state.selectedId=placed.id;b.refreshAll();click('[data-role="insp-design-table"]');await settle();await settle();
 const snapshot=JSON.parse(JSON.stringify(b.getScene()));click('.ts-dialog [data-ts="done"]');b.loadScene(snapshot);b.state.selectedId=placed.id;b.refreshAll();assert.equal(b.getScene().objects.at(-1).tabletop.length,4,'saved object retains extras');
 click('[data-role="insp-duplicate"]');assert.equal(b.computeLineItems().find(l=>l.productId===plate.id).qty,18);assert.equal(b.computeLineItems().find(l=>l.productId===runner.id).qty,2);click('#btnUndo');assert.equal(b.computeLineItems().find(l=>l.productId===plate.id).qty,9);
 click('#btnToReview');assert.match(d.getElementById('reviewSummary').textContent,/Dinner Plate/);assert.match(d.getElementById('reviewSummary').textContent,/Sage Green Matching Napkins/);click('#btnBackToDesigner');
 const plan=d.getElementById('plan2d');Object.defineProperties(plan,{clientWidth:{get:()=>380},clientHeight:{get:()=>520}});b.refreshAll();const stage=d.querySelector('.plan2d-stage'),width=parseFloat(stage.style.width);
 click('[data-plan="in"]');assert.ok(parseFloat(stage.style.width)>width);click('[data-plan="grid"]');assert.ok(stage.classList.contains('show-grid'));click('[data-plan="fit"]');assert.equal(parseFloat(stage.style.width),width);assert.equal(d.querySelector('.plan-tools output').textContent,'100%');
 b.state.selectedId=placed.id;b.refreshAll();click('[data-role="insp-delete"]');assert.ok(!b.computeLineItems().some(l=>l.category==='tabletop'),'deleting table removes attached rentals');
 w.dispatchEvent(new w.CustomEvent('rentsketch:catalogReady',{detail:{tenant:{slug:'second',showPrices:false},products:[{id:'second-plate',name:'Porcelain Dinner Plate',price_per_day:8,category:'other'}]}}));assert.equal(top.TABLETOP.length,1);assert.equal(top.TABLETOP[0].id,'second-plate');assert.equal(top.TABLETOP[0].pricePerDay,null);assert.ok(!linen.LINENS.some(l=>l.productId===runner.id),'second tenant resets Friendly accessory prices');
 console.log('PASS Table Studio: 50 live products, isolated draft/place, selected-items view/search/caret, repeated edits retain focus/scroll, whole setup copy preserves placement and seats, atomic undo/redo, independent copied extras, unavailable items removable, per-seat/manual pricing, saved extras, 2D artwork, WebGL fallback, review, plan zoom, tenant isolation. No live writes.');w.close();
})().catch(e=>{console.error(e);w.close();process.exitCode=1;});
