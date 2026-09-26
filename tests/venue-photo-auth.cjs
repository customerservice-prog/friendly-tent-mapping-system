// Production photo operations and cookie-session transport across deferred auth.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),root=path.resolve(__dirname,'..');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const photo={id:'unused-photo',url:'https://api.test/unused-photo'};
const uploadContext={api:'https://api.test',slug:'friendly',designId:'original-project',sessionId:'original-owner'};
async function fixture(identity='staff-a'){
  const dom=new JSDOM('<!doctype html><body></body>',{url:'https://rentsketch.com/designer/',runScripts:'outside-only'}),w=dom.window,calls=[];
  w.Headers=Headers;w.AbortController=AbortController;
  w.fetch=async(url,options={})=>{calls.push({url,options});return {ok:true,status:200,json:async()=>({id:'uploaded-photo',path:'/photo/uploaded-photo'})};};
  w.eval(fs.readFileSync(path.join(root,'js/ui/dashboard-session.js'),'utf8'));
  const manager=w.RentSketchDashboardSession,accept=id=>manager.accept({id,csrfToken:'csrf-'+id,expiresAt:'2099-01-01T00:00:00Z'});
  if(identity)accept(identity);else await manager.clear('fixture',false);
  const context=dom.getInternalVMContext(),cache=new Map();
  function moduleFor(file){if(cache.has(file))return cache.get(file);const mod=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});cache.set(file,mod);return mod;}
  const module=moduleFor(path.join(root,'js/ui/venue-photo.js'));await module.link((specifier,ref)=>moduleFor(path.resolve(path.dirname(ref.identifier),specifier)));await module.evaluate();
  return {w,calls,manager,accept,photo:module.namespace,close:()=>dom.window.close()};
}
(async()=>{
  for(const initial of ['staff-a','']){
    const f=await fixture(initial),ready=deferred();f.manager.ready=()=>ready.promise;
    const pending=f.photo.deleteVenuePhoto(photo,uploadContext);f.accept('staff-b');ready.resolve();await pending;
    assert.equal(f.calls.length,0,'cleanup cannot cross '+(initial?'staff-to-staff':'anonymous-to-staff')+' while outer readiness is pending');f.close();
  }
  {
    const f=await fixture(),ready=deferred();f.manager.ready=()=>ready.promise;
    const pending=f.photo.deleteVenuePhoto(photo,uploadContext);await f.manager.clear('signed-out',false);ready.resolve();await pending;
    assert.equal(f.calls.length,0,'staff cleanup cannot downgrade to anonymous ownership after logout');f.close();
  }
  {
    const f=await fixture();f.manager.ready=async()=>f.manager.getSession();
    // Only outer readiness is replaced. The production manager.request still
    // awaits its lexical ready(), creating the second identity-switch boundary.
    const pending=f.photo.deleteVenuePhoto(photo,uploadContext);queueMicrotask(()=>f.accept('staff-b'));await pending;
    assert.equal(f.calls.length,0,'inner manager readiness must pin the original identity before sending DELETE');f.close();
  }
  {
    const f=await fixture(),ready=deferred();f.manager.ready=()=>ready.promise;
    const file=new f.w.File([new Uint8Array([255,216,255,217])],'yard.jpg',{type:'image/jpeg'});
    const pending=f.photo.uploadVenuePhoto(file,uploadContext);f.accept('staff-b');ready.resolve();await assert.rejects(pending,/session changed/);
    assert.equal(f.calls.length,0,'upload cannot inherit a different identity during readiness');f.close();
  }
  {
    const f=await fixture();await f.photo.deleteVenuePhoto(photo,uploadContext);
    assert.equal(f.calls.length,1);assert.match(f.calls[0].url,/^\/staff-api\/api\/tenants\/friendly\/designs\/original-project\/background-photo\/unused-photo$/);
    assert.equal(f.calls[0].options.headers.get('X-RentSketch-CSRF'),'csrf-staff-a');
    assert.equal(f.calls[0].options.expectedIdentity,undefined,'custom pinning option is stripped before fetch');f.close();
  }
  {
    const f=await fixture('');await f.photo.deleteVenuePhoto(photo,uploadContext);
    assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.credentials,'omit');assert.equal(f.calls[0].options.headers['X-RentSketch-Session'],'original-owner');f.close();
  }
  {
    const f=await fixture(),pending=f.manager.request('/api/test-default',{method:'POST'});queueMicrotask(()=>f.accept('staff-b'));await pending;
    assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.headers.get('X-RentSketch-CSRF'),'csrf-staff-b','unpinned callers retain their current-session semantics');f.close();
  }
  console.log('PASS venue photo auth: cleanup/upload identity pinned across both readiness boundaries; no anonymous/staff crossover; default transport and owner headers preserved.');
})().catch(error=>{console.error(error);process.exitCode=1;});
