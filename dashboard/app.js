(function () {
  'use strict';

 var API_BASE = window.RENTSKETCH_API_URL || 'https://rentsketch-api-production.up.railway.app';
  var TOKEN_KEY = 'rentsketch_dashboard_token';
  var TENANT_KEY = 'rentsketch_dashboard_tenant';
  var ROUTES = ['login', 'overview', 'products', 'branding', 'requests', 'billing', 'install', 'superadmin'];

 function platformTenantView() { try { return new URLSearchParams(window.location.search).get('tenantView') === '1'; } catch (_) { return false; } }
 function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { if (t) { localStorage.setItem(TOKEN_KEY, t); } else { localStorage.removeItem(TOKEN_KEY); } }
  function getActiveTenant() { return localStorage.getItem(TENANT_KEY); }
  function setActiveTenant(slug) { if (slug) { localStorage.setItem(TENANT_KEY, slug); } else { localStorage.removeItem(TENANT_KEY); } }

 function normCategory(c) { return String(c || '').trim().toLowerCase().replace(/[\s-]+/g, '_'); }
function esc(s) {
   return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
     return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
   });
 }
  function money(n) { return (n === null || n === undefined || n === '') ? '\u2014' : ('$' + Number(n).toFixed(2)); }
  function fmtDate(s) { if (!s) return '\u2014'; try { return new Date(s).toLocaleDateString(); } catch (e) { return String(s); } }
  function fmtDateTime(s) { if (!s) return '\u2014'; try { return new Date(s).toLocaleString(); } catch (e) { return String(s); } }

 function visualOptionsHtml(visuals, selectedId) {
   var groups = {};
   (visuals || []).forEach(function (v) {
     if (!groups[v.category]) groups[v.category] = [];
     groups[v.category].push(v);
   });
   var html = '<option value=""' + (!selectedId ? ' selected' : '') + '>No visual (generic placeholder)</option>';
   Object.keys(groups).sort().forEach(function (cat) {
     html += '<optgroup label="' + esc(cat) + '">';
     groups[cat].forEach(function (v) {
       html += '<option value="' + esc(v.id) + '"' + (v.id === selectedId ? ' selected' : '') + '>' + esc(v.name) + '</option>';
     });
     html += '</optgroup>';
   });
   return html;
 }

 async function api(path, opts) {
   opts = opts || {};
   var headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
   var token = getToken();
   if (token) headers['Authorization'] = 'Bearer ' + token;
   var body = opts.body;
   if (body && typeof body === 'object') {
     headers['Content-Type'] = 'application/json';
     body = JSON.stringify(body);
   }
   var res = await fetch(API_BASE + path, {
     method: opts.method || 'GET',
     headers: headers,
     body: body,
   });
   var data = null;
   try { data = await res.json(); } catch (e) { data = null; }
   if (!res.ok) {
     var err = new Error((data && data.error) || ('Request failed (' + res.status + ')'));
     err.status = res.status;
     throw err;
   }
   return data;
 }

 var state = { user: null, tenants: [], tenant: null };
  var renderGeneration = 0; // bumped on every render() call so stale async tenant fetches can detect they are outdated and refuse to paint the DOM (prevents one tenant's data flashing into another tenant's view when switching tenants in the dashboard)

 function currentRoute() {
   var h = (window.location.hash || '').replace(/^#\/?/, '').split('?')[0];
   return ROUTES.indexOf(h) === -1 ? '' : h;
 }

 function appEl() { return document.getElementById('app'); }

 function activeTenantRecord() {
   return (state.tenants || []).find(function (t) { return t.slug === state.tenant; }) || null;
 }
 function tenantRole() {
   if (state.user && state.user.isPlatformAdmin) return 'platform_admin';
   var record = activeTenantRecord();
   return record && record.role ? record.role : 'viewer';
 }
 function tenantDesignerUrl() {
   return '/designer/?tenant=' + encodeURIComponent(state.tenant || 'generic') + '&staff=1';
 }
 function tenantInitials(name) {
   return String(name || 'RS').trim().split(/\s+/).slice(0, 2).map(function (part) { return part.charAt(0); }).join('').toUpperCase();
 }

 function shellHtml(route, inner) {
   var tenants = state.tenants || [];
   var platformAdmin = !!(state.user && state.user.isPlatformAdmin);
   var record = activeTenantRecord();
   var tenantName = record ? record.name : (state.tenant || 'Business workspace');
   var userName = (state.user && (state.user.displayName || state.user.email)) || 'RentSketch user';
   var role = tenantRole();
   var switcher = '';
   if (tenants.length > 1) {
     switcher = '<select id="tenantSwitch" class="tenant-switch" aria-label="Switch business">' + tenants.map(function (t) {
       return '<option value="' + esc(t.slug) + '"' + (t.slug === state.tenant ? ' selected' : '') + '>' + esc(t.name) + '</option>';
     }).join('') + '</select>';
   } else if (tenants.length === 1) {
     switcher = '<span class="tenant-name">' + esc(tenants[0].name) + '</span>';
   }
   function navLink(r, label, icon) {
     return '<a href="#/' + r + '" class="nav-link' + (route === r ? ' active' : '') + '"><span class="tenant-nav-icon">' + icon + '</span><span>' + label + '</span></a>';
   }
   return '' +
     '<div class="tenant-shell" id="tenantShell">' +
       '<aside class="tenant-sidebar">' +
         '<a class="tenant-brand" href="#/overview"><img src="/assets/brand-mark.svg" alt=""><span><strong>RentSketch</strong><span>Business Workspace</span></span></a>' +
         '<a class="tenant-launch" href="' + tenantDesignerUrl() + '" target="_blank" rel="noopener">✦ Open customer designer</a>' +
         '<nav class="tenant-nav" aria-label="Business workspace">' +
           '<div class="tenant-nav-group"><div class="tenant-nav-label">Workspace</div>' +
             navLink('overview', 'Overview', '⌂') +
             navLink('requests', 'Quote requests', '▤') +
             navLink('products', 'Products', '▦') +
           '</div>' +
           '<div class="tenant-nav-group"><div class="tenant-nav-label">Customer experience</div>' +
             navLink('branding', 'Branding', '◆') +
             navLink('install', 'Website install', '↗') +
           '</div>' +
           '<div class="tenant-nav-group"><div class="tenant-nav-label">Account</div>' +
             navLink('billing', 'Billing & payments', '$') +
             (platformAdmin ? '<a href="/dashboard/platform.html#overview" class="nav-link"><span class="tenant-nav-icon">★</span><span>Platform Console</span></a>' : '') +
           '</div>' +
         '</nav>' +
         '<div class="tenant-sidebar-foot">' +
           '<div class="tenant-user"><span class="tenant-avatar">' + esc(tenantInitials(userName)) + '</span><span><strong>' + esc(userName) + '</strong><small>' + esc(role === 'platform_admin' ? 'Platform admin · viewing ' + tenantName : role + ' · ' + tenantName) + '</small></span></div>' +
           '<button id="btnLogout" class="btn-logout" type="button">Log out</button>' +
         '</div>' +
       '</aside>' +
       '<section class="tenant-workspace">' +
         '<header class="tenant-topbar">' +
           '<button class="tenant-mobile-toggle" id="tenantMenuBtn" type="button" aria-label="Open workspace navigation">☰</button>' +
           '<div class="tenant-crumb"><strong>' + esc(tenantName) + '</strong> / ' + esc(route ? route.charAt(0).toUpperCase() + route.slice(1) : 'Overview') + '</div>' +
           '<div class="tenant-top-actions">' +
             (platformAdmin ? '<a class="tenant-return" href="/dashboard/platform.html#businesses">← Platform Console</a>' : '') +
             '<div class="dash-account"><span class="role-pill">' + esc(role === 'platform_admin' ? 'Super Admin' : role) + '</span>' + switcher + '</div>' +
           '</div>' +
         '</header>' +
         '<main class="dash-main tenant-content" id="dashMain">' + inner + '</main>' +
       '</section>' +
     '</div>';
 }
 function loadingHtml(label) { return '<div class="dash-loading">' + esc(label || 'Loading...') + '</div>'; }
 function errorHtml(err) { return '<div class="dash-error">' + esc(err && err.message ? err.message : String(err)) + (err && err.status === 402 ? ' <a href="#/billing">Open Billing to continue →</a>' : '') + '</div>'; }

 function bindShellEvents() {
   var menuBtn = document.getElementById('tenantMenuBtn');
   var tenantShell = document.getElementById('tenantShell');
   if (menuBtn && tenantShell) menuBtn.addEventListener('click', function () {
     tenantShell.classList.toggle('menu-open');
   });
   Array.prototype.forEach.call(document.querySelectorAll('.tenant-nav .nav-link'), function (link) {
     link.addEventListener('click', function () { if (tenantShell) tenantShell.classList.remove('menu-open'); });
   });
   var logout = document.getElementById('btnLogout');
   if (logout) logout.addEventListener('click', function () {
     setToken(null);
     setActiveTenant(null);
     state.user = null; state.tenants = []; state.tenant = null;
     window.location.hash = '#/login';
     render();
   });
   var sw = document.getElementById('tenantSwitch');
   if (sw) sw.addEventListener('change', function () {
     setActiveTenant(sw.value);
     state.tenant = sw.value;
     render();
   });
 }

 function viewLogin() {
   appEl().innerHTML = '' +
     '<div class="login-wrap">' +
     '<div class="login-card">' +
     '<div class="login-brand">RentSketch</div>' +
     '<h1>Business Dashboard</h1>' +
     '<p class="login-sub">Log in with the staff account for your rental company.</p>' +
     '<form id="loginForm">' +
     '<label>Email<input type="email" id="loginEmail" required autocomplete="username"></label>' +
     '<label>Password<input type="password" id="loginPassword" required autocomplete="current-password"></label>' +
     '<div id="loginError" class="dash-error" hidden></div>' +
     '<button type="submit" class="btn-primary" id="loginSubmit">Log in</button>' +
     '</form>' +
     '<p class="login-sub"><a href="/business/signup.html">Start a free business trial</a> · <a href="/help/">Need help signing in?</a></p>' +
     '</div>' +
     '</div>';
   document.getElementById('loginForm').addEventListener('submit', async function (e) {
     e.preventDefault();
     var errEl = document.getElementById('loginError');
     errEl.hidden = true;
     var email = document.getElementById('loginEmail').value.trim();
     var password = document.getElementById('loginPassword').value;
     var btn = document.getElementById('loginSubmit');
     btn.disabled = true; btn.textContent = 'Logging in...';
     try {
       var result = await api('/api/auth/login', { method: 'POST', body: { email: email, password: password } });
       setToken(result.token);
       await loadMe();
       if (state.user && state.user.isPlatformAdmin && !platformTenantView()) { window.location.href = '/dashboard/platform.html#overview'; return; }
       window.location.hash = '#/overview';
       render();
     } catch (err) {
       errEl.textContent = err.message || 'Login failed';
       errEl.hidden = false;
     } finally {
       btn.disabled = false; btn.textContent = 'Log in';
     }
   });
 }

 async function loadMe() {
   var me = await api('/api/auth/me');
   state.user = me.user;
   state.tenants = me.tenants || [];
   var active = getActiveTenant();
   if (!active || !state.tenants.some(function (t) { return t.slug === active; })) {
     active = state.tenants[0] ? state.tenants[0].slug : null;
     setActiveTenant(active);
   }
   state.tenant = active;
 }

 async function viewOverview(route, gen) {
   appEl().innerHTML = shellHtml(route, loadingHtml('Loading business workspace...'));
   bindShellEvents();
   if (!state.tenant) {
     document.getElementById('dashMain').innerHTML = '<div class="tenant-empty"><div class="tenant-empty-icon">RS</div><h3>No business assigned yet</h3><p>Your account is not attached to a RentSketch business workspace yet.</p></div>';
     return;
   }
   try {
     var summary = await api('/api/tenants/' + state.tenant + '/dashboard-summary');
     if (gen !== renderGeneration) return;
     var t = summary.tenant || {};
     var setup = summary.setup || { completed: 0, total: 4, percent: 0, items: [] };
     var requests = summary.requests || {};
     var designs = summary.designs || {};
     var products = summary.products || {};
     var health = summary.health || {};
     var platformAdmin = !!(state.user && state.user.isPlatformAdmin);
     var role = tenantRole();
     var trialText = '';
     if (!platformAdmin && t.subscriptionStatus === 'trialing' && t.trialEndsAt) {
       var daysLeft = Math.ceil((new Date(t.trialEndsAt) - new Date()) / 86400000);
       trialText = daysLeft > 0 ? (daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + ' left in trial') : 'Trial ended';
     }
     var subscriptionLabel = platformAdmin ? 'Platform admin access' : ((t.subscriptionPlan || 'trial') + ' · ' + (t.subscriptionStatus || 'trialing'));
     var healthRows = [
       ['Customer designer', health.designer, 'Designer is available for this workspace'],
       ['Catalog', health.catalogReady, health.catalogReady ? products.active + ' active products ready' : (products.missingVisual ? products.missingVisual + ' products need visual mapping' : 'Add active products')],
       ['Branding', health.brandingReady, health.brandingReady ? 'Customer-facing brand details configured' : 'Add logo/contact/colors'],
       ['Website install', health.installReady, health.installReady ? ((t.allowedOrigins || []).length + ' approved domain' + ((t.allowedOrigins || []).length === 1 ? '' : 's')) : 'No approved website domain yet'],
       ['Stripe deposits', health.paymentsReady, health.paymentsReady ? 'Stripe Connect active' : 'Not connected'],
       ['Webhook', health.webhookConfigured, health.webhookConfigured ? 'Outbound webhook configured' : 'Optional integration not configured']
     ];
     function cents(value) { return '$' + (Number(value || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
     function setupHtml() {
       return '<div class="tenant-progress-row"><div><strong>' + setup.percent + '%</strong><span class="pc-subtext"> workspace launch readiness</span></div><span class="tenant-status-chip ' + (setup.percent === 100 ? 'good' : 'blue') + '">' + setup.completed + ' of ' + setup.total + ' complete</span></div>' +
         '<div class="tenant-progress-track"><span style="width:' + setup.percent + '%"></span></div>' +
         '<div class="tenant-checklist">' + (setup.items || []).map(function (item) {
           return '<a class="tenant-check' + (item.complete ? ' done' : '') + '" href="' + esc(item.href) + '"><span class="tenant-check-icon">' + (item.complete ? '✓' : '•') + '</span><span><strong>' + esc(item.label) + '</strong><small>' + esc(item.detail) + '</small></span><span>→</span></a>';
         }).join('') + '</div>';
     }
     function recentRequestsHtml() {
       var rows = summary.recentRequests || [];
       if (!rows.length) return '<div class="tenant-empty"><div class="tenant-empty-icon">↗</div><h3>No quote requests yet</h3><p>Preview your customer designer or install it on your website. New customer requests will appear here automatically.</p><a class="tenant-btn primary" href="' + tenantDesignerUrl() + '" target="_blank" rel="noopener">Open customer designer</a></div>';
       return '<div class="tenant-request-list">' + rows.map(function (r) {
         return '<div class="tenant-request-row"><div><strong>' + esc(r.customer_name || 'Customer') + '</strong><small>' + esc(r.customer_email || '') + '</small></div><div><strong>' + esc(fmtDate(r.event_date)) + '</strong><small>' + esc(r.event_type || 'Event') + '</small></div><div><strong>' + esc(r.guest_count || '—') + '</strong><small>guests</small></div><div class="tenant-request-value">' + esc(money(r.estimate_total)) + '</div><div><span class="status-badge status-' + esc(r.status) + '">' + esc(r.status) + '</span></div></div>';
       }).join('') + '</div>';
     }
     function activityHtml() {
       var rows = summary.activity || [];
       if (!rows.length) return '<div class="tenant-empty"><p>Customer designs and quote activity will appear here as this workspace is used.</p></div>';
       return '<div class="tenant-activity">' + rows.map(function (a) {
         return '<div class="tenant-activity-row ' + esc(a.type) + '"><span class="tenant-activity-dot"></span><div><strong>' + esc(a.title) + '</strong><p>' + esc(a.detail || '') + '</p></div><time>' + esc(fmtDateTime(a.at)) + '</time></div>';
       }).join('') + '</div>';
     }
     var html = '' +
       '<div class="tenant-page-head"><div><div class="tenant-eyebrow">Business workspace</div><h1>' + esc(t.name || state.tenant) + '</h1><p>' + esc(t.contactEmail || 'Manage your customer-facing RentSketch workspace') + '</p>' +
         '<div class="tenant-status-row"><span class="tenant-status-chip blue">' + esc(subscriptionLabel) + '</span>' +
         (trialText ? '<span class="tenant-status-chip warn">' + esc(trialText) + '</span>' : '') +
         '<span class="tenant-status-chip ' + (health.installReady ? 'good' : 'warn') + '">' + (health.installReady ? 'Website connected' : 'Install not finished') + '</span>' +
         '<span class="tenant-status-chip ' + (health.catalogReady ? 'good' : 'warn') + '">' + (health.catalogReady ? 'Catalog ready' : 'Catalog needs attention') + '</span></div></div>' +
         '<div class="tenant-head-actions"><a class="tenant-btn" href="#/requests">View requests</a><a class="tenant-btn" href="#/products">Manage products</a><a class="tenant-btn primary" href="' + tenantDesignerUrl() + '" target="_blank" rel="noopener">✦ Open designer</a></div></div>' +
       (platformAdmin ? '<div class="tenant-admin-strip"><span><strong>Super Admin tenant view.</strong> You are seeing this workspace with unrestricted platform access.</span><a href="/dashboard/platform.html#businesses">Return to Platform Console →</a></div>' : '') +
       '<section class="tenant-kpis">' +
         '<article class="tenant-kpi"><label>Quote requests</label><strong>' + Number(requests.total || 0) + '</strong><small>' + Number(requests.month || 0) + ' submitted this month</small></article>' +
         '<article class="tenant-kpi ' + (Number(requests.new || 0) ? 'attention' : '') + '"><label>Needs follow-up</label><strong>' + Number(requests.new || 0) + '</strong><small>New customer requests</small></article>' +
         '<article class="tenant-kpi"><label>Saved designs</label><strong>' + Number(designs.total || 0) + '</strong><small>' + Number(designs.month || 0) + ' created this month</small></article>' +
         '<article class="tenant-kpi"><label>Request pipeline</label><strong>' + esc(money(requests.pipelineValue || 0)) + '</strong><small>Non-declined estimated request value</small></article>' +
         '<article class="tenant-kpi positive"><label>Deposits collected</label><strong>' + cents(requests.paidDepositCents) + '</strong><small>Recorded paid rental deposits</small></article>' +
       '</section>' +
       '<div class="tenant-grid"><div class="tenant-stack">' +
         '<section class="tenant-panel"><div class="tenant-panel-head"><div><h2>Recent quote requests</h2><p>Customer requests from your designer.</p></div><a class="tenant-btn" href="#/requests">All requests</a></div>' + recentRequestsHtml() + '</section>' +
         '<section class="tenant-panel"><div class="tenant-panel-head"><div><h2>Workspace setup</h2><p>Finish the customer experience before sending traffic to it.</p></div><a class="tenant-btn" href="#/install">Install</a></div><div class="tenant-panel-body">' + setupHtml() + '</div></section>' +
       '</div><aside class="tenant-stack">' +
         '<section class="tenant-panel"><div class="tenant-panel-head"><div><h2>Quick actions</h2><p>Common workspace tasks.</p></div></div><div class="tenant-panel-body"><div class="tenant-quick-grid">' +
           '<a class="tenant-quick" href="' + tenantDesignerUrl() + '" target="_blank" rel="noopener"><span>✦</span><strong>Open designer</strong><small>See the customer experience</small></a>' +
           '<a class="tenant-quick" href="#/products"><span>▦</span><strong>Products</strong><small>Catalog, pricing and visuals</small></a>' +
           '<a class="tenant-quick" href="#/branding"><span>◆</span><strong>Branding</strong><small>Logo, colors and contact info</small></a>' +
           '<a class="tenant-quick" href="#/install"><span>↗</span><strong>Website install</strong><small>Domains and embed code</small></a>' +
         '</div></div></section>' +
         '<section class="tenant-panel"><div class="tenant-panel-head"><div><h2>Business health</h2><p>What is ready and what still needs setup.</p></div></div><div class="tenant-panel-body"><div class="tenant-health">' +
           healthRows.map(function (row) { return '<div class="tenant-health-row"><span><strong>' + esc(row[0]) + '</strong><small>' + esc(row[2]) + '</small></span><span class="tenant-health-state ' + (row[1] ? 'good' : 'warn') + '">' + (row[1] ? 'Ready' : 'Review') + '</span></div>'; }).join('') +
         '</div></div></section>' +
         '<section class="tenant-panel"><div class="tenant-panel-head"><div><h2>Recent activity</h2><p>Designs and customer requests.</p></div></div><div class="tenant-panel-body">' + activityHtml() + '</div></section>' +
       '</aside></div>';
     document.getElementById('dashMain').innerHTML = html;
   } catch (err) {
     document.getElementById('dashMain').innerHTML = errorHtml(err);
   }
 }
 function renderRequestsTable(rows, withActions) {
   if (!rows.length) return '<div class="dash-empty">No quote requests yet.</div>';
   var body = rows.map(function (r) {
     return '<tr data-id="' + esc(r.id) + '">' +
       '<td>' + esc(r.customer_name) + '<br><span class="muted">' + esc(r.customer_email) + '</span></td>' +
       '<td>' + fmtDate(r.event_date) + '</td>' +
       '<td>' + (r.guest_count || '\u2014') + '</td>' +
       '<td>' + money(r.estimate_total) + '</td>' +
      '<td>' + (r.payment_status === 'paid' ? ('Paid ' + money((r.amount_paid_cents || 0) / 100)) : '\u2014') + '</td>' +
       '<td>' + fmtDateTime(r.created_at) + '</td>' +
       '<td>' + (withActions ? statusSelect(r) : '<span class="status-badge status-' + esc(r.status) + '">' + esc(r.status) + '</span>') + '</td>' +
       '</tr>';
   }).join('');
   return '<table class="dash-table"><thead><tr><th>Customer</th><th>Event Date</th><th>Guests</th><th>Estimate</th><th>Deposit</th><th>Submitted</th><th>Status</th></tr></thead><tbody>' + body + '</tbody></table>';
 }

 function statusSelect(r) {
   var opts = ['new', 'contacted', 'quoted', 'booked', 'declined'];
   return '<select class="status-select" data-id="' + esc(r.id) + '">' + opts.map(function (o) {
     return '<option value="' + o + '"' + (o === r.status ? ' selected' : '') + '>' + o + '</option>';
   }).join('') + '</select>';
 }

 async function viewRequests(route, gen) {
   appEl().innerHTML = shellHtml(route, loadingHtml('Loading requests...'));
   bindShellEvents();
   if (!state.tenant) { document.getElementById('dashMain').innerHTML = '<div class="tenant-empty">No tenant access.</div>'; return; }
   try {
     var requests = await api('/api/tenants/' + state.tenant + '/quote-requests');
     var reqs = requests.quoteRequests || [];
     if (gen !== renderGeneration) return;
     document.getElementById('dashMain').innerHTML = '' +
       '<div class="tenant-page-head"><div><div class="tenant-eyebrow">Customer pipeline</div><h1>Quote requests</h1><p>Review customer layouts, estimated values, deposits and follow-up status.</p></div><div class="tenant-head-actions"><a class="tenant-btn primary" href="' + tenantDesignerUrl() + '" target="_blank" rel="noopener">Preview customer designer</a></div></div>' +
       '<div class="tenant-kpis">' +
         '<article class="tenant-kpi"><label>Total requests</label><strong>' + reqs.length + '</strong><small>All customer quote requests</small></article>' +
         '<article class="tenant-kpi attention"><label>Needs follow-up</label><strong>' + reqs.filter(function(r){return r.status === 'new';}).length + '</strong><small>New requests</small></article>' +
         '<article class="tenant-kpi"><label>Quoted</label><strong>' + reqs.filter(function(r){return r.status === 'quoted';}).length + '</strong><small>Waiting on customer decision</small></article>' +
         '<article class="tenant-kpi positive"><label>Booked</label><strong>' + reqs.filter(function(r){return r.status === 'booked';}).length + '</strong><small>Marked booked</small></article>' +
         '<article class="tenant-kpi positive"><label>Paid deposits</label><strong>' + reqs.filter(function(r){return r.payment_status === 'paid';}).length + '</strong><small>Requests with recorded deposits</small></article>' +
       '</div>' +
       '<div class="tenant-panel"><div class="tenant-panel-head"><div><h2>Customer requests</h2><p>Search or filter the pipeline, then update status inline.</p></div></div><div class="tenant-panel-body">' +
         '<div class="pc-toolbar"><div class="pc-search"><input id="requestSearch" type="search" placeholder="Search customer, email or event type…"></div><select class="pc-select" id="requestStatus"><option value="">All statuses</option><option value="new">New</option><option value="contacted">Contacted</option><option value="quoted">Quoted</option><option value="booked">Booked</option><option value="declined">Declined</option></select></div>' +
         '<div id="requestTable"></div></div></div>';
     function bindStatuses() {
       Array.prototype.forEach.call(document.querySelectorAll('.status-select'), function (sel) {
         sel.addEventListener('change', async function () {
           sel.disabled = true;
           try {
             await api('/api/tenants/' + state.tenant + '/quote-requests/' + sel.getAttribute('data-id'), { method: 'PATCH', body: { status: sel.value } });
             var row = reqs.find(function(r){return String(r.id) === String(sel.getAttribute('data-id'));}); if(row)row.status=sel.value;
           } catch (err) {
             window.alert('Could not update status: ' + err.message);
           } finally {
             sel.disabled = false;
           }
         });
       });
     }
     function paint() {
       var q=(document.getElementById('requestSearch').value||'').trim().toLowerCase();
       var s=document.getElementById('requestStatus').value;
       var filtered=reqs.filter(function(r){
         var hit=!q || [r.customer_name,r.customer_email,r.event_type].join(' ').toLowerCase().indexOf(q)>-1;
         return hit && (!s || r.status===s);
       });
       document.getElementById('requestTable').innerHTML=renderRequestsTable(filtered,true);
       bindStatuses();
     }
     document.getElementById('requestSearch').addEventListener('input',paint);
     document.getElementById('requestStatus').addEventListener('change',paint);
     paint();
   } catch (err) {
     document.getElementById('dashMain').innerHTML = errorHtml(err);
   }
 }
 async function viewProducts(route, gen) {
   appEl().innerHTML = shellHtml(route, loadingHtml('Loading products...'));
   bindShellEvents();
   if (!state.tenant) { document.getElementById('dashMain').innerHTML = '<div class="dash-empty">No tenant access.</div>'; return; }
   try {
     var data = await api('/api/tenants/' + state.tenant + '/products');
     var products = data.products || [];
     var visuals = [];
     try {
       var visLibData = await api('/api/visual-library');
       visuals = visLibData.visuals || [];
     } catch (vlErr) { visuals = []; }
     var visualsById = {};
     visuals.forEach(function (v) { visualsById[v.id] = v; });
     if (gen !== renderGeneration) return;
     var rows = products.map(function (p) {
               var needsVisual = ['tent', 'table', 'chair', 'dance_floor', 'lighting', 'linen'].indexOf(normCategory(p.category)) !== -1;
               var hasVisual = !!(p.visual_model_id && visualsById[p.visual_model_id]);
               var unknownVisual = p.visual_model_id && !visualsById[p.visual_model_id];
               var hiddenFromDesigner = needsVisual && !hasVisual;
               return '<tr data-id="' + esc(p.id) + '">' +
                           '<td>' + esc(p.category) + '</td>' +
                           '<td>' + esc(p.name) + '</td>' +
                           '<td>' + esc(p.sku || '') + '</td>' +
                           '<td>' + money(p.price_per_day) + '</td>' +
                           '<td>' + (p.capacity || '\u2014') + '</td>' +
                           '<td><select class="visual-select" data-id="' + esc(p.id) + '">' + visualOptionsHtml(visuals, p.visual_model_id) + '</select>' + (unknownVisual ? '<br><span class="muted">Unknown visual id: ' + esc(p.visual_model_id) + '</span>' : '') + '</td>' +
                           '<td>' + (needsVisual ? (hiddenFromDesigner ? '<span class="status-badge status-hidden" title="Customers will not see this item until a visual is picked. It is excluded from the designer rather than shown as a generic shape.">Hidden from designer</span>' : '<span class="status-badge status-visible">Visible to customers</span>') : '<span class="muted">Generic placeholder</span>') + '</td>' +
                           '<td><button class="btn-link" data-action="toggle-active" data-id="' + esc(p.id) + '" data-active="' + (p.active ? '1' : '0') + '">' + (p.active ? 'Active' : 'Inactive') + '</button></td>' +
                           '<td><button class="btn-link btn-danger" data-action="delete" data-id="' + esc(p.id) + '">Remove</button></td>' +
                           '</tr>';
     }).join('');
     var table = products.length ? ('<table class="dash-table"><thead><tr><th>Category</th><th>Name</th><th>SKU</th><th>Price/Day</th><th>Capacity</th><th>Visual</th><th>In Designer</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>') : '<div class="dash-empty">No products yet. Add your first one below.</div>';
     document.getElementById('dashMain').innerHTML = '' +
       '<div class="tenant-page-head"><div><div class="tenant-eyebrow">Catalog</div><h1>Products</h1><p>Control the equipment, pricing and visual models customers can use in your designer.</p></div><div class="tenant-head-actions"><a class="tenant-btn primary" href="' + tenantDesignerUrl() + '" target="_blank" rel="noopener">Preview catalog in designer</a></div></div>' +
       '<div class="tenant-panel"><div class="tenant-panel-head"><div><h2>Customer catalog</h2><p>Items that require a visual model stay hidden until mapped.</p></div><span class="tenant-status-chip blue">' + products.length + ' products</span></div>' + table + '</div>' +
       '<h2 class="dash-section-title">Add a product</h2>' +
       '<form id="productForm" class="dash-form">' +
       '<label>Category<select id="pCategory" required><option value="">Select a category</option><option value="tent">Tent</option><option value="table">Table</option><option value="chair">Chair</option><option value="dance_floor">Dance Floor</option><option value="lighting">Lighting</option><option value="linen">Linen</option></select></label>' +
       '<label>Name<input type="text" id="pName" placeholder="20x20 Pole Tent" required></label>' +
       '<label>SKU<input type="text" id="pSku"></label>' +
       '<label>Price per day<input type="number" step="0.01" id="pPrice"></label>' +
       '<label>Width (ft)<input type="number" step="0.1" id="pWidth"></label>' +
       '<label>Length (ft)<input type="number" step="0.1" id="pLength"></label>' +
       '<label>Capacity<input type="number" id="pCapacity"></label>' +
       '<label>Photo URL<input type="text" id="pPhoto"></label>' +
       '<label>Visual<select id="pVisual">' + visualOptionsHtml(visuals, null) + '</select></label>' +
       '<div id="productError" class="dash-error" hidden></div>' +
       '<button type="submit" class="btn-primary">Add Product</button>' +
       '</form>';
     document.getElementById('productForm').addEventListener('submit', async function (e) {
       e.preventDefault();
       var errEl = document.getElementById('productError');
       errEl.hidden = true;
       try {
         await api('/api/tenants/' + state.tenant + '/products', {
           method: 'POST',
           body: {
             category: document.getElementById('pCategory').value.trim(),
             name: document.getElementById('pName').value.trim(),
             sku: document.getElementById('pSku').value.trim() || null,
             pricePerDay: document.getElementById('pPrice').value || null,
             widthFt: document.getElementById('pWidth').value || null,
             lengthFt: document.getElementById('pLength').value || null,
             capacity: document.getElementById('pCapacity').value || null,
             photoUrl: document.getElementById('pPhoto').value.trim() || null,
             visualModelId: document.getElementById('pVisual').value || null,
           },
         });
         viewProducts(route);
       } catch (err) {
         errEl.textContent = err.message;
         errEl.hidden = false;
       }
     });
     Array.prototype.forEach.call(document.querySelectorAll('.visual-select'), function (sel) {
       sel.addEventListener('change', async function () {
         sel.disabled = true;
         try {
           await api('/api/tenants/' + state.tenant + '/products/' + sel.getAttribute('data-id'), { method: 'PATCH', body: { visualModelId: sel.value || null } });
         } catch (err) {
           window.alert('Could not update visual: ' + err.message);
         } finally {
           sel.disabled = false;
         }
       });
     });
     Array.prototype.forEach.call(document.querySelectorAll('[data-action="toggle-active"]'), function (btn) {
       btn.addEventListener('click', async function () {
         var makeActive = btn.getAttribute('data-active') !== '1';
         try {
           await api('/api/tenants/' + state.tenant + '/products/' + btn.getAttribute('data-id'), { method: 'PATCH', body: { active: makeActive } });
           viewProducts(route);
         } catch (err) { window.alert('Could not update product: ' + err.message); }
       });
     });
     Array.prototype.forEach.call(document.querySelectorAll('[data-action="delete"]'), function (btn) {
       btn.addEventListener('click', async function () {
         if (!window.confirm('Remove this product from your active catalog?')) return;
         try {
           await api('/api/tenants/' + state.tenant + '/products/' + btn.getAttribute('data-id'), { method: 'DELETE' });
           viewProducts(route);
         } catch (err) { window.alert('Could not remove product: ' + err.message); }
       });
     });
   } catch (err) {
     document.getElementById('dashMain').innerHTML = errorHtml(err);
   }
 }

 async function viewBranding(route, gen) {
   appEl().innerHTML = shellHtml(route, loadingHtml('Loading branding...'));
   bindShellEvents();
   if (!state.tenant) { document.getElementById('dashMain').innerHTML = '<div class="dash-empty">No tenant access.</div>'; return; }
   try {
     var t = await api('/api/tenants/' + state.tenant + '/admin');
     if (gen !== renderGeneration) return;
     document.getElementById('dashMain').innerHTML = '' +
       '<div class="tenant-page-head"><div><div class="tenant-eyebrow">Customer experience</div><h1>Branding &amp; settings</h1><p>Make the designer feel like your business before customers see it.</p></div><div class="tenant-head-actions"><a class="tenant-btn primary" href="' + tenantDesignerUrl() + '" target="_blank" rel="noopener">Preview branded designer</a></div></div>' +
       '<form id="brandingForm" class="dash-form">' +
       '<label>Company Name<input type="text" id="bName" value="' + esc(t.name || '') + '"></label>' +
       '<label>Logo URL<input type="text" id="bLogo" value="' + esc(t.logoUrl || '') + '"></label>' +
       '<label>Contact Email<input type="email" id="bEmail" value="' + esc(t.contactEmail || '') + '"></label>' +
       '<label>Phone<input type="text" id="bPhone" value="' + esc(t.phone || '') + '"></label>' +
       '<label>Website<input type="text" id="bWebsite" value="' + esc(t.website || '') + '"></label>' +
       '<label>Tagline<input type="text" id="bTagline" value="' + esc(t.tagline || '') + '"></label>' +
       '<label>Primary Color<input type="color" id="bPrimary" value="' + esc(t.primaryColor || '#2f6fed') + '"></label>' +
       '<label>Secondary Color<input type="color" id="bSecondary" value="' + esc(t.secondaryColor || '#0b1b3a') + '"></label>' +
       '<label class="checkbox-row"><input type="checkbox" id="bShowPrices"' + (t.showPrices ? ' checked' : '') + '> Show prices to customers</label>' +
       '<label class="checkbox-row"><input type="checkbox" id="bPoweredBy"' + (t.poweredByEnabled ? ' checked' : '') + '> Show "Powered by RentSketch"</label>' +
       '<div id="brandingError" class="dash-error" hidden></div>' +
       '<div id="brandingSaved" class="dash-saved" hidden>Saved.</div>' +
       '<button type="submit" class="btn-primary">Save Branding</button>' +
       '</form>' +
        '<section id="payoutsSection" class="tenant-panel" style="margin-top:18px"><div class="tenant-panel-head"><div><h2>Rental deposit payouts</h2><p>Connect Stripe when you want customer rental deposits paid to your business.</p></div></div><div class="tenant-panel-body"><p id="payoutsStatus" class="dash-subtitle">Loading payouts status...</p><button id="connectStripeBtn" class="btn-primary" hidden>Connect Stripe to receive payouts</button></div></section>';
     document.getElementById('brandingForm').addEventListener('submit', async function (e) {
       e.preventDefault();
       var errEl = document.getElementById('brandingError');
       var savedEl = document.getElementById('brandingSaved');
       errEl.hidden = true; savedEl.hidden = true;
       try {
         await api('/api/tenants/' + state.tenant, {
           method: 'PATCH',
           body: {
             name: document.getElementById('bName').value.trim(),
             logoUrl: document.getElementById('bLogo').value.trim(),
             contactEmail: document.getElementById('bEmail').value.trim(),
             phone: document.getElementById('bPhone').value.trim(),
             website: document.getElementById('bWebsite').value.trim(),
             tagline: document.getElementById('bTagline').value.trim(),
             primaryColor: document.getElementById('bPrimary').value,
             secondaryColor: document.getElementById('bSecondary').value,
             showPrices: document.getElementById('bShowPrices').checked,
             poweredByEnabled: document.getElementById('bPoweredBy').checked,
           },
         });
         savedEl.hidden = false;
       } catch (err) {
         errEl.textContent = err.message;
         errEl.hidden = false;
       }
     });
     (async function () {
       try {
         var connectStatus = await api('/api/tenants/' + state.tenant + '/connect/status');
         var statusEl = document.getElementById('payoutsStatus');
         var btnEl = document.getElementById('connectStripeBtn');
         if (!statusEl || !btnEl) return;
         if (connectStatus.status === 'active') {
           statusEl.textContent = 'Connected. Deposits are being split with your connected Stripe account.';
         } else if (connectStatus.hasAccount) {
           statusEl.textContent = 'Stripe onboarding started but not finished yet.';
           btnEl.hidden = false;
           btnEl.textContent = 'Finish connecting Stripe';
         } else {
           statusEl.textContent = 'Not connected yet. Connect your own Stripe account to receive deposit payouts directly.';
           btnEl.hidden = false;
         }
         btnEl.addEventListener('click', async function () {
           btnEl.disabled = true;
           try {
             var onboardRes = await api('/api/tenants/' + state.tenant + '/connect/onboard', { method: 'POST' });
             if (onboardRes.url) { window.location.href = onboardRes.url; }
           } catch (err) {
             statusEl.textContent = 'Could not start Stripe onboarding: ' + err.message;
             btnEl.disabled = false;
           }
         });
       } catch (err) {
         var statusElErr = document.getElementById('payoutsStatus');
         if (statusElErr) statusElErr.textContent = 'Payouts status unavailable.';
       }
     })();

   } catch (err) {
     document.getElementById('dashMain').innerHTML = errorHtml(err);
   }
 }

 async function viewInstall(route, gen) {
   appEl().innerHTML = shellHtml(route, loadingHtml('Loading install info...'));
   bindShellEvents();
   if (!state.tenant) { document.getElementById('dashMain').innerHTML = '<div class="dash-empty">No tenant access.</div>'; return; }
   try {
     var t = await api('/api/tenants/' + state.tenant + '/admin');
     if (gen !== renderGeneration) return;
     var designerUrl = 'https://rentsketch.com/designer/?tenant=' + encodeURIComponent(state.tenant);
     var iframeCode = '<iframe src="' + designerUrl + '&embed=1" style="width:100%;height:820px;border:0" title="' + esc(t.name) + ' Event Designer"></iframe>';
     var loaderCode = '<div id="rentsketch-embed"></div>\n<script src="https://rentsketch.com/embed/v1.js" data-tenant="' + esc(state.tenant) + '" data-embed-key="' + esc(t.embedKey || '') + '" defer></script>';
     var origins = (t.allowedOrigins || []).join('\n');
     document.getElementById('dashMain').innerHTML = '' +
       '<h1 class="dash-title">Install RentSketch</h1>' +
       '<p class="dash-subtitle">Add your event designer to your own website. No RentSketch source code needed.</p>' +
       '<h2 class="dash-section-title">1. Hosted Designer Link</h2>' +
       '<p>Share or link directly to your own hosted designer:</p>' +
       '<textarea class="code-box" rows="1" readonly>' + esc(designerUrl) + '</textarea>' +
       '<h2 class="dash-section-title">2. Iframe Embed (recommended)</h2>' +
       '<p>Paste this anywhere on your website, e.g. a "Design Your Event" page:</p>' +
       '<textarea class="code-box" rows="3" readonly>' + esc(iframeCode) + '</textarea>' +
       '<h2 class="dash-section-title">3. Loader Script (optional, versioned)</h2>' +
       '<p>Renders into the placeholder div automatically and supports future updates without changing your code:</p>' +
       '<textarea class="code-box" rows="3" readonly>' + esc(loaderCode) + '</textarea>' +
       '<h2 class="dash-section-title">4. Allowed Domains</h2>' +
       '<p>List the domains allowed to embed your designer (one per line), e.g. www.yourdomain.com</p>' +
       '<form id="originsForm" class="dash-form">' +
       '<textarea id="originsBox" rows="4">' + esc(origins) + '</textarea>' +
       '<div id="originsError" class="dash-error" hidden></div>' +
       '<div id="originsSaved" class="dash-saved" hidden>Saved.</div>' +
       '<button type="submit" class="btn-primary">Save Allowed Domains</button>' +
       '</form>' +
       '<h2 class="dash-section-title">Embed Identifier</h2>' +
       '<p class="muted">Public embed key (safe to include in front-end code): <code>' + esc(t.embedKey || '') + '</code></p>';
     document.getElementById('originsForm').addEventListener('submit', async function (e) {
       e.preventDefault();
       var errEl = document.getElementById('originsError');
       var savedEl = document.getElementById('originsSaved');
       errEl.hidden = true; savedEl.hidden = true;
       var list = document.getElementById('originsBox').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
       try {
         await api('/api/tenants/' + state.tenant, { method: 'PATCH', body: { allowedOrigins: list } });
         savedEl.hidden = false;
       } catch (err) {
         errEl.textContent = err.message;
         errEl.hidden = false;
       }
     });
   } catch (err) {
     document.getElementById('dashMain').innerHTML = errorHtml(err);
   }
 }

 // Platform-admin only cross-tenant panel. Only ever shown/reachable when
 // state.user.isPlatformAdmin is true (see shellHtml's nav link and the
 // route guard below) - a regular tenant owner can never navigate here
 // because the server-side /api/admin/* routes independently enforce
 // requirePlatformAdmin regardless of what the client does.

 async function viewBilling(route, gen) {
   appEl().innerHTML = shellHtml(route, loadingHtml('Loading billing...'));
   bindShellEvents();
   if (!state.tenant) { document.getElementById('dashMain').innerHTML = '<div class="dash-empty">No tenant access.</div>'; return; }
   if (state.user && state.user.isPlatformAdmin) {
     document.getElementById('dashMain').innerHTML = '' +
       '<h1 class="dash-title">Platform Billing Access</h1>' +
       '<p class="dash-subtitle">You are signed in as the RentSketch platform administrator.</p>' +
       '<div class="dash-saved"><strong>Complimentary platform access is permanent.</strong> Your admin account is not subject to tenant trials, paid plans, cancellations, or past-due billing restrictions.</div>' +
       '<p class="muted">Use Super Admin to inspect tenant subscription states. Opening a tenant does not change your platform-level access.</p>';
     return;
   }
   try {
     var status = await api('/api/business/' + state.tenant + '/billing/status');
     var plans = await api('/api/business/plans');
     if (gen !== renderGeneration) return;
     var plansList = plans.plans || [];
     var selectedInterval = 'monthly';
     var planOptions = plansList.filter(function(p) { return p.id !== 'enterprise'; }).map(function(p) {
       var monthly = (p.monthlyCents || 0) / 100;
       var annual = (p.annualCents || 0) / 100;
       return '<div class="plan-option" data-plan="' + esc(p.id) + '"><div class="plan-name">' + esc(p.name) + '</div><div class="plan-price"><span class="monthly-price" style="display:inline">$' + monthly.toFixed(2) + '/mo</span><span class="annual-price" style="display:none">$' + annual.toFixed(2) + '/yr</span></div></div>';
     }).join('');
     var currentStatus = status.friendlyFree ? '<span style="background:#e6f7ec;color:#1c7a3f;padding:4px 8px;border-radius:4px">Free Access</span>' : 
       ('<span style="background:' + (status.status === 'active' ? '#e4edff' : '#fff3d6') + ';color:' + (status.status === 'active' ? '#2748a8' : '#8a6300') + ';padding:4px 8px;border-radius:4px;text-transform:capitalize">' + esc(status.status || 'unknown') + '</span>');
     var trialText = '';
     if (status.trialEndsAt) {
       var end = new Date(status.trialEndsAt);
       var now = new Date();
       var daysLeft = Math.ceil((end - now) / (24*60*60*1000));
       if (status.status === 'trialing' && daysLeft > 0) trialText = '<p class="trial-banner">Trial ends in ' + daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + ' on ' + fmtDate(status.trialEndsAt) + '</p>';
       else if (status.status === 'trialing' && daysLeft <= 0) trialText = '<p class="trial-banner trial-expired">Your free trial has ended. Choose a plan below to continue.</p>';
     }
     var msg = (window.location.search.indexOf('billing=success') > -1) ? (status.subscription && status.subscription.status === 'active' ? '<div class="dash-saved">Your active subscription has been confirmed.</div>' : '<div class="trial-banner">Checkout returned. Your subscription is not confirmed yet. Refresh billing in a moment; do not start another payment. <button type="button" id="refreshBilling">Refresh billing</button></div>') :
       (window.location.search.indexOf('billing=cancelled') > -1) ? '<div class="dash-error">Checkout was cancelled.</div>' :
       (window.location.search.indexOf('billing=portal-return') > -1) ? '<div class="dash-saved">Returned from billing portal.</div>' : '';
     if (status.friendlyFree) {
       document.getElementById('dashMain').innerHTML = '' +
         '<h1 class="dash-title">Billing</h1>' +
         msg +
         '<div class="dash-empty"><strong>Friendly Party Rental</strong> has complimentary access to RentSketch. No billing required.</div>';
     } else {
       var billingHtml = '<h1 class="dash-title">Billing & Subscription</h1>' + msg + trialText + 
         '<div style="background:#fff;border:1px solid #e3e8ee;border-radius:10px;padding:18px;margin-bottom:20px">' +
         '<h3 style="margin-top:0">Current Status</h3>' +
         '<p><strong>Plan:</strong> ' + esc(status.plan || 'None') + ' &nbsp; <strong>Status:</strong> ' + currentStatus + '</p>' +
         (status.subscription ? '<p class="muted">Period: ' + fmtDate(status.subscription.current_period_start) + ' – ' + fmtDate(status.subscription.current_period_end) + '</p>' : '') +
         '</div>' +
         '<div style="background:#fff;border:1px solid #e3e8ee;border-radius:10px;padding:18px;margin-bottom:20px">' +
         '<h3 style="margin-top:0">Choose Your Plan</h3>' +
         '<div style="margin-bottom:14px"><label><input type="radio" name="interval" value="monthly" checked> Monthly billing &nbsp; <input type="radio" name="interval" value="annual"> Annual billing (save 2 months!)</label></div>' +
         '<div id="plansGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px">' + planOptions + '</div>' +
         '<div id="billingError" class="dash-error" hidden></div>' +
         '<button id="upgradeBtn" class="btn-primary" disabled>Choose Plan</button>' +
         '</div>' +
         '<div style="background:#fff;border:1px solid #e3e8ee;border-radius:10px;padding:18px">' +
         '<h3 style="margin-top:0">Manage Subscription</h3>' +
         '<button id="portalBtn" class="btn-primary">Manage Billing in Stripe</button>' +
         '<p class="muted">Change payment method, view invoices, or cancel your subscription</p>' +
         '</div>';
       document.getElementById('dashMain').innerHTML = billingHtml;
       var refreshBilling = document.getElementById('refreshBilling');
       if (refreshBilling) refreshBilling.addEventListener('click', function () { render(); });
       var selectedPlan = null;
       document.querySelectorAll('.plan-option').forEach(function(el) {
         el.style.cursor = 'pointer';
         el.style.border = '1px solid #d3dae4';
         el.style.borderRadius = '8px';
         el.style.padding = '12px';
         el.onclick = function() {
           document.querySelectorAll('.plan-option').forEach(function(e) { e.style.background = ''; e.style.borderColor = '#d3dae4'; });
           el.style.background = '#e4edff';
           el.style.borderColor = '#2748a8';
           selectedPlan = el.dataset.plan;
           document.getElementById('upgradeBtn').disabled = false;
         };
       });
       document.querySelectorAll('input[name="interval"]').forEach(function(radio) {
         radio.addEventListener('change', function() {
           selectedInterval = this.value;
           document.querySelectorAll('.monthly-price').forEach(function(p) { p.style.display = selectedInterval === 'monthly' ? 'inline' : 'none'; });
           document.querySelectorAll('.annual-price').forEach(function(p) { p.style.display = selectedInterval === 'annual' ? 'inline' : 'none'; });
         });
       });
       document.getElementById('upgradeBtn').addEventListener('click', async function() {
         if (!selectedPlan) { alert('Please choose a plan'); return; }
         var btn = this;
         btn.disabled = true;
         btn.textContent = 'Redirecting to checkout...';
         try {
           var session = await api('/api/business/' + state.tenant + '/billing/checkout-session', {
             method: 'POST',
             body: { plan: selectedPlan, interval: selectedInterval }
           });
           window.location.href = session.url;
         } catch (err) {
           document.getElementById('billingError').textContent = err.message;
           document.getElementById('billingError').hidden = false;
           btn.disabled = false;
           btn.textContent = 'Choose Plan';
         }
       });
       document.getElementById('portalBtn').addEventListener('click', async function() {
         var btn = this;
         btn.disabled = true;
         btn.textContent = 'Loading...';
         try {
           var portal = await api('/api/business/' + state.tenant + '/billing/portal-session', { method: 'POST' });
           window.location.href = portal.url;
         } catch (err) {
           alert('Error: ' + err.message);
           btn.disabled = false;
           btn.textContent = 'Manage Billing in Stripe';
         }
       });
     }
   } catch (err) {
     document.getElementById('dashMain').innerHTML = errorHtml(err);
   }
 }

 async function viewSuperAdmin(route, gen) {
   appEl().innerHTML = shellHtml(route, loadingHtml('Loading platform overview...'));
   bindShellEvents();
   if (!state.user || !state.user.isPlatformAdmin) {
     document.getElementById('dashMain').innerHTML = '<div class="dash-empty">Platform admin access required.</div>';
     return;
   }
   try {
     var overview = await api('/api/admin/overview');
     var tenantsResp = await api('/api/admin/tenants');
     var revenue = await api('/api/admin/revenue');
     if (gen !== renderGeneration) return;
     var rows = tenantsResp.tenants || [];
     var statusCounts = {};
     (overview.byStatus || []).forEach(function (s) { statusCounts[s.subscription_status] = s.count; });
     var tableBody = rows.length ? rows.map(function (t) {
       var trialInfo = t.trial_ends_at ? fmtDate(t.trial_ends_at) : '—';
       return '<tr>' +
         '<td>' + esc(t.name) + '<br><span class="muted">' + esc(t.slug) + '</span></td>' +
         '<td>' + esc(t.subscription_plan || '—') + '</td>' +
         '<td><span class="status-badge status-' + esc(t.subscription_status || '') + '">' + esc(t.subscription_status || '—') + '</span></td>' +
         '<td>' + trialInfo + '</td>' +
         '<td>' + esc(t.stripe_connect_status || 'not_connected') + '</td>' +
         '<td>' + t.product_count + '</td>' +
         '<td>' + t.quote_request_count + '</td>' +
         '<td>' + t.member_count + '</td>' +
         '<td>' + fmtDate(t.created_at) + '</td>' +
         '</tr>';
     }).join('') : '<tr><td colspan="9">No tenants yet.</td></tr>';
     var html = '' +
       '<h1 class="dash-title">Super Admin</h1>' +
       '<p class="dash-subtitle">Platform-wide view across every tenant on RentSketch.</p>' +
       '<div class="stat-row">' +
       '<div class="stat-card"><div class="stat-num">' + overview.totalTenants + '</div><div class="stat-label">Total Tenants</div></div>' +
       '<div class="stat-card"><div class="stat-num">' + overview.totalUsers + '</div><div class="stat-label">Total Users</div></div>' +
       '<div class="stat-card"><div class="stat-num">' + (statusCounts.trialing || 0) + '</div><div class="stat-label">Trialing</div></div>' +
       '<div class="stat-card"><div class="stat-num">' + (statusCounts.active || 0) + '</div><div class="stat-label">Active (Paid)</div></div>' +
       '</div>' +
       '<h2 class="dash-section-title">Revenue (Payment Taxonomy)</h2>' +
       '<div class="stat-row">' +
       '<div class="stat-card"><div class="stat-num">' + money(revenue.consumerDeposits.total_cents / 100) + '</div><div class="stat-label">Consumer Deposits Paid (' + revenue.consumerDeposits.count + ')</div></div>' +
       '<div class="stat-card"><div class="stat-num">' + money(revenue.platformFees.total_cents / 100) + '</div><div class="stat-label">Platform Fees Collected (' + revenue.platformFees.count + ')</div></div>' +
       '<div class="stat-card"><div class="stat-num">' + money((revenue.consumerPayments || []).reduce(function (sum, p) { return sum + p.total_cents; }, 0) / 100) + '</div><div class="stat-label">Event Pass Revenue</div></div>' +
       '<div class="stat-card"><div class="stat-num">\u2014</div><div class="stat-label">Tenant Subscriptions (not yet built)</div></div>' +
       '</div>' +
       '<p class="muted">Consumer deposits are tenant revenue (RentSketch never touches these funds unless a Connect fee applies). Platform fees are RentSketch\'s own cut of a Connect deposit. Event Pass revenue is RentSketch\'s direct-to-consumer product, unrelated to any tenant. Tenant subscription billing is now integrated. See the Billing page.</p>' +
       '<h2 class="dash-section-title">All Tenants</h2>' +
       '<table class="dash-table"><thead><tr>' +
       '<th>Business</th><th>Plan</th><th>Status</th><th>Trial Ends</th><th>Connect</th>' +
       '<th>Products</th><th>Quote Reqs</th><th>Members</th><th>Created</th>' +
       '</tr></thead><tbody>' + tableBody + '</tbody></table>';
     document.getElementById('dashMain').innerHTML = html;
   } catch (err) {
     document.getElementById('dashMain').innerHTML = errorHtml(err);
   }
 }

 function render() {
   var route = currentRoute();
   var authed = !!getToken() && !!state.user;
   if (!authed) {
     if (route !== 'login') { window.location.hash = '#/login'; return; }
     viewLogin();
     return;
   }
   if (route === 'login' || !route) {
     if (state.user && state.user.isPlatformAdmin && !platformTenantView()) { window.location.replace('/dashboard/platform.html#overview'); return; }
     window.location.hash = '#/overview';
     return;
   }
   renderGeneration++;
  var __gen = renderGeneration;
  if (route === 'overview') viewOverview(route, __gen);
   else if (route === 'requests') viewRequests(route, __gen);
   else if (route === 'products') viewProducts(route, __gen);
   else if (route === 'branding') viewBranding(route, __gen);
   else if (route === 'billing') viewBilling(route, __gen);
   else if (route === 'install') viewInstall(route, __gen);
   else if (route === 'superadmin') { window.location.replace('/dashboard/platform.html#overview'); }
 }

 async function boot() {
   var token = getToken();
   if (token) {
     try {
       await loadMe();
       if (state.user && state.user.isPlatformAdmin && !platformTenantView() && !/\/dashboard\/platform\.html$/i.test(location.pathname)) { window.location.replace('/dashboard/platform.html#overview'); return; }
     } catch (e) {
       setToken(null); setActiveTenant(null); state.user = null;
     }
   }
   render();
 }

 window.addEventListener('hashchange', render);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
