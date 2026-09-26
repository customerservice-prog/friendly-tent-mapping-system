// Dashboard session UX. The API independently enforces expiry and revocation.
(function () {
  'use strict';
  var TOKEN = 'rentsketch_dashboard_token';
  var META = 'rentsketch_dashboard_session';
  var IDLE = 30 * 60 * 1000;
  var lastWrite = 0, lastCheck = 0, checking = false;
  function read(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function write(key, value) { try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch (_) {} }
  function claims(token) {
    try {
      var part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')));
    } catch (_) { return null; }
  }
  function meta() { try { return JSON.parse(read(META) || 'null'); } catch (_) { return null; } }
  function announce(reason) { window.dispatchEvent(new CustomEvent('rentsketch:dashboardSessionChanged', { detail: { reason: reason } })); }
  function clear(reason, revoke, expectedToken) {
    var token = read(TOKEN);
    if(expectedToken && token !== expectedToken) return;
    write(TOKEN, null); write(META, null);
    write('rentsketch_dashboard_tenant', null); write('rentsketch_active_tenant', null);
    if (token && revoke !== false) {
      // Clear private UI immediately; a slow network must not postpone logout.
      fetch((window.RENTSKETCH_API_URL || 'https://rentsketch-api-production.up.railway.app') + '/api/auth/logout', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token }, cache: 'no-store', keepalive: true
      }).catch(function () {});
    }
    if (token) announce(reason || 'signed-out');
  }
  function getToken() {
    var token = read(TOKEN); if (!token) return '';
    var data = claims(token), session = meta(), now = Date.now();
    if (!data || data.kind !== 'dashboard_session' || !Number.isFinite(data.exp) || data.exp * 1000 <= now) {
      clear('expired',true,token); return '';
    }
    if (!session || !Number.isFinite(session.lastActivity) || now - session.lastActivity >= IDLE) {
      clear('idle',true,token); return '';
    }
    return token;
  }
  function accept(token) {
    var data = claims(token);
    if (!data || data.kind !== 'dashboard_session' || !Number.isFinite(data.exp) || data.exp * 1000 <= Date.now()) throw Error('Sign-in did not return a valid session. Please try again.');
    write(META, JSON.stringify({ lastActivity: Date.now(), expiresAt: data.exp * 1000 }));
    write(TOKEN, token); lastWrite = Date.now(); lastCheck = Date.now();
    announce('signed-in');
  }
  function unauthorized(token) { if (token && read(TOKEN) === token) clear('expired', false); }
  function activity() {
    var token = getToken(); if (!token || document.visibilityState === 'hidden') return;
    var now = Date.now();
    if (now - lastWrite > 15000) {
      var session = meta(); if(!session) return; session.lastActivity = now; write(META, JSON.stringify(session)); lastWrite = now;
    }
    // Only real interaction keeps an otherwise quiet editor session active.
    if (checking || now - lastCheck < 5 * 60 * 1000) return;
    checking = true; lastCheck = now;
    fetch((window.RENTSKETCH_API_URL || 'https://rentsketch-api-production.up.railway.app') + '/api/auth/me', {
      headers: { Authorization: 'Bearer ' + token }, cache: 'no-store'
    }).then(function (response) { if (response.status === 401) unauthorized(token); }).catch(function () {}).finally(function () { checking = false; });
  }
  window.RentSketchDashboardSession = { getToken: getToken, accept: accept, clear: clear, unauthorized: unauthorized };
  window.addEventListener('storage', function (event) {
    if (event.key === TOKEN || event.key === null) announce(read(TOKEN) ? 'changed' : 'signed-out');
  });
  document.addEventListener('pointerdown', activity, { passive: true });
  document.addEventListener('keydown', activity, { passive: true });
  window.addEventListener('pageshow', function () { getToken(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState !== 'hidden') getToken(); });
  setInterval(getToken, 15000);
  getToken();
})();
