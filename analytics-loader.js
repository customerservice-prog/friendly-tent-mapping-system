(function () {
  'use strict';
  if (window.RENTSKETCH_ANALYTICS_BOOTED) return;
  window.RENTSKETCH_ANALYTICS_BOOTED = true;
  window.RENTSKETCH_GA4_ENABLED = false;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

  var existing = window.RentSketchAnalytics || {};
  var pending = Array.isArray(existing.pendingEvents) ? existing.pendingEvents : [];
  var measurementId = '';
  var started = false;
  var requested = false;
  var timer = null;

  function hint(href) {
    if (document.querySelector('link[rel="preconnect"][href="' + href + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = href;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }

  function loadNow() {
    requested = true;
    if (!measurementId || started) return;
    started = true;
    if (timer) { clearTimeout(timer); timer = null; }
    hint('https://www.googletagmanager.com');
    hint('https://www.google-analytics.com');

    window.gtag('js', new Date());
    window.gtag('config', measurementId, { send_page_view: true });

    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    document.head.appendChild(script);
  }

  function track(name, data) {
    if (!measurementId) {
      pending.push([name, data || {}]);
      requested = true;
      return;
    }
    loadNow();
    window.gtag('event', name, data || {});
  }

  existing.pendingEvents = pending;
  existing.loadNow = loadNow;
  existing.track = track;
  window.RentSketchAnalytics = existing;

  function start() {
    measurementId = String(window.RENTSKETCH_GA4_MEASUREMENT_ID || '').trim().toUpperCase();
    if (!/^G-[A-Z0-9]+$/.test(measurementId)) return;
    window.RENTSKETCH_GA4_ENABLED = true;

    if (requested || pending.length) {
      loadNow();
      while (pending.length) {
        var entry = pending.shift();
        window.gtag('event', entry[0], entry[1] || {});
      }
      return;
    }

    // Keep Google's large analytics library out of the critical render path.
    // Conversion events and the first visitor interaction still force it now.
    timer = setTimeout(loadNow, 2500);
    ['pointerdown', 'touchstart', 'keydown'].forEach(function (type) {
      window.addEventListener(type, loadNow, { once: true, capture: true, passive: type !== 'keydown' });
    });
  }

  var config = document.createElement('script');
  config.async = true;
  config.src = '/analytics-config.js';
  config.referrerPolicy = 'same-origin';
  config.onload = start;
  config.onerror = function () {};
  document.head.appendChild(config);
})();
