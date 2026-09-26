// Local recovery plus revision-checked cloud saves.
(function(){
'use strict';
var params=new URLSearchParams(location.search),started=false;
function start(skipRestore){
 if(started)return;started=true;
 var api=window.RENTSKETCH_API_URL,slug=window.RENTSKETCH_TENANT_SLUG||'generic';
 if(!api){started=false;setTimeout(function(){start(skipRestore);},100);return;}
 var KEY='rentsketch-autosave:'+slug,SESSION='rentsketch-anon-session',timer=null,activeSave=null,lastJson='',lastId=null,revision=null,ownedSession=null,staffSeen=false,retryAfter=0;
 var status={status:'local',message:'Your changes are saved on this device.',savedAt:null,project:{},conflict:null};
 function bridge(){return window.FriendlyBridge||{};}function scene(){return bridge().getScene?.()||null;}
 function stable(v){if(Array.isArray(v))return '['+v.map(function(x){return x===undefined?'null':stable(x);}).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).filter(function(k){return v[k]!==undefined;}).sort().map(function(k){return JSON.stringify(k)+':'+stable(v[k]);}).join(',')+'}';return JSON.stringify(v);}
 function staffIdentity(){return window.RentSketchDashboardSession?.identity?.()||'';}
 function sessionId(){if(ownedSession)return ownedSession;try{var id=localStorage.getItem(SESSION);if(!id){id=crypto.randomUUID?crypto.randomUUID():'rs-'+Date.now()+'-'+Math.random().toString(36).slice(2);localStorage.setItem(SESSION,id);}return id;}catch(_){return null;}}
 function readOnly(){return !!window.RENTSKETCH_SHARED_READONLY||(['friendly','generic'].includes(slug)&&window.RentSketchEventPass?.canEdit()!==true);}
 function read(){try{return JSON.parse(localStorage.getItem(KEY)||'null');}catch(_){return null;}}
 function snapshot(sc){try{localStorage.setItem(KEY,JSON.stringify({id:lastId,revision:revision,scene:sc,savedAt:new Date().toISOString(),tenant:slug,anonymousSessionId:sessionId(),project:{projectName:status.project.projectName,siteNotes:status.project.siteNotes},conflict:status.conflict}));}catch(_){}}
 function getState(){return Object.assign({},status,{id:lastId,revision:revision,dirty:stable(scene())!==lastJson,readOnly:readOnly()});}
 function announce(kind,message,extra){status=Object.assign({},status,extra||{},{status:kind,message:message});window.dispatchEvent(new CustomEvent('rentsketch:saveStatus',{detail:getState()}));}
 function base(){return slug==='generic'?'/api/consumer/designs':'/api/tenants/'+encodeURIComponent(slug)+'/designs';}
 function projectPath(suffix,id){return base()+'/'+encodeURIComponent(id||lastId)+(suffix||'');}
 async function request(path,options){
  var manager=window.RentSketchDashboardSession;await manager?.ready?.();var identity=staffIdentity();if(identity)staffSeen=true;
  if(staffSeen&&!identity)throw new Error('Your admin session ended. Sign in again to save this layout.');
  options=Object.assign({cache:'no-store'},options||{});options.headers=Object.assign({'X-RentSketch-Session':sessionId()},options.headers||{});
  var r=identity?await manager.request(path,options):await fetch(api+path,Object.assign({credentials:'omit'},options)),data={};try{data=await r.json();}catch(_){}
  if(identity!==staffIdentity())throw new Error('Your admin session changed. Sign in again to save this layout.');
  if(!r.ok){var error=new Error(data.error||'Your project could not be saved.');error.status=r.status;error.data=data;
   if(r.status===402)window.dispatchEvent(new CustomEvent('rentsketch:accessRequired'));
   if(r.status===409&&data.currentRevision){announce('conflict','This project changed in another session. Your work is safe on this device.',{conflict:{currentRevision:data.currentRevision}});snapshot(scene());}throw error;}
  return data;
 }
 function metadata(saved){return {projectName:saved.projectName??status.project.projectName??'',siteNotes:saved.siteNotes??status.project.siteNotes??'',crewNotes:saved.crewNotes??status.project.crewNotes??''};}
 function adopt(saved){
  if(saved.tenant&&saved.tenant!==slug)throw new Error('This design belongs to a different rental company.');
  clearTimeout(timer);if(saved.id&&saved.id!==lastId)status.project={};lastId=saved.id||lastId;revision=Number.isInteger(saved.revision)?saved.revision:null;ownedSession=saved.anonymousSessionId||ownedSession;if(saved.adminAccess)staffSeen=true;
  var sc=saved.scene||scene();lastJson=stable(sc);status.project=metadata(saved);status.conflict=null;status.savedAt=saved.updatedAt||new Date().toISOString();snapshot(sc);announce('saved','Saved to your project.');
 }
 async function fetchLatest(){if(!lastId)throw new Error('Save this layout first.');return request(projectPath());}
 async function resolveRevision(){if(!lastId||revision!==null)return;var latest=await fetchLatest();if(!latest.revision)throw new Error('The saved project could not be verified. Refresh and try again.');
  if(stable(latest.scene)!==lastJson){announce('conflict','A newer project is available. Choose which layout to keep.',{conflict:{currentRevision:latest.revision}});var e=new Error(status.message);e.status=409;e.data={currentRevision:latest.revision};throw e;}revision=latest.revision;status.project=metadata(latest);}
 function checkoutPreview(){var s=scene();if(window.RENTSKETCH_SHARED_READONLY||window.RentSketchEventPass?.hasPaidEvent?.()||!s||!Array.isArray(s.objects)||s.objects.length>1)return false;if((s.zones&&(!Array.isArray(s.zones)||s.zones.length))||(s.aisles&&(!Array.isArray(s.aisles)||s.aisles.length))||Number(s.guestCount||0)!==0||s.needDance||s.lastTableConfig||s.matchedPackageId||(s.lightingId&&s.lightingId!=='lighting-none'))return false;return !s.objects.length||(s.tentId==null&&s.objects[0]?.kind==='inflatable'&&typeof s.objects[0].inflatableId==='string');}
 async function save(strict,preview){
  if(readOnly()&&!(preview&&checkoutPreview())){if(strict)throw new Error('This layout is read-only. Open your event access to save changes.');return lastId;}
  if(window.RENTSKETCH_PASS_RESTORING){if(strict)throw new Error('Your saved event is still being restored.');return lastId;}
  if(activeSave){await activeSave;if(strict&&stable(scene())!==lastJson)return save(true,preview);return lastId;}
  var sc=scene();if(!sc||!Array.isArray(sc.objects)){if(strict)throw new Error('The current layout is not available to save.');return lastId;}
  var json=stable(sc);if(json===lastJson&&lastId&&revision!==null)return lastId;snapshot(sc);
  if(status.conflict){if(strict)throw new Error('Resolve the project conflict before saving. Your local work is preserved.');return lastId;}
  if(Date.now()<retryAfter){if(strict)throw new Error('Saving is temporarily rate limited. Try again in a minute.');return lastId;}
  activeSave=(async function(){await Promise.resolve();try{
   if(navigator.onLine===false)throw new Error('You are offline. Your work is saved on this device.');announce('saving','Saving your layout…');await resolveRevision();
   var st=bridge().state||{},payload={scene:sc,eventType:st.eventType||null,guestCount:st.guestCount||null,anonymousSessionId:sessionId(),schemaVersion:1};if(lastId)payload.expectedRevision=revision;
   var data=await request(lastId?projectPath():base(),{method:lastId?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   lastId=data.id||lastId;revision=Number.isInteger(data.revision)?data.revision:revision;lastJson=json;status.savedAt=data.updatedAt||new Date().toISOString();status.project=metadata(data);status.conflict=null;snapshot(scene());announce('saved','All changes saved.');
   window.dispatchEvent(new CustomEvent('rentsketch:autosaved',{detail:{id:lastId,revision:revision,updated:!!data.updated}}));if(window.parent!==window)window.parent.postMessage({type:'rentsketch.designSaved',tenant:slug,designId:lastId},'*');if(stable(scene())!==lastJson)schedule();return lastId;
  }catch(e){if(e.status===429)retryAfter=Date.now()+60000;if(!status.conflict)announce(navigator.onLine===false||e instanceof TypeError?'offline':'error',e.message||'Could not sync. Your work is saved on this device.');if(strict)throw e;return lastId;}finally{activeSave=null;}})();return activeSave;
 }
 function schedule(){if(readOnly())return;clearTimeout(timer);if(status.status!=='conflict')announce(navigator.onLine===false?'offline':'local',navigator.onLine===false?'Offline — saved on this device.':'Changes waiting to sync.');snapshot(scene());timer=setTimeout(function(){save(false);},1500);}
 function restorePrompt(){if(window.RENTSKETCH_PASS_RESTORING||readOnly())return;var saved=read(),b=bridge();if(!saved||saved.tenant!==slug||!saved.scene||!b.loadScene)return;var age=Date.now()-Date.parse(saved.savedAt||0);if(!Number.isFinite(age)||age>180*86400000||(!saved.scene.tentId&&!saved.scene.objects?.length))return;
  setTimeout(function(){if(window.RENTSKETCH_TENT_PREVIEW||readOnly())return;if(b.loadScene(saved.scene)){adopt(Object.assign({},saved,saved.project||{}));if(saved.conflict){status.conflict=saved.conflict;announce('conflict','This local layout has changes to resolve before syncing.');}window.dispatchEvent(new CustomEvent('rentsketch:draftResumed',{detail:{savedAt:saved.savedAt,id:lastId}}));}},180);}
 function restoreWhenAllowed(){if(!document.querySelector('.rs-entry'))return restorePrompt();window.addEventListener('rentsketch:entryAccepted',restorePrompt,{once:true});}
 function emergency(){if(!window.RENTSKETCH_PASS_RESTORING&&!readOnly()&&scene())snapshot(scene());}
 window.RentSketchAutosave={start:function(){return this;},flush:function(){return save(true);},prepareCheckoutDraft:function(){return save(true,true);},getDesignId:function(){return lastId;},getSessionId:sessionId,getRevision:function(){return revision;},getState:getState,projectPath:projectPath,request:request,adopt:adopt,fetchLatest:fetchLatest,
  reloadLatest:async function(){if(readOnly())throw new Error('This layout is read-only.');await activeSave;var latest=await fetchLatest();if(!bridge().loadScene(latest.scene))throw new Error('Could not restore the latest layout.');adopt(latest);return latest;},flushLocal:emergency};
 function bind(){if(!bridge().getScene){setTimeout(bind,100);return;}if(!skipRestore)restoreWhenAllowed();document.addEventListener('pointerup',function(e){if(!e.target.closest?.('.rs-project-panel'))schedule();},true);document.addEventListener('change',function(e){if(!e.target.closest?.('.rs-project-panel'))schedule();},true);document.addEventListener('keyup',function(e){if((e.key==='Delete'||e.key==='Backspace')&&!/INPUT|TEXTAREA/.test(e.target.tagName))schedule();},true);window.addEventListener('rentsketch:requestSave',schedule);window.addEventListener('pagehide',emergency);window.addEventListener('online',function(){save(false);});window.addEventListener('offline',function(){emergency();announce('offline','Offline — saved on this device.');});document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')emergency();});}
 window.addEventListener('rentsketch:dashboardSessionChanged',function(){status.project.crewNotes='';if(staffSeen&&!staffIdentity())announce('error','Your admin session ended. Sign in again to save this layout.');});
 bind();
}
window.RentSketchStartAutosave=function(){start(true);return window.RentSketchAutosave;};
window.addEventListener('rentsketch:designStarted',function(){start(true);},{once:true});
async function restoreShared(){
  var share=new URLSearchParams(location.hash.slice(1)).get('share');
  if(!share)return false;
  var sharedBridge=window.FriendlyBridge||{};
  if(!window.RENTSKETCH_API_URL||!window.RENTSKETCH_CATALOG_READY||!sharedBridge.loadScene)return false;
  window.RENTSKETCH_PASS_RESTORING=true;
  try{
    var r=await fetch(window.RENTSKETCH_API_URL+'/api/tenants/'+encodeURIComponent(window.RENTSKETCH_TENANT_SLUG||'generic')+'/shared-design/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:share}),cache:'no-store',credentials:'omit'});
    var d={};try{d=await r.json();}catch(e){}
    if(!r.ok)throw new Error(d.error||'Shared layout could not be opened');
    window.RENTSKETCH_SHARED_READONLY=true;
    window.RENTSKETCH_SHARED_PROJECT={projectName:d.projectName||'',siteNotes:d.siteNotes||'',revision:d.revision||null};
    if(!sharedBridge.loadScene(d.scene||{},{}))throw new Error('Shared layout could not be displayed');
    history.replaceState(null,'',location.pathname+location.search);
    window.dispatchEvent(new CustomEvent('rentsketch:sharedDesign',{detail:{id:d.id,updatedAt:d.updatedAt||null}}));
    return true;
  }catch(e){console.warn('[RentSketch] shared layout restore failed',e);alert(e.message||'This shared layout could not be opened.');return true;}
  finally{window.RENTSKETCH_PASS_RESTORING=false;}
}
async function boot(){if(window.RENTSKETCH_PASS_RESTORING)return;if(['tent','inflatable'].includes(params.get('focus'))&&params.get('autoplace')==='1')return;if(!window.RENTSKETCH_CATALOG_READY){window.addEventListener('rentsketch:catalogReady',function(){boot();},{once:true});return;}if(await restoreShared())return;start(false);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
