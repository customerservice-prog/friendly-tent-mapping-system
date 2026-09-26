// Authentication stays in a Secure HttpOnly cookie. This module stores only UI
// session metadata in memory; the API remains authoritative for every request.
(function () {
  'use strict';
  var EVENT_KEY = 'rentsketch_dashboard_event';
  var current = null, generation = 0, initialized = false, discovery = null, lastAuthenticatedId = '';
  var pendingRevoke = Promise.resolve(), lastBroadcast = 0, lastHeartbeat = 0, heartbeating = false;
  function remove(key) { try { localStorage.removeItem(key); } catch (_) {} }
  // Invalidate credentials from older releases. Never read or reuse them.
  remove('rentsketch_dashboard_token'); remove('rentsketch_dashboard_session');
  function announce(reason) { window.dispatchEvent(new CustomEvent('rentsketch:dashboardSessionChanged', { detail: { reason: reason, id: current && current.id || '' } })); }
  function broadcast(kind, id, at) {
    try { localStorage.setItem(EVENT_KEY, JSON.stringify({ kind: kind, id: id, at: at || Date.now(), nonce: Math.random().toString(36).slice(2) })); } catch (_) {}
  }
  function stale() { var error = new Error('Your session changed. Sign in again.'); error.status = 401; error.sessionChanged = true; return error; }
  function normalize(value) {
    var expiry = value && (typeof value.expiresAt === 'number' ? value.expiresAt : Date.parse(value.expiresAt));
    if (!value || typeof value.id !== 'string' || !value.id || typeof value.csrfToken !== 'string' || !value.csrfToken || !Number.isFinite(expiry) || expiry <= Date.now()) throw new Error('Sign-in did not return a valid session. Please try again.');
    return { id: value.id, csrfToken: value.csrfToken, expiresAt: expiry, idleTimeoutSeconds: Math.min(1800, Number(value.idleTimeoutSeconds) || 1800), lastActivity: Date.now() };
  }
  function raw(path, options, session) {
    if (!/^\/api\//.test(path) || /[\\\r\n]/.test(path)) throw new Error('Invalid dashboard request path.');
    options = options || {};
    var method = String(options.method || 'GET').toUpperCase(), headers = new Headers(options.headers || {});
    headers.delete('Authorization'); headers.set('X-RentSketch-Client', 'dashboard');
    if (!/^(GET|HEAD|OPTIONS)$/.test(method) && session) headers.set('X-RentSketch-CSRF', session.csrfToken);
    return fetch('/staff-api' + path, Object.assign({}, options, { method: method, headers: headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error' }));
  }
  function getSession() {
    if (!current) return null;
    if (Date.now() >= current.expiresAt || Date.now() - current.lastActivity >= current.idleTimeoutSeconds * 1000) { clear('expired', true, current.id); return null; }
    return Object.assign({}, current);
  }
  function identity() { var value = getSession(); return value ? value.id : ''; }
  function accept(value) {
    current = normalize(value); lastAuthenticatedId = current.id; generation++; initialized = true; discovery = null; pendingRevoke = Promise.resolve();
    lastHeartbeat = Date.now(); lastBroadcast = 0;
    broadcast('signed-in', current.id); announce('signed-in'); return getSession();
  }
  function clear(reason, revoke, expectedId, fromOtherTab) {
    if (expectedId && (!current || current.id !== expectedId)) return Promise.resolve();
    var previous = current;
    current = null; generation++; initialized = true; discovery = null;
    remove('rentsketch_dashboard_tenant'); remove('rentsketch_active_tenant');
    if (previous) {
      if (!fromOtherTab) broadcast('signed-out', previous.id);
      announce(reason || 'signed-out');
    }
    if (previous && revoke !== false) {
      // Revoke only: the server deliberately does not delete a possibly newer
      // cookie when an older logout reply arrives late.
      pendingRevoke = pendingRevoke.catch(function () {}).then(function () {
        return raw('/api/auth/logout', { method: 'POST', keepalive: true }, previous).then(function (r) { if (!r.ok && r.status !== 401 && lastAuthenticatedId === previous.id) throw new Error('Sign-out could not be confirmed. Please retry.'); });
      });
      pendingRevoke.catch(function () {}); // UI expiry may clear without awaiting; explicit sign-in still awaits the failure.
    }
    return pendingRevoke;
  }
  function unauthorized(expectedId) { if (expectedId && current && current.id === expectedId) clear('expired', false, expectedId); }
  async function ready(options) {
    await pendingRevoke;
    if (discovery) return discovery;
    if (initialized && !(options && options.refresh)) return getSession();
    var expectedGeneration = generation;
    discovery = (async function () {
      var response = await raw('/api/auth/me', {}, null);
      var data = await response.json().catch(function () { return {}; });
      if (expectedGeneration !== generation) throw stale();
      if (response.status === 401) { current = null; initialized = true; return null; }
      if (!response.ok) { var error = new Error(data.error || 'Could not check your sign-in.'); error.status = response.status; throw error; }
      var previous = current;
      current = normalize(data.session); lastAuthenticatedId = current.id;
      if (previous && previous.id === current.id) current.lastActivity = previous.lastActivity;
      initialized = true; return getSession();
    })();
    var task = discovery;
    try { return await task; } finally { if (discovery === task) discovery = null; }
  }
  async function request(path, options) {
    var bootstrap = /^\/api\/auth\/(?:login(?:\/mfa)?|reset-password|forgot-password)$/.test(path) || path === '/api/business/signup';
    if (!bootstrap) await ready(); else await pendingRevoke;
    var session = getSession(), expectedGeneration = generation;
    var response = await raw(path, options, session);
    if (expectedGeneration !== generation) throw stale();
    if (response.status === 401 && session) unauthorized(session.id);
    return response;
  }
  async function json(path, options) {
    options = Object.assign({}, options || {});
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData) && !(options.body instanceof Blob)) {
      var headers = new Headers(options.headers || {}); headers.set('Content-Type', 'application/json'); options.headers = headers; options.body = JSON.stringify(options.body);
    }
    var response = await request(path, options), expectedGeneration = generation;
    var data = await response.json().catch(function () { return {}; });
    if (expectedGeneration !== generation) throw stale();
    if (!response.ok) { var error = new Error(data.error || ('Request failed (' + response.status + ')')); error.status = response.status; throw error; }
    return data;
  }
  function activity() {
    var session = getSession(); if (!session || document.visibilityState === 'hidden') return;
    current.lastActivity = Date.now();
    if (Date.now() - lastBroadcast > 15000) { broadcast('activity', session.id); lastBroadcast = Date.now(); }
    if (heartbeating || Date.now() - lastHeartbeat < 5 * 60 * 1000) return;
    heartbeating = true; lastHeartbeat = Date.now();
    request('/api/auth/heartbeat', { method: 'POST' }).catch(function () {}).finally(function () { heartbeating = false; });
  }
  window.RentSketchDashboardSession = { ready: ready, refresh: function () { return ready({ refresh: true }); }, getSession: getSession, identity: identity, accept: accept, clear: clear, unauthorized: unauthorized, request: request, json: json };
  window.addEventListener('storage', function (event) {
    if (event.key !== EVENT_KEY || !event.newValue) return;
    var value; try { value = JSON.parse(event.newValue); } catch (_) { return; }
    if (!value || typeof value.id !== 'string') return;
    if (value.kind === 'activity' && current && current.id === value.id && Number.isFinite(value.at) && value.at <= Date.now()) { current.lastActivity = Math.max(current.lastActivity, value.at); return; }
    if (value.kind === 'signed-out') { if(current && current.id !== value.id)return;clear('signed-out', false, current ? value.id : undefined, true); return; }
    if (value.kind === 'signed-in') {
      current = null; generation++; initialized = false; discovery = null; pendingRevoke = Promise.resolve(); announce('refreshing');
      ready({ refresh: true }).then(function () { announce(current ? 'changed' : 'signed-out'); }).catch(function () { announce('signed-out'); });
    }
  });
  document.addEventListener('pointerdown', activity, { passive: true }); document.addEventListener('keydown', activity, { passive: true });
  window.addEventListener('pageshow', function () { getSession(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState !== 'hidden') getSession(); });
  setInterval(getSession, 15000);
})();
