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
 w.eval(source);await wait(280);
 assert.equal(loaded.length,1,'returning browser automatically reopens its saved layout');
 assert.deepEqual(loaded[0],scene);assert.equal(w.RentSketchAutosave.getDesignId(),'saved-design');assert.equal(w.RentSketchAutosave.getSessionId(),'owner-session');
 dom.window.close();
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
  let scene={tentId:'frame-20x20',objects:[]},missingDraft=false;
  const calls=[];
  w.RENTSKETCH_API_URL='https://api.test';w.RENTSKETCH_TENANT_SLUG=slug;w.RENTSKETCH_CATALOG_READY=true;
  w.FriendlyBridge={getScene:()=>scene,state:{}};
  w.RentSketchEventPass={canEdit:()=>true};
  w.localStorage.setItem('rentsketch-anon-session','owner-session');
  w.localStorage.setItem('rentsketch_dashboard_token','first-token');
  w.fetch=async(url,options)=>{
   calls.push({url,method:options.method,headers:options.headers,body:JSON.parse(options.body)});
   if(missingDraft&&options.method==='PATCH'){missingDraft=false;return{ok:false,status:404,json:async()=>({error:'Draft not found for this session'})};}
   return{ok:true,status:200,json:async()=>({id:'saved-design'})};
  };
  w.eval(source);w.RentSketchStartAutosave();
  await w.RentSketchAutosave.flush();
  assert.equal(calls[0].method,'POST');assert.equal(calls[0].headers.Authorization,'Bearer first-token');
  w.localStorage.setItem('rentsketch_dashboard_token','renewed-token');
  scene={...scene,surfaceType:'concrete'};missingDraft=true;
  await w.RentSketchAutosave.flush();
  assert.deepEqual(calls.slice(1).map(c=>c.method),['PATCH','POST'],'missing draft recreation follows the update');
  for(const call of calls.slice(1))assert.equal(call.headers.Authorization,'Bearer renewed-token','update and recreate use current login');
  w.localStorage.removeItem('rentsketch_dashboard_token');
  scene={...scene,surfaceType:'grass'};
  await w.RentSketchAutosave.flush();
  assert.equal(calls.at(-1).headers.Authorization,undefined,'logout never reuses an old bearer');
  for(const call of calls){assert.equal(call.body.anonymousSessionId,'owner-session');assert.equal(call.headers['Content-Type'],'application/json');}
  assert.match(calls[0].url,slug==='generic'?/\/api\/consumer\/designs$/:/\/api\/tenants\/friendly\/designs$/);
  dom.window.close();
 }
}
(async()=>{await localResume();await sharedRestore();await authenticatedSaves();console.log('PASS draft resume: automatic 180-day local continuation and signed shared-layout read-only restore, and authenticated create/update/recreate saves.');})().catch(e=>{console.error(e);process.exitCode=1});
