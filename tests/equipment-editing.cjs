// Real customer controls, isolated DOM and no production API writes.
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dom=new JSDOM(fs.readFileSync(path.join(root,'designer/index.html'),'utf8'),{url:'https://rentsketch.com/designer/?tenant=friendly',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,d=w.document;
w.ResizeObserver=class{observe(){}disconnect(){}};w.ACTIVE_TENANT={slug:'friendly',name:'Friendly Party Rental'};
w.fetch=()=>{throw new Error('No network calls permitted');};
const context=dom.getInternalVMContext(),cache=new Map();
function moduleFor(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file,initializeImportMeta(meta){meta.url=require('node:url').pathToFileURL(file).href;}});cache.set(file,m);return m;}
 async function load(file){const m=moduleFor(file);if(m.status==='unlinked')await m.link((spec,ref)=>moduleFor(path.resolve(path.dirname(ref.identifier),spec)));return m;}
const click=selector=>{const el=d.querySelector(selector);assert.ok(el,selector);el.focus();el.click();};
const change=(role,value)=>{const el=d.querySelector(`[data-role="${role}"]`);el.focus();el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
(async()=>{
 await(await load(path.join(root,'script.js'))).evaluate();await(await load(path.join(root,'js/ui/intake.js'))).evaluate();
 const b=w.FriendlyBridge;
 const round={kind:'table',tableId:'round-5ft',shape:'round',widthFt:5,depthFt:5,rotationDeg:0,linenId:null};
 const initial=[
  {...round,id:'round-a',x:1,y:1,seatCount:8,chairId:'plastic-white'},
  {...round,id:'round-b',x:12,y:12,seatCount:6,chairId:'resin-white'},
  {...round,id:'banquet',tableId:'banquet-6ft',shape:'rect',widthFt:6,depthFt:2.5,x:12,y:1,seatCount:6,chairId:'plastic-white'},
  {...round,id:'service',tableId:'cocktail',widthFt:2.5,depthFt:2.5,x:1,y:12,seatCount:0,chairId:'plastic-white'},
  {id:'floor',kind:'dance',widthFt:3,depthFt:3,x:6,y:14},
 ];
 b.loadScene({tentId:'pole-20x20',chairId:'plastic-white',objects:initial});
 const objects=()=>JSON.parse(JSON.stringify(b.getScene().objects));
 click('[data-drawer="chairs"]');
 assert.equal(d.querySelectorAll('[data-role="chair-card"] img').length,b.CHAIRS.length);
 for(const image of d.querySelectorAll('[data-role="chair-card"] img'))assert.ok(fs.existsSync(path.join(root,new URL(image.src).pathname)));
 assert.ok(d.querySelectorAll('.plan2d-chair svg').length>=20);
 assert.match(d.getElementById('drawerBody').textContent,/3 seated tables \(20 chairs\)/);
 d.getElementById('drawerBody').scrollTop=180;
 click('[data-role="chair-card"][data-id="chiavari-gold"]');
 assert.ok(objects().filter(o=>o.seatCount>0).every(o=>o.chairId==='chiavari-gold'));
 assert.equal(objects().find(o=>o.id==='service').chairId,'plastic-white');
 assert.deepEqual(objects().at(-1),initial.at(-1));
 assert.equal(d.activeElement.dataset.id,'chiavari-gold');
 assert.equal(d.getElementById('drawerBody').scrollTop,180);
 assert.equal(d.activeElement.getAttribute('aria-pressed'),'true');
 click('#btnUndo');assert.deepEqual(objects(),initial,'one undo restores every individual chair style');
 click('#btnRedo');assert.ok(objects().filter(o=>o.seatCount>0).every(o=>o.chairId==='chiavari-gold'));
 click('#drawerClose');b.state.selectedId='round-a';b.refreshAll();
 const panel=d.getElementById('inspectorPanel');panel.scrollTop=120;
 change('insp-chair','resin-white');assert.equal(d.activeElement.dataset.role,'insp-chair');assert.equal(panel.scrollTop,120);
 change('insp-linen','linen-round-120');
 click('[data-role="insp-linen-swatch"][data-color="Navy Blue"]');
 const swatches=d.querySelector('.linen-swatches');swatches.scrollLeft=110;panel.scrollTop=170;
 click('[data-role="insp-linen-swatch"][data-color="Sage Green"]');
 assert.equal(d.activeElement.dataset.color,'Sage Green');assert.equal(panel.scrollTop,170);assert.equal(d.querySelector('.linen-swatches').scrollLeft,110);
 assert.equal(d.querySelector('.equipment-visual g').getAttribute('fill'),'#8b9b79','table thumbnail uses chosen linen');
 assert.equal(d.querySelector('[data-item-id="round-a"] .plan2d-table-top')?.style.background || d.querySelector('[data-item-id="round-a"] .plan2d-top')?.style.background,'rgb(139, 155, 121)','2D uses chosen linen');
 const before=objects();click('[data-role="insp-match-tables"]');
 const after=objects();
 assert.equal(after[1].chairId,'resin-white');assert.equal(after[1].linenId,'linen-round-120');assert.equal(after[1].linenColor,'Sage Green');
 assert.equal(after[1].seatCount,6);assert.equal(after[1].x,12);assert.equal(after[1].y,12);
 assert.deepEqual(after.slice(2),before.slice(2),'different tables and dance floor are untouched');
 click('#btnUndo');assert.deepEqual(objects(),before,'matching table style is one undo');
 click('#btnRedo');assert.deepEqual(objects(),after);
 click('#btnToReview');
 assert.match(d.getElementById('reviewSummary').textContent,/Sage Green 120/);
 assert.equal(b.computeLineItems().find(l=>l.category==='linen').qty,2);
 assert.equal(b.computeLineItems().find(l=>l.category==='chair'&&/Resin/.test(l.label)).qty,14);
 click('#btnBackToDesigner');
 change('insp-linen','');assert.equal(objects()[0].linenId,null);assert.equal(objects()[0].linenColor,null);
 assert.equal(d.querySelector('.linen-swatches'),null);assert.equal(d.querySelector('.equipment-visual g').getAttribute('fill'),'#b99165');
 // Repeated keyboard edits preserve focus even when reaching the seat limit.
 b.state.selectedId='round-b';b.refreshAll();
 for(let i=0;i<4;i++)click('[data-role="insp-seats"][data-delta="1"]');
 assert.equal(objects()[1].seatCount,10);assert.equal(d.activeElement.dataset.role,'insp-seats');assert.equal(d.activeElement.dataset.delta,'-1');
 // Card totals include exactly the table and its default chairs, or require pricing.
 const ui=(await load(path.join(root,'js/ui/equipment-controls.js'))).namespace;
 const t={id:'sample',name:'Sample',shape:'round',diameterFt:5,seatsDefault:8,pricePerDay:15};
 assert.match(ui.tableCard(t,{pricePerDay:4},0),/\$47.00\/day/);
 assert.match(ui.tableCard(t,{pricePerDay:null},0),/Confirm pricing/);
 assert.match(ui.tableCard({...t,seatsDefault:0},{pricePerDay:null},0),/\$15.00\/day/);
 console.log('PASS equipment: visual chair choices apply to seated tables; one undo restores mixed styles; focus/scroll survive edits; linen swatches update 2D and preview; matching styles preserve placement/seats; review quantities match; no network writes');
 dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});
