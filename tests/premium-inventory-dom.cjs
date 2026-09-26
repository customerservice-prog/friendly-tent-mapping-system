// Runs the real designer modules against a DOM without WebGL or production writes.
// Requires jsdom; run with node --experimental-vm-modules.
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const dom=new JSDOM(fs.readFileSync(path.join(root,'designer/index.html'),'utf8'),{
  url:'https://rentsketch.com/designer/?tenant=friendly&focus=tent&autoplace=1&view=2d&tentSlug=20x20-pole-tent',
  runScripts:'outside-only',pretendToBeVisual:true
});
const {window}=dom;
// Isolated paid-event context; no real payment or entitlement is created.
window.RentSketchEventPass={canEdit:()=>true,hasPaidEvent:()=>false};
window.ResizeObserver=class{observe(){} disconnect(){}};
window.alert=message=>{throw new Error('Unexpected alert: '+message);};
window.RENTSKETCH_API_URL='https://test.invalid';
window.RENTSKETCH_TENANT_SLUG='friendly';
window.RENTSKETCH_CATALOG_READY=true;
window.ACTIVE_TENANT={name:'Friendly Party Rental',slug:'friendly'};
window.fetch=()=>{throw new Error('Production writes are prohibited in this test');};
const context=dom.getInternalVMContext(),cache=new Map();
function moduleFor(file){
  if(cache.has(file))return cache.get(file);
  const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file,initializeImportMeta(meta){meta.url=require('node:url').pathToFileURL(file).href;}});
  cache.set(file,m);
  return m;
}
async function moduleAt(file){const m=moduleFor(file);if(m.status==='unlinked')await m.link((spec,ref)=>moduleFor(path.resolve(path.dirname(ref.identifier),spec)));return m;}
(async()=>{
  const script=await moduleAt(path.join(root,'script.js'));await script.evaluate();
  window.eval(fs.readFileSync(path.join(root,'js/ui/autosave.js'),'utf8'));
  window.eval(fs.readFileSync(path.join(root,'js/ui/tent-preview-entry.js'),'utf8'));
  const catalog=await moduleAt(path.join(root,'js/data/equipment.js'));await catalog.evaluate();
  catalog.namespace.EQUIPMENT.push(...catalog.namespace.genericEquipment());
  const inflatable=await moduleAt(path.join(root,'js/data/inflatables.js'));await inflatable.evaluate();
  inflatable.namespace.INFLATABLES.push({...inflatable.namespace.INFLATABLE_PROFILES[0],id:'bounce',name:'Bounce house',pricePerDay:null});
  const b=window.FriendlyBridge;window.document.getElementById('designMyEvent').click();
  function click(selector){const el=window.document.querySelector(selector);assert.ok(el,selector);el.click();}
  click('[data-drawer="inventory"]');
  const input=window.document.querySelector('[data-role="inventory-query"]');input.value='foam';input.dispatchEvent(new window.Event('input',{bubbles:true}));
  assert.equal(window.document.querySelectorAll('[data-role="equipment-card"]').length,1);
  click('[data-role="equipment-card"]');click('#placementConfirm');
  assert.equal(b.getScene().objects[0].kind,'equipment');assert.match(window.document.getElementById('inspectorPanel').textContent,/Foam/);
  click('[data-role="insp-rotate"]');click('[data-role="insp-duplicate"]');assert.equal(b.getScene().objects.length,2);
  click('#btnUndo');assert.equal(b.getScene().objects.length,1);click('#btnRedo');assert.equal(b.getScene().objects.length,2);
  const saved=JSON.parse(JSON.stringify(b.getScene()));assert.equal(b.loadScene(saved),true);assert.equal(b.getScene().objects.length,2);
  const lines=b.computeLineItems();assert.equal(lines.find(l=>l.category==='equipment').qty,2);
  click('[data-drawer="inflatables"]');click('[data-role="inflatable-card"]');click('#placementConfirm');
  assert.equal(b.getScene().tentId,'pole-20x20','adding inflatable retains tent');assert.equal(b.getScene().siteLayout,true);
  const bounce=b.getScene().objects.find(o=>o.kind==='inflatable');assert.ok(bounce.x>=30,'inflatable starts outside tent');
  click('#btnToReview');assert.match(window.document.getElementById('reviewSummary').textContent,/Foam machine/);assert.match(window.document.getElementById('reviewSummary').textContent,/Bounce house/);
  console.log('PASS: searchable inventory → foam placement → rotate/duplicate/undo/redo → saved reopen → mixed tent/inflatable layout → complete itemized review; no network writes');
  dom.window.close();
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1;});
