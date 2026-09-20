// A free preview has one deadline per anonymous browser. Paid and included
// events keep their existing server-verified access and saved scene.
(function () {
  'use strict';
  window.RentSketchStartPreviewLimit = function (options) {
    var key = 'rentsketch-preview-deadline:v1', started = false, interval, screen;
    var expiresAt = 0, monotonicEnd = 0;
    function remaining() { return Math.max(0, Math.min(expiresAt - Date.now(), monotonicEnd - performance.now())); }
    function setDeadline(milliseconds) {
      var duration = Math.max(0, milliseconds);
      expiresAt = Date.now() + duration; monotonicEnd = performance.now() + duration;
      try { localStorage.setItem(key, String(expiresAt)); } catch (_) {}
    }
    function focusIfLocked() { if (screen && !document.querySelector('.paywall-overlay')) screen.querySelector('h2').focus(); }
    function unlockView() {
      clearInterval(interval);
      if (screen) { screen.remove(); screen = null; document.getElementById('designerApp')?.removeAttribute('inert'); }
      document.body.classList.remove('rs-preview-expired');
    }
    function expire() {
      if (screen) return;
      document.body.classList.add('rs-preview-expired');
      document.getElementById('designerApp')?.setAttribute('inert', '');
      screen = document.createElement('section'); screen.className = 'preview-limit-screen'; screen.setAttribute('aria-label', 'Free preview ended');
      screen.innerHTML = '<div class="preview-limit-card"><p class="pass-eyebrow">Your preview is complete</p><h2 tabindex="-1">Ready to make it your event?</h2><p>Your five-minute free preview has ended. Keep this exact rental and unlock your event design.</p><button type="button" class="btn-primary" data-preview-buy></button><p class="pass-fine" data-preview-price></p><a class="btn-secondary" href="https://rentsketch.com/my-event/?tenant=friendly&mode=order" target="_blank" rel="noopener">Booked with Friendly? Get included access</a><button type="button" class="pass-back" data-preview-resume hidden>Continue my saved event</button><button type="button" class="pass-back" data-preview-recover>Open my saved event</button><p class="pass-fine">No subscription. Rental equipment is separate.</p></div>';
      screen.querySelector('[data-preview-buy]').textContent = 'Unlock my event · ' + options.price();
      screen.querySelector('[data-preview-price]').textContent = 'One event · ' + options.days() + ' days of access';
      screen.querySelector('[data-preview-buy]').onclick = options.purchase;
      screen.querySelector('[data-preview-recover]').onclick = options.recover;
      if (options.resume) { var resume = screen.querySelector('[data-preview-resume]'); resume.hidden = false; resume.onclick = options.resume; }
      document.body.appendChild(screen); focusIfLocked();
    }
    function tick() {
      if (options.hasAccess()) { unlockView(); return; }
      var left = remaining();
      var mark = document.getElementById('eventPreviewMark');
      if (mark) { var seconds = Math.ceil(left / 1000); mark.textContent = 'Free preview · ' + Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') + ' left'; }
      if (left <= 0) { clearInterval(interval); expire(); }
    }
    async function begin() {
      started = true;
      var cached; try { cached = Number(localStorage.getItem(key)); } catch (_) {}
      setDeadline(Number.isFinite(cached) && cached > 0 ? Math.min(options.duration() * 1000, cached - Date.now()) : options.duration() * 1000);
      tick(); interval = setInterval(tick, 1000);
      try {
        var lease = await options.request();
        if (lease.limited === false) { unlockView(); return; }
        if (!Number.isFinite(lease.remainingSeconds) || lease.remainingSeconds < 0) throw Error('Invalid preview deadline');
        setDeadline(Math.min(remaining(), lease.remainingSeconds * 1000)); tick();
      } catch (_) {
        // An outage cannot reset a previously started preview. The persisted
        // local deadline bounds this attempt until the server is reachable.
        tick();
      }
    }
    document.addEventListener('visibilitychange', function () { if (started) tick(); });
    window.addEventListener('storage', function (event) {
      if (event.key === key && started && Number(event.newValue) > 0) {
        var shorter = Number(event.newValue) - Date.now();
        if (shorter < remaining()) { setDeadline(shorter); tick(); }
      }
    });
    return { updateAccess: function () { if (options.hasAccess()) unlockView(); else if (!started) begin(); else tick(); }, focusIfLocked: focusIfLocked };
  };
})();
