// Load the intake only after the authoritative tenant catalog is ready.
// Prevents recommendations/demo mode from racing the async tenant/products fetch.
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  // Product entry owns its preview; the questionnaire must never race it.
  if (['tent','inflatable'].includes(params.get('focus')) && params.get('autoplace') === '1') return;
  var started = false;
  var timeout = null;
  function showCatalogFailure(message) {
    if (window.parent !== window) window.parent.postMessage({type:'rentsketch.error',tenant:params.get('tenant') || 'generic',reason:message || 'Catalog unavailable'}, '*');
    var host = document.getElementById('intakeWizard');
    if (!host) return;
    host.innerHTML = '<div class="card" style="max-width:680px;margin:32px auto;text-align:center"><h2>Event designer is temporarily unavailable</h2><p>We could not load this rental company’s current catalog. Please try again so we do not show outdated inventory or pricing.</p><button type="button" class="btn-primary" id="catalogRetryBtn">Try Again</button><p class="disclaimer">'+String(message||'Catalog unavailable').replace(/[<>]/g,'')+'</p></div>';
    var b=document.getElementById('catalogRetryBtn'); if(b)b.onclick=function(){location.reload();};
  }
  function start() {
    if (started) return;
    started = true;
    if (timeout) clearTimeout(timeout);
    if (params.get('tenant') && params.get('tenant') !== 'generic' && !((window.ACTIVE_TENANT || {}).tents || []).length && !((window.ACTIVE_TENANT || {}).inflatables || []).length) {
      showCatalogFailure('This rental company has no product previews available yet.');
      return;
    }
    import('./intake.js').then(function () {
      var attempts = 0;
      (function ready() {
        var host = document.getElementById('step-designer');
        if (window.FriendlyBridge && host && host.classList.contains('active')) {
          window.dispatchEvent(new CustomEvent('rentsketch:intakeReady'));
          if (window.parent !== window) window.parent.postMessage({type:'rentsketch.ready',mode:'designer',tenant:params.get('tenant') || 'generic'}, '*');
        } else if (++attempts < 100) setTimeout(ready, 100);
        else showCatalogFailure('The designer could not start. Please try again.');
      })();
    }).catch(function (err) {
      console.error('[RentSketch] intake failed to load', err);
      showCatalogFailure('Designer module failed to load.');
    });
  }
  // Generic mode intentionally uses local renderer/demo definitions and does not
  // require a business catalog. Real tenants must wait for the API result.
  var slug = params.get('tenant') || 'generic';
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
