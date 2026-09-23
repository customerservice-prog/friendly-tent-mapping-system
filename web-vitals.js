(function () {
  'use strict';
  if (window.RENTSKETCH_WEB_VITALS_BOOTED || !('PerformanceObserver' in window)) return;
  window.RENTSKETCH_WEB_VITALS_BOOTED = true;

  var metrics = { lcp: null, cls: 0, inp: null, fcp: null, ttfb: null };
  var sent = false;
  var observers = [];
  var endpoint = 'https://rentsketch-api-production.up.railway.app/api/analytics/web-vitals';

  function round(value, digits) {
    if (!Number.isFinite(value)) return null;
    var scale = Math.pow(10, digits || 0);
    return Math.round(value * scale) / scale;
  }

  function observe(type, callback, extra) {
    try {
      var observer = new PerformanceObserver(function (list) {
        list.getEntries().forEach(callback);
      });
      observer.observe(Object.assign({ type: type, buffered: true }, extra || {}));
      observers.push(observer);
    } catch (_) {}
  }

  var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  if (nav) metrics.ttfb = round(nav.responseStart - nav.startTime, 1);

  var paints = performance.getEntriesByName && performance.getEntriesByName('first-contentful-paint');
  if (paints && paints[0]) metrics.fcp = round(paints[0].startTime, 1);

  observe('paint', function (entry) {
    if (entry.name === 'first-contentful-paint') metrics.fcp = round(entry.startTime, 1);
  });
  observe('largest-contentful-paint', function (entry) {
    metrics.lcp = round(entry.startTime, 1);
  });
  observe('layout-shift', function (entry) {
    if (!entry.hadRecentInput) metrics.cls = round((metrics.cls || 0) + entry.value, 4);
  });
  observe('event', function (entry) {
    if (!entry.interactionId) return;
    metrics.inp = Math.max(metrics.inp || 0, round(entry.duration, 1));
  }, { durationThreshold: 40 });

  function deviceClass() {
    var width = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    return width < 768 ? 'phone' : width < 1200 ? 'tablet' : 'desktop';
  }

  function validMetricCount() {
    return Object.keys(metrics).reduce(function (count, key) {
      return count + (Number.isFinite(metrics[key]) ? 1 : 0);
    }, 0);
  }

  function send() {
    if (sent || !validMetricCount()) return;
    sent = true;
    observers.forEach(function (observer) { try { observer.disconnect(); } catch (_) {} });

    var payload = JSON.stringify({
      version: 1,
      path: location.pathname || '/',
      navigationType: nav && ['navigate', 'reload', 'back_forward', 'prerender'].includes(nav.type) ? nav.type : null,
      deviceClass: deviceClass(),
      metrics: {
        lcp: metrics.lcp,
        cls: round(metrics.cls || 0, 4),
        inp: metrics.inp,
        fcp: metrics.fcp,
        ttfb: metrics.ttfb
      }
    });

    try {
      if (navigator.sendBeacon && navigator.sendBeacon(endpoint, payload)) return;
    } catch (_) {}
    try {
      fetch(endpoint, {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        keepalive: true,
        credentials: 'omit',
        cache: 'no-store'
      }).catch(function () {});
    } catch (_) {}
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') send();
  }, true);
  window.addEventListener('pagehide', send, { capture: true });
})();
