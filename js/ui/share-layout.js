// Read-only shared RentSketch layout loader.
(function(){
'use strict';
var fragment=new URLSearchParams(location.hash.slice(1)),token=fragment.get('shareToken');
if(!token)return;
window.RENTSKETCH_SHARED_VIEW=true;
window.RENTSKETCH_PASS_RESTORING=true;
function wait(){
  if(!window.FriendlyBridge||!window.FriendlyBridge.loadScene||!window.RENTSKETCH_API_URL||!window.RENTSKETCH_CATALOG_READY){setTimeout(wait,60);return;}
  fetch(window.RENTSKETCH_API_URL+'/api/consumer/shared/'+encodeURIComponent(token),{headers:{Accept:'application/json'},cache:'no-store'})
    .then(async function(r){var d=await r.json().catch(function(){return{}});if(!r.ok)throw new Error(d.error||'Shared layout could not be opened.');return d;})
    .then(function(data){
      var current=window.RENTSKETCH_TENANT_SLUG||new URLSearchParams(location.search).get('tenant')||'generic';
      if(data.tenant&&data.tenant!==current){
        location.replace(location.pathname+'?tenant='+encodeURIComponent(data.tenant)+'#shareToken='+encodeURIComponent(token));return;
      }
      if(!window.FriendlyBridge.loadScene(data.scene))throw new Error('Shared layout could not be displayed.');
      document.body.classList.add('rs-shared-layout');
      var bar=document.createElement('div');bar.className='shared-layout-banner';bar.setAttribute('role','status');
      bar.innerHTML='<div><strong>Shared RentSketch layout</strong><span>Read-only preview · changes are disabled</span></div><div><button type="button" data-share-print>Print</button><button type="button" data-share-copy>Copy link</button></div>';
      document.body.prepend(bar);
      bar.querySelector('[data-share-print]').onclick=function(){window.print();};
      bar.querySelector('[data-share-copy]').onclick=async function(){try{await navigator.clipboard.writeText(location.href);this.textContent='Copied';}catch(_){prompt('Copy this layout link:',location.href);}};
      window.dispatchEvent(new CustomEvent('rentsketch:sharedLayoutOpened',{detail:{id:data.id,tenant:data.tenant}}));
    })
    .catch(function(err){
      var box=document.createElement('div');box.className='shared-layout-error';box.textContent=err.message||'Shared layout could not be opened.';document.body.prepend(box);
    })
    .finally(function(){window.RENTSKETCH_PASS_RESTORING=false;});
}
wait();
})();