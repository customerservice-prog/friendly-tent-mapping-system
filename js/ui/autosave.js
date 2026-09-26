// RentSketch anonymous autosave/resume. Product tent previews are intentionally excluded.
(function(){
'use strict';
var params=new URLSearchParams(location.search),started=false;
function start(skipRestore){if(started)return;started=true;
var api=window.RENTSKETCH_API_URL,slug=window.RENTSKETCH_TENANT_SLUG||'generic';if(!api||!slug){started=false;setTimeout(function(){start(skipRestore);},100);return;}
var KEY='rentsketch-autosave:'+slug,SESSION='rentsketch-anon-session',timer=null,saving=false,lastJson='',lastId=null,retryAfter=0,pending=false,ownedSession=null,staffSeen=false;
function sessionId(){if(ownedSession)return ownedSession;try{var id=localStorage.getItem(SESSION);if(!id){id=(crypto.randomUUID?crypto.randomUUID():'rs-'+Date.now()+'-'+Math.random().toString(36).slice(2));localStorage.setItem(SESSION,id);}return id;}catch(e){return null;}}
function bridge(){return window.FriendlyBridge||{};}function scene(){var b=bridge();return b.getScene?b.getScene():null;}function meta(){var b=bridge(),s=b.state||{};return{eventType:s.eventType||null,guestCount:s.guestCount||null};}
function read(){try{return JSON.parse(localStorage.getItem(KEY)||'null');}catch(e){return null;}}function write(v){try{localStorage.setItem(KEY,JSON.stringify(v));}catch(e){}}
function snapshotLocal(sc,id){write({id:id||lastId||null,scene:sc,savedAt:new Date().toISOString(),tenant:slug,anonymousSessionId:sessionId()});}
function payload(sc,m,sid){return JSON.stringify({scene:sc,eventType:m.eventType,guestCount:m.guestCount,anonymousSessionId:sid,schemaVersion:1});}
function staffIdentity(){return window.RentSketchDashboardSession?.identity?.()||'';}
async function sendSave(sc,m,sid,id){
 var manager=window.RentSketchDashboardSession;await manager?.ready?.();
 var identity=staffIdentity();if(identity)staffSeen=true;
 if(staffSeen&&!identity)throw new Error('Your admin session ended. Sign in again to save this layout.');
 var base=slug==='generic'?'/api/consumer/designs':'/api/tenants/'+encodeURIComponent(slug)+'/designs',isUpdate=!!(id&&sid);
 async function request(path,method){
  if(identity!==staffIdentity())throw new Error('Your admin session changed. Sign in again to save this layout.');
  var options={method:method,headers:{'Content-Type':'application/json'},body:payload(sc,m,sid)};
  var response=identity?await manager.request(path,options):await fetch(api+path,Object.assign({credentials:'omit'},options));
  if(identity!==staffIdentity())throw new Error('Your admin session changed. Sign in again to save this layout.');
  return response;
 }
 var r=await request(isUpdate?base+'/'+encodeURIComponent(id):base,isUpdate?'PATCH':'POST');
 if(isUpdate&&r.status===404)r=await request(base,'POST');
 return {response:r,identity:identity};
}
function waitForActiveSave(){return new Promise(function(resolve,reject){var started=Date.now(),timer=setInterval(function(){if(!saving){clearInterval(timer);resolve(lastId);return;}if(Date.now()-started>10000){clearInterval(timer);reject(new Error('Timed out waiting for the current design save.'));}},50);});}
function readOnly(){return ['friendly','generic'].includes(slug)&&window.RentSketchEventPass?.canEdit()!==true;}
async function save(strict){if(!strict&&readOnly())return lastId;if(window.RENTSKETCH_PASS_RESTORING){if(strict)throw new Error('Your paid design is still being restored.');return lastId;}if(saving){pending=true;var existing=await waitForActiveSave();if(strict){var current=scene(),currentJson='';try{currentJson=current?JSON.stringify(current):'';}catch(e){}if(currentJson&&currentJson!==lastJson)return save(true);}return existing;}var sc=scene();if(!sc||!Array.isArray(sc.objects)){if(strict)throw new Error('The current design is not available to save.');return lastId;}var json;try{json=JSON.stringify(sc);}catch(e){if(strict)throw e;return lastId;}if(json===lastJson&&lastId)return lastId;if(!readOnly())snapshotLocal(sc,lastId);if(Date.now()<retryAfter){if(strict)throw new Error('Design saving is temporarily rate limited. Please wait a moment and try again.');return lastId;}saving=true;try{var m=meta(),sid=sessionId(),result=await sendSave(sc,m,sid,lastId),r=result.response;if(r.status===429){retryAfter=Date.now()+60000;throw new Error('Design saving is temporarily rate limited. Please wait a moment and try again.');}var d={};try{d=await r.json();}catch(e){}if(result.identity!==staffIdentity())throw new Error('Your admin session changed. Sign in again to save this layout.');if(r.status===402)window.dispatchEvent(new CustomEvent('rentsketch:accessRequired'));if(!r.ok)throw new Error(d.error||('autosave '+r.status));lastId=d.id||lastId;lastJson=json;snapshotLocal(sc,lastId);window.dispatchEvent(new CustomEvent('rentsketch:autosaved',{detail:{id:lastId,updated:!!d.updated}}));if(window.parent!==window)window.parent.postMessage({type:'rentsketch.designSaved',tenant:slug,designId:lastId},'*');return lastId;}catch(e){console.warn('[RentSketch] autosave failed; local recovery retained',e);if(strict)throw e;return lastId;}finally{saving=false;if(pending){pending=false;schedule();}}}
function schedule(){clearTimeout(timer);timer=setTimeout(function(){save(false);},1500);}
function restorePrompt(){if(window.RENTSKETCH_PASS_RESTORING||readOnly())return;var saved=read(),b=bridge();if(!saved||saved.tenant!==slug||!saved.scene||!b.loadScene)return;var age=Date.now()-Date.parse(saved.savedAt||0);if(!Number.isFinite(age)||age>180*24*60*60*1000)return;var hasLayout=(Array.isArray(saved.scene.objects)&&saved.scene.objects.length>0)||!!saved.scene.tentId;if(!hasLayout)return;setTimeout(function(){if(window.RENTSKETCH_TENT_PREVIEW)return;if(b.loadScene(saved.scene)){lastJson=JSON.stringify(saved.scene);lastId=saved.id||null;ownedSession=saved.anonymousSessionId||null;window.dispatchEvent(new CustomEvent('rentsketch:draftResumed',{detail:{savedAt:saved.savedAt||null,id:lastId}}));}},180);}
function restoreWhenAllowed(){var entry=document.querySelector('.rs-entry');if(!entry){restorePrompt();return;}var done=false;function resume(){if(done)return;done=true;window.removeEventListener('rentsketch:entryAccepted',resume);restorePrompt();}window.addEventListener('rentsketch:entryAccepted',resume,{once:true});}
function emergencyLocalSave(){if(window.RENTSKETCH_PASS_RESTORING||readOnly())return;var sc=scene();if(!sc||!Array.isArray(sc.objects))return;snapshotLocal(sc,lastId);}
window.RentSketchAutosave={start:function(){return this;},flush:function(){return save(true);},getDesignId:function(){return lastId;},getSessionId:sessionId,adopt:function(saved){if(saved.tenant!==slug)throw new Error('This design belongs to a different rental company.');clearTimeout(timer);lastId=saved.id;lastJson=JSON.stringify(saved.scene);ownedSession=saved.anonymousSessionId||null;if(saved.adminAccess)staffSeen=true;snapshotLocal(saved.scene,lastId);}};
function bind(){var b=bridge();if(!b.getScene){setTimeout(bind,100);return;}if(!skipRestore)restoreWhenAllowed();document.addEventListener('pointerup',schedule,true);document.addEventListener('change',schedule,true);document.addEventListener('keyup',function(e){if(e.key==='Delete'||e.key==='Backspace')schedule();},true);window.addEventListener('pagehide',emergencyLocalSave);document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')emergencyLocalSave();});window.addEventListener('rentsketch:requestSave',schedule);}
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
