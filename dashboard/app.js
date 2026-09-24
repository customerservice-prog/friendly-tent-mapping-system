(function () {
  'use strict';

 var API_BASE = window.RENTSKETCH_API_URL || 'https://rentsketch-api-production.up.railway.app';
  var TOKEN_KEY = 'rentsketch_dashboard_token';
  var TENANT_KEY = 'rentsketch_dashboard_tenant';
  var ROUTES = ['login', 'overview', 'requests', 'products', 'branding', 'analytics', 'billing', 'install', 'superadmin'];

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

 function shellHtml(route, inner) {
   var tenants = state.tenants || [];
   var platformAdmin = !!(state.user && state.user.isPlatformAdmin);
   var brandSub = platformAdmin ? 'Tenant Workspace · Admin' : 'Business Workspace';
   var switcher = '';
   if (tenants.length > 1) {
     switcher = '<select id="tenantSwitch" class="tenant-switch" aria-label="Switch business">' + tenants.map(function (t) {
       return '<option value="' + esc(t.slug) + '"' + (t.slug === state.tenant ? ' selected' : '') + '>' + esc(t.name) + '</option>';
     }).join('') + '</select>';
   } else if (tenants.length === 1) {
     switcher = '<span class="tenant-name">' + esc(tenants[0].name) + '</span>';
   }
   function navLink(r, label) {
     return '<a href="#/' + r + '" class="nav-link' + (route === r ? ' active' : '') + '">' + label + '</a>';
   }
   return '' +
     '<div class="dash-shell" id="tenantShell">' +
     '<button type="button" id="tenantMobileMenu" aria-label="Open workspace menu">☰</button>' +
     '<header class="dash-header">' +
       '<div class="dash-brand">RentSketch <span class="dash-brand-sub">' + brandSub + '</span></div>' +
       '<nav class="dash-nav" aria-label="Business workspace">' +
         navLink('overview', 'Overview') + navLink('requests', 'Requests') + navLink('products', 'Products') +
         navLink('branding', 'Branding') + navLink('analytics', 'Analytics') + navLink('billing', 'Billing') + navLink('install', 'Install') +
         (platformAdmin ? '<a href="/dashboard/platform.html#overview" class="nav-link">Platform Console</a>' : '') +
       '</nav>' +
       '<div class="dash-account">' + switcher +
         (platformAdmin ? '<span class="role-pill">Platform Admin</span>' : '') +
         '<button id="btnLogout" class="btn-logout" type="button">Log out</button>' +
       '</div>' +
     '</header>' +
     '<main class="dash-main" id="dashMain">' + inner + '</main>' +
     '</div>';
 }

 function loadingHtml(label) { return '<div class="dash-loading">' + esc(label || 'Loading...') + '</div>'; }
 function errorHtml(err) { return '<div class="dash-error">' + esc(err && err.message ? err.message : String(err)) + (err && err.status === 402 ? ' <a href="#/billing">Open Billing to continue →</a>' : '') + '</div>'; }

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
   var mobile = document.getElementById('tenantMobileMenu');
   var shell = document.getElementById('tenantShell');
   if (mobile && shell) mobile.addEventListener('click', function () { shell.classList.toggle('menu-open'); });
   document.querySelectorAll('.dash-nav a').forEach(function (link) {
     link.addEventListener('click', function () { if (shell) shell.classList.remove('menu-open'); });
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
   appEl().innerHTML = shellHtml(route, loadingHtml('Loading workspace...'));
   bindShellEvents();
   if (!state.tenant) {
     document.getElementById('dashMain').innerHTML = '<div class="dash-empty"><div class="dash-empty-icon">RS</div><h3>No business assigned yet</h3><p>Ask a RentSketch administrator to add this account to a business workspace.</p></div>';
     return;
   }
   try {
     var results = await Promise.all([
       api('/api/tenants/' + state.tenant + '/admin'),
       api('/api/tenants/' + state.tenant + '/designs'),
       api('/api/tenants/' + state.tenant + '/quote-requests'),
       api('/api/tenants/' + state.tenant + '/products'),
       api('/api/tenants/' + state.tenant + '/connect/status').catch(function(){ return {status:'unavailable',hasAccount:false}; })
     ]);
     var admin=results[0], designs=results[1], requests=results[2], productsData=results[3], connect=results[4];
     var reqs=requests.quoteRequests||[], designsList=designs.designs||[], products=productsData.products||[];
     var newCount=reqs.filter(function(r){return r.status==='new';}).length;
     var bookedCount=reqs.filter(function(r){return r.status==='booked';}).length;
     var pipeline=reqs.filter(function(r){return r.status!=='declined';}).reduce(function(sum,r){return sum+Number(r.estimate_total||0);},0);
     var pricedProducts=products.filter(function(p){return Number(p.price_per_day)>0;}).length;
     var mappedProducts=products.filter(function(p){return !!p.visual_model_id || ['other','accessory','inflatable'].indexOf(normCategory(p.category))!==-1;}).length;
     var brandingReady=!!(admin.name && (admin.logoUrl || admin.primaryColor) && admin.contactEmail);
     var installReady=Array.isArray(admin.allowedOrigins)&&admin.allowedOrigins.length>0;
     var paymentsReady=connect.status==='active';
     var launch=[
       {key:'catalog',label:'Build your catalog',detail:products.length?products.length+' products added':'Add the rentals customers can place',done:products.length>0,href:'#/products'},
       {key:'brand',label:'Finish your branding',detail:brandingReady?'Company identity is configured':'Logo, colors and contact details',done:brandingReady,href:'#/branding'},
       {key:'price',label:'Confirm pricing',detail:pricedProducts+'/'+products.length+' products have pricing',done:products.length>0&&pricedProducts===products.length,href:'#/products'},
       {key:'pay',label:'Connect payments',detail:paymentsReady?'Stripe payouts connected':'Connect Stripe for customer deposits',done:paymentsReady,href:'#/branding'},
       {key:'install',label:'Publish your designer',detail:installReady?'Allowed website domain saved':'Add your website and preview the embed',done:installReady,href:'#/install'}
     ];
     var done=launch.filter(function(x){return x.done;}).length,pct=Math.round(done/launch.length*100);
     if(gen!==renderGeneration)return;
     var designerUrl='/designer/?tenant='+encodeURIComponent(state.tenant);
     var trial='';
     if(!(state.user&&state.user.isPlatformAdmin)&&admin.trialEndsAt){
       var daysLeft=Math.ceil((new Date(admin.trialEndsAt)-new Date())/86400000);
       if(admin.subscriptionStatus==='trialing'&&daysLeft<=0)trial='<div class="trial-banner trial-expired">Your trial has ended. Billing remains available so you can choose a plan.</div>';
       else if(admin.subscriptionStatus==='trialing')trial='<div class="trial-banner">Trial ends in '+daysLeft+' day'+(daysLeft===1?'':'s')+'.</div>';
     }
     var activity=[];
     reqs.slice(0,8).forEach(function(r){activity.push({type:'request',title:(r.customer_name||'Customer')+' submitted a quote request',detail:(r.event_type||'Event')+(r.estimate_total?' · '+money(r.estimate_total):''),at:r.created_at,status:r.status});});
     designsList.slice(0,8).forEach(function(d){activity.push({type:'design',title:'A design was saved',detail:(d.event_type||'Event')+(d.guest_count?' · '+d.guest_count+' guests':''),at:d.created_at,status:'active'});});
     activity.sort(function(a,b){return new Date(b.at)-new Date(a.at);});activity=activity.slice(0,7);
     var health=[
       {label:'Catalog',detail:products.length+' products · '+mappedProducts+' visually mapped',ok:products.length>0&&mappedProducts>=Math.min(products.length,1),href:'#/products'},
       {label:'Branding',detail:brandingReady?'Customer-facing identity ready':'Finish logo/colors/contact info',ok:brandingReady,href:'#/branding'},
       {label:'Payments',detail:paymentsReady?'Stripe payouts connected':connect.hasAccount?'Stripe onboarding incomplete':'Stripe not connected',ok:paymentsReady,href:'#/branding'},
       {label:'Website install',detail:installReady?admin.allowedOrigins.length+' allowed domain'+(admin.allowedOrigins.length===1?'':'s'):'No allowed website domain yet',ok:installReady,href:'#/install'}
     ];
     var html=
       '<div class="tw-page-head"><div><div class="tw-eyebrow">Business workspace</div><h1 class="dash-title">'+esc(admin.name)+'</h1><p class="dash-subtitle">Customer activity, designer readiness, requests and account health in one place.</p></div><div class="tw-actions"><a class="tw-btn" href="#/requests">Open requests</a><a class="tw-btn" href="'+designerUrl+'" target="_blank" rel="noopener">Preview designer</a><a class="tw-btn primary" href="'+designerUrl+'" target="_blank" rel="noopener">✦ Open RentSketch</a></div></div>'+
       ((state.user&&state.user.isPlatformAdmin)?'<div class="role-banner"><strong>Platform Admin</strong>&nbsp; You are viewing this tenant with unrestricted platform access. Customer billing rules are unchanged.</div>':'')+
       trial+
       '<section class="tw-progress-card"><div class="tw-progress-top"><div><div class="tw-eyebrow">Launch checklist</div><h2>'+ (pct===100?'Your designer is launch-ready':'Finish your customer designer') +'</h2></div><span>'+done+' of '+launch.length+' complete · '+pct+'%</span></div><div class="tw-progress-track"><span style="width:'+pct+'%"></span></div><div class="tw-checklist">'+
       launch.map(function(x){return '<a class="tw-check '+(x.done?'done':'')+'" href="'+x.href+'"><i>'+(x.done?'✓':'•')+'</i><span><strong>'+esc(x.label)+'</strong><small>'+esc(x.detail)+'</small></span></a>';}).join('')+
       '</div></section>'+
       '<section class="tw-metrics">'+
         '<article class="tw-metric"><div class="tw-metric-label">Quote requests</div><div class="tw-metric-value">'+reqs.length+'</div><div class="tw-metric-detail">'+newCount+' new / unread</div></article>'+
         '<article class="tw-metric"><div class="tw-metric-label">Saved designs</div><div class="tw-metric-value">'+designsList.length+'</div><div class="tw-metric-detail">Latest 50 customer layouts</div></article>'+
         '<article class="tw-metric"><div class="tw-metric-label">Booked requests</div><div class="tw-metric-value">'+bookedCount+'</div><div class="tw-metric-detail">Marked booked by your team</div></article>'+
         '<article class="tw-metric"><div class="tw-metric-label">Open estimate pipeline</div><div class="tw-metric-value">'+money(pipeline)+'</div><div class="tw-metric-detail">Non-declined request estimates</div></article>'+
       '</section>'+
       '<div class="tw-grid"><div class="tw-stack">'+
         '<section class="tw-panel"><div class="tw-panel-head"><div><h2>Recent quote requests</h2><p>Newest customer requests and current status.</p></div><a class="tw-btn" href="#/requests">View all</a></div><div class="tw-table-scroll">'+renderRequestsTable(reqs.slice(0,7),false)+'</div></section>'+
         '<section class="tw-panel"><div class="tw-panel-head"><div><h2>Recent activity</h2><p>Customer requests and saved-design activity.</p></div><a class="tw-btn" href="#/analytics">Analytics</a></div><div class="tw-panel-body">'+
           (activity.length?'<div class="tw-activity-list">'+activity.map(function(a){return '<div class="tw-activity-row"><div><strong>'+esc(a.title)+'</strong><p>'+esc(a.detail)+' · '+fmtDateTime(a.at)+'</p></div><span class="tw-status '+esc(a.status)+'">'+esc(a.type)+'</span></div>';}).join('')+'</div>':'<div class="dash-empty"><h3>No customer activity yet</h3><p>Preview your designer or share its link to start collecting layouts and requests.</p></div>')+
         '</div></section>'+
       '</div><aside class="tw-stack">'+
         '<section class="tw-panel"><div class="tw-panel-head"><div><h2>Business health</h2><p>What is ready and what still needs attention.</p></div></div><div class="tw-panel-body"><div class="tw-health-list">'+health.map(function(h){return '<a class="tw-health-row" href="'+h.href+'" style="text-decoration:none;color:inherit"><div><strong><i class="tw-dot '+(h.ok?'':'warn')+'"></i>'+esc(h.label)+'</strong><p>'+esc(h.detail)+'</p></div><span class="tw-status '+(h.ok?'ok':'new')+'">'+(h.ok?'Ready':'Review')+'</span></a>';}).join('')+'</div></div></section>'+
         '<section class="tw-panel"><div class="tw-panel-head"><div><h2>Quick actions</h2><p>Common workspace tasks.</p></div></div><div class="tw-panel-body"><div class="tw-list">'+
           '<a class="tw-list-row" href="'+designerUrl+'" target="_blank" rel="noopener"><strong>Open customer designer</strong><span>↗</span></a>'+
           '<a class="tw-list-row" href="#/products"><strong>Manage catalog</strong><span>→</span></a>'+
           '<a class="tw-list-row" href="#/branding"><strong>Branding & payouts</strong><span>→</span></a>'+
           '<a class="tw-list-row" href="#/install"><strong>Website install</strong><span>→</span></a>'+
         '</div></div></section>'+
       '</aside></div>';
     document.getElementById('dashMain').innerHTML=html;
   } catch(err){document.getElementById('dashMain').innerHTML=errorHtml(err);}
 }

 async function viewAnalytics(route,gen){
   appEl().innerHTML=shellHtml(route,loadingHtml('Loading analytics...'));bindShellEvents();
   if(!state.tenant){document.getElementById('dashMain').innerHTML='<div class="dash-empty">No tenant access.</div>';return;}
   try{
     var data=await Promise.all([
       api('/api/tenants/'+state.tenant+'/quote-requests'),
       api('/api/tenants/'+state.tenant+'/designs'),
       api('/api/tenants/'+state.tenant+'/products')
     ]);
     var reqs=data[0].quoteRequests||[],designs=data[1].designs||[],products=data[2].products||[];
     var now=Date.now(),monthAgo=now-30*86400000;
     var recentReq=reqs.filter(function(r){return new Date(r.created_at).getTime()>=monthAgo;});
     var recentDesigns=designs.filter(function(d){return new Date(d.created_at).getTime()>=monthAgo;});
     var booked=reqs.filter(function(r){return r.status==='booked';}).length;
     var avg=reqs.length?reqs.reduce(function(s,r){return s+Number(r.estimate_total||0);},0)/reqs.length:0;
     var avgGuests=reqs.filter(function(r){return Number(r.guest_count)>0;});
     avgGuests=avgGuests.length?Math.round(avgGuests.reduce(function(s,r){return s+Number(r.guest_count);},0)/avgGuests.length):0;
     var types={};reqs.forEach(function(r){var k=r.event_type||'Unspecified';types[k]=(types[k]||0)+1;});
     var statuses={};reqs.forEach(function(r){statuses[r.status]=(statuses[r.status]||0)+1;});
     var maxStatus=Math.max(1,...Object.values(statuses));
     if(gen!==renderGeneration)return;
     document.getElementById('dashMain').innerHTML=
       '<div class="tw-page-head"><div><div class="tw-eyebrow">Workspace analytics</div><h1 class="dash-title">Customer planning activity</h1><p class="dash-subtitle">A practical view of demand coming through your RentSketch designer.</p></div><div class="tw-actions"><a class="tw-btn primary" href="/designer/?tenant='+encodeURIComponent(state.tenant)+'" target="_blank" rel="noopener">Open RentSketch</a></div></div>'+
       '<section class="tw-metrics">'+
         '<article class="tw-metric"><div class="tw-metric-label">Requests · 30 days</div><div class="tw-metric-value">'+recentReq.length+'</div><div class="tw-metric-detail">'+reqs.length+' all-time requests</div></article>'+
         '<article class="tw-metric"><div class="tw-metric-label">Designs · 30 days</div><div class="tw-metric-value">'+recentDesigns.length+'</div><div class="tw-metric-detail">'+designs.length+' saved layouts in current history</div></article>'+
         '<article class="tw-metric"><div class="tw-metric-label">Request → booked</div><div class="tw-metric-value">'+(reqs.length?Math.round(booked/reqs.length*100):0)+'%</div><div class="tw-metric-detail">'+booked+' booked of '+reqs.length+' requests</div></article>'+
         '<article class="tw-metric"><div class="tw-metric-label">Average estimate</div><div class="tw-metric-value">'+money(avg)+'</div><div class="tw-metric-detail">'+(avgGuests?avgGuests+' average guests':'Guest count not available')+'</div></article>'+
       '</section>'+
       '<div class="tw-analytics-grid">'+
         '<section class="tw-panel"><div class="tw-panel-head"><div><h2>Request pipeline</h2><p>Status distribution across customer requests.</p></div></div><div class="tw-panel-body">'+Object.keys(statuses).map(function(k){return '<div class="tw-list-row"><span>'+esc(k)+'</span><strong>'+statuses[k]+'</strong></div><div class="tw-bar"><span style="width:'+Math.round(statuses[k]/maxStatus*100)+'%"></span></div>';}).join('')+(Object.keys(statuses).length?'':emptyAnalytics('No requests yet'))+'</div></section>'+
         '<section class="tw-panel"><div class="tw-panel-head"><div><h2>Event types</h2><p>What customers are planning.</p></div></div><div class="tw-panel-body">'+Object.entries(types).sort(function(a,b){return b[1]-a[1];}).slice(0,8).map(function(x){return '<div class="tw-list-row"><span>'+esc(x[0])+'</span><strong>'+x[1]+'</strong></div>';}).join('')+(Object.keys(types).length?'':emptyAnalytics('No event-type data yet'))+'</div></section>'+
         '<section class="tw-panel"><div class="tw-panel-head"><div><h2>Catalog readiness</h2><p>How much of your equipment is customer-ready.</p></div></div><div class="tw-panel-body"><div class="tw-list-row"><span>Total products</span><strong>'+products.length+'</strong></div><div class="tw-list-row"><span>Active</span><strong>'+products.filter(function(p){return p.active;}).length+'</strong></div><div class="tw-list-row"><span>Priced</span><strong>'+products.filter(function(p){return Number(p.price_per_day)>0;}).length+'</strong></div><div class="tw-list-row"><span>Visual model assigned</span><strong>'+products.filter(function(p){return p.visual_model_id;}).length+'</strong></div></div></section>'+
       '</div>';
   }catch(err){document.getElementById('dashMain').innerHTML=errorHtml(err);}
 }
 function emptyAnalytics(text){return '<div class="dash-empty"><p>'+esc(text)+'</p></div>';}

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
   if (!state.tenant) { document.getElementById('dashMain').innerHTML = '<div class="dash-empty">No tenant access.</div>'; return; }
   try {
     var requests = await api('/api/tenants/' + state.tenant + '/quote-requests');
     var reqs = requests.quoteRequests || [];
     if (gen !== renderGeneration) return;
     var pipeline=reqs.filter(function(r){return r.status!=='declined';}).reduce(function(s,r){return s+Number(r.estimate_total||0);},0);
     document.getElementById('dashMain').innerHTML =
       '<div class="tw-page-head"><div><div class="tw-eyebrow">Customer pipeline</div><h1 class="dash-title">Quote requests</h1><p class="dash-subtitle">Search, review and move customer requests through your sales process.</p></div><div class="tw-actions"><a class="tw-btn primary" href="/designer/?tenant='+encodeURIComponent(state.tenant)+'" target="_blank" rel="noopener">Preview customer designer</a></div></div>'+
       '<section class="tw-metrics">'+
         '<article class="tw-metric"><div class="tw-metric-label">All requests</div><div class="tw-metric-value">'+reqs.length+'</div><div class="tw-metric-detail">Total request records</div></article>'+
         '<article class="tw-metric"><div class="tw-metric-label">New</div><div class="tw-metric-value">'+reqs.filter(function(r){return r.status==="new";}).length+'</div><div class="tw-metric-detail">Needs your attention</div></article>'+
         '<article class="tw-metric"><div class="tw-metric-label">Booked</div><div class="tw-metric-value">'+reqs.filter(function(r){return r.status==="booked";}).length+'</div><div class="tw-metric-detail">Converted requests</div></article>'+
         '<article class="tw-metric"><div class="tw-metric-label">Open estimate pipeline</div><div class="tw-metric-value">'+money(pipeline)+'</div><div class="tw-metric-detail">Excludes declined requests</div></article>'+
       '</section>'+
       '<div class="tw-panel"><div class="tw-panel-head"><div><h2>Request inbox</h2><p>Filter by customer, event or status. Changes save immediately.</p></div></div><div class="tw-panel-body"><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="requestSearch" type="search" placeholder="Search customer, email, event…" style="flex:1;min-width:220px;border:1px solid #d7e0eb;border-radius:9px;padding:9px 10px"><select id="requestStatus" style="border:1px solid #d7e0eb;border-radius:9px;padding:9px 10px"><option value="">All statuses</option><option>new</option><option>contacted</option><option>quoted</option><option>booked</option><option>declined</option></select></div></div><div id="requestTable" class="tw-table-scroll"></div></div>';
     function paint(){
       var q=(document.getElementById('requestSearch').value||'').toLowerCase(),st=document.getElementById('requestStatus').value;
       var rows=reqs.filter(function(r){return (!st||r.status===st)&&(!q||[r.customer_name,r.customer_email,r.event_type,r.customer_phone].join(' ').toLowerCase().includes(q));});
       document.getElementById('requestTable').innerHTML=renderRequestsTable(rows,true);
       Array.prototype.forEach.call(document.querySelectorAll('.status-select'), function (sel) {
         sel.addEventListener('change', async function () {
           sel.disabled=true;
           try { await api('/api/tenants/'+state.tenant+'/quote-requests/'+sel.getAttribute('data-id'),{method:'PATCH',body:{status:sel.value}}); var row=reqs.find(function(r){return String(r.id)===String(sel.getAttribute('data-id'));});if(row)row.status=sel.value; }
           catch(err){window.alert('Could not update status: '+err.message);}
           finally{sel.disabled=false;}
         });
       });
     }
     document.getElementById('requestSearch').oninput=paint;document.getElementById('requestStatus').onchange=paint;paint();
   } catch (err) { document.getElementById('dashMain').innerHTML = errorHtml(err); }
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
       '<h1 class="dash-title">Products</h1>' +
       '<p class="dash-subtitle">These are the real items customers see in your designer. Changes appear immediately. Pick a Visual for each tent, table, and chair so it renders correctly on the design canvas. Items without one are automatically hidden from the customer designer (not shown as a generic shape) until mapped &mdash; see the "In Designer" column below.</p>' +
       table +
       '<h2 class="dash-section-title">Add a Product</h2>' +
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
       '</form>' +
        '<div id="payoutsSection" class="dash-section"><h2 class="dash-section-title">Payouts</h2><p id="payoutsStatus" class="dash-subtitle">Loading payouts status...</p><button id="connectStripeBtn" class="btn-primary" hidden>Connect Stripe to receive payouts</button></div>';
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
   else if (route === 'analytics') viewAnalytics(route, __gen);
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
