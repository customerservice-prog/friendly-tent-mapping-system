// Friendly Party Rental — Tenant configuration.
import { CHAIRS } from './chairs.js';
import { TABLES } from './tables.js';
import { TENTS as CANONICAL_TENTS } from './tents.js';
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

// Resolve tent deep-link by name/slug against canonical TENTS catalog
// No dependency on window.FriendlyBridge.TENTS
function resolveTentDeepLink(requestedName, requestedSlug, tentsCatalog) {
  if (!Array.isArray(tentsCatalog) || !requestedName && !requestedSlug) return null;

  // Normalize: lowercase, remove all non-alphanumeric for comparison
  function norm(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  // Extract dimensions from name/slug: match patterns like "20x20", "20 x 30", "30×40"
  function parseDims(v) {
    const m = String(v || '').toLowerCase().match(/(10|20|30|40)\s*[x×-]\s*(10|20|30|40|45|60|80|100)/);
    return m ? { w: parseInt(m[1]), l: parseInt(m[2]) } : null;
  }

  // Infer tent type from text
  function inferType(text) {
    const s = String(text || '').toLowerCase();
    if (/frame/.test(s)) return 'frame';
    if (/pop|canopy/.test(s)) return 'canopy';
    if (/pole/.test(s)) return 'pole';
    return null;
  }

  const normName = norm(requestedName);
  const normSlug = norm(requestedSlug);
  const typeHint = inferType(requestedName + ' ' + requestedSlug);
  const dims = parseDims(requestedName) || parseDims(requestedSlug);

  // Strategy 1: exact normalized canonical name match
  let match = tentsCatalog.find(t => norm(t.name) === normName);
  if (match) return match;

  // Strategy 2: exact normalized canonical id match
  match = tentsCatalog.find(t => norm(t.id) === normSlug);
  if (match) return match;

  // Strategy 3: exact canonical id match (case-sensitive)
  match = tentsCatalog.find(t => t.id === requestedSlug);
  if (match) return match;

  // Strategy 4: match by dimensions + type (order-insensitive dimensions)
  if (dims) {
    match = tentsCatalog.find(t => {
      const dimMatch = (t.widthFt === dims.w && t.lengthFt === dims.l) ||
                       (t.widthFt === dims.l && t.lengthFt === dims.w);
      const typeMatch = !typeHint || t.type === typeHint;
      return dimMatch && typeMatch;
    });
    if (match) return match;
  }

  return null;
}

// Product-page tent deep links are PREVIEWS, not event/package builders.
// They show exactly the clicked tent by itself in 3D. Seating prompts,
// guest shortfall warnings and inherited wizard state are removed.
// Fixed: resolves against canonical TENTS catalog (js/data/tents.js) instead of
// relying on window.FriendlyBridge.TENTS, punctuation normalization, canvas
// readiness, tent mesh bounding box fitting, and visible error UI on resolve failure.
(function bootTentDeepLink() {
  if (typeof window === 'undefined') return;
  var q = new URLSearchParams(window.location.search);
  if (q.get('view') !== '3d' || q.get('focus') !== 'tent' || q.get('autoplace') !== '1') return;
  var requestedName = q.get('tent') || '';
  var requestedSlug = q.get('tentSlug') || '';
  if (!requestedName && !requestedSlug) return;
  window.__RENTSKETCH_TENT_PREVIEW__ = true;
  var resolvedTent = resolveTentDeepLink(requestedName, requestedSlug, CANONICAL_TENTS);

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

  var errorShown = false;

  function showError(msg) {
    if (errorShown) return;
    errorShown = true;
    errorOverlay.innerHTML = '<h3 style="color:#c00;margin:0 0 10px 0">Tent Not Found</h3><p style="color:#666;font-size:14px;margin:0">' + msg + '</p>';
    errorOverlay.style.display = 'block';
  }

  // Catalog resolution is deterministic and already done (resolvedTent), so if
  // the requested tent isn't in the canonical catalog there's nothing to wait
  // for — surface the error immediately instead of polling forever.
  if (!resolvedTent) {
    console.warn('[TentPreview] tent not found in canonical catalog:', requestedName, requestedSlug);
    showError('Tent not in catalog: ' + requestedName + (requestedSlug ? ' (' + requestedSlug + ')' : ''));
    return;
  }

  var match = resolvedTent;
  var bridgeAttempt = 0;

  function attemptDeepLink() {
    bridgeAttempt++;
    if (bridgeAttempt > 200) {
      console.warn('[TentPreview] bridge unavailable after 200 frames (~3.3sec)');
      showError('Designer failed to initialize (bridge unavailable)');
      return;
    }
    
    var b = window.FriendlyBridge;
    // Only wait for bridge state + customizeFromScratch — the tent itself was
    // already resolved against the canonical catalog above.
    if (!b || !b.state || !b.customizeFromScratch) {
      requestAnimationFrame(attemptDeepLink);
      return;
    }
    
    console.log('[TentPreview] resolved tent:', match.name, 'after', bridgeAttempt, 'frames');
    
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

// Deterministic resolver tests
if (typeof window !== 'undefined' && window.__RENTSKETCH_RESOLVER_TEST__) {
  const tests = [
    // Pole tents
    { name: '20x20 Pole Tent', slug: '20x20-pole-tent', expect: 'pole-20x20' },
    { name: '20x30 Pole Tent', slug: '20x30-pole-tent', expect: 'pole-20x30' },
    { name: '20x40 Pole Tent', slug: '20x40-pole-tent', expect: 'pole-20x40' },
    { name: '30x30 Pole Tent', slug: '30x30-pole-tent', expect: 'pole-30x30' },
    { name: '30x45 Pole Tent', slug: '30x45-pole-tent', expect: 'pole-30x45' },
    { name: '30x60 Pole Tent', slug: '30x60-pole-tent', expect: 'pole-30x60' },
    { name: '40x40 Pole Tent', slug: '40x40-pole-tent', expect: 'pole-40x40' },
    { name: '40x60 Pole Tent', slug: '40x60-pole-tent', expect: 'pole-40x60' },
    { name: '40x80 Pole Tent', slug: '40x80-pole-tent', expect: 'pole-40x80' },
    { name: '40x100 Pole Tent', slug: '40x100-pole-tent', expect: 'pole-40x100' },
    // Frame tents
    { name: '20x20 Frame Tent', slug: '20x20-frame-tent', expect: 'frame-20x20' },
    { name: '20x30 Frame Tent', slug: '20x30-frame-tent', expect: 'frame-20x30' },
    { name: '20x40 Frame Tent', slug: '20x40-frame-tent', expect: 'frame-20x40' },
    { name: '30x40 Classic Frame Tent', slug: '30x40-classic-frame', expect: 'frame-30x40' },
    // Canopy
    { name: '10x10 EZ Pop-Up Canopy', slug: '10x10-popup-canopy', expect: 'canopy-10x10' },
    { name: '10x20 EZ Pop-Up Canopy', slug: '10x20-popup-canopy', expect: 'canopy-10x20' },
  ];
  
  const results = tests.map(tc => {
    const resolved = resolveTentDeepLink(tc.name, tc.slug, CANONICAL_TENTS);
    const pass = resolved && resolved.id === tc.expect;
    return { ...tc, got: resolved?.id || null, pass };
  });
  
  const failures = results.filter(r => !r.pass);
  if (failures.length) {
    console.error('[ResolveTentDeepLink] Test failures:', failures);
    window.__RENTSKETCH_RESOLVER_TESTS__ = { pass: false, count: results.length, failures };
  } else {
    console.log('[ResolveTentDeepLink] All ' + results.length + ' tests passed');
    window.__RENTSKETCH_RESOLVER_TESTS__ = { pass: true, count: results.length };
  }
}

