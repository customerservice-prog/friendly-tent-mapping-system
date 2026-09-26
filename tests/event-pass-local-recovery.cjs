// Real Event Pass bootstrap and real autosave: deferred cloud access must not
// replace the same owner's unsynced device layout during a page reopen.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),root=path.resolve(__dirname,'..');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),clone=value=>JSON.parse(JSON.stringify(value));
const localScene={tentId:'frame-20x20',objects:[{id:'local-table',kind:'table',x:12,y:7}],eventName:'Offline arrangement'};
const cloudScene={tentId:'frame-20x20',objects:[{id:'cloud-table',kind:'table',x:2,y:3}],eventName:'Previous cloud arrangement'};
async function setup(slug,{local={},remote={},failedResume=false}={}){
 const dom=new JSDOM('<!doctype html><body><div class="designer-shell"><div class="canvas-viewport"></div></div></body>',{url:'https://rentsketch.com/designer/?tenant='+slug,runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,calls=[],loaded=[];let scene={tentId:'frame-20x20',objects:[]};
 const saved={id:'same-project',tenant:slug,anonymousSessionId:'same-owner',revision:3,pending:true,scene:clone(localScene),savedAt:new Date().toISOString(),...local};
 const result={id:'same-project',tenant:slug,anonymousSessionId:'same-owner',revision:3,active:true,expiresAt:'2099-01-01T00:00:00.000Z',scene:clone(cloudScene),renewable:true,...remote};
 w.Headers=Headers;w.AbortController=AbortController;w.console.warn=()=>{};w.alert=message=>{throw Error(message);};
 w.RENTSKETCH_API_URL='https://api.test';w.RENTSKETCH_TENANT_SLUG=slug;w.RENTSKETCH_CATALOG_READY=true;
 w.localStorage.setItem('rentsketch-anon-session','same-owner');w.localStorage.setItem('rentsketch-autosave:'+slug,JSON.stringify(saved));
 w.FriendlyBridge={state:{},getScene:()=>clone(scene),loadScene:value=>{assert.equal(w.RENTSKETCH_PASS_RESTORING||w.RentSketchEventPass.canEdit(),true,'scene restoration requires verified access or controlled restore');loaded.push(clone(value));scene=clone(value);return true;}};
 w.fetch=async(url,options={})=>{
  const body=options.body?JSON.parse(options.body):null;calls.push({url,method:options.method||'GET',body});
  if(url.includes('/event-pass/offer?'))return {ok:true,json:async()=>({required:true,available:true,priceCents:999,durationDays:30,renewalPriceCents:499,renewalDurationDays:30})};
  if(url.endsWith('/event-pass/resume'))return {ok:!failedResume,json:async()=>failedResume?{error:'Connection unavailable'}:clone(result)};
  if(/\/designs\/same-project$/.test(url)&&options.method==='PATCH')return {ok:true,json:async()=>({id:result.id,revision:result.revision+1,updated:true})};
  throw Error('Unexpected request '+url);
 };
 w.eval(fs.readFileSync(path.join(root,'js/ui/paywall.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'js/ui/autosave.js'),'utf8'));
 for(let n=0;n<60;n++){if(loaded.length||w.document.querySelector('.paywall-error'))break;await wait(10);}
 await wait(15);
 return {dom,w,calls,loaded,saved,result,get scene(){return clone(scene);},stored:()=>JSON.parse(w.localStorage.getItem('rentsketch-autosave:'+slug)),writes:()=>calls.filter(call=>call.method==='PATCH')};
}
(async()=>{
 for(const slug of ['generic','friendly']){
  {
   const t=await setup(slug);assert.equal(t.w.RentSketchEventPass.canEdit(),true);assert.equal(t.scene.objects[0].id,'local-table',slug+': verified reopen retains unsynced local placement');
   assert.equal(t.loaded.some(scene=>scene.objects[0]?.id==='cloud-table'),false,'cloud does not flash over pending local scene');
   assert.equal(t.w.RentSketchAutosave.getState().dirty,true);assert.equal(t.stored().pending,true);assert.equal(t.writes().length,0);
   await t.w.RentSketchAutosave.flush();assert.equal(t.writes().length,1);assert.equal(t.writes()[0].body.expectedRevision,3);assert.equal(t.writes()[0].body.scene.objects[0].id,'local-table');
   assert.match(t.writes()[0].url,slug==='generic'?/\/api\/consumer\/designs\//:/\/api\/tenants\/friendly\/designs\//);assert.equal(t.stored().pending,false);t.dom.window.close();
  }
  {
   const t=await setup(slug,{remote:{revision:4}});assert.equal(t.scene.objects[0].id,'local-table');assert.equal(t.w.RentSketchAutosave.getState().status,'conflict');assert.equal(t.w.RentSketchAutosave.getState().conflict.currentRevision,4);
   await assert.rejects(t.w.RentSketchAutosave.flush(),/conflict|choos/i);assert.equal(t.writes().length,0,'newer cloud revision pauses sync until a choice');assert.equal(t.stored().pending,true);assert.equal(t.stored().scene.objects[0].id,'local-table');t.dom.window.close();
  }
  {
   const t=await setup(slug,{local:{revision:null}});assert.equal(t.scene.objects[0].id,'local-table');assert.equal(t.w.RentSketchAutosave.getState().status,'conflict','unknown base revision is never silently assigned the latest revision');
   await assert.rejects(t.w.RentSketchAutosave.flush(),/conflict|choos/i);assert.equal(t.writes().length,0);t.dom.window.close();
  }
  {
   const t=await setup(slug,{local:{pending:false}});assert.equal(t.scene.objects[0].id,'cloud-table','confirmed clean device copy follows current cloud version');assert.equal(t.w.RentSketchAutosave.getState().dirty,false);assert.equal(t.writes().length,0);t.dom.window.close();
  }
  {
   const t=await setup(slug,{local:{revision:null,pending:undefined,scene:clone(cloudScene)}});assert.equal(t.scene.objects[0].id,'cloud-table','an identical legacy device scene has no unsynced difference to recover');assert.equal(t.w.RentSketchAutosave.getState().conflict,null);assert.equal(t.w.RentSketchAutosave.getRevision(),3);assert.equal(t.w.RentSketchAutosave.getState().dirty,false);t.dom.window.close();
  }
  {
   const t=await setup(slug,{remote:{active:false,expiresAt:'2020-01-01T00:00:00.000Z'}});assert.equal(t.w.RentSketchEventPass.canEdit(),false);assert.equal(t.scene.objects[0].id,'cloud-table','expired access shows the saved cloud layout only');
   assert.equal(t.stored().scene.objects[0].id,'local-table','expired access does not destroy pending recovery');assert.equal(t.stored().pending,true);await assert.rejects(t.w.RentSketchAutosave.flush(),/read-only/i);assert.equal(t.writes().length,0);t.dom.window.close();
  }
  for(const mismatch of [{anonymousSessionId:'different-owner'},{id:'different-project'},{tenant:'different-tenant'}]){
   const t=await setup(slug,{local:mismatch});assert.equal(t.scene.objects[0].id,'cloud-table','only exactly matching tenant, project and owner can load local recovery');assert.equal(t.loaded.some(scene=>scene.objects[0]?.id==='local-table'),false);assert.equal(t.writes().length,0);t.dom.window.close();
  }
  {
   const t=await setup(slug,{local:{anonymousSessionId:null}});assert.equal(t.scene.objects[0].id,'cloud-table','an owner-less local record is not trusted as the verified owner');assert.equal(t.writes().length,0);t.dom.window.close();
  }
  for(const savedAt of ['not-a-date',new Date(Date.now()+86400000).toISOString(),new Date(Date.now()-181*86400000).toISOString()]){
   const t=await setup(slug,{local:{savedAt}});assert.equal(t.scene.objects[0].id,'cloud-table','invalid, future and expired device copies cannot replace verified cloud data');assert.equal(t.writes().length,0);t.dom.window.close();
  }
  {
   const t=await setup(slug,{remote:{tenant:'different-tenant'}});assert.equal(t.loaded.length,0,'server tenant mismatch is rejected before restoring either scene');assert.equal(t.stored().scene.objects[0].id,'local-table');t.dom.window.close();
  }
  {
   const t=await setup(slug,{failedResume:true});assert.equal(t.loaded.length,0);assert.equal(t.stored().scene.objects[0].id,'local-table','failed access verification preserves the local recovery');assert.equal(t.writes().length,0);t.dom.window.close();
  }
 }
 console.log('PASS Event Pass + autosave reopen: generic/Friendly pending recovery, revision conflicts, clean resume, expired access, exact owner/project/tenant checks, and failed verification.');
})().catch(error=>{console.error(error);process.exitCode=1;});
