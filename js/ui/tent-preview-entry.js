// Boot a Friendly product-page tent CTA directly into its exact RentSketch 3D tent preview.
(function(){
'use strict';
var q=new URLSearchParams(location.search);
if(!(q.get('embed')==='1'&&q.get('view')==='3d'&&q.get('focus')==='tent'&&q.get('autoplace')==='1'))return;
var requestedSlug=(q.get('tentSlug')||'').toLowerCase();
var requestedName=(q.get('tent')||'').toLowerCase();
function normalize(s){return String(s||'').toLowerCase().replace(/×/g,'x').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function findTent(list){var slug=normalize(requestedSlug),name=normalize(requestedName);return (list||[]).find(function(t){var id=normalize(t.id),n=normalize(t.name);return (slug&&(id===slug||n===slug||slug.indexOf(id)>=0||slug.indexOf(n)>=0))||(name&&(n===name||name.indexOf(n)>=0||n.indexOf(name)>=0));})||(list||[]).find(function(t){var dims=(requestedName+' '+requestedSlug).match(/(\d+)\s*x\s*(\d+)/i);return dims&&Number(dims[1])===Number(t.widthFt)&&Number(dims[2])===Number(t.lengthFt)&&(!/frame/.test(requestedName+requestedSlug)||t.type==='frame')&&(!/pole/.test(requestedName+requestedSlug)||t.type==='pole');});}
var tries=0;
function boot(){tries++;var b=window.FriendlyBridge;if(!b||!b.state||!b.TENTS||!b.customizeFromScratch){if(tries<160)return setTimeout(boot,50);return fail('Designer bridge did not initialize');}
var tent=findTent(b.TENTS);if(!tent)return fail('Requested tent was not found');
try{b.state.tentId=tent.id;b.customizeFromScratch();var switchTries=0;function switch3d(){switchTries++;var btn=document.getElementById('viewMode3d');if(btn){btn.click();setTimeout(function(){if(b.fitTentPreview)try{b.fitTentPreview();}catch(e){};ready(tent);},350);return;}if(switchTries<80)return setTimeout(switch3d,50);fail('3D view control did not initialize');}switch3d();}catch(e){console.error('Tent preview boot failed',e);fail(e&&e.message||'Preview failed');}}
function ready(tent){try{parent.postMessage({type:'rentsketch.ready',mode:'tent-preview',tentId:tent.id,tentName:tent.name},'*');}catch(e){} }
function fail(reason){console.error('RentSketch 3D preview:',reason);if(window.RentSketchCustomerEntry&&window.RentSketchCustomerEntry.showRecovery)window.RentSketchCustomerEntry.showRecovery();try{parent.postMessage({type:'rentsketch.error',reason:String(reason||'unknown')},'*');}catch(e){}}
boot();
})();