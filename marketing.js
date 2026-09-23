(function () {
  'use strict';
  function preconnect(href) {
    if (document.querySelector('link[rel="preconnect"][href="' + href + '"]')) return;
    var link = document.createElement('link'); link.rel = 'preconnect'; link.href = href; link.crossOrigin = 'anonymous'; document.head.appendChild(link);
  }
  preconnect('https://rentsketch-api-production.up.railway.app');
  var vitals = document.createElement('script');
  vitals.src = '/web-vitals.js?v=20260922-rum-2';
  vitals.async = true;
  document.head.appendChild(vitals);
  window.RentSketchAnalytics = window.RentSketchAnalytics || { pendingEvents: [] };
  var analytics = document.createElement('script');
  analytics.src = '/analytics-loader.js?v=20260922-ga4-2';
  analytics.async = true;
  document.head.appendChild(analytics);
  function track(name, data) {
    var api = window.RentSketchAnalytics;
    if (api && typeof api.track === 'function') api.track(name, data || {});
    else if (api) api.pendingEvents.push([name, data || {}]);
    else if (typeof window.gtag === 'function') window.gtag('event', name, data || {});
  }
  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[href*="/api/consumer/event-pass/direct-checkout"]');
    if (!link) return;
    var source = '';
    try { source = new URL(link.href, location.href).searchParams.get('source') || ''; } catch (_) {}
    track('begin_checkout', {
      currency: 'USD',
      value: 9.99,
      checkout_source: source,
      items: [{ item_id: 'event_pass_30_day', item_name: 'RentSketch Event Pass', price: 9.99, quantity: 1 }]
    });
  });
  var menu = document.querySelector('.menu-toggle');
  var links = document.getElementById('navlinks');
  function closeMenu() { links.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); }
  menu.addEventListener('click', function () {
    var open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open)); links.classList.toggle('open', open);
  });
  links.addEventListener('click', function (e) { if (e.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); } });
  var annual = false;
  function renderPrices() {
    document.querySelectorAll('[data-monthly]').forEach(function (node) {
      node.textContent = '$' + Number(node.dataset[annual ? 'annual' : 'monthly']).toLocaleString('en-US');
      node.closest('.price-card').querySelector('[data-period]').textContent = annual ? '/year' : '/month';
      node.closest('.price-card').querySelector('[data-annual-note]').textContent = annual ? 'Billed yearly. Renews annually until canceled.' : '$' + Number(node.dataset.annual).toLocaleString('en-US') + ' billed yearly if you choose annual';
    });
  }
  document.querySelectorAll('[data-billing]').forEach(function (button) {
    button.addEventListener('click', function () {
      annual = button.dataset.billing === 'annual';
      document.querySelectorAll('[data-billing]').forEach(function (other) { other.setAttribute('aria-pressed', String(other === button)); });
      renderPrices();
    });
  });
  // The page remains useful without JavaScript or API availability. Hydrate
  // the visible catalog from the same amounts the checkout server validates.
  if (document.querySelector('[data-monthly]')) {
    fetch('https://rentsketch-api-production.up.railway.app/api/business/plans')
      .then(function (r) { if (!r.ok) throw Error('Catalog unavailable'); return r.json(); })
      .then(function (data) {
        (data.plans || []).forEach(function (plan) {
          var node = document.querySelector('[data-plan="' + plan.id + '"] [data-monthly]');
          if (node && Number.isFinite(plan.monthlyCents) && Number.isFinite(plan.annualCents)) {
            node.dataset.monthly = String(plan.monthlyCents / 100); node.dataset.annual = String(plan.annualCents / 100);
          }
        }); renderPrices();
      }).catch(function () {});
  }

  var header = document.querySelector('.top');
  function syncHeaderDepth() {
    if (header) header.dataset.scrolled = String(window.scrollY > 12);
  }
  syncHeaderDepth();
  window.addEventListener('scroll', syncHeaderDepth, { passive: true });

  document.addEventListener('click', function (event) {
    if (!menu || !links || menu.getAttribute('aria-expanded') !== 'true') return;
    if (event.target.closest('.menu-toggle,#navlinks')) return;
    closeMenu();
  });

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var revealItems = Array.from(document.querySelectorAll('.section,.cta-band'));
  if (!reduceMotion && 'IntersectionObserver' in window && revealItems.length) {
    revealItems.forEach(function (item) { item.classList.add('rs-reveal'); });
    document.documentElement.classList.add('rs-motion-ready');
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    revealItems.forEach(function (item) { revealObserver.observe(item); });
  } else {
    revealItems.forEach(function (item) { item.classList.add('is-visible'); });
  }
})();
