const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dom=new JSDOM(fs.readFileSync(path.join(root,'designer/index.html'),'utf8'),{url:'https://rentsketch.com/designer/?tenant=friendly',runScripts:'outside-only',pretendToBeVisual:true});
// Isolated paid-event context; no real payment or entitlement is created.
dom.window.RentSketchEventPass={canEdit:()=>true,hasPaidEvent:()=>false};
dom.window.ResizeObserver=class{observe(){}disconnect(){}};dom.window.ACTIVE_TENANT={name:'Friendly Party Rental',slug:'friendly'};dom.window.fetch=()=>{throw new Error('No live API calls permitted');};
const context=dom.getInternalVMContext(),cache=new Map();
function moduleFor(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file,initializeImportMeta(meta){meta.url=require('node:url').pathToFileURL(file).href;}});cache.set(file,m);return m;}
 async function load(file){const m=moduleFor(file);if(m.status==='unlinked')await m.link((spec,ref)=>moduleFor(path.resolve(path.dirname(ref.identifier),spec)));return m;}
(async()=>{
 await(await load(path.join(root,'script.js'))).evaluate();await(await load(path.join(root,'js/ui/intake.js'))).evaluate();
 const d=dom.window.document,b=dom.window.FriendlyBridge;
 assert.equal(d.querySelector('.step.active').id,'step-designer');assert.equal(b.getScene().tentId,'pole-20x20');assert.equal(b.getScene().guestCount,0);assert.equal(d.querySelector('.studio-progress'),null);assert.match(d.getElementById('toolbarEventTitle').textContent,/20.*20/);
 d.querySelector('[data-role="empty-suggest"]').click();assert.ok(d.getElementById('quickSetupForm'));
 d.querySelector('[data-role="setup-manual"]').click();assert.equal(d.getElementById('drawerTitle').textContent,'Tables & Chairs');
 d.querySelector('[data-role="table-card"]').click();d.querySelector('#placementConfirm').click();assert.equal(b.getScene().objects.length,1);
 d.querySelector('[data-drawer="setup"]').click();d.getElementById('drawerClose').click();assert.equal(d.getElementById('drawer').hidden,true);assert.equal(b.getScene().objects.length,1);
 console.log('PASS direct entry: visible 20×20, no wizard, optional suggestion, manual editing, close preserves layout');dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});
