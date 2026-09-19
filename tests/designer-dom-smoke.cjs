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
  // Exercise the customer-facing inspector, then verify review uses those edits.
  window.document.querySelector('[data-role="insp-seats"][data-delta="1"]').click();
  assert.equal(b.getScene().objects[0].seatCount,9);
  const chair=window.document.querySelector('[data-role="insp-chair"]');
  chair.value='resin-white';chair.dispatchEvent(new window.Event('change',{bubbles:true}));
  assert.equal(b.getScene().objects[0].chairId,'resin-white');
  const linen=window.document.querySelector('[data-role="insp-linen"]');
  linen.value='linen-round-120';linen.dispatchEvent(new window.Event('change',{bubbles:true}));
  assert.equal(b.getScene().objects[0].linenId,'linen-round-120');
  window.document.querySelector('[data-role="insp-duplicate"]').click();
  assert.equal(b.getScene().objects.length,2);
  assert.equal(b.getScene().objects[1].seatCount,9);
  window.document.getElementById('btnUndo').click();
  assert.equal(b.getScene().objects.length,1);
  window.document.getElementById('btnRedo').click();
  assert.equal(b.getScene().objects.length,2);
  window.document.querySelector('[data-role="insp-rotate"]').click();
  assert.equal(b.getScene().objects[1].rotationDeg,90);
  window.document.querySelector('[data-role="insp-delete"]').click();
  assert.equal(b.getScene().objects.length,1);
  window.document.getElementById('btnToReview').click();
  assert.equal(window.document.querySelector('.step.active').id,'step-review');
  assert.match(window.document.getElementById('reviewSummary').textContent,/20.*20/);
  assert.match(window.document.getElementById('reviewSummary').textContent,/White Resin/);
  assert.match(window.document.getElementById('reviewSummary').textContent,/White 120/);
  assert.match(window.document.getElementById('reviewSummary').textContent,/Confirm pricing/);
  assert.equal(b.computeLineItems().find(line=>line.category==='chair').qty,9);
  window.document.getElementById('btnBackToDesigner').click();
  assert.equal(b.getScene().objects.length,1);
  assert.equal(b.getScene().tentId,'pole-20x20');
  for(let i=0;i<3;i++){
    window.document.querySelector('[data-drawer="tables"]').click();
    window.document.querySelector('[data-role="table-card"][data-id="round-5ft"]').click();
  }
  assert.equal(b.getScene().objects.length,4);
  const positions=new Set();
  for(const item of b.getScene().objects){
    assert.ok(item.x>=0 && item.y>=0 && item.x+item.widthFt<=20 && item.y+item.depthFt<=20);
    positions.add(item.x+':'+item.y);
  }
  assert.equal(positions.size,4,'four tables occupy separate starting positions');
  console.log('PASS: exact preview → table → seats/chairs/linen → duplicate/rotate/delete/undo/redo → complete review → return; no network writes');
  dom.window.close();
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1;});
