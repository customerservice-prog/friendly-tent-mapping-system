// RentSketch anonymous autosave/resume. Product tent previews are intentionally excluded.
(function(){
'use strict';
var preview=!!window.RENTSKETCH_TENT_PREVIEW;
if(preview)return;
var api=window.RENTSKETCH_API_URL,slug=window.RENTSKETCH_TENANT_SLUG||'generic';
if(!api||!slug)return;
var KEY='rentsketch-autosave:'+slug,SESSION='rentsketch-anon-session',timer=null,saving=false,lastJson='',lastId=null;
function sessionId(){try{var id=localStorage.getItem(SESSION);if(!id){id=(crypto.randomUUID?crypto.randomUUID():'rs-'+Date.now()+'-'+Math.random().toString(36).slice(2));localStorage.setItem(SESSION,id);}return id;}catch(e){return null;}}
function bridge(){return window.FriendlyBridge||{};}
function scene(){var b=bridge();return b.getScene?b.getScene():null;}
function meta(){var b=bridge(),s=b.state||{};return{eventType:s.eventType||null,guestCount:s.guestCount||null};}
function read(){try{return JSON.parse(localStorage.getItem(KEY)||'null');}catch(e){return null;}}
function write(v){try{localStorage.setItem(KEY,JSON.stringify(v));}catch(e){}}
async function save(){if(saving)return;var sc=scene();if(!sc||!Array.isArray(sc.objects))return;var json=JSON.stringify(sc);if(json===lastJson)return;saving=true;try{var m=meta(),r=await fetch(api+'/api/tenants/'+encodeURIComponent(slug)+'/designs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scene:sc,eventType:m.eventType,guestCount:m.guestCount,anonymousSessionId:sessionId(),schemaVersion:1})});if(!r.ok)throw new Error('autosave '+r.status);var d=await r.json();lastId=d.id;lastJson=json;write({id:d.id,scene:sc,savedAt:new Date().toISOString(),tenant:slug});window.dispatchEvent(new CustomEvent('rentsketch:autosaved',{detail:{id:d.id}}));}catch(e){console.warn('[RentSketch] autosave failed',e);}finally{saving=false;}}
function schedule(){clearTimeout(timer);timer=setTimeout(save,1200);}
function restorePrompt(){var saved=read(),b=bridge();if(!saved||saved.tenant!==slug||!saved.scene||!b.loadScene)return;var age=Date.now()-Date.parse(saved.savedAt||0);if(!Number.isFinite(age)||age>30*24*60*60*1000)return;var hasObjects=Array.isArray(saved.scene.objects)&&saved.scene.objects.length>0;if(!hasObjects)return;setTimeout(function(){if(window.RENTSKETCH_TENT_PREVIEW)return;if(confirm('Continue your saved RentSketch design?\n\nChoose Cancel to start a fresh design.')){if(b.loadScene(saved.scene)){lastJson=JSON.stringify(saved.scene);lastId=saved.id||null;}}else{try{localStorage.removeItem(KEY);}catch(e){}}},350);}
function bind(){var b=bridge();if(!b.getScene){setTimeout(bind,100);return;}restorePrompt();document.addEventListener('pointerup',schedule,true);document.addEventListener('change',schedule,true);document.addEventListener('keyup',function(e){if(e.key==='Delete'||e.key==='Backspace')schedule();},true);window.addEventListener('beforeunload',function(){if(timer){clearTimeout(timer);save();}});window.addEventListener('rentsketch:requestSave',schedule);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
