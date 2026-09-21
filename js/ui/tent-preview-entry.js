// The sole product-preview controller. Keep the existing store and renderer alive
// when the customer continues into the full designer.
(function () {
  'use strict';
  var q = new URLSearchParams(location.search);
  var inflatable = q.get('focus') === 'inflatable';
  if (!((q.get('focus') === 'tent' || inflatable) && q.get('autoplace') === '1')) return;
  window.RENTSKETCH_TENT_PREVIEW = true;
  var noun=inflatable?'inflatable':'tent',previewMode=inflatable?'inflatable-preview':'tent-preview';
  var tenantSlug = q.get('tenant') || 'generic';
  var requestedProductId = q.get('productId') || '';
  var requestedSlug = q.get(inflatable?'productSlug':'tentSlug') || '';
  var requestedName = q.get(inflatable?'product':'tent') || '';
  var readySent = false, failed = false, tent = null, startedAt = Date.now();
  var want3d = q.get('view') !== '2d';
  var bridge;
  document.body.classList.add('tent-preview');if(inflatable)document.body.classList.add('inflatable-preview');

  function normalize(value) {
    return String(value || '').toLowerCase().replace(/×/g, 'x').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  function findTent(list) {
    // An explicit product ID is authoritative; never silently substitute a tent.
    if (requestedProductId) return list.find(function (t) { return String(t.productId) === requestedProductId; });
    var slug = normalize(requestedSlug), name = normalize(requestedName);
    return list.find(function (t) {
      return (slug && (normalize(t.externalId && t.externalId.split(':').pop()) === slug || normalize(t.id) === slug || normalize(t.name) === slug)) ||
        (name && normalize(t.name) === name);
    });
  }
  var status = document.createElement('div');
  status.id = 'tentPreviewStatus';
  status.setAttribute('role', 'status');
  status.textContent = 'Loading your '+noun+'…';
  document.querySelector('.canvas-viewport').appendChild(status);
  var title = document.getElementById('toolbarEventTitle');
  title.textContent = 'Your ' + (requestedName || noun);
  var meta = document.getElementById('toolbarEventMeta');
  meta.textContent = 'Explore your '+noun+', then make it your event.';
  var actions = document.createElement('div');
  actions.className = 'tent-preview-actions';
  actions.innerHTML = '<p><span class="preview-instructions">Add your own items, or try an editable party setup.</span> <button type="button" class="btn-tertiary" data-open-help>Help</button></p><button type="button" class="btn-secondary" id="previewParty" disabled>Try a Party Setup</button><button type="button" class="btn-primary" id="designMyEvent" disabled>Design My Event</button>';
  document.querySelector('.designer-shell').appendChild(actions);
  var design = document.getElementById('designMyEvent');
  var party = document.getElementById('previewParty');if(inflatable){party.hidden=true;actions.querySelector('.preview-instructions').textContent='Preview the action, then arrange your outdoor event.';}
  party.addEventListener('click',function(){if(bridge?.buildPartyScene?.()){party.textContent='Party Setup Added';party.disabled=true;party.hidden=true;actions.querySelector('.preview-instructions').textContent='Your party setup is ready. Make it yours.';}});

  function continueDesigning() {
    if (!tent) return;
    window.RENTSKETCH_TENT_PREVIEW = false;
    document.body.classList.remove('tent-preview','inflatable-preview');
    document.body.classList.add('product-designer');
    actions.remove();
    status.remove();
    // Do not call customizeFromScratch / enterDesigner here: both reset state
    // or view mode. The preview and full designer use this same live scene.
    bridge.refreshAll();
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new CustomEvent('rentsketch:designStarted', { detail: { tentId: inflatable?null:tent.id, productId: tent.productId } }));
  }
  design.addEventListener('click', function () {
    var entry = window.RentSketchCustomerEntry;
    if (entry && entry.startDesigning) entry.startDesigning(continueDesigning);
    else if (q.get('embed') !== '1') continueDesigning();
  });
  function ready(renderer) {
    document.body.classList.remove('tent-preview-loading');
    if (readySent) return;
    readySent = true;
    window.RENTSKETCH_PRODUCT_PREVIEW_READY = true;
    status.hidden = true;
    design.disabled = false;party.disabled=false;
    try { parent.postMessage({ type: 'rentsketch.ready', mode: previewMode, tenant: tenantSlug, productId: tent.productId || null, externalId: tent.externalId || null, tentId: inflatable?null:tent.id, tentName: inflatable?null:tent.name, productName: tent.name, renderer: renderer }, '*'); } catch (_) {}
    window.dispatchEvent(new CustomEvent('rentsketch:productPreviewReady'));
  }
  function fail(reason) {
    if (failed) return;
    failed = true;
    console.error('RentSketch 3D preview:', reason);
    if (tent) {
      want3d = false;
      bridge.setViewMode('plan');
      status.hidden = false;
      status.textContent = '3D is unavailable right now. Your '+noun+' is ready in 2D.';
      design.disabled = false;party.disabled=false;
      ready('2d');
      status.hidden = false;
    } else {
      status.hidden = false;
      status.textContent = 'We couldn’t load this exact '+noun+'. Please close the preview and try again.';
      try { parent.postMessage({ type: 'rentsketch.error', mode: previewMode, tenant: tenantSlug, productId: requestedProductId || null, reason: String(reason) }, '*'); } catch (_) {}
    }
  }
  function waitFor3d() {
    if (failed || readySent) return;
    if (!want3d) return ready('2d');
    if (window.__rentsketchLast3dError) return fail(window.__rentsketchLast3dError);
    var canvas = document.querySelector('#canvas canvas');
    if (canvas && canvas.clientWidth >= 100 && canvas.clientHeight >= 100 && bridge.fitTentPreview) {
      bridge.fitTentPreview();
      requestAnimationFrame(function () { requestAnimationFrame(function () { if (!failed) ready('webgl'); }); });
      return;
    }
    if (Date.now() - startedAt > 18000) return fail('3D renderer did not become usable');
    setTimeout(waitFor3d, 50);
  }
  function boot() {
    bridge = window.FriendlyBridge;
    if (window.RENTSKETCH_CATALOG_ERROR) return fail(window.RENTSKETCH_CATALOG_ERROR);
    if ((tenantSlug !== 'generic' && !window.RENTSKETCH_CATALOG_READY) || !bridge || !bridge.customizeFromScratch) {
      if (Date.now() - startedAt > 15000) return fail('Tenant catalog or designer did not become ready');
      return setTimeout(boot, 50);
    }
    tent = findTent((inflatable?bridge.INFLATABLES:bridge.TENTS) || []);
    if (!tent) return fail('Requested '+noun+' not found in the live tenant catalog');
    title.textContent = 'Your ' + tent.name;
    meta.textContent = (inflatable?(tent.dimensionsConfirmed?tent.widthFt+' × '+tent.depthFt+' ft':'Illustrative model · confirm dimensions'):tent.widthFt+' × '+tent.lengthFt+' ft')+' · '+(window.ACTIVE_TENANT.name||'RentSketch');
    if(inflatable){bridge.openInflatablePreview(tent);var ref=document.createElement('div');ref.className='product-reference';if(tent.photoUrl){var img=document.createElement('img');img.src=tent.photoUrl;img.alt=tent.name+' rental photo';ref.appendChild(img);}var caption=document.createElement('span');caption.textContent='Your rental photo · The model and children illustrate the setup. Confirm dimensions and clear space with your rental company.';ref.appendChild(caption);actions.prepend(ref);}
    else {bridge.state.tentId = tent.id;
    bridge.state.guestCount = 0;
    bridge.customizeFromScratch();}
    // Paint the exact 2D footprint while WebGL initializes, rather than exposing
    // an empty canvas or a questionnaire. It remains available if 3D fails.
    if (want3d) {
      document.body.classList.add('tent-preview-loading');
      bridge.setViewMode('3d');
      waitFor3d();
    } else ready('2d');
  }
  document.getElementById('viewModePlan').addEventListener('click', function () {
    want3d = false;
    if (tent) ready('2d');
    document.body.classList.remove('tent-preview-loading');
  });
  window.addEventListener('rentsketch:preview2d', function () { if (tent) ready('2d'); });
  window.addEventListener('rentsketch:3d-error', function (e) { if (window.RENTSKETCH_TENT_PREVIEW) fail(e.detail && e.detail.message || '3D unavailable'); });
  boot();
})();
