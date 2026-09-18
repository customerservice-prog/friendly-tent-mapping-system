// Capture failures that can happen before/around the lazy 3D module so the
// tent-preview watchdog can report a real reason instead of a blank/green view.
(function(){
'use strict';
function clean(v){return String(v||'unknown').replace(/\s+/g,' ').slice(0,500);}
function relevant(s){s=String(s||'').toLowerCase();return s.includes('view3d')||s.includes('three')||s.includes('webgl')||s.includes('webglrenderer')||s.includes('dynamically imported module')||s.includes('failed to fetch dynamically imported');}
function record(prefix,detail){var msg=clean(detail);if(!relevant(msg)&&prefix!=='webgl-context-lost')return;window.__rentsketchLast3dError=prefix+': '+msg;try{window.dispatchEvent(new CustomEvent('rentsketch:3d-error',{detail:{code:prefix,message:msg}}));}catch(e){}}
window.addEventListener('error',function(e){var detail=(e&&e.error&&e.error.message)||(e&&e.message)||((e&&e.filename)?e.filename:'');record('3d-runtime-error',detail);},true);
window.addEventListener('unhandledrejection',function(e){var r=e&&e.reason,detail=(r&&r.message)||r;record('3d-promise-rejection',detail);});
function bindCanvas(){var el=document.getElementById('canvas');if(!el){setTimeout(bindCanvas,50);return;}el.addEventListener('webglcontextlost',function(e){if(e&&e.preventDefault)e.preventDefault();record('webgl-context-lost','The browser lost the 3D graphics context.');},false);el.addEventListener('webglcontextrestored',function(){window.__rentsketchLast3dError=null;try{if(window.FriendlyBridge&&window.FriendlyBridge.refreshAll)window.FriendlyBridge.refreshAll();}catch(e){}},false);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindCanvas);else bindCanvas();
})();
