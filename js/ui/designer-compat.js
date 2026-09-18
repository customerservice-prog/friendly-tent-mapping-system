// Preserve customer helper controls expected by the designer runtime and keep
// bootstrap selections valid after a tenant's live catalog replaces local data.
(function(){
'use strict';
function restore(){var c=document.getElementById('tryTheseCard');if(c&&!c.querySelector('[data-role]')){c.innerHTML='<button type="button" class="try-these-close" id="tryTheseClose" aria-label="Close">&#10005;</button><div class="try-these-title">Try These</div><ul class="try-these-list" id="tryTheseList"><li><button type="button" class="try-these-item" data-role="try-drawer" data-drawer="tables">Open Tables &amp; Chairs</button></li><li><button type="button" class="try-these-item" data-role="try-event-check">Run an Event Check</button></li><li><button type="button" class="try-these-item" data-role="try-3d">Switch to 3D View</button></li></ul>';}}
function guardCatalog(attempt){var b=window.FriendlyBridge;if(!b||!b.state){if((attempt||0)<80)setTimeout(function(){guardCatalog((attempt||0)+1);},50);return;}var tents=b.TENTS||[],chairs=b.CHAIRS||[],changed=false;if(tents.length&&!tents.some(function(t){return t.id===b.state.tentId;})){b.state.tentId=tents[0].id;changed=true;}if(chairs.length&&!chairs.some(function(c){return c.id===b.state.chairId;})){b.state.chairId=chairs[0].id;changed=true;}if(changed){try{window.dispatchEvent(new CustomEvent('rentsketch:selectionRepaired',{detail:{tentId:b.state.tentId,chairId:b.state.chairId}}));}catch(e){}}}
window.addEventListener('rentsketch:catalogReady',function(){guardCatalog(0);});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){restore();guardCatalog(0);});else{restore();guardCatalog(0);}
})();
