// Real session manager/dashboard/paywall code in JSDOM; all API responses isolated.
// JWTs here are UI fixtures only. Server signature/session validation has separate API tests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '..');
const TOKEN = 'rentsketch_dashboard_token';
const META = 'rentsketch_dashboard_session';
const START = Date.parse('2026-09-26T02:00:00Z');
const MINUTE = 60000;
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };
function jwt(id = 'session-a', expires = START + 8 * 60 * MINUTE, extra = {}) {
  return Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' +
    Buffer.from(JSON.stringify({ kind: 'dashboard_session', sub: 'staff-1', jti: id, exp: Math.floor(expires / 1000), ...extra })).toString('base64url') + '.isolated-ui-fixture';
}
function response(data, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => data }; }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function harness(surface = 'session', options = {}) {
  const file = surface === 'account' ? 'dashboard/account.html' : surface === 'platform' ? 'dashboard/platform.html' : surface === 'designer' ? 'designer/index.html' : 'dashboard/index.html';
  const url = options.url || (surface === 'account' ? 'https://rentsketch.com/dashboard/account.html' : surface === 'platform' ? 'https://rentsketch.com/dashboard/platform.html#users' : surface === 'designer' ? 'https://rentsketch.com/designer/?tenant=generic&admin=1' : 'https://rentsketch.com/dashboard/?tenantView=1#/requests');
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', err => { if (!/Not implemented: navigation/i.test(err.message)) errors.push(err.message); });
  const dom = new JSDOM(fs.readFileSync(path.join(root, file), 'utf8'), { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window, calls = [], intervals = new Map();
  let now = START, intervalId = 0;
  w.Date.now = () => now;
  w.setInterval = fn => { intervals.set(++intervalId, fn); return intervalId; };
  w.clearInterval = id => intervals.delete(id);
  w.AbortController = AbortController;
  w.RENTSKETCH_API_URL = 'https://api.example.invalid';
  w.alert = () => {}; w.confirm = () => false;
  const token = options.token === undefined ? jwt() : options.token;
  if (token) {
    w.localStorage.setItem(TOKEN, token);
    if (!options.omitMeta) w.localStorage.setItem(META, JSON.stringify({ lastActivity: options.lastActivity ?? now, expiresAt: now + 8 * 60 * MINUTE }));
    w.localStorage.setItem('rentsketch_dashboard_tenant', 'friendly');
    w.localStorage.setItem('rentsketch_active_tenant', 'friendly');
  }
  const user = { id: 'staff-1', email: 'private-owner@example.invalid', displayName: 'PRIVATE OWNER', isPlatformAdmin: surface === 'platform' || surface === 'designer' };
  const tenant = { slug: 'friendly', name: 'PRIVATE BUSINESS', role: 'admin' };
  w.fetch = async (url, opts = {}) => {
    const call = { url: String(url), path: new URL(url).pathname, headers: opts.headers || {}, method: opts.method || 'GET', body: opts.body, opts };
    calls.push(call);
    if (options.respond) { const custom = await options.respond(call); if (custom !== undefined) return custom; }
    if (call.path === '/api/auth/logout' || call.path === '/api/auth/change-password') return response({ ok: true });
    if (call.path === '/api/auth/login') return response({ token: options.loginToken || jwt('session-b') });
    if (call.path === '/api/auth/me') return response({ user, tenants: [tenant] });
    if (call.path === '/api/admin/users') return response({ users: [{ id: user.id, email: user.email, display_name: user.displayName, is_platform_admin: true, memberships: [] }] });
    if (call.path === '/api/tenants/friendly/quote-requests') return response({ quoteRequests: [{ id: 'request-private', customer_name: 'PRIVATE CUSTOMER', customer_email: 'private-customer@example.invalid', status: 'new', estimate_total: 125 }] });
    if (call.path === '/api/tenants/friendly/admin') return response({ name: tenant.name, contactEmail: 'private-office@example.invalid', allowedOrigins: [] });
    if (call.path === '/api/tenants/friendly/designs') return response({ designs: [] });
    if (call.path === '/api/tenants/friendly/products') return response({ products: [] });
    if (call.path === '/api/tenants/friendly/connect/status') return response({ status: 'not_connected', hasAccount: false });
    if (call.path === '/api/consumer/event-pass/offer') return response(call.headers.Authorization ? { required: false, adminAccess: true } : { required: true, adminAccess: false, priceCents: 999, durationDays: 30 });
    throw new Error('Unexpected isolated API: ' + call.method + ' ' + call.url);
  };
  const evalFile = file => w.eval(fs.readFileSync(path.join(root, file), 'utf8'));
  await flush(); // Native DOMContentLoaded has fired; boot exactly once per script.
  evalFile('js/ui/dashboard-session.js');
  if (surface === 'designer') {
    w.RENTSKETCH_CATALOG_READY = true;
    w.FriendlyBridge = { getScene: () => ({ tentId: 'pole-20x20', objects: [] }), loadScene: () => true, refreshAll() {}, state: {} };
    w.RentSketchStartAutosave = () => ({ flush: async () => 'isolated-design', getSessionId: () => 'isolated-owner', adopt() {} });
    evalFile('js/ui/paywall.js');
  } else if (surface !== 'session') evalFile(surface === 'account' ? 'dashboard/account.js' : surface === 'platform' ? 'dashboard/platform.js' : 'dashboard/app.js');
  await flush();
  return { w, dom, calls, errors, token, session: w.RentSketchDashboardSession,
    close() { dom.window.close(); },
    advance(ms) { now += ms; for (const fn of [...intervals.values()]) fn(); },
    activity() { w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true })); },
    removeFromOtherTab() {
      const oldValue = w.localStorage.getItem(TOKEN);
      w.localStorage.removeItem(TOKEN); w.localStorage.removeItem(META);
      w.dispatchEvent(new w.StorageEvent('storage', { key: TOKEN, oldValue, newValue: null, storageArea: w.localStorage }));
    }
  };
}
function noPrivateContent(t) {
  assert.doesNotMatch(t.w.document.body.textContent, /PRIVATE (?:OWNER|BUSINESS|CUSTOMER)|private-(?:owner|customer|office)@example\.invalid/);
}

test('explicit login revokes a remembered session and remains a login form without loading private endpoints', async () => {
  for (const suffix of ['#/login', '']) {
  const t = await harness('tenant', { url: 'https://rentsketch.com/dashboard/' + suffix });
  try {
    assert.ok(t.w.document.querySelector('#loginForm'));
    assert.equal(t.w.location.hash, '#/login');
    assert.equal(t.w.localStorage.getItem(TOKEN), null);
    assert.equal(t.calls.filter(c => c.path === '/api/auth/logout').length, 1);
    assert.deepEqual(t.calls.filter(c => c.path !== '/api/auth/logout'), []);
    noPrivateContent(t); assert.deepEqual(t.errors, []);
  } finally { t.close(); }
  }
});

test('legacy or metadata-less browser tokens cannot reopen either dashboard', async () => {
  for (const options of [{ token: null }, { token: 'legacy-long-lived-token' }, { token: jwt('wrong-kind', START + MINUTE, { kind: 'customer_access' }) }, { token: jwt('expired', START) }, { token: jwt(), omitMeta: true }]) {
    for (const surface of ['tenant', 'platform']) {
      const t = await harness(surface, options);
      try {
        assert.equal(t.session.getToken(), '');
        assert.ok(!t.calls.some(c => c.path === '/api/auth/me'));
        noPrivateContent(t); assert.deepEqual(t.errors, []);
      } finally { t.close(); }
    }
  }
});

test('new form login accepts the returned session and reaches authenticated workspace', async () => {
  const newToken = jwt('new-login');
  const t = await harness('tenant', { token: null, url: 'https://rentsketch.com/dashboard/?tenantView=1#/login', loginToken: newToken });
  try {
    t.w.document.querySelector('#loginEmail').value = 'staff@example.invalid';
    t.w.document.querySelector('#loginPassword').value = 'isolated-test-password';
    t.w.document.querySelector('#loginForm').dispatchEvent(new t.w.Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    assert.equal(t.session.getToken(), newToken);
    assert.ok(t.w.document.querySelector('#tenantShell'));
    assert.match(t.w.document.body.textContent, /PRIVATE BUSINESS/);
    assert.equal(t.calls.find(c => c.path === '/api/auth/me').headers.Authorization, 'Bearer ' + newToken);
    assert.equal(t.calls.some(c => c.path === '/api/auth/logout'), false);
    assert.deepEqual(t.errors, []);
  } finally { t.close(); }
});

test('logout clears private state before a slow server revoke completes, on both dashboards', async () => {
  for (const surface of ['tenant', 'platform']) {
    const gate = deferred();
    const t = await harness(surface, { respond: c => c.path === '/api/auth/logout' ? gate.promise : undefined });
    try {
      assert.match(t.w.document.body.textContent, /PRIVATE (?:CUSTOMER|OWNER)/);
      t.w.document.querySelector(surface === 'tenant' ? '#btnLogout' : '#pcLogout').click();
      assert.equal(t.w.localStorage.getItem(TOKEN), null);
      assert.equal(t.w.localStorage.getItem(META), null);
      assert.equal(t.w.localStorage.getItem('rentsketch_dashboard_tenant'), null);
      assert.equal(t.w.localStorage.getItem('rentsketch_active_tenant'), null);
      noPrivateContent(t);
      const revoke = t.calls.find(c => c.path === '/api/auth/logout');
      assert.equal(revoke.method, 'POST'); assert.equal(revoke.headers.Authorization, 'Bearer ' + t.token);
      assert.equal(revoke.opts.keepalive, true);
      gate.resolve(response({ ok: true })); await flush(); noPrivateContent(t);
      assert.deepEqual(t.errors, []);
    } finally { gate.resolve(response({ ok: true })); t.close(); }
  }
});

test('30-minute idle deadline locks an open private page without waiting for another request', async () => {
  const t = await harness('tenant');
  try {
    t.advance(30 * MINUTE - 1); assert.equal(t.session.getToken(), t.token);
    t.advance(1); noPrivateContent(t);
    assert.equal(t.session.getToken(), ''); assert.ok(t.w.document.querySelector('#loginForm'));
    assert.equal(t.calls.filter(c => c.path === '/api/auth/logout').length, 1);
    await flush(); assert.deepEqual(t.errors, []);
  } finally { t.close(); }
});

test('real activity extends idle time but never extends the token absolute expiry', async () => {
  const t = await harness('session', { token: jwt('short-absolute', START + 60 * MINUTE) });
  try {
    t.advance(25 * MINUTE); t.activity(); await flush();
    t.advance(25 * MINUTE); assert.equal(t.session.getToken(), t.token); t.activity(); await flush();
    t.advance(10 * MINUTE); assert.equal(t.session.getToken(), '');
    assert.equal(t.calls.filter(c => c.path === '/api/auth/logout').length, 1);
    assert.deepEqual(t.errors, []);
  } finally { t.close(); }
});

test('logout in another tab immediately erases rendered private dashboards', async () => {
  for (const surface of ['tenant', 'platform']) {
    const t = await harness(surface);
    try {
      assert.match(t.w.document.body.textContent, /PRIVATE (?:CUSTOMER|OWNER)/);
      t.removeFromOtherTab(); noPrivateContent(t);
      await flush(); noPrivateContent(t);
      assert.equal(t.calls.some(c => c.path === '/api/auth/logout'), false, 'the tab which logged out owns server revocation');
      assert.deepEqual(t.errors, []);
    } finally { t.close(); }
  }
});

test('private responses arriving after logout cannot repaint either dashboard', async () => {
  for (const surface of ['tenant', 'platform']) {
    const gate = deferred();
    const privatePath = surface === 'tenant' ? '/api/tenants/friendly/quote-requests' : '/api/admin/users';
    const t = await harness(surface, { respond: c => c.path === privatePath ? gate.promise : undefined });
    try {
      assert.ok(t.calls.some(c => c.path === privatePath));
      t.removeFromOtherTab(); noPrivateContent(t);
      gate.resolve(response(surface === 'tenant' ? { quoteRequests: [{ id: 'late', customer_name: 'PRIVATE CUSTOMER', customer_email: 'private-customer@example.invalid', status: 'new' }] } : { users: [{ id: 'late', display_name: 'PRIVATE OWNER', email: 'private-owner@example.invalid', memberships: [] }] }));
      await flush(); noPrivateContent(t); assert.deepEqual(t.errors, []);
    } finally { gate.resolve(response({})); t.close(); }
  }
});

test('an old failed identity response cannot revoke a newer accepted login', async () => {
  for (const surface of ['tenant', 'platform']) {
    const gate = deferred();
    const t = await harness(surface, { respond: c => c.path === '/api/auth/me' ? gate.promise : undefined });
    try {
      const newToken = jwt('session-replaced');
      t.session.accept(newToken);
      gate.resolve(response({ error: 'Old session expired' }, 401));
      await flush();
      assert.equal(t.session.getToken(), newToken, surface + ': stale request must not clear the new login');
      assert.equal(t.calls.some(c => c.path === '/api/auth/logout' && c.headers.Authorization === 'Bearer ' + newToken), false);
      noPrivateContent(t); assert.deepEqual(t.errors, []);
    } finally { gate.resolve(response({})); t.close(); }
  }
});

test('a late 401 for a replaced session cannot clear the session manager current token', async () => {
  const t = await harness();
  try {
    const fresh = jwt('session-fresh'); t.session.accept(fresh);
    t.session.unauthorized(t.token); assert.equal(t.session.getToken(), fresh);
    t.session.unauthorized(fresh); assert.equal(t.session.getToken(), '');
    assert.equal(t.calls.some(c => c.path === '/api/auth/logout'), false);
  } finally { t.close(); }
});

test('designer loses admin edit access immediately when dashboard session is removed', async () => {
  const t = await harness('designer');
  try {
    assert.equal(t.w.RentSketchEventPass.canEdit(), true);
    assert.equal(t.w.document.body.classList.contains('rs-platform-admin'), true);
    t.removeFromOtherTab();
    assert.equal(t.w.RentSketchEventPass.canEdit(), false, 'admin privilege must end synchronously');
    assert.equal(t.w.document.body.classList.contains('rs-platform-admin'), false);
    await flush();
    assert.equal(t.w.RentSketchEventPass.canEdit(), false);
    const bar = t.w.document.querySelector('#eventPassBar');
    assert.equal(bar.hidden, false);
    assert.match(bar.textContent, /Admin session ended/);
    assert.equal(bar.querySelector('a').getAttribute('href'), '/dashboard/#/login');
    assert.equal(bar.querySelector('[data-buy-pass]'), null, 'expired admin is asked to sign in, not buy access');
    await t.w.RentSketchEventPass.requestAccess();
    assert.match(t.w.document.querySelector('.paywall-overlay').textContent, /Sign in to continue editing/);
    t.session.accept(jwt('designer-new-login')); await flush();
    assert.equal(t.w.RentSketchEventPass.canEdit(), true);
    assert.equal(t.w.document.body.classList.contains('rs-platform-admin'), true);
    assert.equal(t.w.document.querySelector('.paywall-overlay'), null);
    assert.deepEqual(t.errors, []);
  } finally { t.close(); }
});


test('an already open login tab does not revoke a new sign-in completed in another tab', async () => {
  const t = await harness('tenant', { token: null, url: 'https://rentsketch.com/dashboard/#/login' });
  try {
    const fresh = jwt('other-tab-login');
    t.w.localStorage.setItem(META, JSON.stringify({ lastActivity: START, expiresAt: START + 8 * 60 * MINUTE }));
    t.w.localStorage.setItem(TOKEN, fresh);
    t.w.dispatchEvent(new t.w.StorageEvent('storage', { key: TOKEN, oldValue: null, newValue: fresh, storageArea: t.w.localStorage }));
    await flush();
    assert.equal(t.session.getToken(), fresh);
    assert.ok(t.w.document.querySelector('#loginForm'), 'explicit sign-in page must remain a form');
    assert.equal(t.calls.some(c => c.path === '/api/auth/logout'), false);
    assert.equal(t.calls.some(c => c.path === '/api/auth/me'), false);
    noPrivateContent(t); assert.deepEqual(t.errors, []);
  } finally { t.close(); }
});


function fillPasswordForm(t) {
  t.w.document.querySelector('#current').value = 'old-password-fixture';
  t.w.document.querySelector('#next').value = 'new-password-fixture';
  t.w.document.querySelector('#confirm').value = 'new-password-fixture';
}
function submitPasswordForm(t) { t.w.document.querySelector('#f').dispatchEvent(new t.w.Event('submit', { bubbles: true, cancelable: true })); }
function assertPasswordFormLocked(t) {
  for (const input of t.w.document.querySelectorAll('input[type="password"]')) {
    assert.equal(input.value, '', 'password must be removed from the DOM after session ends');
    assert.equal(input.disabled, true, 'password input must be unavailable after session ends');
  }
  assert.equal(t.w.document.querySelector('#save').disabled, true);
}

test('account password form resets and locks on cross-tab logout and cannot submit', async () => {
  const t = await harness('account');
  try {
    fillPasswordForm(t); t.removeFromOtherTab(); assertPasswordFormLocked(t);
    assert.match(t.w.document.querySelector('#msg').textContent, /session changed.*Sign in again/i);
    submitPasswordForm(t); await flush();
    assert.equal(t.calls.some(c => c.path === '/api/auth/change-password'), false);
    assert.deepEqual(t.errors, []);
  } finally { t.close(); }
});

test('account password form is cleared before entering browser page history', async () => {
  const t = await harness('account');
  try {
    fillPasswordForm(t);
    t.w.dispatchEvent(new t.w.PageTransitionEvent('pagehide', { persisted: true }));
    assertPasswordFormLocked(t);
    assert.equal(t.session.getToken(), t.token, 'hiding account page must not itself revoke an active session');
    assert.equal(t.calls.length, 0);
  } finally { t.close(); }
});

test('password submission reads the current session and successful change requires a new sign-in', async () => {
  const gate = deferred();
  const t = await harness('account', { respond: c => c.path === '/api/auth/change-password' ? gate.promise : undefined });
  try {
    const currentToken = jwt('account-current'); t.session.accept(currentToken);
    fillPasswordForm(t); submitPasswordForm(t);
    const call = t.calls.find(c => c.path === '/api/auth/change-password');
    assert.ok(call); assert.equal(call.method, 'POST');
    assert.equal(call.headers.Authorization, 'Bearer ' + currentToken, 'password form must not retain the token from initial page load');
    assert.equal(call.opts.cache, 'no-store');
    assert.deepEqual(JSON.parse(call.body), { currentPassword: 'old-password-fixture', newPassword: 'new-password-fixture' });
    gate.resolve(response({ ok: true })); await flush();
    assert.equal(t.session.getToken(), ''); assertPasswordFormLocked(t);
    assert.match(t.w.document.querySelector('#msg').textContent, /Password changed.*sessions have ended.*Sign in again/i);
    assert.equal(t.w.document.querySelector('a.back').getAttribute('href'), '/dashboard/#/login');
    assert.equal(t.calls.some(c => c.path === '/api/auth/logout'), false, 'password endpoint already revokes sessions server-side');
    assert.deepEqual(t.errors, []);
  } finally { gate.resolve(response({ ok: true })); t.close(); }
});

test('an old password-change response cannot clear a newer accepted session', async () => {
  for (const status of [200, 401]) {
    const gate = deferred();
    const t = await harness('account', { respond: c => c.path === '/api/auth/change-password' ? gate.promise : undefined });
    try {
      fillPasswordForm(t); submitPasswordForm(t);
      assert.equal(t.calls.find(c => c.path === '/api/auth/change-password').headers.Authorization, 'Bearer ' + t.token);
      const newToken = jwt('new-after-password-submit-' + status); t.session.accept(newToken);
      gate.resolve(response(status === 200 ? { ok: true } : { error: 'Old session expired' }, status));
      await flush();
      assert.equal(t.session.getToken(), newToken, 'late success or rejection belongs only to its original session');
      assert.doesNotMatch(t.w.document.querySelector('#msg').textContent, /Password changed|Old session expired/);
      assert.equal(t.calls.some(c => c.path === '/api/auth/logout'), false);
      assert.deepEqual(t.errors, []);
    } finally { gate.resolve(response({})); t.close(); }
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
