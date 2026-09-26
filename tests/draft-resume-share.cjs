// Browser-storage resume + shared-layout restore regression. Isolated JSDOM only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'js/ui/autosave.js'),'utf8');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function localResume(){
 const dom=new JSDOM('<!doctype html><body><div id="designer"></div></body>',{url:'https://rentsketch.com/designer/?tenant=lake',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,scene={tentId:'frame-20x20',sidewalls:[{id:'front-0',side:'front',startFt:0,lengthFt:10,type:'solid',enabled:true}],backgroundPhoto:{id:'photo-local',url:'https://api.test/api/tenants/lake/background-photo/photo-local?t=private-local',focusX:42,focusY:61,zoom:1.18,shade:.1},objects:[{id:'table-1',kind:'table'}]},loaded=[];
 w.RENTSKETCH_API_URL='https://api.test';w.RENTSKETCH_TENANT_SLUG='lake';w.RENTSKETCH_CATALOG_READY=true;
 w.FriendlyBridge={getScene:()=>scene,loadScene:s=>{loaded.push(JSON.parse(JSON.stringify(s)));return true;},state:{}};
 w.confirm=()=>{throw Error('resume must not ask for confirmation');};
 w.localStorage.setItem('rentsketch-autosave:lake',JSON.stringify({id:'saved-design',scene,savedAt:new Date(Date.now()-7*86400000).toISOString(),tenant:'lake',anonymousSessionId:'owner-session'}));
 w.fetch=async()=>{throw Error('Unexpected fetch before recovery assertions');};w.eval(source);await wait(280);
 assert.equal(loaded.length,1,'returning browser automatically reopens its saved layout');
 assert.equal(w.RentSketchAutosave.getState().dirty,true,'legacy local copy remains pending until server confirms it');assert.doesNotMatch(w.RentSketchAutosave.getState().message,/All changes saved|Saved to your project/);
 assert.deepEqual(loaded[0],scene);assert.equal(w.RentSketchAutosave.getDesignId(),'saved-design');assert.equal(w.RentSketchAutosave.getSessionId(),'owner-session');
 dom.window.close();
}
async function pendingRecovery(){
 const dom=new JSDOM('<!doctype html><body></body>',{url:'https://rentsketch.com/designer/?tenant=lake',runScripts:'outside-only'}),w=dom.window;
 let current={tentId:'frame-20x20',objects:[]};const pending={...current,eventName:'Offline changes',objects:[{id:'table-1',kind:'table'}]},calls=[];
 w.RENTSKETCH_API_URL='https://api.test';w.RENTSKETCH_TENANT_SLUG='lake';w.RENTSKETCH_CATALOG_READY=true;
 w.FriendlyBridge={getScene:()=>current,loadScene:s=>{current=s;return true;},state:{}};
 w.localStorage.setItem('rentsketch-autosave:lake',JSON.stringify({id:'saved-design',revision:3,pending:true,scene:pending,savedAt:new Date().toISOString(),tenant:'lake',anonymousSessionId:'owner-session'}));
 w.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return{ok:true,json:async()=>({id:'saved-design',revision:4})};};
 w.eval(source);await wait(280);assert.equal(w.RentSketchAutosave.getState().dirty,true);await w.RentSketchAutosave.flush();
 assert.equal(calls.length,1);assert.equal(calls[0].expectedRevision,3);assert.equal(calls[0].scene.eventName,'Offline changes');assert.equal(w.RentSketchAutosave.getState().dirty,false);assert.equal(JSON.parse(w.localStorage.getItem('rentsketch-autosave:lake')).pending,false);dom.window.close();
}
async function sharedRestore(){
 const dom=new JSDOM('<!doctype html><body></body>',{url:'https://rentsketch.com/designer/?tenant=lake#share=signed-fixture',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,scene={tentId:'pole-20x20',sidewalls:[{id:'left-0',side:'left',startFt:0,lengthFt:10,type:'window',enabled:true}],backgroundPhoto:{id:'photo-shared',url:'https://api.test/api/tenants/lake/background-photo/photo-shared?t=private-share',focusX:50,focusY:50,zoom:1,shade:.08},objects:[]},loaded=[];
 w.RENTSKETCH_API_URL='https://api.test';w.RENTSKETCH_TENANT_SLUG='lake';w.RENTSKETCH_CATALOG_READY=true;
 w.FriendlyBridge={getScene:()=>scene,loadScene:s=>{loaded.push(JSON.parse(JSON.stringify(s)));return true;},state:{}};
 w.fetch=async(url,options)=>{assert.match(url,/\/api\/tenants\/lake\/shared-design\/restore$/);assert.equal(JSON.parse(options.body).token,'signed-fixture');return{ok:true,json:async()=>({id:'shared-design',tenant:'lake',scene,readOnly:true,updatedAt:'2026-09-24T00:00:00Z'})};};
 w.eval(source);await wait(80);
 assert.equal(loaded.length,1);assert.deepEqual(loaded[0],scene);assert.equal(w.RENTSKETCH_SHARED_READONLY,true,'shared viewer is locked read-only');
 assert.equal(w.location.hash,'','share credential is removed after restoration');assert.equal(w.RentSketchAutosave,undefined,'read-only share never starts draft autosave');
 dom.window.close();
}
async function authenticatedSaves(){
 for(const slug of ['friendly','generic']){
  const dom=new JSDOM('<!doctype html><body></body>',{url:'https://rentsketch.com/designer/?tenant='+slug,runScripts:'outside-only'}),w=dom.window;
  let scene={tentId:'frame-20x20',objects:[]},missingDraft=false,pendingJson=null,revision=0;
  let staff={id:'first-session',csrfToken:'first-csrf',expiresAt:'2099-01-01T00:00:00.000Z'};
  const calls=[];w.Headers=Headers;
  w.RENTSKETCH_API_URL='https://api.test';w.RENTSKETCH_TENANT_SLUG=slug;w.RENTSKETCH_CATALOG_READY=true;
  w.FriendlyBridge={getScene:()=>scene,state:{}};
  w.RentSketchEventPass={canEdit:()=>true};
  w.localStorage.setItem('rentsketch-anon-session','owner-session');
  w.fetch=async(url,options)=>{
   if(url==='/staff-api/api/auth/me')return{ok:!!staff,status:staff?200:401,json:async()=>({session:staff})};
   const headers=Object.fromEntries(new Headers(options.headers).entries());
   calls.push({url,method:options.method,headers,credentials:options.credentials,body:options.body?JSON.parse(options.body):null});
   if(missingDraft&&options.method==='PATCH'){missingDraft=false;return{ok:false,status:404,json:async()=>({error:'Draft not found for this session'})};}
   return{ok:true,status:200,json:async()=>pendingJson?await pendingJson:{id:'saved-design',revision:++revision}};
  };
  w.eval(fs.readFileSync(path.join(root,'js/ui/dashboard-session.js'),'utf8'));
  w.eval(source);w.RentSketchStartAutosave();
  await w.RentSketchAutosave.flush();
  assert.equal(calls[0].method,'POST');assert.equal(calls[0].headers['x-rentsketch-csrf'],'first-csrf');
  staff={...staff,id:'renewed-session',csrfToken:'renewed-csrf'};w.RentSketchDashboardSession.accept(staff);
  scene={...scene,surfaceType:'concrete'};missingDraft=true;
  await assert.rejects(w.RentSketchAutosave.flush(),/Draft not found/,'missing saved project is not silently recreated');
  assert.equal(w.RentSketchAutosave.getDesignId(),'saved-design');
  await w.RentSketchAutosave.flush();
  assert.deepEqual(calls.slice(1).map(c=>c.method),['PATCH','PATCH'],'retry retains the original project');
  assert.equal(calls[1].body.expectedRevision,1,'update is bound to the last known server revision');
  for(const call of calls.slice(1))assert.equal(call.headers['x-rentsketch-csrf'],'renewed-csrf','update and recreate use current cookie session CSRF');
  let release;pendingJson=new Promise(resolve=>{release=resolve;});scene={...scene,eventName:'Staff pending write'};
  const pending=w.RentSketchAutosave.flush();await wait(20);
  await w.RentSketchDashboardSession.clear('signed-out',false);staff=null;
  release({id:'stale-design'});
  await assert.rejects(pending,/session changed/,'logout while parsing a save response prevents client state adoption');
  assert.equal(w.RentSketchAutosave.getDesignId(),'saved-design');
  scene={...scene,surfaceType:'grass'};
  const before=calls.length;await assert.rejects(w.RentSketchAutosave.flush(),/admin session ended/);
  assert.equal(calls.length,before,'a lost staff session never silently falls back to an anonymous write');
  for(const call of calls){assert.equal(call.body.anonymousSessionId,'owner-session');assert.equal(call.headers['content-type'],'application/json');assert.equal(call.headers.authorization,undefined);assert.equal(call.credentials,'same-origin');assert.ok(call.url.startsWith('/staff-api/api/'));}
  assert.match(calls[0].url,slug==='generic'?/\/api\/consumer\/designs$/:/\/api\/tenants\/friendly\/designs$/);
  assert.equal(w.localStorage.getItem('rentsketch_dashboard_token'),null,'no readable staff credential is stored');
  dom.window.close();
 }
}
(async()=>{await localResume();await pendingRecovery();await sharedRestore();await authenticatedSaves();console.log('PASS draft resume: automatic 180-day local continuation and signed shared-layout read-only restore, and authenticated revision-aware saves and missing-project recovery.');})().catch(e=>{console.error(e);process.exitCode=1});
