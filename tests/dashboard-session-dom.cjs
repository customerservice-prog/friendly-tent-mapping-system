// Actual browser modules in JSDOM. Fetch fixtures model an opaque browser cookie;
// backend cookie, signature, Origin and CSRF enforcement has separate API tests.
const { test } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '..'), START = Date.parse('2026-09-26T02:00:00Z'), MINUTE = 60000;
const EVENT_KEY = 'rentsketch_dashboard_event';
const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r)); };
function metadata(id = 'session-a', expires = START + 8 * 60 * MINUTE) { return { id, csrfToken: 'isolated-csrf-' + id, expiresAt: new Date(expires).toISOString(), idleTimeoutSeconds: 1800 }; }
function response(data, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => data }; }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function harness(surface = 'session', options = {}) {
  const file = surface === 'account' ? 'dashboard/account.html' : surface === 'platform' ? 'dashboard/platform.html' : surface === 'designer' ? 'designer/index.html' : 'dashboard/index.html';
  const url = options.url || (surface === 'account' ? 'https://rentsketch.com/dashboard/account.html' : surface === 'platform' ? 'https://rentsketch.com/dashboard/platform.html#users' : surface === 'designer' ? 'https://rentsketch.com/designer/?tenant=generic&admin=1' : 'https://rentsketch.com/dashboard/?tenantView=1#/requests');
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', err => { if (!/Not implemented: navigation/i.test(err.message)) errors.push(err.message); });
  const dom = new JSDOM(fs.readFileSync(path.join(root, file), 'utf8'), { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window, calls = [], intervals = new Map();
  let now = START, intervalId = 0, serverSession = options.session === undefined ? metadata() : options.session;
  const initialSession = serverSession;
  w.Date.now = () => now;
  w.setInterval = fn => { intervals.set(++intervalId, fn); return intervalId; }; w.clearInterval = id => intervals.delete(id);
  w.AbortController = AbortController; w.Headers = Headers;
  w.RENTSKETCH_API_URL = 'https://api.example.invalid'; w.alert = () => {}; w.confirm = () => false;
  w.localStorage.setItem('rentsketch_dashboard_tenant', 'friendly'); w.localStorage.setItem('rentsketch_active_tenant', 'friendly');
  if (options.legacy) { w.localStorage.setItem('rentsketch_dashboard_token', 'legacy-jwt-must-be-discarded'); w.localStorage.setItem('rentsketch_dashboard_session', JSON.stringify({ lastActivity: now })); }
  const user = { id: 'staff-1', email: 'private-owner@example.invalid', displayName: 'PRIVATE OWNER', isPlatformAdmin: surface === 'platform' || surface === 'designer' };
  const tenant = { slug: 'friendly', name: 'PRIVATE BUSINESS', role: 'admin' };
  function identityResponse() { return { user, tenants: [tenant], session: serverSession }; }
  w.fetch = async (url, opts = {}) => {
    const resolved = new URL(url, w.location.href), headers = Object.fromEntries(new Headers(opts.headers || {}).entries());
    const apiPath = resolved.pathname.replace(/^\/staff-api/, '');
    const call = { url: String(url), path: apiPath, headers, method: opts.method || 'GET', body: opts.body, opts };
    calls.push(call);
    if (options.respond) { const custom = await options.respond(call); if (custom !== undefined) return custom; }
    if (resolved.pathname.startsWith('/staff-api/')) {
      assert.equal(resolved.origin, w.location.origin); assert.equal(opts.credentials, 'same-origin');
      assert.equal(headers['x-rentsketch-client'], 'dashboard'); assert.equal(headers.authorization, undefined);
    }
    if (apiPath === '/api/auth/login' && options.mfa) return response({ mfaRequired: true, challengeToken: 'isolated-mfa-challenge', expiresAt: new Date(now + 5 * MINUTE).toISOString() });
    if (apiPath === '/api/auth/login' || apiPath === '/api/auth/login/mfa') {
      if (apiPath.endsWith('/mfa')) { const body = JSON.parse(opts.body); assert.equal(body.challengeToken, 'isolated-mfa-challenge'); if (body.code !== '123456' && body.code !== 'abcd1234-abcd1234-abcd1234-abcd1234') return response({ error: 'Code not accepted' }, 401); }
      serverSession = metadata('session-new'); return response(identityResponse());
    }
    if (apiPath === '/api/consumer/event-pass/offer') return response(resolved.pathname.startsWith('/staff-api/') && serverSession ? { required: false, adminAccess: true } : { required: true, adminAccess: false, priceCents: 999, durationDays: 30 });
    if (!serverSession || Date.parse(serverSession.expiresAt) <= now) return response({ error: 'Sign in required' }, 401);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(call.method)) assert.equal(headers['x-rentsketch-csrf'], serverSession.csrfToken);
    if (apiPath === '/api/auth/me') return response(identityResponse());
    if (apiPath === '/api/auth/logout' || apiPath === '/api/auth/change-password') { serverSession = null; return response({ ok: true }); }
    if (apiPath === '/api/auth/heartbeat') return response({ ok: true });
    if (apiPath === '/api/admin/users') return response({ users: [{ id: user.id, email: user.email, display_name: user.displayName, is_platform_admin: true, memberships: [] }] });
    if (apiPath === '/api/tenants/friendly/quote-requests') return response({ quoteRequests: [{ id: 'private-request', customer_name: 'PRIVATE CUSTOMER', customer_email: 'private-customer@example.invalid', status: 'new', estimate_total: 125 }] });
    if (apiPath === '/api/tenants/friendly/admin') return response({ name: tenant.name, contactEmail: 'private-office@example.invalid', allowedOrigins: [] });
    if (apiPath === '/api/tenants/friendly/designs') return response({ designs: [] });
    if (apiPath === '/api/tenants/friendly/products') return response({ products: [] });
    if (apiPath === '/api/tenants/friendly/connect/status') return response({ status: 'not_connected', hasAccount: false });
    throw new Error('Unexpected isolated API: ' + call.method + ' ' + call.url);
  };
  const evalFile = file => w.eval(fs.readFileSync(path.join(root, file), 'utf8'));
  await flush(); evalFile('js/ui/dashboard-session.js');
  if (surface === 'designer') {
    w.RENTSKETCH_CATALOG_READY = true;
    w.FriendlyBridge = { getScene: () => ({ tentId: 'pole-20x20', objects: [] }), loadScene: () => true, refreshAll() {}, state: {} };
    w.RentSketchStartAutosave = () => ({ flush: async () => 'isolated-design', getSessionId: () => 'isolated-owner', adopt() {} });
    evalFile('js/ui/paywall.js');
  } else if (surface !== 'session') evalFile(surface === 'account' ? 'dashboard/account.js' : surface === 'platform' ? 'dashboard/platform.js' : 'dashboard/app.js');
  else if (!options.deferDiscovery) await w.RentSketchDashboardSession.ready();
  await flush();
  return { w, dom, calls, errors, initialSession, session: w.RentSketchDashboardSession,
    close() { dom.window.close(); }, advance(ms) { now += ms; for (const fn of [...intervals.values()]) fn(); },
    activity() { w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true })); },
    accept(value) { serverSession = value; w.RentSketchDashboardSession.accept(value); },
    setServer(value) { serverSession = value; },
    otherTab(kind, value) {
      const id = value ? value.id : w.RentSketchDashboardSession.identity(); serverSession = value;
      w.dispatchEvent(new w.StorageEvent('storage', { key: EVENT_KEY, newValue: JSON.stringify({ kind, id, at: now, nonce: 'isolated-tab' }), storageArea: w.localStorage }));
    }
  };
}
function noPrivateContent(t) { assert.doesNotMatch(t.w.document.body.textContent, /PRIVATE (?:OWNER|BUSINESS|CUSTOMER)|private-(?:owner|customer|office)@example\.invalid/); }
function noStoredCredentials(t) {
  for (const storage of [t.w.localStorage, t.w.sessionStorage]) {
    for (let i = 0; i < storage.length; i++) { const value = storage.getItem(storage.key(i)); assert.doesNotMatch(value, /isolated-csrf-|legacy-jwt|csrfToken|Bearer/); }
  }
  assert.equal(t.w.localStorage.getItem('rentsketch_dashboard_token'), null);
  assert.equal(t.w.localStorage.getItem('rentsketch_dashboard_session'), null);
}

test('explicit login waits for old-cookie revocation before showing credentials', async () => {
  for (const suffix of ['#/login', '']) {
    const gate = deferred(), t = await harness('tenant', { url: 'https://rentsketch.com/dashboard/' + suffix, respond: c => c.path === '/api/auth/logout' ? gate.promise : undefined });
    try {
      assert.equal(t.w.document.querySelector('#loginForm'), null); noPrivateContent(t);
      assert.ok(t.calls.find(c => c.path === '/api/auth/logout'));
      assert.ok(t.calls.every(c => ['/api/auth/me', '/api/auth/logout'].includes(c.path)));
      gate.resolve(response({ ok: true })); await flush();
      assert.ok(t.w.document.querySelector('#loginForm')); assert.equal(t.session.identity(), ''); noStoredCredentials(t);
    } finally { gate.resolve(response({ ok: true })); t.close(); }
  }
});

test('legacy web-storage credentials cannot authenticate a missing or expired cookie', async () => {
  for (const cookie of [null, metadata('expired', START)]) {
    for (const surface of ['tenant', 'platform']) {
      const t = await harness(surface, { session: cookie, legacy: true });
      try { assert.equal(t.session.identity(), ''); assert.ok(!t.calls.some(c => /\/api\/(?:admin|tenants)\//.test(c.path))); noPrivateContent(t); noStoredCredentials(t); assert.deepEqual(t.errors, []); }
      finally { t.close(); }
    }
  }
});

test('password login uses same-origin cookie transport with no bearer token', async () => {
  const t = await harness('tenant', { session: null, url: 'https://rentsketch.com/dashboard/?tenantView=1#/login' });
  try {
    t.w.document.querySelector('#loginEmail').value = 'staff@example.invalid'; t.w.document.querySelector('#loginPassword').value = 'isolated-password';
    t.w.document.querySelector('#loginForm').dispatchEvent(new t.w.Event('submit', { bubbles: true, cancelable: true })); await flush();
    assert.equal(t.session.identity(), 'session-new'); assert.ok(t.w.document.querySelector('#tenantShell')); noStoredCredentials(t);
    const login = t.calls.find(c => c.path === '/api/auth/login'); assert.equal(login.url, '/staff-api/api/auth/login'); assert.equal(login.opts.credentials, 'same-origin');
    assert.equal(login.headers.authorization, undefined); assert.deepEqual(t.errors, []);
  } finally { t.close(); }
});

test('MFA challenges show only the code form and accept authenticator or recovery codes', async () => {
  for (const code of ['123456', 'abcd1234-abcd1234-abcd1234-abcd1234']) {
    const t = await harness('tenant', { session: null, mfa: true, url: 'https://rentsketch.com/dashboard/?tenantView=1#/login' });
    try {
      t.w.document.querySelector('#loginEmail').value = 'staff@example.invalid'; t.w.document.querySelector('#loginPassword').value = 'isolated-password';
      t.w.document.querySelector('#loginForm').dispatchEvent(new t.w.Event('submit', { bubbles: true, cancelable: true })); await flush();
      assert.equal(t.session.identity(), ''); assert.equal(t.w.document.querySelector('#loginPassword'), null); assert.ok(t.w.document.querySelector('#mfaForm'));
      assert.ok(!t.calls.some(c => /\/api\/(?:admin|tenants)\//.test(c.path)));
      t.w.document.querySelector('#mfaCode').value = code; t.w.document.querySelector('#mfaForm').dispatchEvent(new t.w.Event('submit', { bubbles: true, cancelable: true })); await flush();
      assert.equal(t.session.identity(), 'session-new'); assert.ok(t.w.document.querySelector('#tenantShell')); noStoredCredentials(t); assert.deepEqual(t.errors, []);
    } finally { t.close(); }
  }
});

test('logout clears private UI immediately and sends the original CSRF without readable auth credentials', async () => {
  for (const surface of ['tenant', 'platform']) {
    const gate = deferred(), t = await harness(surface, { respond: c => c.path === '/api/auth/logout' ? gate.promise : undefined });
    try {
      assert.match(t.w.document.body.textContent, /PRIVATE (?:CUSTOMER|OWNER)/);
      t.w.document.querySelector(surface === 'tenant' ? '#btnLogout' : '#pcLogout').click(); noPrivateContent(t); assert.equal(t.session.identity(), ''); await flush();
      const revoke = t.calls.find(c => c.path === '/api/auth/logout'); assert.equal(revoke.headers['x-rentsketch-csrf'], t.initialSession.csrfToken); assert.equal(revoke.headers.authorization, undefined);
      assert.equal(revoke.method, 'POST'); assert.equal(revoke.opts.keepalive, true); noStoredCredentials(t);
      gate.resolve(response({ ok: true })); await flush(); noPrivateContent(t); assert.deepEqual(t.errors, []);
    } finally { gate.resolve(response({ ok: true })); t.close(); }
  }
});

test('idle expiry immediately locks private pages while real activity sends a CSRF heartbeat', async () => {
  const t = await harness('tenant');
  try {
    t.advance(25 * MINUTE); t.activity(); await flush();
    assert.ok(t.calls.some(c => c.path === '/api/auth/heartbeat' && c.method === 'POST' && c.headers['x-rentsketch-csrf'] === t.initialSession.csrfToken));
    t.advance(30 * MINUTE - 1); assert.equal(t.session.identity(), t.initialSession.id);
    t.advance(1); assert.equal(t.session.identity(), ''); noPrivateContent(t); await flush(); assert.deepEqual(t.errors, []);
  } finally { t.close(); }
});

test('activity cannot extend absolute session expiry', async () => {
  const t = await harness('session', { session: metadata('short', START + 60 * MINUTE) });
  try { t.advance(25 * MINUTE); t.activity(); await flush(); t.advance(25 * MINUTE); t.activity(); await flush(); t.advance(10 * MINUTE); assert.equal(t.session.identity(), ''); }
  finally { t.close(); }
});

test('logout in another tab immediately erases private dashboards', async () => {
  for (const surface of ['tenant', 'platform']) {
    const t = await harness(surface);
    try { assert.match(t.w.document.body.textContent, /PRIVATE (?:CUSTOMER|OWNER)/); t.otherTab('signed-out', null); noPrivateContent(t); await flush(); noPrivateContent(t); assert.equal(t.calls.some(c => c.path === '/api/auth/logout'), false); assert.deepEqual(t.errors, []); }
    finally { t.close(); }
  }
});

test('late protected responses cannot repaint after logout or clear a newer cookie session', async () => {
  for (const surface of ['tenant', 'platform']) {
    const gate = deferred(), endpoint = surface === 'tenant' ? '/api/tenants/friendly/quote-requests' : '/api/admin/users';
    const t = await harness(surface, { respond: c => c.path === endpoint ? gate.promise : undefined });
    try {
      t.otherTab('signed-out', null); t.accept(metadata('replacement'));
      gate.resolve(response({ error: 'Old session expired' }, 401)); await flush();
      assert.equal(t.session.identity(), 'replacement'); noPrivateContent(t); assert.deepEqual(t.errors, []);
    } finally { gate.resolve(response({})); t.close(); }
  }
});

test('in-flight discovery cannot resurrect a session after it has been cleared', async () => {
  const gate = deferred(), t = await harness('session', { deferDiscovery: true, respond: c => c.path === '/api/auth/me' ? gate.promise : undefined });
  try {
    const discovering = t.session.ready(); await flush(); await t.session.clear('signed-out', false);
    gate.resolve(response({ session: metadata(), user: {}, tenants: [] }));
    await assert.rejects(discovering, error => error.sessionChanged === true); assert.equal(t.session.identity(), '');
  } finally { gate.resolve(response({}, 401)); t.close(); }
});

test('a late logout CSRF rejection cannot poison a newer accepted login', async () => {
  const gate = deferred(), t = await harness('session', { respond: c => c.path === '/api/auth/logout' ? gate.promise : undefined });
  try {
    const clearing = t.session.clear('signed-out'); await flush(); t.accept(metadata('new-during-logout'));
    gate.resolve(response({ error: 'Old CSRF does not match the new cookie' }, 403)); await clearing;
    assert.equal((await t.session.ready()).id, 'new-during-logout');
    assert.equal((await t.session.json('/api/auth/me')).session.id, 'new-during-logout');
  } finally { gate.resolve(response({}, 403)); t.close(); }
});

test('a login tab discovers a new cookie from another tab without revoking it or showing private UI', async () => {
  const t = await harness('tenant', { session: null, url: 'https://rentsketch.com/dashboard/#/login' });
  try { t.otherTab('signed-in', metadata('other-tab')); await flush(); assert.equal(t.session.identity(), 'other-tab'); assert.ok(t.w.document.querySelector('#loginForm')); assert.equal(t.calls.some(c => c.path === '/api/auth/logout'), false); noPrivateContent(t); noStoredCredentials(t); }
  finally { t.close(); }
});

function fillPasswordForm(t) { t.w.document.querySelector('#current').value = 'old-password-fixture'; t.w.document.querySelector('#next').value = 'new-password-fixture'; t.w.document.querySelector('#confirm').value = 'new-password-fixture'; }
function submitPasswordForm(t) { t.w.document.querySelector('#f').dispatchEvent(new t.w.Event('submit', { bubbles: true, cancelable: true })); }
function assertPasswordFormLocked(t) { for (const input of t.w.document.querySelectorAll('#f input[type="password"]')) { assert.equal(input.value, ''); assert.equal(input.disabled, true); } assert.equal(t.w.document.querySelector('#save').disabled, true); }

test('account password fields reset and lock when session changes or page enters history', async () => {
  for (const action of ['logout', 'pagehide']) {
    const t = await harness('account');
    try { fillPasswordForm(t); if (action === 'logout') t.otherTab('signed-out', null); else t.w.dispatchEvent(new t.w.PageTransitionEvent('pagehide', { persisted: true })); assertPasswordFormLocked(t); submitPasswordForm(t); await flush(); assert.equal(t.calls.some(c => c.path === '/api/auth/change-password'), false); assert.deepEqual(t.errors, []); }
    finally { t.close(); }
  }
});

test('password changes use current-cookie CSRF and current success clears the UI session', async () => {
  const t = await harness('account');
  try {
    t.accept(metadata('account-current')); fillPasswordForm(t); submitPasswordForm(t); await flush();
    const call = t.calls.find(c => c.path === '/api/auth/change-password'); assert.ok(call); assert.equal(call.headers['x-rentsketch-csrf'], metadata('account-current').csrfToken); assert.equal(call.headers.authorization, undefined);
    assert.equal(t.session.identity(), ''); assertPasswordFormLocked(t); assert.match(t.w.document.querySelector('#msg').textContent, /Password changed.*Sign in again/i); assert.deepEqual(t.errors, []);
  } finally { t.close(); }
});

test('late password-change success or failure cannot clear a newer session', async () => {
  for (const status of [200, 401]) {
    const gate = deferred(), t = await harness('account', { respond: c => c.path === '/api/auth/change-password' ? gate.promise : undefined });
    try { fillPasswordForm(t); submitPasswordForm(t); await flush(); t.accept(metadata('new-after-submit')); gate.resolve(response(status === 200 ? { ok: true } : { error: 'Old session expired' }, status)); await flush(); assert.equal(t.session.identity(), 'new-after-submit'); assert.doesNotMatch(t.w.document.querySelector('#msg').textContent, /Password changed|Old session expired/); assert.deepEqual(t.errors, []); }
    finally { gate.resolve(response({})); t.close(); }
  }
});
test('Caddy configuration isolates no-store dashboard CSP from the embeddable designer', () => {
  // Static configuration regression. This does not claim deployed-header verification.
  const caddy = fs.readFileSync(path.join(root, 'Caddyfile'), 'utf8');
  const dashboardMatcher = caddy.match(/^\s*@dashboardAssets\s+path\s+([^\n]+)/m);
  assert.ok(dashboardMatcher);
  assert.deepEqual(dashboardMatcher[1].trim().split(/\s+/), ['/dashboard', '/dashboard/*']);
  const dashboardHeaders = caddy.match(/header\s+@dashboardAssets\s*\{([^}]+)\}/)?.[1];
  assert.ok(dashboardHeaders, 'dashboard response policy must be an explicit scoped block');
  assert.match(dashboardHeaders, /Cache-Control\s+"no-store"/);
  assert.match(dashboardHeaders, /X-Frame-Options\s+"DENY"/);
  const csp = dashboardHeaders.match(/Content-Security-Policy\s+"([^"]+)"/)?.[1];
  assert.ok(csp);
  const directives = Object.fromEntries(csp.split(';').map(s => s.trim().split(/\s+/)).filter(a => a[0]).map(([key, ...values]) => [key, values]));
  assert.deepEqual(directives['script-src'], ["'self'"], 'dashboard must not allow inline scripts or arbitrary script hosts');
  assert.deepEqual(directives['frame-ancestors'], ["'none'"]);
  assert.deepEqual(directives['object-src'], ["'none'"]);
  assert.deepEqual(directives['base-uri'], ["'none'"]);
  assert.deepEqual(directives['form-action'], ["'self'"]);
  const publicMatcher = caddy.match(/^\s*@publicPages\s+not\s+path\s+([^\n]+)/m);
  assert.ok(publicMatcher);
  assert.deepEqual(publicMatcher[1].trim().split(/\s+/), ['/dashboard', '/dashboard/*'], 'public CSP must not overwrite strict dashboard policy');
  assert.match(caddy, /header\s+@publicPages\s+Content-Security-Policy/);
  const designerMatcher = caddy.match(/^\s*@designer\s+path\s+([^\n]+)/m)?.[1];
  assert.ok(designerMatcher?.includes('/designer/*'));
  assert.ok(!designerMatcher.split(/\s+/).includes('/dashboard/*'), 'designer revalidation must not override dashboard no-store');
  assert.match(caddy, /header\s+@designer\s+Cache-Control\s+"no-cache"/);
});

test('all dashboard HTML pages use same-origin external scripts and no executable HTML attributes', () => {
  const files = fs.readdirSync(path.join(root, 'dashboard')).filter(file => file.endsWith('.html'));
  assert.ok(files.includes('account.html')); assert.ok(files.includes('reset-password.html'));
  for (const file of files) {
    const url = 'https://rentsketch.com/dashboard/' + file;
    const dom = new JSDOM(fs.readFileSync(path.join(root, 'dashboard', file), 'utf8'), { url });
    try {
      const scripts = [...dom.window.document.querySelectorAll('script')];
      assert.ok(scripts.length > 0, file + ': expected external application scripts');
      for (const script of scripts) {
        assert.equal(script.textContent.trim(), '', file + ': inline script conflicts with dashboard CSP');
        const src = script.getAttribute('src'); assert.ok(src, file + ': executable script must have an external source');
        const sourceUrl = new URL(src, url);
        assert.equal(sourceUrl.origin, 'https://rentsketch.com');
        assert.ok(fs.statSync(path.join(root, sourceUrl.pathname)).isFile(), file + ': script file must exist');
      }
      for (const element of dom.window.document.querySelectorAll('*')) {
        for (const attribute of element.attributes) {
          assert.equal(/^on/i.test(attribute.name), false, file + ': inline event handlers are forbidden');
          if (['href', 'src', 'action', 'formaction', 'xlink:href'].includes(attribute.name)) {
            assert.doesNotMatch(attribute.value.replace(/[\u0000-\u0020]/g, ''), /^(?:javascript:|vbscript:|data:text\/html)/i);
          }
        }
      }
    } finally { dom.window.close(); }
  }
});

test('a session change while response JSON is pending discards both late success and late 401', async () => {
  for (const status of [200, 401]) {
    const gate = deferred(), t = await harness('session', { respond: c => c.path === '/api/tenants/friendly/products' ? { ok: status === 200, status, json: () => gate.promise } : undefined });
    try {
      const loading = t.session.json('/api/tenants/friendly/products'); await flush();
      t.accept(metadata('new-during-json')); gate.resolve(status === 200 ? { products: [{ name: 'PRIVATE CUSTOMER' }] } : { error: 'Old session expired' });
      await assert.rejects(loading, error => error.sessionChanged === true);
      assert.equal(t.session.identity(), 'new-during-json'); noStoredCredentials(t);
    } finally { gate.resolve({}); t.close(); }
  }
});

test('designer cookie access ends synchronously on logout and resumes only after fresh server discovery', async () => {
  const t = await harness('designer');
  try {
    assert.equal(t.w.RentSketchEventPass.canEdit(), true); assert.equal(t.w.document.body.classList.contains('rs-platform-admin'), true);
    t.otherTab('signed-out', null);
    assert.equal(t.w.RentSketchEventPass.canEdit(), false); assert.equal(t.w.document.body.classList.contains('rs-platform-admin'), false);
    await flush();
    const bar = t.w.document.querySelector('#eventPassBar'); assert.equal(bar.hidden, false); assert.match(bar.textContent, /Admin session ended/); assert.equal(bar.querySelector('[data-buy-pass]'), null);
    await t.w.RentSketchEventPass.requestAccess(); assert.match(t.w.document.querySelector('.paywall-overlay').textContent, /Sign in to continue editing/);
    t.otherTab('signed-in', metadata('designer-new-cookie')); await flush();
    assert.equal(t.w.RentSketchEventPass.canEdit(), true); assert.equal(t.w.document.body.classList.contains('rs-platform-admin'), true); assert.equal(t.w.document.querySelector('.paywall-overlay'), null);
    noStoredCredentials(t); assert.deepEqual(t.errors, []);
  } finally { t.close(); }
});

test('cross-tab logout also invalidates initial discovery before this tab knows its session ID', async () => {
  const gate = deferred(), t = await harness('session', { deferDiscovery: true, respond: c => c.path === '/api/auth/me' ? gate.promise : undefined });
  try {
    const discovering = t.session.ready(); await flush();
    t.w.dispatchEvent(new t.w.StorageEvent('storage', { key: EVENT_KEY, newValue: JSON.stringify({ kind: 'signed-out', id: 'session-a', at: START }), storageArea: t.w.localStorage }));
    gate.resolve(response({ session: metadata(), user: {}, tenants: [] }));
    await assert.rejects(discovering, error => error.sessionChanged === true); assert.equal(t.session.identity(), '');
  } finally { gate.resolve(response({}, 401)); t.close(); }
});
