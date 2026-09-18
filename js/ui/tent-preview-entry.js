// Boot a Friendly product-page tent CTA directly into its exact RentSketch 3D tent preview.
(function(){
'use strict';
var q=new URLSearchParams(location.search);
if(!(q.get('embed')==='1'&&q.get('view')==='3d'&&q.get('focus')==='tent'&&q.get('autoplace')==='1'))return;
var requestedSlug=(q.get('tentSlug')||'').toLowerCase();
var requestedName=(q.get('tent')||'').toLowerCase();
var tenantSlug=q.get('tenant')||'generic';
var LEGAL_VERSION='2026-09-17';
var storageKey='rentsketch:entry-accepted:'+tenantSlug+':'+LEGAL_VERSION;
var bootStarted=false;
function normalize(s){return String(s||'').toLowerCase().replace(/×/g,'x').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function findTent(list){var slug=normalize(requestedSlug),name=normalize(requestedName);return (list||[]).find(function(t){var id=normalize(t.id),n=normalize(t.name);return (slug&&(id===slug||n===slug||slug.indexOf(id)>=0||slug.indexOf(n)>=0))||(name&&(n===name||name.indexOf(n)>=0||n.indexOf(name)>=0));})||(list||[]).find(function(t){var dims=(requestedName+' '+requestedSlug).match(/(\d+)\s*x\s*(\d+)/i);return dims&&Number(dims[1])===Number(t.widthFt)&&Number(dims[2])===Number(t.lengthFt)&&(!/frame/.test(requestedName+requestedSlug)||t.type==='frame')&&(!/pole/.test(requestedName+requestedSlug)||t.type==='pole');});}
function entryAccepted(){try{return localStorage.getItem(storageKey)==='accepted';}catch(e){return false;}}
function startBoot(){if(bootStarted)return;bootStarted=true;boot();}
function waitForVisible3d(b,tent,attempt){attempt=attempt||0;var btn=document.getElementById('viewMode3d');if(!btn){if(attempt<80)return setTimeout(function(){waitForVisible3d(b,tent,attempt+1);},50);return fail('3D view control did not initialize');}if(attempt===0||attempt%20===0)btn.click();requestAnimationFrame(function(){requestAnimationFrame(function(){var canvas=document.querySelector('canvas');var host=canvas&&canvas.parentElement;var r=(host||canvas)&&((host||canvas).getBoundingClientRect());if(!r||r.width<2||r.height<2){if(attempt<300)return setTimeout(function(){waitForVisible3d(b,tent,attempt+1);},50);return fail('3D viewport did not become visible (canvasFound='+(!!canvas)+',canvases='+document.querySelectorAll('canvas').length+',rect='+(r?Math.round(r.width)+'x'+Math.round(r.height):'none')+',win='+window.innerWidth+'x'+window.innerHeight+',mount3dErr='+(window.__rentsketchLast3dError||'none')+')');}try{window.dispatchEvent(new Event('resize'));if(b.fitTentPreview)b.fitTentPreview();}catch(e){console.warn('Tent preview fit retry failed',e);}setTimeout(function(){try{window.dispatchEvent(new Event('resize'));if(b.fitTentPreview)b.fitTentPreview();}catch(e){}ready(tent);},150);});});}
var tries=0;
function boot(){tries++;var b=window.FriendlyBridge;if(!b||!b.state||!b.TENTS||!b.customizeFromScratch){if(tries<160)return setTimeout(boot,50);return fail('Designer bridge did not initialize');}
var tent=findTent(b.TENTS);if(!tent)return fail('Requested tent was not found');
try{b.state.tentId=tent.id;b.customizeFromScratch();waitForVisible3d(b,tent,0);}catch(e){console.error('Tent preview boot failed',e);fail(e&&e.message||'Preview failed');}}
function ready(tent){try{parent.postMessage({type:'rentsketch.ready',mode:'tent-preview',tentId:tent.id,tentName:tent.name},'*');}catch(e){} }
function fail(reason){console.error('RentSketch 3D preview:',reason);if(window.RentSketchCustomerEntry&&window.RentSketchCustomerEntry.showRecovery)window.RentSketchCustomerEntry.showRecovery();try{parent.postMessage({type:'rentsketch.error',reason:String(reason||'unknown')},'*');}catch(e){}}
// The embedded welcome/legal entry owns the first customer interaction. Do not
// race the 3D preview boot underneath that modal: boot immediately for returning
// customers, otherwise wait for customer-entry.js to persist acceptance and emit
// its entryAccepted event. The fallback poll covers script-order differences.
if(entryAccepted())startBoot();
else{
  window.addEventListener('rentsketch:entryAccepted',startBoot,{once:true});
  var entryWaits=0;
  (function waitForEntry(){
    if(bootStarted)return;
    if(entryAccepted())return startBoot();
    entryWaits++;
    if(entryWaits<600)return setTimeout(waitForEntry,100);
    fail('Customer entry was not accepted');
  })();
}
})();
