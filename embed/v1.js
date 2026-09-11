// RentSketch Embed Loader (v1)
// Include this script on a rental company's own website to render their
// hosted RentSketch designer without copying any RentSketch source code.
//
// Usage:
//   <div id="rentsketch-embed"></div>
//   <script src="https://rentsketch.com/embed/v1.js" data-tenant="YOUR_TENANT_SLUG" data-embed-key="YOUR_EMBED_KEY" defer></script>
//
// Optional data attributes:
//   data-target   - id of the container element (default: "rentsketch-embed")
//   data-height   - fixed iframe height in px (default: responsive via postMessage)
//   data-mode     - "inline" (default) renders immediately, "button" renders a
//                   launch button that opens the designer in a modal overlay.
//
// This file intentionally stays small and dependency-free so it is safe to
// load on any website. It never reads or writes cookies/localStorage on the
// host page - all state lives inside the RentSketch iframe.
(function () {
  'use strict';

 var RENTSKETCH_ORIGIN = 'https://rentsketch.com';
  var VERSION = '1';

 var thisScript = document.currentScript || (function () {
   var scripts = document.getElementsByTagName('script');
   return scripts[scripts.length - 1];
 })();

 function attr(name, fallback) {
   var v = thisScript.getAttribute(name);
   return v === null || v === undefined || v === '' ? fallback : v;
 }

 var tenant = attr('data-tenant', null);
  var embedKey = attr('data-embed-key', '');
  var targetId = attr('data-target', 'rentsketch-embed');
  var fixedHeight = attr('data-height', null);
  var mode = attr('data-mode', 'inline');

 if (!tenant) {
   console.error('[RentSketch embed] Missing required data-tenant attribute on the embed script tag.');
   return;
 }

 function buildSrc() {
   var params = ['tenant=' + encodeURIComponent(tenant), 'embed=1', 'v=' + VERSION];
   if (embedKey) params.push('embedKey=' + encodeURIComponent(embedKey));
   return RENTSKETCH_ORIGIN + '/designer/?' + params.join('&');
 }

 function makeIframe() {
   var iframe = document.createElement('iframe');
   iframe.src = buildSrc();
   iframe.title = 'Event Designer';
   iframe.setAttribute('allow', 'clipboard-write');
   iframe.style.width = '100%';
   iframe.style.border = '0';
   iframe.style.display = 'block';
   iframe.style.height = (fixedHeight ? fixedHeight : '820') + 'px';
   return iframe;
 }

 function handleMessage(iframe) {
   window.addEventListener('message', function (event) {
     if (event.origin !== RENTSKETCH_ORIGIN) return;
     if (!event.source || event.source !== iframe.contentWindow) return;
     var msg = event.data || {};
     if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
     if (msg.type === 'rentsketch.resize' && !fixedHeight) {
       var h = Number(msg.height);
       if (h && h > 100 && h < 6000) iframe.style.height = h + 'px';
     } else if (msg.type === 'rentsketch.ready') {
       iframe.dispatchEvent(new CustomEvent('rentsketch:ready', { detail: msg }));
     } else if (msg.type === 'rentsketch.designSaved') {
       iframe.dispatchEvent(new CustomEvent('rentsketch:designSaved', { detail: msg }));
     } else if (msg.type === 'rentsketch.quoteRequested') {
       iframe.dispatchEvent(new CustomEvent('rentsketch:quoteRequested', { detail: msg }));
     } else if (msg.type === 'rentsketch.close') {
       closeModalIfOpen();
     }
   });
 }

 var modalOverlay = null;
  function closeModalIfOpen() {
    if (modalOverlay && modalOverlay.parentNode) {
      modalOverlay.parentNode.removeChild(modalOverlay);
      modalOverlay = null;
    }
  }

 function renderInline(target) {
   var iframe = makeIframe();
   target.appendChild(iframe);
   handleMessage(iframe);
 }

 function renderButton(target) {
   var btn = document.createElement('button');
   btn.type = 'button';
   btn.textContent = target.getAttribute('data-label') || 'Design Your Event';
   btn.style.background = '#2f6fed';
   btn.style.color = '#fff';
   btn.style.border = 'none';
   btn.style.padding = '12px 22px';
   btn.style.borderRadius = '8px';
   btn.style.fontSize = '15px';
   btn.style.fontWeight = '600';
   btn.style.cursor = 'pointer';
   btn.addEventListener('click', function () {
     closeModalIfOpen();
     modalOverlay = document.createElement('div');
     modalOverlay.style.position = 'fixed';
     modalOverlay.style.top = '0';
     modalOverlay.style.left = '0';
     modalOverlay.style.width = '100%';
     modalOverlay.style.height = '100%';
     modalOverlay.style.background = 'rgba(10,16,28,0.7)';
     modalOverlay.style.zIndex = '999999';
     modalOverlay.style.display = 'flex';
     modalOverlay.style.alignItems = 'center';
     modalOverlay.style.justifyContent = 'center';
     modalOverlay.style.padding = '20px';

                        var panel = document.createElement('div');
     panel.style.background = '#fff';
     panel.style.width = '100%';
     panel.style.maxWidth = '1100px';
     panel.style.height = '90vh';
     panel.style.borderRadius = '10px';
     panel.style.overflow = 'hidden';
     panel.style.position = 'relative';

                        var closeBtn = document.createElement('button');
     closeBtn.type = 'button';
     closeBtn.textContent = String.fromCharCode(10005);
     closeBtn.setAttribute('aria-label', 'Close');
     closeBtn.style.position = 'absolute';
     closeBtn.style.top = '8px';
     closeBtn.style.right = '8px';
     closeBtn.style.zIndex = '1';
     closeBtn.style.background = '#fff';
     closeBtn.style.border = '1px solid #d3dae4';
     closeBtn.style.borderRadius = '50%';
     closeBtn.style.width = '32px';
     closeBtn.style.height = '32px';
     closeBtn.style.cursor = 'pointer';
     closeBtn.addEventListener('click', closeModalIfOpen);

                        var iframe = makeIframe();
     iframe.style.height = '100%';

                        panel.appendChild(closeBtn);
     panel.appendChild(iframe);
     modalOverlay.appendChild(panel);
     document.body.appendChild(modalOverlay);
     handleMessage(iframe);
   });
   target.appendChild(btn);
 }

 function init() {
   var target = document.getElementById(targetId);
   if (!target) {
     console.error('[RentSketch embed] No element with id="' + targetId + '" found on the page.');
     return;
   }
   if (mode === 'button') renderButton(target);
   else renderInline(target);
 }

 if (document.readyState === 'loading') {
   document.addEventListener('DOMContentLoaded', init);
 } else {
   init();
 }

 window.RentSketchEmbed = { version: VERSION };
})();
