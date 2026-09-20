// Free product preview -> one explicitly priced Event Pass -> the same design.
// Pricing and access always come from the API, never a local "paid" flag.
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var slug = params.get('tenant') || 'generic';
  if (!['friendly', 'generic'].includes(slug)) return;
  var fragment = new URLSearchParams(location.hash.slice(1));
  var checkoutId = params.get('checkout_session_id') || fragment.get('eventPass');
  var draftToken = fragment.get('draft');
  var recoveryToken = params.get('recoveryToken') || fragment.get('recoveryToken');
  var productPreview = ['tent', 'inflatable'].includes(params.get('focus')) && params.get('autoplace') === '1';
  var offer, verified, savedPaidEvent, modal, offerPromise, ready = false, busy = false;
  var saved = read('rentsketch-autosave:' + slug);
  var returning = !!(checkoutId || draftToken || recoveryToken || (!productPreview && saved && saved.id));
  window.RENTSKETCH_PASS_RESTORING = returning;
  // Reserve preview controls before the asynchronous offer request completes.
  document.body.classList.add('rs-pass-checking');

  function read(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; } }
  function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function bridge() { return window.FriendlyBridge; }
  function money(cents) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100); }
  function active() { return !!(verified && verified.active && (!verified.expiresAt || Date.parse(verified.expiresAt) > Date.now())); }
  function api(path, body) {
    var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 12000);
    return fetch((window.RENTSKETCH_API_URL || '') + '/api/consumer' + path, {
      method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined, signal: controller.signal, cache: 'no-store',
    }).then(async function (response) {
      var data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Please try again in a moment.');
      return data;
    }).catch(function (err) {
      if (err.name === 'AbortError') throw new Error('That took too long. Your preview is safe. Please try again.');
      throw err;
    }).finally(function () { clearTimeout(timer); });
  }
  function getOffer(refresh) {
    if (!offerPromise || refresh) offerPromise = api('/event-pass/offer?tenant=' + encodeURIComponent(slug)).then(function (data) {
      offer = data; render(); return data;
    }).catch(function (err) { offerPromise = null; throw err; });
    return offerPromise;
  }
  function autosave() {
    var auto = window.RentSketchAutosave || (window.RentSketchStartAutosave && window.RentSketchStartAutosave());
    if (auto && auto.start) auto = auto.start();
    if (!auto || !auto.flush) throw new Error('The designer is still loading. Please try again.');
    return auto;
  }
  function track(event, extra) {
    var data = Object.assign({ tenant: slug, currency: 'USD' }, extra || {});
    window.dispatchEvent(new CustomEvent('rentsketch:' + event, { detail: data }));
    if (typeof window.gtag === 'function') window.gtag('event', event, data);
  }
  function closeModal() { if (modal) { var focus = modal._returnFocus; modal.remove(); modal = null; if (focus && focus.isConnected) focus.focus(); } }
  function openModal(title, html) {
    closeModal();
    var focus = document.activeElement;
    modal = document.createElement('div'); modal.className = 'paywall-overlay'; modal._returnFocus = focus;
    modal.innerHTML = '<section class="paywall-modal" role="dialog" aria-modal="true" aria-labelledby="eventPassTitle"><button class="pass-close" type="button" aria-label="Back to preview">×</button><div class="pass-eyebrow">RentSketch Event Pass</div><h2 id="eventPassTitle"></h2>' + html + '</section>';
    modal.querySelector('h2').textContent = title;
    document.body.appendChild(modal);
    modal.querySelector('.pass-close').onclick = closeModal;
    modal.addEventListener('click', function (event) { if (event.target === modal) closeModal(); });
    modal.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { event.preventDefault(); closeModal(); return; }
      if (event.key !== 'Tab') return;
      var controls = Array.from(modal.querySelectorAll('button:not([disabled]),a[href],input,textarea')).filter(function (el) { return !el.hidden; });
      var first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    modal.querySelector('.pass-close').focus();
    return modal;
  }
  function render() {
    document.body.classList.toggle('rs-pass-checking', !offer);
    document.body.classList.toggle('rs-pass-preview', !!(offer && offer.required && !active()));
    var bar = document.getElementById('eventPassBar');
    if (!bar) {
      bar = document.createElement('div'); bar.id = 'eventPassBar'; bar.className = 'event-pass-bar';
      var shell = document.querySelector('.designer-shell'); if (!shell) return;
      shell.appendChild(bar);
    }
    if (!offer || !offer.required) { bar.hidden = true; return; }
    bar.hidden = false;
    if (active()) {
      bar.innerHTML = '<span><strong>Event Pass active</strong><small></small></span><button type="button" class="btn-secondary">Keep my access link</button>';
      bar.querySelector('small').textContent = verified.expiresAt ? 'Editing until ' + new Date(verified.expiresAt).toLocaleDateString() : 'Your event is ready to edit';
      bar.querySelector('button').onclick = showAccessLink;
    } else {
      var renew = verified && verified.renewable;
      bar.innerHTML = '<span><strong></strong><small></small></span><button type="button" class="btn-primary" data-buy-pass>Design My Event</button>';
      bar.querySelector('strong').textContent = renew ? 'Keep working on your event' : 'Make this event yours';
      bar.querySelector('small').textContent = (renew ? money(offer.renewalPriceCents) : money(offer.priceCents)) + ' · one event · ' + (renew ? offer.renewalDurationDays : offer.durationDays) + ' days · no subscription';
      bar.querySelector('[data-buy-pass]').textContent = renew ? 'Renew Event Pass' : 'Design My Event';
      bar.querySelector('[data-buy-pass]').onclick = function () { requestAccess(); };
      if (savedPaidEvent) {
        var resume = document.createElement('button'); resume.type = 'button'; resume.className = 'btn-secondary'; resume.textContent = 'Continue my paid event';
        resume.onclick = function () { restoreScene(savedPaidEvent); continueProduct(); };
        bar.appendChild(resume);
      }
    }
    var previewButton = document.getElementById('designMyEvent');
    if (previewButton && !active()) previewButton.textContent = 'Design My Event · ' + money(offer.priceCents);
    // Product previews already have a primary CTA. Keep only its clear price line.
    bar.classList.toggle('event-pass-product', !!window.RENTSKETCH_TENT_PREVIEW && !active());
  }
  function continueProduct() {
    var button = document.getElementById('designMyEvent');
    if (button && window.RENTSKETCH_TENT_PREVIEW) button.click();
    render();
  }
  function restoreScene(data) {
    if (data.tenant !== slug) throw new Error('This event belongs to a different rental company. Open its original access link.');
    window.RENTSKETCH_PASS_RESTORING = true;
    try {
      var auto = autosave();
      if (!bridge().loadScene(data.scene)) throw new Error('Your saved layout could not be restored. Please retry.');
      auto.adopt(data);
      verified = data;
    } finally { window.RENTSKETCH_PASS_RESTORING = false; }
    render();
  }
  function showAccessLink() {
    var reference = checkoutId || (read('rentsketch-pass:' + slug) || {}).checkoutId;
    var view = openModal('Come back to this event', '<p>Your Event Pass is a one-time purchase. Keep your private edit link to open this design on another device.</p><textarea class="pass-access-link" rows="3" readonly aria-label="Private event access link"></textarea><button type="button" class="btn-primary" data-copy-link>Copy my private link</button><p class="paywall-error" role="status"></p><p class="pass-fine">Anyone with this private link can edit your event. Use Review → Share for a rental summary.</p>');
    if (!reference) { view.querySelector('textarea').hidden = true; view.querySelector('[data-copy-link]').hidden = true; view.querySelector('.paywall-error').textContent = 'Your event is saved in this browser. Keep the return link from your original checkout to open it elsewhere.'; return; }
    var link = location.origin + '/designer/?tenant=' + encodeURIComponent(slug) + '#eventPass=' + encodeURIComponent(reference);
    view.querySelector('textarea').value = link;
    view.querySelector('[data-copy-link]').onclick = async function () {
      try { await navigator.clipboard.writeText(link); view.querySelector('.paywall-error').textContent = 'Private link copied. Keep it somewhere you can find later.'; }
      catch (_) { view.querySelector('textarea').focus(); view.querySelector('textarea').select(); view.querySelector('.paywall-error').textContent = 'Copy the selected link and keep it for later.'; }
    };
  }
  async function showPurchase() {
    var renewal = !!(verified && verified.renewable), amount = renewal ? offer.renewalPriceCents : offer.priceCents;
    var days = renewal ? offer.renewalDurationDays : offer.durationDays;
    var view = openModal(renewal ? 'More time for your event' : 'Your event, arranged your way',
      '<div class="paywall-price">' + money(amount) + '<small>one-time payment</small></div>' +
      '<p>One event design. ' + days + ' days of access. No subscription or automatic renewal.</p>' +
      '<ul class="pass-benefits"><li>Arrange tables, chairs and event rentals in 2D and 3D</li><li>Style your setup, save changes and return later</li><li>Print, download and share your event plan</li></ul>' +
      '<form><label class="paywall-label" for="passEmail">Email for checkout</label><input id="passEmail" class="paywall-email" type="email" autocomplete="email" maxlength="254" required placeholder="you@example.com"><button class="btn-primary paywall-submit" type="submit">Continue to checkout · ' + money(amount) + '</button></form>' +
      '<a class="btn-primary pass-checkout-link" target="_blank" rel="noopener" hidden>Open secure checkout</a><p class="paywall-error" role="status" aria-live="polite"></p>' +
      '<p class="pass-fine">This pays for RentSketch design access. Rental equipment, delivery and tax on rentals are separate. ' + money(offer.renewalPriceCents) + ' adds ' + offer.renewalDurationDays + ' days when you choose to renew.</p><button type="button" class="pass-back">Keep previewing for free</button>');
    view.querySelector('.pass-back').onclick = closeModal;
    view.querySelector('#passEmail').focus();
    track('event_pass_offer', { value: amount / 100 });
    view.querySelector('form').onsubmit = async function (event) {
      event.preventDefault(); if (busy) return;
      busy = true;
      var button = view.querySelector('.paywall-submit'), status = view.querySelector('.paywall-error');
      button.disabled = true; button.textContent = 'Saving your exact design…'; status.textContent = '';
      try {
        // Expired passes are read-only: renew their saved design without
        // attempting a forbidden edit before payment.
        var auto = autosave(), id = renewal && verified.id ? verified.id : await auto.flush();
        if (!id) throw new Error('Your design could not be saved. Please try again.');
        var result = await api('/designs/' + encodeURIComponent(id) + '/event-pass/' + (renewal ? 'renewal-checkout-session' : 'checkout-session'), {
          customerEmail: view.querySelector('#passEmail').value.trim(), anonymousSessionId: auto.getSessionId(),
        });
        if (result.active) {
          var resumed = await api('/event-pass/resume', { designId: id, anonymousSessionId: auto.getSessionId() });
          restoreScene(resumed); closeModal(); continueProduct(); return;
        }
        if (!result.url || new URL(result.url).origin !== 'https://checkout.stripe.com') throw new Error('Secure checkout did not return a valid link.');
        track('event_pass_checkout', { value: amount / 100, design_id: id });
        if (window.parent === window) { location.assign(result.url); }
        else {
          // Stripe hosted Checkout must not load inside Friendly's iframe.
          // A real link click also works when a mobile browser blocks popups.
          var link = view.querySelector('.pass-checkout-link'); link.href = result.url; link.hidden = false; link.textContent = 'Open secure checkout · ' + money(amount); link.focus();
          view.querySelector('form').hidden = true;
          status.textContent = 'Your design is saved. Checkout opens in a new tab and brings you back to this exact event.';
        }
      } catch (err) { status.textContent = err.message; }
      finally { busy = false; button.disabled = false; button.textContent = 'Continue to checkout · ' + money(amount); }
    };
  }
  async function requestAccess(continuation) {
    try {
      await getOffer();
      if (!offer.required || active()) { if (continuation) continuation(); return true; }
      if (returning && !ready) throw new Error('Your saved event is still being restored. Please try again in a moment.');
      await showPurchase();
      return false;
    } catch (err) {
      var view = openModal('Your preview is still here', '<p class="paywall-error" role="status"></p><button class="btn-primary" type="button" data-retry>Try again</button>');
      view.querySelector('.paywall-error').textContent = err.message;
      view.querySelector('[data-retry]').onclick = function () { closeModal(); getOffer(true).then(function () { requestAccess(continuation); }).catch(function () { requestAccess(continuation); }); };
      return false;
    }
  }
  window.RentSketchEventPass = { requestAccess: requestAccess };
  // Current entry points call the existing designer directly; wrapping only
  // the old recommendation bridge misses these controls completely.
  document.addEventListener('click', function (event) {
    if (active() || (offer && !offer.required) || event.target.closest('.paywall-overlay,#eventPassBar')) return;
    var control = event.target.closest('#designMyEvent,.rail-btn,#btnToReview,#btnBackToRecommend,#btnUndo,#btnRedo,#emptyStateOverlay button,#inspectorPanel button,#inspectorPanel input,#drawer button,#btnPrint,#btnShare,#btnDownload');
    if (!control || control.disabled || control.matches('[data-open-help]')) return;
    event.preventDefault(); event.stopImmediatePropagation(); requestAccess();
  }, true);
  document.addEventListener('pointerdown', function (event) {
    if (active() || (offer && !offer.required)) return;
    if (event.target.closest('#plan2d [data-item-id],#inspectorPanel,#drawer')) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('rentsketch:designStarted', render);
  window.addEventListener('rentsketch:intakeReady', render);
  async function boot() {
    if (!bridge() || !window.RENTSKETCH_API_URL || !window.RENTSKETCH_CATALOG_READY || !window.RentSketchStartAutosave) { setTimeout(boot, 50); return; }
    try {
      await getOffer();
      if (checkoutId || draftToken || recoveryToken) {
        var view = openModal('Opening your saved event', '<p class="paywall-error" role="status">Checking your access and restoring your layout…</p><button type="button" class="btn-primary" data-check hidden>Check again</button>');
        async function checkReturn() {
          var result = await api('/event-pass/restore', checkoutId ? { checkoutSessionId: checkoutId } : (draftToken ? { draftToken: draftToken } : { recoveryToken: recoveryToken }));
          if (result.pending) {
            if (result.scene) restoreScene(result);
            view.querySelector('.paywall-error').textContent = 'Payment has not been confirmed yet. If you completed checkout, check again in a moment. You will not be asked to pay again here.';
            view.querySelector('[data-check]').hidden = false;
            return;
          }
          if (result.tenant !== slug && recoveryToken) { location.replace(location.pathname + '?tenant=' + encodeURIComponent(result.tenant) + '#recoveryToken=' + encodeURIComponent(recoveryToken)); return; }
          restoreScene(result);
          if (checkoutId) write('rentsketch-pass:' + slug, { checkoutId: checkoutId });
          closeModal();
          history.replaceState(null, '', location.pathname + '?tenant=' + encodeURIComponent(slug) + '&design=' + encodeURIComponent(result.id));
          if (result.active && checkoutId) showAccessLink();
          ready = true;
        }
        view.querySelector('[data-check]').onclick = function () { checkReturn().catch(function (err) { view.querySelector('.paywall-error').textContent = err.message; }); };
        try { await checkReturn(); } catch (err) { view.querySelector('.paywall-error').textContent = err.message; view.querySelector('[data-check]').hidden = false; }
      } else if (saved && saved.id) {
        var sid; try { sid = saved.anonymousSessionId || localStorage.getItem('rentsketch-anon-session'); } catch (_) {}
        if (sid) {
          var data = await api('/event-pass/resume', { designId: saved.id, anonymousSessionId: sid });
          if (productPreview) { if (data.active) savedPaidEvent = data; }
          else restoreScene(data);
        }
      }
    } catch (err) {
      console.warn('[RentSketch] Event Pass:', err.message);
      if (returning) {
        var failed = openModal('Your saved event could not be opened', '<p class="paywall-error" role="status"></p><p>Your saved layout has not been replaced. Retry the connection or open your private access link.</p><button type="button" class="btn-primary" data-reload>Retry opening my event</button>');
        failed.querySelector('.paywall-error').textContent = err.message;
        failed.querySelector('[data-reload]').onclick = function () { location.reload(); };
      }
    }
    finally { ready = true; window.RENTSKETCH_PASS_RESTORING = returning && !verified; render(); }
  }
  boot();
})();
