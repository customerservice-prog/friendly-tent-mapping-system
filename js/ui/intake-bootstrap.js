// Load the intake only after the authoritative tenant catalog is ready.
// Prevents recommendations/demo mode from racing the async tenant/products fetch.
(function () {
  'use strict';
  var started = false;
  var timeout = null;
  function showCatalogFailure(message) {
    var host = document.getElementById('intakeWizard');
    if (!host) return;
    host.innerHTML = '<div class="card" style="max-width:680px;margin:32px auto;text-align:center"><h2>Event designer is temporarily unavailable</h2><p>We could not load this rental company’s current catalog. Please try again so we do not show outdated inventory or pricing.</p><button type="button" class="btn-primary" id="catalogRetryBtn">Try Again</button><p class="disclaimer">'+String(message||'Catalog unavailable').replace(/[<>]/g,'')+'</p></div>';
    var b=document.getElementById('catalogRetryBtn'); if(b)b.onclick=function(){location.reload();};
  }
  function start() {
    if (started) return;
    started = true;
    if (timeout) clearTimeout(timeout);
    import('./intake.js').catch(function (err) {
      console.error('[RentSketch] intake failed to load', err);
      showCatalogFailure('Designer module failed to load.');
    });
  }
  // Generic mode intentionally uses local renderer/demo definitions and does not
  // require a business catalog. Real tenants must wait for the API result.
  var slug = window.RENTSKETCH_TENANT_SLUG || 'generic';
  if (slug === 'generic' || window.RENTSKETCH_CATALOG_READY) { start(); return; }
  if (window.RENTSKETCH_CATALOG_ERROR) { showCatalogFailure(window.RENTSKETCH_CATALOG_ERROR); return; }
  window.addEventListener('rentsketch:catalogReady', start, { once: true });
  window.addEventListener('rentsketch:tenantError', function (e) {
    if (started) return;
    if (timeout) clearTimeout(timeout);
    showCatalogFailure(e && e.detail && e.detail.message);
  }, { once: true });
  timeout = setTimeout(function () {
    if (!started) showCatalogFailure('Catalog request timed out.');
  }, 12000);
})();
