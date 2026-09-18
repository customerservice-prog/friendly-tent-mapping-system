// Friendly Party Rental — Tenant configuration.
import { CHAIRS } from './chairs.js';
import { TABLES } from './tables.js';
import { TENTS } from './tents.js';
export { CHAIRS, TABLES, TENTS };

export const FRIENDLY_TENANT = {
  id: 'friendly', slug: 'friendly', name: 'Friendly Party Rental', logo: 'logo.png',
  contactEmail: 'customerservice@friendlypartyrental.com',
  colors: { primary: '#2f7a3c', primaryDark: '#22592c', primaryTint: '#eef7ee', secondary: '#f7f3ea' },
  tents: cloneCatalog(TENTS), tables: cloneCatalog(TABLES), chairs: cloneCatalog(CHAIRS),
};
Object.assign(FRIENDLY_TENANT, { tagline: 'Plan your tent, tables, and chairs for your event with Friendly Party Rental', phone: '315-884-1498', shortName: 'Friendly', showPackages: true });

export const GENERIC_TENANT = {
  id: 'generic', slug: 'generic', name: 'RentSketch', shortName: 'RentSketch', logo: 'logo.png', contactEmail: '', phone: '',
  tagline: 'Plan tents, tables, chairs, dance floors and more in a real-scale event layout.', showPackages: false,
  colors: { primary: '#2f6fed', primaryDark: '#1f4fbf', primaryTint: '#eaf1ff', secondary: '#0b1b3a' },
  tents: stripPricing(cloneCatalog(TENTS)), tables: stripPricing(cloneCatalog(TABLES)), chairs: stripPricing(cloneCatalog(CHAIRS)),
};
function cloneCatalog(list) { return list.map(function (item) { return JSON.parse(JSON.stringify(item)); }); }
function stripPricing(list) { return list.map(function (item) { item.pricePerDay = null; return item; }); }
export function getTenant(slug) { return slug === 'friendly' ? FRIENDLY_TENANT : GENERIC_TENANT; }

(function installTenantCatalogAdapter() {
  if (typeof window === 'undefined' || !window.fetch || window.__RENTSKETCH_CATALOG_ADAPTER__) return;
  window.__RENTSKETCH_CATALOG_ADAPTER__ = true;
  var originalFetch = window.fetch.bind(window);
  function norm(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function tentVisual(name) { var n=String(name||'').toLowerCase(),m=n.match(/(10|20|30|40)\s*[x×-]\s*(10|20|30|40|45|60|80|100)/),size=m?(m[1]+'x'+m[2]):'20x20',type=/frame/.test(n)?'frame':(/pop|canopy/.test(n)?'canopy':'pole'),id=type+'-'+size; return TENTS.some(function(x){return x.id===id;})?id:(type==='frame'?'frame-20x20':type==='canopy'?'canopy-10x10':'pole-20x20'); }
  function tableVisual(name) { var n=String(name||'').toLowerCase(); if(/fill|chill/.test(n))return'fill-chill-4ft';if(/cocktail|highboy|high boy/.test(n))return'cocktail';if(/round/.test(n))return'round-5ft';if(/8\s*(ft|foot|'|')/.test(n))return'banquet-8ft';return'banquet-6ft'; }
  function chairVisual(name) { var n=String(name||'').toLowerCase();if(/queen|tiffany/.test(n))return'throne-queen-tiffany';if(/king.*throne|throne.*king/.test(n))return'throne-king';if(/mahogany.*chiavari|chiavari.*mahogany/.test(n))return'chiavari-mahogany';if(/white.*chiavari|chiavari.*white/.test(n))return'chiavari-white';if(/chiavari/.test(n))return'chiavari-gold';if(/resin/.test(n))return'resin-white';return'plastic-white'; }
  function infer(p){var c=norm(p&&p.category);if(c==='tent')return tentVisual(p.name);if(c==='table')return tableVisual(p.name);if(c==='chair')return chairVisual(p.name);return null;}
  window.fetch=function(input,init){return originalFetch(input,init).then(function(res){var url=typeof input==='string'?input:(input&&input.url)||'';if(!res.ok||url.indexOf('/products')===-1||(init&&init.method&&String(init.method).toUpperCase()!=='GET'))return res;return res.clone().json().then(function(data){if(!data||!Array.isArray(data.products))return res;data.products.forEach(function(p){if(!p||p.active===false||p.visual_model_id)return;var v=infer(p);if(v){p.visual_model_id=v;p.visual_model_fallback=true;}});return new Response(JSON.stringify(data),{status:res.status,statusText:res.statusText,headers:{'Content-Type':'application/json'}});}).catch(function(){return res;});});};
})();

(function bootTentDeepLink(){
  if(typeof window==='undefined')return;
  var q=new URLSearchParams(window.location.search);
  if(q.get('view')!=='3d'||q.get('focus')!=='tent'||q.get('autoplace')!=='1')return;
  var requestedName=q.get('tent')||'',requestedSlug=q.get('tentSlug')||'';if(!requestedName&&!requestedSlug)return;
  window.__RENTSKETCH_TENT_PREVIEW__=true;
  var errorOverlay=document.createElement('div');errorOverlay.id='tentPreviewErrorOverlay';errorOverlay.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border:2px solid #c00;border-radius:8px;padding:20px;z-index:10000;text-align:center;font-family:sans-serif;max-width:400px;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:none;';document.body.appendChild(errorOverlay);
  var style=document.createElement('style');style.id='tentPreviewModeStyles';style.textContent=['#statusBar .status-pill-group .status-item:first-child{display:none!important}','#statusBar .status-pill-group .status-item:nth-child(2){display:none!important}','#statusBar .status-pill-group .status-flag{display:none!important}','#btnToReview{display:none!important}','#tryTheseCard{display:none!important}'].join('');document.head.appendChild(style);
  function norm(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');} function dims(v){var m=String(v||'').toLowerCase().match(/(10|20|30|40)\s*[x×-]\s*(10|20|30|40|45|60|80|100)/);return m?(m[1]+'x'+m[2]):'';}
  var wantedType=/frame/i.test(requestedName+' '+requestedSlug)?'frame':(/pop|canopy/i.test(requestedName+' '+requestedSlug)?'canopy':(/pole/i.test(requestedName+' '+requestedSlug)?'pole':'')),wantedDims=dims(requestedName)||dims(requestedSlug),tryCount=0,errorShown=false;
  function showError(msg){if(errorShown)return;errorShown=true;if(window.RentSketchCustomerEntry&&window.RentSketchCustomerEntry.showRecovery){window.RentSketchCustomerEntry.showRecovery();return;}errorOverlay.innerHTML='<h3 style="color:#c00;margin:0 0 10px 0">Preview needs a moment</h3><p style="color:#666;font-size:14px;margin:0">'+(msg||'The 3D view could not finish loading. Please reload or try again.')+'</p>';errorOverlay.style.display='block';}
  function resolveTentDeepLink(name,slug,catalog){var exact=catalog.find(function(t){return norm(t.name)===norm(name)||norm(t.id)===norm(slug)||t.id===slug;});if(exact)return exact;return catalog.find(function(t){return(!wantedDims||(t.widthFt+'x'+t.lengthFt)===wantedDims)&&(!wantedType||t.type===wantedType);})||null;}
  function accepted(){if(q.get('embed')!=='1')return true;try{return localStorage.getItem('rentsketch:entry-accepted:'+(q.get('tenant')||'generic')+':2026-09-17')==='accepted';}catch(e){return false;}}
  function begin(){requestAnimationFrame(attemptDeepLink);} if(!accepted()){window.addEventListener('rentsketch:entryAccepted',begin,{once:true});}else{begin();}
  function attemptDeepLink(){tryCount++;if(tryCount>200){showError('Timeout resolving tent catalog');return;}var b=window.FriendlyBridge;if(!b||!b.state||!b.customizeFromScratch){requestAnimationFrame(attemptDeepLink);return;}var match=resolveTentDeepLink(requestedName,requestedSlug,TENTS);if(!match){requestAnimationFrame(attemptDeepLink);return;}b.state.tentId=match.id;b.state.guestCount=0;b.state.matchedPackageId=null;b.state.eventType='';b.state.eventCheckOpen=false;b.customizeFromScratch();var titleTimer=setInterval(function(){var title=document.getElementById('toolbarEventTitle'),meta=document.getElementById('toolbarEventMeta');if(title)title.textContent=match.name+' · 3D Preview';if(meta)meta.textContent='Tent only — rotate and zoom to explore';},250);setTimeout(function(){clearInterval(titleTimer);},5000);var designerAttempt=0,tentPreview3dClicked=false;function waitReady(){designerAttempt++;if(designerAttempt>400){showError('Designer failed to initialize');return;}var s=document.getElementById('step-designer');if(!s||!document.body.classList.contains('designer-active')||!s.classList.contains('active')){requestAnimationFrame(waitReady);return;}if(!tentPreview3dClicked){var btn=document.getElementById('viewMode3d');if(btn){btn.click();tentPreview3dClicked=true;}}var c=document.getElementById('canvas');if(!c||c.offsetParent===null||c.offsetWidth<=100||c.offsetHeight<=100){requestAnimationFrame(waitReady);return;}setTimeout(fit,300);}var fitAttempt=0;function fit(){fitAttempt++;if(fitAttempt>50){showError('3D camera failed to initialize');return;}var bridge=window.FriendlyBridge;if(!bridge||!bridge.fitTentPreview){requestAnimationFrame(fit);return;}if(!bridge.fitTentPreview())showError('Tent mesh failed to render');}requestAnimationFrame(waitReady);}
})();
