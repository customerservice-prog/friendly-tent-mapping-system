(function () {
  'use strict';

 var API_BASE = window.RENTSKETCH_API_URL || 'https://rentsketch-api-production.up.railway.app';
  var TOKEN_KEY = 'rentsketch_dashboard_token';
  var TENANT_KEY = 'rentsketch_dashboard_tenant';
  var ROUTES = ['login', 'overview', 'products', 'branding', 'requests', 'install'];

 function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { if (t) { localStorage.setItem(TOKEN_KEY, t); } else { localStorage.removeItem(TOKEN_KEY); } }
  function getActiveTenant() { return localStorage.getItem(TENANT_KEY); }
  function setActiveTenant(slug) { if (slug) { localStorage.setItem(TENANT_KEY, slug); } else { localStorage.removeItem(TENANT_KEY); } }

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

 function currentRoute() {
   var h = (window.location.hash || '').replace(/^#\/?/, '').split('?')[0];
   return ROUTES.indexOf(h) === -1 ? '' : h;
 }

 function appEl() { return document.getElementById('app'); }

 function shellHtml(route, inner) {
   var tenants = state.tenants || [];
   var switcher = '';
   if (tenants.length > 1) {
     switcher = '<select id="tenantSwitch" class="tenant-switch">' + tenants.map(function (t) {
       return '<option value="' + esc(t.slug) + '"' + (t.slug === state.tenant ? ' selected' : '') + '>' + esc(t.name) + '</option>';
     }).join('') + '</select>';
   } else if (tenants.length === 1) {
     switcher = '<span class="tenant-name">' + esc(tenants[0].name) + '</span>';
   }
   function navLink(r, label) {
     return '<a href="#/' + r + '" class="nav-link' + (route === r ? ' active' : '') + '">' + label + '</a>';
   }
   return '' +
     '<div class="dash-shell">' +
     '<header class="dash-header">' +
     '<div class="dash-brand">RentSketch <span class="dash-brand-sub">Business Dashboard</span></div>' +
     '<nav class="dash-nav">' +
     navLink('overview', 'Overview') + navLink('requests', 'Requests') + navLink('products', 'Products') +
     navLink('branding', 'Branding') + navLink('install', 'Install') +
     '</nav>' +
     '<div class="dash-account">' + switcher + '<button id="btnLogout" class="btn-logout" type="button">Log out</button></div>' +
     '</header>' +
     '<main class="dash-main" id="dashMain">' + inner + '</main>' +
     '</div>';
 }

 function loadingHtml(label) { return '<div class="dash-loading">' + esc(label || 'Loading...') + '</div>'; }
  function errorHtml(err) { return '<div class="dash-error">' + esc(err && err.message ? err.message : String(err)) + '</div>'; }

 function bindShellEvents() {
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

 async function viewOverview(route) {
   appEl().innerHTML = shellHtml(route, loadingHtml('Loading overview...'));
   bindShellEvents();
   if (!state.tenant) {
     document.getElementById('dashMain').innerHTML = '<div class="dash-empty">Your account is not a member of any tenant yet. Ask a RentSketch admin to add you.</div>';
     return;
   }
   try {
     var admin = await api('/api/tenants/' + state.tenant + '/admin');
     var designs = await api('/api/tenants/' + state.tenant + '/designs');
     var requests = await api('/api/tenants/' + state.tenant + '/quote-requests');
     var reqs = requests.quoteRequests || [];
     var newCount = reqs.filter(function (r) { return r.status === 'new'; }).length;
     var html = '' +
       '<h1 class="dash-title">' + esc(admin.name) + '</h1>' +
       '<p class="dash-subtitle">Plan: ' + esc(admin.subscriptionPlan || 'trial') + ' &middot; Status: ' + esc(admin.subscriptionStatus || 'trialing') + '</p>' +
       '<div class="stat-row">' +
       '<div class="stat-card"><div class="stat-num">' + reqs.length + '</div><div class="stat-label">Quote Requests</div></div>' +
       '<div class="stat-card"><div class="stat-num">' + newCount + '</div><div class="stat-label">New / Unread</div></div>' +
       '<div class="stat-card"><div class="stat-num">' + (designs.designs || []).length + '</div><div class="stat-label">Saved Designs (last 50)</div></div>' +
       '</div>' +
       '<h2 class="dash-section-title">Recent Quote Requests</h2>' +
       renderRequestsTable(reqs.slice(0, 8), false) +
       '<p class="dash-more"><a href="#/requests">View all requests &rarr;</a></p>';
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
       '<td>' + fmtDateTime(r.created_at) + '</td>' +
       '<td>' + (withActions ? statusSelect(r) : '<span class="status-badge status-' + esc(r.status) + '">' + esc(r.status) + '</span>') + '</td>' +
       '</tr>';
   }).join('');
   return '<table class="dash-table"><thead><tr><th>Customer</th><th>Event Date</th><th>Guests</th><th>Estimate</th><th>Submitted</th><th>Status</th></tr></thead><tbody>' + body + '</tbody></table>';
 }

 function statusSelect(r) {
   var opts = ['new', 'contacted', 'quoted', 'booked', 'declined'];
   return '<select class="status-select" data-id="' + esc(r.id) + '">' + opts.map(function (o) {
     return '<option value="' + o + '"' + (o === r.status ? ' selected' : '') + '>' + o + '</option>';
   }).join('') + '</select>';
 }

 async function viewRequests(route) {
   appEl().innerHTML = shellHtml(route, loadingHtml('Loading requests...'));
   bindShellEvents();
   if (!state.tenant) { document.getElementById('dashMain').innerHTML = '<div class="dash-empty">No tenant access.</div>'; return; }
   try {
     var requests = await api('/api/tenants/' + state.tenant + '/quote-requests');
     var reqs = requests.quoteRequests || [];
     document.getElementById('dashMain').innerHTML = '<h1 class="dash-title">Quote Requests</h1>' + renderRequestsTable(reqs, true);
     Array.prototype.forEach.call(document.querySelectorAll('.status-select'), function (sel) {
       sel.addEventListener('change', async function () {
         sel.disabled = true;
         try {
           await api('/api/tenants/' + state.tenant + '/quote-requests/' + sel.getAttribute('data-id'), { method: 'PATCH', body: { status: sel.value } });
         } catch (err) {
           window.alert('Could not update status: ' + err.message);
         } finally {
           sel.disabled = false;
         }
       });
     });
   } catch (err) {
     document.getElementById('dashMain').innerHTML = errorHtml(err);
   }
 }

 async function viewProducts(route) {
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
     var rows = products.map(function (p) {
               var needsVisual = ['tent', 'table', 'chair'].indexOf(p.category) !== -1;
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
       '<h1 class="dash-title">Products</h1>' +
       '<p class="dash-subtitle">These are the real items customers see in your designer. Changes appear immediately. Pick a Visual for each tent, table, and chair so it renders correctly on the design canvas. Items without one are automatically hidden from the customer designer (not shown as a generic shape) until mapped &mdash; see the "In Designer" column below.</p>' +
       table +
       '<h2 class="dash-section-title">Add a Product</h2>' +
       '<form id="productForm" class="dash-form">' +
       '<label>Category<input type="text" id="pCategory" placeholder="tent, table, chair" required></label>' +
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

 async function viewBranding(route) {
   appEl().innerHTML = shellHtml(route, loadingHtml('Loading branding...'));
   bindShellEvents();
   if (!state.tenant) { document.getElementById('dashMain').innerHTML = '<div class="dash-empty">No tenant access.</div>'; return; }
   try {
     var t = await api('/api/tenants/' + state.tenant + '/admin');
     document.getElementById('dashMain').innerHTML = '' +
       '<h1 class="dash-title">Branding &amp; Settings</h1>' +
       '<p class="dash-subtitle">This controls how your hosted designer looks to your customers.</p>' +
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
       '</form>';
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
   } catch (err) {
     document.getElementById('dashMain').innerHTML = errorHtml(err);
   }
 }

 async function viewInstall(route) {
   appEl().innerHTML = shellHtml(route, loadingHtml('Loading install info...'));
   bindShellEvents();
   if (!state.tenant) { document.getElementById('dashMain').innerHTML = '<div class="dash-empty">No tenant access.</div>'; return; }
   try {
     var t = await api('/api/tenants/' + state.tenant + '/admin');
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

 function render() {
   var route = currentRoute();
   var authed = !!getToken() && !!state.user;
   if (!authed) {
     if (route !== 'login') { window.location.hash = '#/login'; return; }
     viewLogin();
     return;
   }
   if (route === 'login' || !route) {
     window.location.hash = '#/overview';
     return;
   }
   if (route === 'overview') viewOverview(route);
   else if (route === 'requests') viewRequests(route);
   else if (route === 'products') viewProducts(route);
   else if (route === 'branding') viewBranding(route);
   else if (route === 'install') viewInstall(route);
 }

 async function boot() {
   var token = getToken();
   if (token) {
     try {
       await loadMe();
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
