// Exercise the actual lazy-loaded table detail through customer controls.
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dom=new JSDOM(fs.readFileSync(path.join(root,'designer/index.html'),'utf8'),{url:'https://rentsketch.com/designer/?tenant=friendly',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,d=w.document;
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
 const b=w.FriendlyBridge,linens=(await load(path.join(root,'js/data/linens.js'))).namespace.LINENS;
 b.TABLES.find(t=>t.id==='round-5ft').pricePerDay=15;b.CHAIRS.find(c=>c.id==='plastic-white').pricePerDay=3.75;b.CHAIRS.find(c=>c.id==='resin-white').pricePerDay=5;
 linens.find(l=>l.id==='linen-round-120').pricePerDay=12;
 for(let i=0;i<2;i++){click('[data-drawer="tables"]');click('[data-role="table-card"][data-id="round-5ft"]');click('#placementConfirm');}
 const snapshot=b.getScene();snapshot.objects=snapshot.objects.map(o=>({...o,tableDecor:{centerpiece:true,napkinColor:'Blush'}}));b.loadScene(snapshot);b.state.selectedId=snapshot.objects.at(-1).id;b.refreshAll();
 const selected=b.state.selectedId;click('[data-role="insp-design-table"]');await settle();await settle();
 const dialog=d.querySelector('.ts-dialog');assert.ok(dialog.open);assert.equal(d.body.style.overflow,'hidden');assert.equal(d.activeElement.dataset.ts,'close');
 assert.equal(dialog.querySelector('.ts-total').textContent,'$45.00/day');assert.equal(dialog.querySelectorAll('.ts-price-lines > div').length,2,'table and chair prices exclude tent');
 assert.doesNotMatch(dialog.textContent,/Plates|Centerpiece|Table number|mapped to a tenant/);
 assert.match(dialog.querySelector('[role="img"]').getAttribute('aria-label'),/8 White Plastic/);
 let saves=0;w.addEventListener('rentsketch:requestSave',()=>saves++);
 click('.ts-dialog [data-role="insp-seats"][data-delta="1"]');assert.equal(b.getScene().objects.find(o=>o.id===selected).seatCount,9);assert.equal(dialog.querySelector('.ts-total').textContent,'$48.75/day');
 assert.equal(d.activeElement.dataset.role,'insp-seats');
 change('insp-chair','resin-white');assert.equal(dialog.querySelector('.ts-total').textContent,'$60.00/day');
 change('insp-linen','linen-round-120');click('.ts-dialog [data-role="insp-linen-swatch"][data-color="Navy Blue"]');
 assert.equal(dialog.querySelector('.ts-total').textContent,'$72.00/day');assert.equal(dialog.querySelector('.equipment-visual g').getAttribute('fill'),'#172c52');
 assert.equal(d.querySelector('#inspectorPanel .equipment-visual g').getAttribute('fill'),'#172c52','event inspector sees the same edit');
 change('insp-linen','linen-round-90');assert.equal(dialog.querySelector('.ts-total').textContent,'Confirm pricing');assert.match(dialog.querySelector('.ts-price-note').textContent,/Known items: \$60.00/);
 change('insp-linen','linen-round-120');
 const before=JSON.parse(JSON.stringify(b.getScene().objects));
 click('.ts-dialog [data-role="insp-match-tables"]');
 assert.ok(b.getScene().objects.every(o=>o.chairId==='resin-white'&&o.linenColor==='Navy Blue'));
 assert.equal(b.getScene().objects[0].seatCount,8,'matching preserves each seat count');
 assert.ok(b.getScene().objects.every(o=>o.tableDecor.napkinColor==='Blush'),'existing saved decoration data survives');
 click('.ts-dialog [data-ts="undo"]');assert.deepEqual(JSON.parse(JSON.stringify(b.getScene().objects)),before,'one undo restores matching tables');
 click('.ts-dialog [data-ts="redo"]');assert.ok(b.getScene().objects.every(o=>o.linenId==='linen-round-120'));
 assert.ok(saves>=7,'real edits reach existing autosave event');
 dialog.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 assert.equal(dialog.open,false);assert.equal(d.body.style.overflow,'');assert.equal(b.state.selectedId,selected,'Escape returns to same selected table');assert.equal(d.activeElement.dataset.role,'insp-design-table');
 click('#btnToReview');assert.match(d.getElementById('reviewSummary').textContent,/Navy Blue 120/);assert.equal(b.computeLineItems().find(l=>l.category==='chair').qty,17);assert.equal(b.computeLineItems().find(l=>l.category==='linen').qty,2);
 assert.ok(b.computeLineItems().every(l=>['tent','table','chair','linen'].includes(l.category)));
 click('#btnBackToDesigner');click('[data-role="insp-design-table"]');await settle();assert.ok(dialog.open,'reopen works after review');
 click('.ts-dialog [data-ts="close"]');click('[data-drawer="tables"]');click('[data-role="table-card"][data-id="cocktail"]');click('#placementConfirm');click('[data-role="insp-design-table"]');await settle();
 assert.ok(dialog.open);assert.equal(dialog.querySelector('[data-role="insp-seats"]'),null,'standing tables do not offer seats');assert.equal(dialog.querySelector('.ts-visual svg').querySelectorAll(':scope > rect').length,0,'zero seats stay zero');
 click('.ts-dialog [data-ts="undo"]');assert.equal(dialog.open,false,'undoing table creation closes stale detail');assert.equal(d.body.style.overflow,'');
 console.log('PASS table detail: actual lazy entry; live chairs/seats/linens and per-table pricing; unknown pricing; shared inspector and autosave; atomic match/undo/redo; preserved legacy data; review quantities; close/reopen; zero-seat tables; no network writes');
 dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});
