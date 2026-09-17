// Friendly Party Rental — Tenant configuration.
import { CHAIRS } from './chairs.js';
import { TABLES } from './tables.js';
export { CHAIRS, TABLES };

export const TENTS = [
{ id: 'pole-20x20', type: 'pole', name: "20x20 Pole Tent", widthFt: 20, lengthFt: 20, pricePerDay: 250, maxGuests: { dining: 33, cocktail: 66 } },
{ id: 'pole-20x30', type: 'pole', name: "20x30 Pole Tent", widthFt: 20, lengthFt: 30, pricePerDay: 350, maxGuests: { dining: 50, cocktail: 100 } },
{ id: 'pole-20x40', type: 'pole', name: "20x40 Pole Tent", widthFt: 20, lengthFt: 40, pricePerDay: 450, maxGuests: { dining: 66, cocktail: 133 } },
{ id: 'pole-30x30', type: 'pole', name: "30x30 Pole Tent", widthFt: 30, lengthFt: 30, pricePerDay: 575, maxGuests: { dining: 75, cocktail: 150 } },
{ id: 'pole-30x45', type: 'pole', name: "30x45 Pole Tent", widthFt: 30, lengthFt: 45, pricePerDay: 700, maxGuests: { dining: 112, cocktail: 225 } },
{ id: 'pole-30x60', type: 'pole', name: "30x60 Pole Tent", widthFt: 30, lengthFt: 60, pricePerDay: 850, maxGuests: { dining: 150, cocktail: 300 } },
{ id: 'pole-40x40', type: 'pole', name: "40x40 Pole Tent", widthFt: 40, lengthFt: 40, pricePerDay: 1500, maxGuests: { dining: 133, cocktail: 266 } },
{ id: 'pole-40x60', type: 'pole', name: "40x60 Pole Tent", widthFt: 40, lengthFt: 60, pricePerDay: 850, maxGuests: { dining: 200, cocktail: 400 } },
{ id: 'pole-40x80', type: 'pole', name: "40x80 Pole Tent", widthFt: 40, lengthFt: 80, pricePerDay: 1850, maxGuests: { dining: 266, cocktail: 533 } },
{ id: 'pole-40x100', type: 'pole', name: "40x100 Pole Tent", widthFt: 40, lengthFt: 100, pricePerDay: 1950, maxGuests: { dining: 333, cocktail: 666 } },
{ id: 'frame-20x20', type: 'frame', name: "20x20 Frame Tent", widthFt: 20, lengthFt: 20, pricePerDay: 400, maxGuests: { dining: 33, cocktail: 66 } },
{ id: 'frame-20x30', type: 'frame', name: "20x30 Frame Tent", widthFt: 20, lengthFt: 30, pricePerDay: 475, maxGuests: { dining: 50, cocktail: 100 } },
{ id: 'frame-20x40', type: 'frame', name: "20x40 Frame Tent", widthFt: 20, lengthFt: 40, pricePerDay: 550, maxGuests: { dining: 66, cocktail: 133 } },
{ id: 'frame-30x40', type: 'frame', name: "30x40 Frame Tent", widthFt: 30, lengthFt: 40, pricePerDay: 700, maxGuests: { dining: 100, cocktail: 200 } },
{ id: 'canopy-10x10', type: 'canopy', name: "10x10 Pop-Up Canopy", widthFt: 10, lengthFt: 10, pricePerDay: 100, maxGuests: { dining: 8, cocktail: 16 } },
{ id: 'canopy-10x20', type: 'canopy', name: "10x20 Pop-Up Canopy", widthFt: 10, lengthFt: 20, pricePerDay: 175, maxGuests: { dining: 16, cocktail: 33 } },
];

function cloneCatalog(list) { return list.map(function (item) { return JSON.parse(JSON.stringify(item)); }); }
function stripPricing(list) { return list.map(function (item) { item.pricePerDay = null; return item; }); }

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
    errorOverlay.innerHTML = '<h3 style="color:#c00;margin:0 0 10px 0">Tent Not Found</h3><p style="color:#666;font-size:14px;margin:0">Could not locate: <strong>' + requestedName + (requestedSlug ? ' (' + requestedSlug + ')' : '') + '</strong></p>';
    errorOverlay.style.display = 'block';
  }
  
  function attemptDeepLink() {
    tryCount++;
    if (tryCount > 200) {
      console.warn('[TentPreview] catalog resolve timeout after 200 frames (~3.3sec)');
      showError('Timeout resolving tent catalog');
      return;
    }
    
    var b = window.FriendlyBridge;
    // Wait for bridge AND its TENTS catalog to be ready
    if (!b || !b.state || !b.TENTS || !Array.isArray(b.TENTS) || !b.customizeFromScratch) {
      requestAnimationFrame(attemptDeepLink);
      return;
    }
    
    // Exact match: normalized name or slug
    var exact = b.TENTS.find(function (t) { 
      return norm(t.name) === norm(requestedName) || norm(t.id) === norm(requestedSlug) || t.id === requestedSlug;
    });
    
    // Fallback: match by dimensions + type
    var match = exact || b.TENTS.find(function (t) { 
      return (!wantedDims || (t.widthFt + 'x' + t.lengthFt) === wantedDims) && (!wantedType || t.type === wantedType);
    });
    
    if (!match) {
      requestAnimationFrame(attemptDeepLink);
      return;
    }
    
    console.log('[TentPreview] resolved tent:', match.name, 'after', tryCount, 'frames');
    
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
      if (designerAttempt > 120) {
        console.warn('[TentPreview] designer layout never ready after 120 frames');
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
        
        // After 3D mode activates, fit camera to tent mesh (excluding ground)
        setTimeout(function() {
          attemptCameraFit();
        }, 300);
      }
    }
    
    var cameraFitAttempt = 0;
    function attemptCameraFit() {
      cameraFitAttempt++;
      if (cameraFitAttempt > 50) {
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

