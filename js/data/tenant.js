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

// Wire tenant inventory into the existing designer loader. The loader expects
// visual_model_id; this adapter fills a safe visual id for active tent/table/chair
// products that have not been manually mapped yet, so they remain visible.
(function installTenantCatalogAdapter() {
  if (typeof window === 'undefined' || !window.fetch || window.__RENTSKETCH_CATALOG_ADAPTER__) return;
  window.__RENTSKETCH_CATALOG_ADAPTER__ = true;
  var originalFetch = window.fetch.bind(window);
  function norm(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function tentVisual(name) {
    var n = String(name || '').toLowerCase();
    var m = n.match(/(10|20|30|40)\s*[x×-]\s*(10|20|30|40|45|60|80|100)/);
    var size = m ? (m[1] + 'x' + m[2]) : '20x20';
    var type = /frame/.test(n) ? 'frame' : (/pop|canopy/.test(n) ? 'canopy' : 'pole');
    var id = type + '-' + size;
    return TENTS.some(function (x) { return x.id === id; }) ? id : (type === 'frame' ? 'frame-20x20' : type === 'canopy' ? 'canopy-10x10' : 'pole-20x20');
  }
  function tableVisual(name) {
    var n = String(name || '').toLowerCase();
    if (/fill|chill/.test(n)) return 'fill-chill-4ft';
    if (/cocktail|highboy|high boy/.test(n)) return 'cocktail';
    if (/round/.test(n)) return 'round-5ft';
    if (/8\s*(ft|foot|'|')/.test(n)) return 'banquet-8ft';
    return 'banquet-6ft';
  }
  function chairVisual(name) {
    var n = String(name || '').toLowerCase();
    if (/queen|tiffany/.test(n)) return 'throne-queen-tiffany';
    if (/king.*throne|throne.*king/.test(n)) return 'throne-king';
    if (/mahogany.*chiavari|chiavari.*mahogany/.test(n)) return 'chiavari-mahogany';
    if (/white.*chiavari|chiavari.*white/.test(n)) return 'chiavari-white';
    if (/chiavari/.test(n)) return 'chiavari-gold';
    if (/resin/.test(n)) return 'resin-white';
    return 'plastic-white';
  }
  function infer(p) {
    var c = norm(p && p.category);
    if (c === 'tent') return tentVisual(p.name);
    if (c === 'table') return tableVisual(p.name);
    if (c === 'chair') return chairVisual(p.name);
    return null;
  }
  window.fetch = function(input, init) {
    return originalFetch(input, init).then(function(res) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!res.ok || url.indexOf('/products') === -1 || (init && init.method && String(init.method).toUpperCase() !== 'GET')) return res;
      return res.clone().json().then(function(data) {
        if (!data || !Array.isArray(data.products)) return res;
        data.products.forEach(function(p) {
          if (!p || p.active === false || p.visual_model_id) return;
          var v = infer(p);
          if (v) { p.visual_model_id = v; p.visual_model_fallback = true; }
        });
        return new Response(JSON.stringify(data), { status: res.status, statusText: res.statusText, headers: { 'Content-Type': 'application/json' } });
      }).catch(function() { return res; });
    });
  };
})();

// Product-page tent deep links are PREVIEWS, not event/package builders.
// They show exactly the clicked tent by itself in 3D. Seating prompts,
// guest shortfall warnings and inherited wizard state are removed.
// Fixed: proper async/catalog wait, punctuation normalization, canvas readiness,
// tent mesh bounding box fitting, and visible error UI on resolve failure.
(function bootTentDeepLink() {
  if (typeof window === 'undefined') return;
  var q = new URLSearchParams(window.location.search);
  if (q.get('view') !== '3d' || q.get('focus') !== 'tent' || q.get('autoplace') !== '1') return;
  var requestedName = q.get('tent') || '';
  var requestedSlug = q.get('tentSlug') || '';
  if (!requestedName && !requestedSlug) return;
  window.__RENTSKETCH_TENT_PREVIEW__ = true;

  // Create dedicated error overlay (separate from #emptyStateOverlay which is hidden)
  var errorOverlay = document.createElement('div');
  errorOverlay.id = 'tentPreviewErrorOverlay';
  errorOverlay.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border:2px solid #c00;border-radius:8px;padding:20px;z-index:10000;text-align:center;font-family:sans-serif;max-width:400px;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:none;';
  document.body.appendChild(errorOverlay);

  // Hide UI elements not relevant to preview mode
  var style = document.createElement('style');
  style.id = 'tentPreviewModeStyles';
  style.textContent = [
    '#statusBar .status-pill-group .status-item:first-child{display:none!important}',
    '#statusBar .status-pill-group .status-item:nth-child(2){display:none!important}',
    '#statusBar .status-pill-group .status-flag{display:none!important}',
    '#btnToReview{display:none!important}',
    '#tryTheseCard{display:none!important}'
  ].join('');
  document.head.appendChild(style);

  // Normalize names for matching: remove all non-alphanumeric
  function norm(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function dims(v) { var m = String(v || '').toLowerCase().match(/(10|20|30|40)\s*[x×-]\s*(10|20|30|40|45|60|80|100)/); return m ? (m[1] + 'x' + m[2]) : ''; }
  
  var wantedType = /frame/i.test(requestedName + ' ' + requestedSlug) ? 'frame' : (/pop|canopy/i.test(requestedName + ' ' + requestedSlug) ? 'canopy' : (/pole/i.test(requestedName + ' ' + requestedSlug) ? 'pole' : ''));
  var wantedDims = dims(requestedName) || dims(requestedSlug);
  var tryCount = 0;
  var errorShown = false;
  
  function showError(msg) {
    if (errorShown) return;
    errorShown = true;
    errorOverlay.innerHTML = '<h3 style="color:#c00;margin:0 0 10px 0">Tent Preview Error</h3><p style="color:#666;font-size:14px;margin:0">' + msg + ' — <strong>' + requestedName + (requestedSlug ? ' (' + requestedSlug + ')' : '') + '</strong></p>';
    errorOverlay.style.display = 'block';
  }
  
  function resolveTentDeepLink(name, slug, catalog) {
    // Exact match: normalized name or slug against canonical catalog
    var exact = catalog.find(function (t) { 
      return norm(t.name) === norm(name) || norm(t.id) === norm(slug) || t.id === slug;
    });
    if (exact) return exact;
    
    // Fallback: match by dimensions + type
    var fallback = catalog.find(function (t) { 
      return (!wantedDims || (t.widthFt + 'x' + t.lengthFt) === wantedDims) && (!wantedType || t.type === wantedType);
    });
    return fallback || null;
  }
  
  function attemptDeepLink() {
    tryCount++;
    if (tryCount > 400) {
      console.warn('[TentPreview] catalog resolve timeout after 400 frames (~3.3sec)');
      showError('Timeout resolving tent catalog');
      return;
    }
    
    var b = window.FriendlyBridge;
    // Wait for bridge state and customizeFromScratch to be ready (but NOT b.TENTS)
    if (!b || !b.state || !b.customizeFromScratch) {
      requestAnimationFrame(attemptDeepLink);
      return;
    }
    
    // Resolve tent using LOCAL canonical TENTS catalog
    var match = resolveTentDeepLink(requestedName, requestedSlug, TENTS);
    
    if (!match) {
      requestAnimationFrame(attemptDeepLink);
      return;
    }
    
    console.log('[TentPreview] resolved tent:', match.name, 'canonical id:', match.id, 'after', tryCount, 'frames');
    
    // Initialize state: ONLY tent, no objects
    b.state.tentId = match.id;
    b.state.guestCount = 0;
    b.state.matchedPackageId = null;
    b.state.eventType = '';
    b.state.eventCheckOpen = false;
    b.customizeFromScratch();
    
    // Update UI labels
    var titleTimer = setInterval(function () {
      var title = document.getElementById('toolbarEventTitle');
      var meta = document.getElementById('toolbarEventMeta');
      if (title) title.textContent = match.name + ' · 3D Preview';
      if (meta) meta.textContent = 'Tent only — rotate and zoom to explore';
    }, 250);
    setTimeout(function () { clearInterval(titleTimer); }, 5000);
    
    // Wait for designer DOM to be ready AND canvas to have real dimensions
    var designerAttempt = 0;
    function waitForDesignerReady() {
      designerAttempt++;
      if (designerAttempt > 300) {
        console.warn('[TentPreview] designer layout never ready after 300 frames');
        showError('Designer failed to initialize');
        return;
      }
      
      var stepDesigner = document.getElementById('step-designer');
      var canvasEl = document.getElementById('canvas');
      var bodyHasClass = document.body.classList.contains('designer-active');
      var stepActive = stepDesigner && stepDesigner.classList.contains('active');
      
      if (!stepDesigner || !canvasEl || !bodyHasClass || !stepActive) {
        requestAnimationFrame(waitForDesignerReady);
        return;
      }
      
      // CRITICAL: verify canvas has real, non-zero dimensions
      var displayed = canvasEl.offsetParent !== null;
      var hasWidth = canvasEl.offsetWidth > 100;
      var hasHeight = canvasEl.offsetHeight > 100;
      
      if (!displayed || !hasWidth || !hasHeight) {
        requestAnimationFrame(waitForDesignerReady);
        return;
      }
      
      console.log('[TentPreview] canvas ready:', canvasEl.offsetWidth, 'x', canvasEl.offsetHeight);
      
      // Trigger 3D mode
      var viewMode3dBtn = document.getElementById('viewMode3d');
      if (viewMode3dBtn) {
        viewMode3dBtn.click();
      }

      // After 3D mode activates (or if already in 3D view / button not found), fit camera to tent mesh (excluding ground)
      setTimeout(function() {
        attemptCameraFit();
      }, 300);
    }
    
    var cameraFitAttempt = 0;
    function attemptCameraFit() {
      cameraFitAttempt++;
      if (cameraFitAttempt > 150) {
        console.warn('[TentPreview] camera fit timeout after', cameraFitAttempt, 'attempts');
        return;
      }
      
      // Access the view3d module's fitTentPreview method via FriendlyBridge
      var b = window.FriendlyBridge;
      if (!b || !b.fitTentPreview) {
        requestAnimationFrame(attemptCameraFit);
        return;
      }
      
      console.log('[TentPreview] calling fitTentPreview at attempt', cameraFitAttempt);
      var success = b.fitTentPreview();
      if (!success) {
        console.warn('[TentPreview] tent mesh fit failed or empty');
        showError('Tent mesh failed to render');
      }
    }
    
    requestAnimationFrame(waitForDesignerReady);
  }
  
  requestAnimationFrame(attemptDeepLink);
})();

