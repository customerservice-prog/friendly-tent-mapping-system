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
window.ResizeObserver=class{observe(){} disconnect(){}};
window.alert=message=>{throw new Error('Unexpected alert: '+message);};
window.RENTSKETCH_API_URL='https://test.invalid';
window.RENTSKETCH_TENANT_SLUG='friendly';
window.RENTSKETCH_CATALOG_READY=true;
window.ACTIVE_TENANT={name:'Friendly Party Rental',slug:'friendly'};
window.fetch=()=>{throw new Error('Production writes are prohibited in this test');};
const context=dom.getInternalVMContext(),cache=new Map();
async function moduleAt(file){
  if(cache.has(file))return cache.get(file);
  const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file,initializeImportMeta(meta){meta.url=require('node:url').pathToFileURL(file).href;}});
  cache.set(file,m);
  await m.link((specifier,ref)=>moduleAt(path.resolve(path.dirname(ref.identifier),specifier)));
  return m;
}
(async()=>{
  const script=await moduleAt(path.join(root,'script.js'));await script.evaluate();
  window.eval(fs.readFileSync(path.join(root,'js/ui/autosave.js'),'utf8'));
  window.eval(fs.readFileSync(path.join(root,'js/ui/tent-preview-entry.js'),'utf8'));
  const b=window.FriendlyBridge;
  assert.equal(b.getScene().tentId,'pole-20x20');
  assert.equal(b.getScene().objects.length,0);
  assert.equal(window.document.querySelector('.step.active').id,'step-designer');
  assert.equal(window.RentSketchAutosave,undefined,'preview does not autosave');
  window.document.getElementById('designMyEvent').click();
  assert.equal(b.getScene().tentId,'pole-20x20');
  assert.equal(window.RENTSKETCH_TENT_PREVIEW,false);
  assert.ok(window.RentSketchAutosave,'continuation activates autosave');
  window.document.querySelector('[data-drawer="tables"]').click();
  window.document.querySelector('[data-role="table-card"][data-id="round-5ft"]').click();
  assert.equal(b.getScene().objects.length,1);
  assert.equal(b.getScene().objects[0].seatCount,8);
  window.document.getElementById('btnUndo').click();
  assert.equal(b.getScene().objects.length,0);
  window.document.getElementById('btnRedo').click();
  assert.equal(b.getScene().objects.length,1);
  window.document.getElementById('drawerClose').click();
  window.document.getElementById('btnToReview').click();
  assert.equal(window.document.querySelector('.step.active').id,'step-review');
  assert.match(window.document.getElementById('reviewSummary').textContent,/20.*20/);
  window.document.getElementById('btnBackToDesigner').click();
  assert.equal(b.getScene().objects.length,1);
  assert.equal(b.getScene().tentId,'pole-20x20');
  console.log('PASS: exact 2D preview → same tent → add table → undo/redo → review → return; no network writes');
  dom.window.close();
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1;});
