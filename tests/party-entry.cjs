const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dom=new JSDOM(fs.readFileSync(path.join(root,'designer/index.html'),'utf8'),{url:'https://rentsketch.com/designer/?tenant=friendly&focus=tent&autoplace=1&view=2d&tentSlug=20x20-pole-tent',runScripts:'outside-only',pretendToBeVisual:true});
dom.window.ResizeObserver=class{observe(){}disconnect(){}};dom.window.ACTIVE_TENANT={name:'Friendly Party Rental',slug:'friendly'};dom.window.fetch=()=>{throw new Error('No live API calls permitted');};
// Isolated paid-event context; no real payment or entitlement is created.
dom.window.RentSketchEventPass={canEdit:()=>true,hasPaidEvent:()=>false};
const context=dom.getInternalVMContext(),cache=new Map();
function moduleFor(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file,initializeImportMeta(meta){meta.url=require('node:url').pathToFileURL(file).href;}});cache.set(file,m);return m;}
 async function load(file){const m=moduleFor(file);if(m.status==='unlinked')await m.link((spec,ref)=>moduleFor(path.resolve(path.dirname(ref.identifier),spec)));return m;}
(async()=>{
 await(await load(path.join(root,'script.js'))).evaluate();
 const w=dom.window,d=w.document,b=w.FriendlyBridge;
 w.RENTSKETCH_CATALOG_READY=true;
 b.TENTS.find(t=>t.id==='pole-20x20').pricePerDay=250;
 b.TABLES.find(t=>t.id==='round-5ft').pricePerDay=15;b.TABLES.find(t=>t.id==='cocktail').pricePerDay=12;
 b.CHAIRS.find(c=>c.id==='resin-white').pricePerDay=5;
 const linens=(await load(path.join(root,'js/data/linens.js'))).namespace.LINENS;
 for(const id of ['linen-round-120','linen-cocktail-cover']){const l=linens.find(l=>l.id===id);l.productId='test-'+id;l.pricePerDay=id==='linen-round-120'?12:10;}
 const floor=(await load(path.join(root,'js/data/danceFloor.js'))).namespace.DANCE_SECTION;floor.productId='test-floor';floor.pricePerDay=35;
 w.eval(fs.readFileSync(path.join(root,'js/ui/tent-preview-entry.js'),'utf8'));
 const party=d.getElementById('previewParty');assert.ok(!party.disabled);party.click();assert.ok(party.disabled&&party.hidden);
 const before=JSON.stringify(b.getScene().objects);assert.equal(b.getScene().objects.length,7);assert.equal(b.getScene().objects.reduce((n,o)=>n+(o.seatCount||0),0),16);
 assert.equal(b.getScene().tentId,'pole-20x20');assert.equal(b.getScene().lightingId,'lighting-none','starter does not silently add lighting');
 d.getElementById('designMyEvent').click();assert.equal(JSON.stringify(b.getScene().objects),before,'preview to designer preserves every rental item');
 d.getElementById('btnToReview').click();assert.match(d.getElementById('reviewSummary').textContent,/16 planned seats/);assert.match(d.getElementById('reviewSummary').textContent,/546.00/);
 assert.ok(!b.computeLineItems().some(l=>/guest|flower|place setting|glassware/i.test(l.label)),'styling never becomes a quote item');
 d.getElementById('btnBackToDesigner').click();d.getElementById('btnUndo').click();assert.equal(b.getScene().objects.length,0);assert.equal(b.computeLineItems().reduce((sum,l)=>sum+l.amount,0),250);
 d.getElementById('btnRedo').click();assert.equal(JSON.stringify(b.getScene().objects),before);
 assert.equal(b.buildPartyScene(),false);assert.equal(JSON.stringify(b.getScene().objects),before,'party shortcut never overwrites an existing design');
 console.log('PASS party entry: exact 20×20 → catalog-backed furnished setup → continuous designer → $546 review → atomic undo/redo; no decorative quote items or network writes');w.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});
