(function () {
  'use strict';
  if (window.RENTSKETCH_ANALYTICS_BOOTED) return;
  window.RENTSKETCH_ANALYTICS_BOOTED = true;
  window.RENTSKETCH_GA4_ENABLED = false;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

  function start() {
    var id = String(window.RENTSKETCH_GA4_MEASUREMENT_ID || '').trim().toUpperCase();
    if (!/^G-[A-Z0-9]+$/.test(id)) return;

    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    document.head.appendChild(script);

    window.RENTSKETCH_GA4_ENABLED = true;
    window.gtag('js', new Date());
    window.gtag('config', id, {
      send_page_view: true
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
