// RentSketch Embed Loader v2 — validated, responsive, integration-safe.
(function () {
  'use strict';

  var RENTSKETCH_ORIGIN = 'https://rentsketch.com';
  var API_ORIGIN = 'https://rentsketch-api-production.up.railway.app';
  var VERSION = '2';
  var script = document.currentScript || document.scripts[document.scripts.length - 1];

  function attr(name, fallback) {
    var v = script.getAttribute(name);
    return v == null || v === '' ? fallback : v;
  }

  var tenant = attr('data-tenant', null);
  var embedKey = attr('data-embed-key', '');
  var targetId = attr('data-target', 'rentsketch-embed');
  var fixedHeight = attr('data-height', null);
  var mode = attr('data-mode', 'inline');
  var orderId = attr('data-order-id', '');
  var customerToken = attr('data-customer-token', '');
  var modalOverlay = null;

  function target() { return document.getElementById(targetId); }
  function emit(el, name, detail) {
    el.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }
  function messageBox(el, title, body) {
    el.innerHTML = '';
    var box = document.createElement('div');
    box.style.cssText = 'font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:24px;border:1px solid #dfe6ed;border-radius:14px;background:#fff;color:#172536;box-shadow:0 10px 35px rgba(25,45,70,.08)';
    var h = document.createElement('strong'); h.textContent = title; h.style.display = 'block'; h.style.marginBottom = '6px';
    var p = document.createElement('span'); p.textContent = body; p.style.color = '#667589'; p.style.fontSize = '14px';
    box.appendChild(h); box.appendChild(p); el.appendChild(box);
  }

  function buildSrc() {
    var params = [
      'tenant=' + encodeURIComponent(tenant),
      'embed=1',
      'v=' + VERSION,
      'parentOrigin=' + encodeURIComponent(window.location.origin)
    ];
    if (embedKey) params.push('embedKey=' + encodeURIComponent(embedKey));
    if (orderId) params.push('orderId=' + encodeURIComponent(orderId));
    if (customerToken) params.push('customerToken=' + encodeURIComponent(customerToken));
    return RENTSKETCH_ORIGIN + '/designer/?' + params.join('&');
  }

  function makeIframe() {
    var iframe = document.createElement('iframe');
    iframe.src = buildSrc();
    iframe.title = 'RentSketch Event Designer';
    iframe.setAttribute('allow', 'clipboard-write; fullscreen');
    iframe.setAttribute('loading', 'eager');
    iframe.style.cssText = 'width:100%;border:0;display:block;background:#fff;height:' + (fixedHeight ? Number(fixedHeight) : 860) + 'px';
    return iframe;
  }

  function closeModal() {
    if (modalOverlay && modalOverlay.parentNode) modalOverlay.parentNode.removeChild(modalOverlay);
    modalOverlay = null;
  }

  function bindMessages(iframe) {
    var lastHeight = Number(fixedHeight) || 860;
    var lastResizeAt = 0;
    window.addEventListener('message', function (event) {
      if (event.origin !== RENTSKETCH_ORIGIN || event.source !== iframe.contentWindow) return;
      var msg = event.data || {};
      if (!msg || typeof msg.type !== 'string') return;
      if (msg.type === 'rentsketch.resize' && !fixedHeight) {
        // Throttle ResizeObserver chatter. The old loader could continuously
        // chase iframe document height changes and make embedded designer pages
        // feel frozen/jumpy on responsive host pages.
        var now = Date.now();
        var h = Math.max(650, Math.min(1800, Number(msg.height) || 860));
        if (Math.abs(h - lastHeight) >= 24 && now - lastResizeAt > 120) {
          lastHeight = h; lastResizeAt = now; iframe.style.height = h + 'px';
        }
      } else if (msg.type === 'rentsketch.ready') {
        emit(iframe, 'rentsketch:ready', msg);
      } else if (msg.type === 'rentsketch.designSaved') {
        emit(iframe, 'rentsketch:designSaved', msg);
      } else if (msg.type === 'rentsketch.quoteRequested') {
        emit(iframe, 'rentsketch:quoteRequested', msg);
      } else if (msg.type === 'rentsketch.close') {
        closeModal();
      }
    });
  }

  async function validate() {
    if (!tenant || !embedKey) throw new Error('This RentSketch installation is missing its tenant or embed key.');
    var response = await fetch(API_ORIGIN + '/api/embed/validate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant: tenant, embedKey: embedKey, parentOrigin: window.location.origin })
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok || !data.ok) throw new Error(data.error || 'RentSketch could not validate this website.');
    return data;
  }

  function renderInline(el) {
    var iframe = makeIframe(); el.innerHTML = ''; el.appendChild(iframe); bindMessages(iframe);
  }

  function renderButton(el) {
    el.innerHTML = '';
    var btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = el.getAttribute('data-label') || 'Visualize My Event';
    btn.style.cssText = 'background:#1976e9;color:#fff;border:0;padding:13px 20px;border-radius:10px;font:700 15px system-ui;cursor:pointer;box-shadow:0 8px 22px rgba(25,118,233,.22)';
    btn.addEventListener('click', function () {
      closeModal();
      modalOverlay = document.createElement('div');
      modalOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(13,25,39,.58);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(5px)';
      var panel = document.createElement('div');
      panel.style.cssText = 'background:#fff;width:min(1280px,100%);height:min(92vh,1000px);border-radius:18px;overflow:hidden;position:relative;box-shadow:0 30px 90px rgba(0,0,0,.25)';
      var close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label','Close');
      close.style.cssText = 'position:absolute;right:12px;top:10px;z-index:3;width:38px;height:38px;border-radius:50%;border:1px solid #d9e1e8;background:#fff;font-size:24px;cursor:pointer';
      close.addEventListener('click', closeModal);
      var iframe = makeIframe(); iframe.style.height = '100%';
      panel.appendChild(close); panel.appendChild(iframe); modalOverlay.appendChild(panel); document.body.appendChild(modalOverlay); bindMessages(iframe);
    });
    el.appendChild(btn);
  }

  async function init() {
    var el = target();
    if (!el) { console.error('[RentSketch] Missing #' + targetId); return; }
    messageBox(el, 'Loading your event designer…', 'Connecting this website to RentSketch.');
    try {
      var handshake = await validate();
      if (mode === 'button') renderButton(el); else renderInline(el);
      emit(el, 'rentsketch:validated', handshake);
    } catch (err) {
      messageBox(el, 'RentSketch needs attention', err.message || 'This integration could not be loaded.');
      console.error('[RentSketch embed]', err);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.RentSketchEmbed = { version: VERSION, close: closeModal };
})();
