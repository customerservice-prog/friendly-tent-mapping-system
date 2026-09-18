// Keep mobile bottom-sheet panel classes synchronized with the desktop hidden/state logic.
(function(){
'use strict';
function mobile(){return window.matchMedia&&window.matchMedia('(max-width: 880px)').matches;}
function syncDrawer(){var el=document.getElementById('drawer');if(!el)return;el.classList.toggle('open',mobile()&&!el.hidden);}
function syncInspector(){var el=document.getElementById('inspectorPanel');if(!el)return;var hasSelection=!!el.querySelector('.inspector-close');el.classList.toggle('active',mobile()&&!el.hidden&&hasSelection);}
function syncFlyout(el){if(!el)return;el.classList.toggle('active',mobile()&&!el.hidden);}
function bind(){var drawer=document.getElementById('drawer'),inspector=document.getElementById('inspectorPanel'),eventFly=document.getElementById('eventCheckFlyout'),estimateFly=document.getElementById('estimateFlyout');
  if(drawer)new MutationObserver(syncDrawer).observe(drawer,{attributes:true,attributeFilter:['hidden','class']});
  if(inspector)new MutationObserver(syncInspector).observe(inspector,{attributes:true,childList:true,subtree:true,attributeFilter:['hidden']});
  [eventFly,estimateFly].forEach(function(el){if(el)new MutationObserver(function(){syncFlyout(el);}).observe(el,{attributes:true,attributeFilter:['hidden']});});
  window.addEventListener('resize',function(){syncDrawer();syncInspector();syncFlyout(eventFly);syncFlyout(estimateFly);});
  document.addEventListener('click',function(){setTimeout(function(){syncDrawer();syncInspector();syncFlyout(eventFly);syncFlyout(estimateFly);},0);},true);
  syncDrawer();syncInspector();syncFlyout(eventFly);syncFlyout(estimateFly);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
