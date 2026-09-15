// RentSketch Direct Consumer Event Pass paywall.
// Wraps window.FriendlyBridge.useRecommendedLayout / customizeFromScratch so
// a direct consumer (no tenant, or the generic RentSketch catalog) must
// unlock a $9.99 / 30-day Event Pass before entering the editor. Tenant
// customers (e.g. Friendly Party Rental) are NOT gated here - their access
// rules are separate and will be built later, per docs/ROADMAP.md. The
// server is authoritative for the entitlement check; this file never trusts
// the Stripe success URL by itself.

(function () {
  var ANON_SESSION_KEY = 'rentsketch_anon_session';
    var DESIGN_ID_KEY = 'rentsketch_design_id';
var EVER_PAID_KEY = 'rentsketch_ever_paid';
var AUTOSAVE_INTERVAL_MS = 20000;
var _autosaveTimer = null;
var _lastSavedSceneJSON = null;

      function getAnonymousSessionId() {
          var id = window.localStorage.getItem(ANON_SESSION_KEY);
              if (!id) {
                    id = 'anon_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
                          window.localStorage.setItem(ANON_SESSION_KEY, id);
                              }
                                  return id;
                                    }

                                      function apiUrl(path) {
                                          return (window.RENTSKETCH_API_URL || '') + path;
                                            }

                                              function createAnonymousDesign(scene) {
                                                  return fetch(apiUrl('/api/consumer/designs'), {
                                                        method: 'POST',
                                                              headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({
                                                                            scene: scene || { note: 'RentSketch direct consumer design' },
                                                                                    anonymousSessionId: getAnonymousSessionId(),
                                                                                            schemaVersion: 1,
                                                                                                  }),
                                                                                                      })
                                                                                                            .then(function (r) { return r.json(); })
                                                                                                                  .then(function (created) {
                                                                                                                          window.localStorage.setItem(DESIGN_ID_KEY, created.id);
                                                                                                                                  return created.id;
                                                                                                                                        });
                                                                                                                                          }
                                                                                                                                          
                                                                                                                                            function checkEntitlement(designId) {
                                                                                                                                                return fetch(apiUrl('/api/consumer/designs/' + designId + '/entitlement'))
                                                                                                                                                      .then(function (r) { return r.ok ? r.json() : { active: false }; })
                                                                                                                                                            .catch(function () { return { active: false }; });
                                                                                                                                                              }
                                                                                                                                                              
                                                                                                                                                                function startCheckout(designId, email) {
                                                                                                                                                                    return fetch(apiUrl('/api/consumer/designs/' + designId + '/event-pass/checkout-session'), {
                                                                                                                                                                          method: 'POST',
                                                                                                                                                                                headers: { 'Content-Type': 'application/json' },
                                                                                                                                                                                      body: JSON.stringify({ customerEmail: email, origin: window.location.origin }),
                                                                                                                                                                                          })
                                                                                                                                                                                                .then(function (r) {
                                                                                                                                                                                                        return r.json().then(function (body) { return { ok: r.ok, body: body }; });
                                                                                                                                                                                                              })
                                                                                                                                                                                                                    .then(function (result) {
                                                                                                                                                                                                                            if (!result.ok || !result.body.url) {
                                                                                                                                                                                                                                      throw new Error(result.body.error || 'Could not start checkout');
                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                      window.location.href = result.body.url;
                                                                                                                                                                                                                                                            });
                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                              
                                                                                                                                                                                                                                                                function apiPatchDesign(designId, payload) {
  return fetch(apiUrl('/api/consumer/designs/' + designId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(function (r) {
    return r.json().then(function (body) { return { ok: r.ok, status: r.status, body: body }; });
  });
}

function stopAutosave() {
  if (_autosaveTimer) {
    clearInterval(_autosaveTimer);
    _autosaveTimer = null;
  }
}

function saveDesignNow(designId) {
 if (!window.FriendlyBridge || typeof window.FriendlyBridge.getScene !== 'function') return;
 var scene = window.FriendlyBridge.getScene();
 var sceneJSON = JSON.stringify(scene);
 
  if (sceneJSON === _lastSavedSceneJSON) return;
  apiPatchDesign(designId, {
    scene: scene,
    eventType: scene.eventType || null,
    guestCount: scene.guestCount || null,
    estimateTotal: scene.estimateTotal || null,
  }).then(function (result) {
    if (result.ok) {
      _lastSavedSceneJSON = sceneJSON;
    } else if (result.status === 402) {
      stopAutosave();
      showRenewalModal(designId, function () {});
    }
  }).catch(function () {});
}

function startAutosave(designId) {
  stopAutosave();
  saveDesignNow(designId);
  _autosaveTimer = setInterval(function () { saveDesignNow(designId); }, AUTOSAVE_INTERVAL_MS);
  window.addEventListener('beforeunload', function () { saveDesignNow(designId); });
}

function startRenewalCheckout(designId, email) {
  return fetch(apiUrl('/api/consumer/designs/' + designId + '/event-pass/renewal-checkout-session'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerEmail: email, origin: window.location.origin }),
  })
    .then(function (r) {
      return r.json().then(function (body) { return { ok: r.ok, body: body }; });
    })
    .then(function (result) {
      if (!result.ok || !result.body.url) {
        throw new Error(result.body.error || 'Could not start checkout');
      }
      window.location.href = result.body.url;
    });
}

function showRenewalModal(designId, onUnlock) {
  var overlay = document.createElement('div');
  overlay.className = 'paywall-overlay';
  overlay.innerHTML =
    '<div class="paywall-modal">' +
    '<h2>Your Event Pass Expired</h2>' +
    '<p>Renew for 30 more days of full editing access to your event design.</p>' +
    '<div class="paywall-price">$4.99</div>' +
    '<label class="paywall-label">Email (for your receipt)</label>' +
    '<input type="email" class="paywall-email" placeholder="you@example.com" />' +
    '<div class="paywall-error"></div>' +
    '<button type="button" class="btn-primary paywall-submit">Renew My Event Pass</button>' +
    '<button type="button" class="btn-link paywall-cancel">Not yet</button>' +
    '</div>';
  document.body.appendChild(overlay);

  var emailInput = overlay.querySelector('.paywall-email');
  var errorBox = overlay.querySelector('.paywall-error');
  var submitBtn = overlay.querySelector('.paywall-submit');

  overlay.querySelector('.paywall-cancel').addEventListener('click', function () {
    overlay.remove();
if (window.FriendlyBridge && typeof window.FriendlyBridge.showStep === 'function') {
window.FriendlyBridge.showStep('step-recommend');
}
  });

  submitBtn.addEventListener('click', function () {
    var email = emailInput.value.trim();
    if (!email || email.indexOf('@') === -1) {
      errorBox.textContent = 'Please enter a valid email address.';
      return;
    }
    errorBox.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Redirecting to secure checkout...';
    startRenewalCheckout(designId, email).catch(function (err) {
      errorBox.textContent = err.message || 'Something went wrong. Please try again.';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Renew My Event Pass';
    });
  });
}

function injectStyles() {
                                                                                                                                                                                                                                                                    var style = document.createElement('style');
                                                                                                                                                                                                                                                                        style.textContent =
                                                                                                                                                                                                                                                                              '.paywall-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;}' +
                                                                                                                                                                                                                                                                                    '.paywall-modal{background:#fff;border-radius:12px;padding:32px;max-width:380px;width:90%;text-align:center;font-family:inherit;}' +
                                                                                                                                                                                                                                                                                          '.paywall-modal h2{margin:0 0 8px;}' +
                                                                                                                                                                                                                                                                                                '.paywall-price{font-size:32px;font-weight:700;margin:12px 0;}' +
                                                                                                                                                                                                                                                                                                      '.paywall-label{display:block;text-align:left;font-size:13px;margin-top:12px;margin-bottom:4px;color:#555;}' +
                                                                                                                                                                                                                                                                                                            '.paywall-email{width:100%;padding:10px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-size:14px;}' +
                                                                                                                                                                                                                                                                                                                  '.paywall-error{color:#c0392b;font-size:13px;min-height:18px;margin-top:6px;text-align:left;}' +
                                                                                                                                                                                                                                                                                                                        '.paywall-modal .btn-primary{width:100%;margin-top:14px;padding:12px;border-radius:8px;border:none;background:#5b3df0;color:#fff;font-size:15px;cursor:pointer;}' +
                                                                                                                                                                                                                                                                                                                              '.paywall-modal .btn-link{display:block;width:100%;margin-top:10px;background:none;border:none;color:#777;text-decoration:underline;cursor:pointer;font-size:13px;}' +
                                                                                                                                                                                                                                                                                                                                    '.paywall-unlocked-banner{position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#1e8e3e;color:#fff;padding:10px 20px;border-radius:8px;z-index:9999;font-size:14px;}';
style.textContent +=
'.rs-event-pass-badge{position:fixed;top:16px;right:16px;background:#1e293b;color:#fff;padding:8px 14px;border-radius:20px;font-size:13px;z-index:9998;box-shadow:0 2px 8px rgba(0,0,0,0.25);}' +
'.rs-event-pass-badge-warn{background:#b45309;}' +
'.rs-recover-link{position:fixed;top:16px;left:16px;background:rgba(255,255,255,0.9);color:#333;padding:6px 12px;border-radius:16px;font-size:12px;z-index:9998;text-decoration:underline;cursor:pointer;border:none;}';

                                                                                                                                                                                                                                                                                                                                        document.head.appendChild(style);
                                                                                                                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                                                                                                                          
                                                                                                                                                                                                                                                                                                                                            function showPaywallModal(designId) {
                                                                                                                                                                                                                                                                                                                                                var overlay = document.createElement('div');
                                                                                                                                                                                                                                                                                                                                                    overlay.className = 'paywall-overlay';
                                                                                                                                                                                                                                                                                                                                                        overlay.innerHTML =
                                                                                                                                                                                                                                                                                                                                                              '<div class="paywall-modal">' +
                                                                                                                                                                                                                                                                                                                                                                      '<h2>Unlock Your Event</h2>' +
                                                                                                                                                                                                                                                                                                                                                                              '<p>Save, edit and explore your complete event design for 30 days.</p>' +
                                                                                                                                                                                                                                                                                                                                                                                      '<div class="paywall-price">$9.99</div>' +
                                                                                                                                                                                                                                                                                                                                                                                              '<label class="paywall-label">Email (for your receipt, and to find your design later)</label>' +
                                                                                                                                                                                                                                                                                                                                                                                                      '<input type="email" class="paywall-email" placeholder="you@example.com" />' +
                                                                                                                                                                                                                                                                                                                                                                                                              '<div class="paywall-error"></div>' +
                                                                                                                                                                                                                                                                                                                                                                                                                      '<button type="button" class="btn-primary paywall-submit">Unlock My Event</button>' +
'<button type="button" class="btn-link paywall-cancel">Not yet</button>' +
'<button type="button" class="btn-link paywall-recover">Already paid on another device?</button>' +
'</div>';
                                                                                                                                                                                                                                                                                                                                                                                                                                        document.body.appendChild(overlay);
                                                                                                                                                                                                                                                                                                                                                                                                                                        
                                                                                                                                                                                                                                                                                                                                                                                                                                            var emailInput = overlay.querySelector('.paywall-email');
                                                                                                                                                                                                                                                                                                                                                                                                                                                var errorBox = overlay.querySelector('.paywall-error');
                                                                                                                                                                                                                                                                                                                                                                                                                                                    var submitBtn = overlay.querySelector('.paywall-submit');
                                                                                                                                                                                                                                                                                                                                                                                                                                                    
                                                                                                                                                                                                                                                                                                                                                                                                                                                        overlay.querySelector('.paywall-cancel').addEventListener('click', function () {
                                                                                                                                                                                                                                                                                                                                                                                                                                                              overlay.remove();
if (window.FriendlyBridge && typeof window.FriendlyBridge.showStep === 'function') {
window.FriendlyBridge.showStep('step-recommend');
}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                  });
                                                                                                                                                                                                                                                                                                                                                                                                                                                                  
                                                                                                                                                                                                                                                                                                                                                                                                                                                                      submitBtn.addEventListener('click', function () {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                            var email = emailInput.value.trim();
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  if (!email || email.indexOf('@') === -1) {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          errorBox.textContent = 'Please enter a valid email address.';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  return;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              errorBox.textContent = '';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    submitBtn.disabled = true;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          submitBtn.textContent = 'Redirecting to secure checkout...';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                startCheckout(designId, email)
.catch(function (err) {
errorBox.textContent = err.message || 'Something went wrong. Please try again.';
submitBtn.disabled = false;
submitBtn.textContent = 'Unlock My Event';
});
});

var recoverBtn = overlay.querySelector('.paywall-recover');
if (recoverBtn) {
  recoverBtn.addEventListener('click', function () {
    var email = emailInput.value.trim();
    if (!email || email.indexOf('@') === -1) {
      errorBox.textContent = 'Enter the email you used to pay, then tap this again.';
      return;
    }
    errorBox.textContent = '';
    recoverBtn.disabled = true;
    recoverBtn.textContent = 'Sending...';
    requestRecoveryLink(email).then(function () {
      errorBox.style.color = '#1e8e3e';
      errorBox.textContent = 'If that email has a paid design, we just emailed a link to continue editing it.';
      recoverBtn.textContent = 'Already paid on another device?';
      recoverBtn.disabled = false;
    }).catch(function (err) {
      errorBox.style.color = '';
      errorBox.textContent = err.message || 'Something went wrong. Please try again.';
      recoverBtn.textContent = 'Already paid on another device?';
      recoverBtn.disabled = false;
    });
  });
}
}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              function isGenericConsumer() {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  var tenant = window.ACTIVE_TENANT;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      return !tenant || tenant.slug === 'generic';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          function ensureDesignWithScene(existingDesignId, scene) {
if (existingDesignId) {
return apiPatchDesign(existingDesignId, {
scene: scene,
eventType: scene.eventType || null,
guestCount: scene.guestCount || null,
}).then(function () { return existingDesignId; });
}
return createAnonymousDesign(scene);
}

function showLoadingOverlay() {
var overlay = document.createElement('div');
overlay.className = 'paywall-overlay';
overlay.innerHTML = '<div class="paywall-modal"><p>Preparing your event...</p></div>';
document.body.appendChild(overlay);
return overlay;
}

function gate(originalFn) {
return function () {
if (true || !isGenericConsumer()) { // TEMP: paywall disabled for everyone for early feedback - remove "true ||" to re-enable
return originalFn.apply(this, arguments);
}
var existingDesignId = window.localStorage.getItem(DESIGN_ID_KEY);
var args = arguments;
var self = this;
if (existingDesignId) {
checkEntitlement(existingDesignId).then(function (entitlement) {
if (entitlement.active) {
loadAndEnterDesign(existingDesignId);
return;
}
originalFn.apply(self, args);
var loading = showLoadingOverlay();
var scene = window.FriendlyBridge.getScene();
ensureDesignWithScene(existingDesignId, scene).then(function (designId) {
loading.remove();
if (window.localStorage.getItem(EVER_PAID_KEY) === '1') {
showRenewalModal(designId, function () {});
} else {
showPaywallModal(designId);
}
});
});
} else {
originalFn.apply(self, args);
var loading = showLoadingOverlay();
var scene = window.FriendlyBridge.getScene();
ensureDesignWithScene(null, scene).then(function (designId) {
loading.remove();
showPaywallModal(designId);
});
}
};
}

function installPaywallGate() {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      var Bridge = window.FriendlyBridge;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          if (!Bridge || Bridge.__paywallInstalled) return;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              Bridge.__paywallInstalled = true;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  var originalUse = Bridge.useRecommendedLayout;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      var originalCustomize = Bridge.customizeFromScratch;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          if (typeof originalUse === 'function') {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                Bridge.useRecommendedLayout = gate(originalUse);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        if (typeof originalCustomize === 'function') {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              Bridge.customizeFromScratch = gate(originalCustomize);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      function requestRecoveryLink(email) {
  return fetch(apiUrl('/api/consumer/designs/recovery-link'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, origin: window.location.origin }),
  }).then(function (r) {
    return r.json().then(function (body) {
      if (!r.ok) throw new Error(body.error || 'Could not send recovery email');
      return body;
    });
  });
}

// Fetches a design's full saved scene by id and restores it into the
// designer via FriendlyBridge.loadScene(), instead of silently dropping the
// customer's paid work and starting over on every reload/new device. Falls
// back to a fresh entrance (enterDesigner) if there is no scene yet (a
// brand-new design) or the bridge/endpoint is unavailable for any reason.
function renderEventPassBadge(expiresAt) {
var existing = document.getElementById('__rsEventPassBadge');
if (existing) existing.remove();
if (!expiresAt) return;
var msLeft = new Date(expiresAt).getTime() - Date.now();
var daysLeft = Math.ceil(msLeft / 86400000);
if (daysLeft < 0) return;
var badge = document.createElement('div');
badge.id = '__rsEventPassBadge';
badge.className = 'rs-event-pass-badge' + (daysLeft <= 7 ? ' rs-event-pass-badge-warn' : '');
badge.textContent = 'Event Pass \u00b7 ' + daysLeft + (daysLeft === 1 ? ' day left' : ' days left');
document.body.appendChild(badge);
}

function loadAndEnterDesign(designId) {
startAutosave(designId);
checkEntitlement(designId).then(function (entitlement) {
if (entitlement.active) renderEventPassBadge(entitlement.expiresAt);
});
return fetch(apiUrl('/api/consumer/designs/' + designId))
 .then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body }; }); })
 .then(function (result) {
 var restored = result.ok && result.body && window.FriendlyBridge && typeof window.FriendlyBridge.loadScene === 'function' && window.FriendlyBridge.loadScene(result.body.scene);
 if (!restored && window.FriendlyBridge && typeof window.FriendlyBridge.enterDesigner === 'function') {
 window.FriendlyBridge.enterDesigner();
 }
 return restored;
 })
 .catch(function () {
 if (window.FriendlyBridge && typeof window.FriendlyBridge.enterDesigner === 'function') {
 window.FriendlyBridge.enterDesigner();
 }
 return false;
 });
}

function checkRecoveryToken() {
  var params = new URLSearchParams(window.location.search);
  var token = params.get('recoveryToken');
  if (!token) return;
  fetch(apiUrl('/api/consumer/designs/recover?token=' + encodeURIComponent(token)))
    .then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body }; }); })
    .then(function (result) {
      var banner = document.createElement('div');
      if (result.ok && result.body.designId) {
        window.localStorage.setItem(DESIGN_ID_KEY, result.body.designId);
        window.localStorage.setItem(EVER_PAID_KEY, '1');
        banner.className = 'paywall-unlocked-banner';
        banner.textContent = 'Your design is ready - continue editing.';
        document.body.appendChild(banner);
        setTimeout(function () { banner.remove(); }, 6000);
        loadAndEnterDesign(result.body.designId);
 } else {
        banner.className = 'paywall-unlocked-banner';
        banner.style.background = '#c0392b';
        banner.textContent = (result.body && result.body.error) || 'This recovery link is invalid or has expired.';
        document.body.appendChild(banner);
        setTimeout(function () { banner.remove(); }, 6000);
      }
    })
    .catch(function () {});
}

function checkReturnFromCheckout() {
var params = new URLSearchParams(window.location.search);
var designId = params.get('design');
var payment = params.get('payment');
if (!designId || payment !== 'success') return;
checkEntitlement(designId).then(function (entitlement) {
if (!entitlement.active) return;
window.localStorage.setItem(DESIGN_ID_KEY, designId);
window.localStorage.setItem(EVER_PAID_KEY, '1');
var banner = document.createElement('div');
banner.className = 'paywall-unlocked-banner';
banner.textContent = 'Your Event Pass is active - enjoy 30 days of full editing access.';
document.body.appendChild(banner);
setTimeout(function () { banner.remove(); }, 6000);
loadAndEnterDesign(designId);
});
}

function showRecoverPrompt() {
var overlay = document.createElement('div');
overlay.className = 'paywall-overlay';
overlay.innerHTML =
'<div class="paywall-modal">' +
'<h2>Continue My Event</h2>' +
'<p>Enter the email you used before and we will send you a link back to your design.</p>' +
'<label class="paywall-label">Email</label>' +
'<input type="email" class="paywall-email" placeholder="you@example.com" />' +
'<div class="paywall-error"></div>' +
'<button type="button" class="btn-primary paywall-submit">Send Me My Link</button>' +
'<button type="button" class="btn-link paywall-cancel">Close</button>' +
'</div>';
document.body.appendChild(overlay);
var emailInput = overlay.querySelector('.paywall-email');
var errorBox = overlay.querySelector('.paywall-error');
var submitBtn = overlay.querySelector('.paywall-submit');
overlay.querySelector('.paywall-cancel').addEventListener('click', function () { overlay.remove(); });
submitBtn.addEventListener('click', function () {
var email = emailInput.value.trim();
if (!email || email.indexOf('@') === -1) {
errorBox.textContent = 'Please enter a valid email address.';
return;
}
errorBox.textContent = '';
submitBtn.disabled = true;
submitBtn.textContent = 'Sending...';
requestRecoveryLink(email).then(function () {
errorBox.style.color = '#1e8e3e';
errorBox.textContent = 'If that email has a paid design, we just emailed a link to continue editing it.';
submitBtn.textContent = 'Send Me My Link';
submitBtn.disabled = false;
}).catch(function (err) {
errorBox.style.color = '';
errorBox.textContent = err.message || 'Something went wrong. Please try again.';
submitBtn.textContent = 'Send Me My Link';
submitBtn.disabled = false;
});
});
}

function checkRecoverParam() {
var params = new URLSearchParams(window.location.search);
if (params.get('recover') === '1') showRecoverPrompt();
}

function tryInstall(attempts) {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    if (window.FriendlyBridge) {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          installPaywallGate();
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                injectStyles();
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      checkReturnFromCheckout();
checkRecoveryToken();
checkRecoverParam();
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            return;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    if (attempts > 200) return;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        setTimeout(function () { tryInstall(attempts + 1); }, 50);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            tryInstall(0);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            })();
