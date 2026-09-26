(function(){
'use strict';
var API=window.RENTSKETCH_API_URL||'https://rentsketch-api-production.up.railway.app';
var session=window.RentSketchDashboardSession,TENANT_KEY='rentsketch_dashboard_tenant';
var app=document.getElementById('platformApp');
var state={user:null,tenants:[],route:'overview',menu:false};

var nav=[
 {label:'Platform',items:[
  ['overview','Overview','⌂'],['businesses','Businesses','▦'],['users','Users','◉'],['onboarding','Onboarding','✓'],['analytics','Analytics','▥'],['payments','Payments','＄'],['subscriptions','Subscriptions','↻']
 ]},
 {label:'Product',items:[
  ['event-pass','Event Pass','◇'],['designs','Saved designs','✦'],['activity','Admin activity','≡']
 ]},
 {label:'Operations',items:[
  ['alerts','Alerts','!'],['performance','Web performance','↗'],['system','System health','●']
 ]}
];

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]});}
function money(cents){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(cents||0)/100);}
function moneyDollars(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0));}
function date(v){if(!v)return '—';try{return new Date(v).toLocaleDateString();}catch(_){return '—';}}
function datetime(v){if(!v)return '—';try{return new Date(v).toLocaleString();}catch(_){return '—';}}
function status(v){var s=String(v||'unknown');return '<span class="pc-status '+esc(s)+'">'+esc(s.replaceAll('_',' '))+'</span>';}
function initials(name){return String(name||'RS').trim().split(/\s+/).slice(0,2).map(function(x){return x[0]||''}).join('').toUpperCase();}
function identity(){return session.identity();}
function setTenant(v){try{if(v)localStorage.setItem(TENANT_KEY,v);else localStorage.removeItem(TENANT_KEY)}catch(_){}}

async function api(path,opts){return session.json(path,opts);}

function route(){var r=(location.hash||'#overview').replace(/^#/,'').split('?')[0];return nav.flatMap(function(g){return g.items.map(function(i){return i[0]})}).includes(r)?r:'overview';}
function routeTitle(r){for(var g of nav)for(var i of g.items)if(i[0]===r)return i[1];return'Overview';}
function shell(){
 var navHtml=nav.map(function(g){return '<div class="pc-nav-group"><div class="pc-nav-label">'+esc(g.label)+'</div>'+g.items.map(function(i){return '<a href="#'+i[0]+'" class="'+(state.route===i[0]?'active':'')+'"><span class="pc-nav-icon">'+i[2]+'</span><span>'+esc(i[1])+'</span></a>'}).join('')+'</div>'}).join('');
 navHtml+='<div class="pc-nav-group"><div class="pc-nav-label">Account</div><a href="/dashboard/account.html"><span class="pc-nav-icon" aria-hidden="true">⚿</span><span>Account security</span></a></div>';
 return '<div class="pc-shell'+(state.menu?' menu-open':'')+'" id="pcShell">'+
  '<aside class="pc-sidebar"><div class="pc-brand"><img src="/assets/brand-mark.svg" alt=""><div><strong>RentSketch</strong><span>Platform Console</span></div></div>'+
  '<a class="pc-sidebar-launch" href="/designer/?tenant=generic&admin=1" target="_blank" rel="noopener">✦ Open RentSketch</a>'+
  '<nav class="pc-nav">'+navHtml+'</nav>'+
  '<div class="pc-sidebar-foot"><div class="pc-admin-badge"><span class="pc-avatar">'+esc(initials(state.user&&state.user.displayName||state.user&&state.user.email))+'</span><div><strong>'+esc(state.user&&state.user.displayName||'Platform Admin')+'</strong><small>'+esc(state.user&&state.user.email||'')+'</small></div></div><button class="pc-logout" id="pcLogout">Log out</button></div></aside>'+
  '<section class="pc-main"><header class="pc-topbar"><div class="pc-crumb"><strong>Platform</strong> / '+esc(routeTitle(state.route))+'</div><div class="pc-top-actions"><button class="pc-btn pc-mobile-toggle" id="pcMenu">☰</button><a class="pc-btn" href="/dashboard/?tenantView=1#/overview">Tenant dashboard</a><a class="pc-btn primary" href="/designer/?tenant=generic&admin=1" target="_blank" rel="noopener">✦ Open RentSketch</a></div></header><main class="pc-content" id="pcContent"><div class="pc-loading">Loading…</div></main></section></div>';
}
function head(eyebrow,title,description,actions){
 return '<div class="pc-page-head"><div><div class="pc-eyebrow">'+esc(eyebrow)+'</div><h1>'+esc(title)+'</h1><p>'+esc(description)+'</p></div>'+(actions?'<div class="pc-actions">'+actions+'</div>':'')+'</div>';
}
function metric(label,value,detail,cls){return '<article class="pc-metric '+(cls||'')+'"><div class="pc-metric-label">'+esc(label)+'</div><div class="pc-metric-value">'+esc(value)+'</div><div class="pc-metric-detail">'+esc(detail)+'</div></article>'}
function empty(msg){return '<div class="pc-empty">'+esc(msg)+'</div>'}
function fail(err){var target=document.getElementById('pcContent');if(!target)return;target.innerHTML='<div class="pc-message error">'+esc(err.message||err)+'</div>'}
function bindShell(){
 document.getElementById('pcLogout').onclick=function(){session.clear('signed-out');setTenant(null);location.href='/dashboard/#/login';};
 var menu=document.getElementById('pcMenu');if(menu)menu.onclick=function(){state.menu=!state.menu;document.getElementById('pcShell').classList.toggle('menu-open',state.menu);};
 document.querySelectorAll('.pc-nav a').forEach(function(a){a.onclick=function(){state.menu=false;};});
}
async function render(){
 if(!state.user||!identity()){app.replaceChildren();return;}
 state.route=route();app.innerHTML=shell();bindShell();
 try{
  if(state.route==='overview')await overview();
  else if(state.route==='businesses')await businesses();
  else if(state.route==='users')await users();
  else if(state.route==='onboarding')await onboarding();
  else if(state.route==='analytics')await platformAnalytics();
  else if(state.route==='payments')await payments('all');
  else if(state.route==='subscriptions')await subscriptions();
  else if(state.route==='event-pass')await eventPass();
  else if(state.route==='designs')await designs();
  else if(state.route==='activity')await activity();
  else if(state.route==='alerts')await alerts();
  else if(state.route==='performance')await performance();
  else if(state.route==='system')await system();
 }catch(err){if(err.sessionChanged)return;if(err.status===401||err.status===403){session.clear('signed-out');location.href='/dashboard/#/login';return;}fail(err);}
}

async function overview(){
 var d=await Promise.all([
  api('/api/admin/console-overview'),api('/api/admin/payments?limit=7'),api('/api/admin/activity?limit=7'),api('/api/admin/system'),api('/api/admin/onboarding'),api('/api/admin/alerts')
 ]);
 var o=d[0],p=d[1].payments||[],a=d[2].activity||[],s=d[3],onboardingRows=d[4].accounts||[],alertRows=d[5].alerts||[];
 var readyCount=onboardingRows.filter(function(r){return r.progress===100;}).length;
 var attentionCount=alertRows.filter(function(r){return r.severity==='high'||r.severity==='medium';}).length;
 var content=head('Platform overview','Your RentSketch business','Revenue, subscriptions, customers, designs, and system activity in one operating view.',
  '<a class="pc-btn" href="#payments">Review payments</a><a class="pc-btn primary" href="/designer/?tenant=generic&admin=1" target="_blank" rel="noopener">Use RentSketch now</a>')+
  '<section class="pc-grid metrics pc-metrics-wide">'+
   metric('List-price MRR',moneyDollars(o.subscriptions&&o.subscriptions.list_mrr),'Active subscription records at configured list pricing','positive')+
   metric('Event Pass revenue',money(o.eventPassRevenue.cents),o.eventPassRevenue.count+' paid Event Pass transactions','positive')+
   metric('Rental deposit volume',money(o.tenantDepositVolume.cents),o.tenantDepositVolume.count+' tenant deposit payments')+
   metric('Rental businesses',o.tenants,(o.subscriptions.active||0)+' active subscriptions · '+(o.subscriptions.trialing||0)+' trials')+
   metric('Saved designs',o.designs||0,'Layouts stored across the platform')+
   metric('Needs attention',attentionCount,readyCount+' of '+onboardingRows.length+' businesses launch-ready')+
  '</section>'+
  '<div class="pc-split"><section class="pc-panel"><div class="pc-panel-head"><div><h2>Recent payments</h2><p>Event Pass sales and tenant rental deposits.</p></div><a class="pc-btn small" href="#payments">All payments</a></div>'+paymentTable(p,false)+'</section>'+
  '<aside class="pc-panel"><div class="pc-panel-head"><div><h2>Admin activity</h2><p>Changes made from the platform console.</p></div><a class="pc-btn small" href="#activity">Audit log</a></div><div class="pc-panel-body">'+activityList(a)+'</div></aside></div>'+
  '<div class="pc-split" style="margin-top:16px"><section class="pc-panel"><div class="pc-panel-head"><div><h2>Onboarding health</h2><p>How many rental businesses are ready to launch.</p></div><a class="pc-btn small" href="#onboarding">Onboarding</a></div><div class="pc-panel-body"><div class="pc-progress-large"><span style="width:'+(onboardingRows.length?Math.round(readyCount/onboardingRows.length*100):0)+'%"></span></div><div class="pc-list-row"><div><strong>'+readyCount+' launch-ready</strong><p>'+Math.max(0,onboardingRows.length-readyCount)+' still need setup work</p></div><span class="pc-status active">'+(onboardingRows.length?Math.round(readyCount/onboardingRows.length*100):0)+'%</span></div></div></section><aside class="pc-panel"><div class="pc-panel-head"><div><h2>Attention queue</h2><p>Current billing, setup and delivery alerts.</p></div><a class="pc-btn small" href="#alerts">View alerts</a></div><div class="pc-panel-body">'+(alertRows.length?alertRows.slice(0,4).map(function(x){return '<div class="pc-list-row"><div><strong>'+esc(x.title)+'</strong><p>'+esc(x.name)+' · '+esc(x.detail)+'</p></div><span class="pc-status '+(x.severity==='high'?'failed':x.severity==='medium'?'trialing':'')+'">'+esc(x.severity)+'</span></div>';}).join(''):empty('No current alerts.'))+'</div></aside></div>'+
  '<section class="pc-panel" style="margin-top:16px"><div class="pc-panel-head"><div><h2>System snapshot</h2><p>Critical services that keep checkout and access working.</p></div><a class="pc-btn small" href="#system">System health</a></div><div class="pc-panel-body">'+healthCards(s)+'</div></section>';
 document.getElementById('pcContent').innerHTML=content;
}

function paymentTable(rows,actions){
 if(!rows.length)return empty('No payment records yet.');
 return '<div class="pc-table-wrap"><table class="pc-table"><thead><tr><th>Payment</th><th>Customer</th><th>Business</th><th>Amount</th><th>Status</th><th>Date</th>'+(actions?'<th>Action</th>':'')+'</tr></thead><tbody>'+
 rows.map(function(p){return '<tr><td><strong>'+esc(p.kind==='event_pass'?'Event Pass':'Rental deposit')+'</strong><span class="pc-subtext">'+esc(p.subtype||'')+'</span></td><td>'+esc(p.customer_name||p.customer_email||'—')+(p.customer_name&&p.customer_email?'<span class="pc-subtext">'+esc(p.customer_email)+'</span>':'')+'</td><td>'+esc(p.tenant_name||p.tenant_slug||'—')+'</td><td class="pc-money">'+money(p.amount_cents)+'</td><td>'+status(p.status)+'</td><td>'+date(p.created_at)+'</td>'+(actions?'<td>'+(p.status==='paid'?'<button class="pc-btn small danger" data-refund="'+esc(p.kind)+'" data-id="'+esc(p.id)+'" data-amount="'+esc(p.amount_cents)+'">Refund</button>':'—')+'</td>':'')+'</tr>'}).join('')+
 '</tbody></table></div>';
}
function activityList(rows){
 if(!rows.length)return empty('No platform actions recorded yet.');
 return '<div class="pc-list">'+rows.map(function(a){return '<div class="pc-list-row"><div><strong>'+esc(String(a.action||'').replaceAll('_',' ').replaceAll('.',' › '))+'</strong><p>'+esc(a.target_label||a.target_type||'Platform')+'</p></div><time>'+date(a.created_at)+'</time></div>'}).join('')+'</div>';
}
function healthCards(s){
 return '<div class="pc-health">'+
  '<div class="pc-health-card"><b><i class="pc-dot"></i>Database</b><span>Connected · '+esc(datetime(s.database&&s.database.serverTime))+'</span></div>'+
  '<div class="pc-health-card"><b><i class="pc-dot '+(s.payments&&s.payments.stripeConfigured&&s.payments.webhookConfigured?'':'bad')+'"></i>Stripe payments</b><span>'+(s.payments&&s.payments.stripeConfigured?'API configured':'Missing API config')+' · '+(s.payments&&s.payments.webhookConfigured?'Webhook ready':'Webhook missing')+'</span></div>'+
  '<div class="pc-health-card"><b><i class="pc-dot '+(Number(s.email&&s.email.failed||0)?'warn':'')+'"></i>Access email</b><span>'+Number(s.email&&s.email.pending||0)+' queued · '+Number(s.email&&s.email.failed||0)+' failed</span></div>'+
 '</div>';
}

async function businesses(){
 var d=await api('/api/admin/tenants');state.tenants=d.tenants||[];
 document.getElementById('pcContent').innerHTML=head('Business accounts','Rental businesses','Manage every RentSketch rental-company workspace and jump directly into its dashboard or designer.',
  '<a class="pc-btn primary" href="/designer/?tenant=generic&admin=1" target="_blank" rel="noopener">✦ Open RentSketch</a>')+
  '<div class="pc-toolbar"><div class="pc-search"><input id="tenantSearch" type="search" placeholder="Search business, slug or email…"></div></div>'+
  '<section class="pc-panel"><div id="tenantTable"></div></section>';
 function paint(){
  var q=(document.getElementById('tenantSearch').value||'').toLowerCase();
  var rows=state.tenants.filter(function(t){return [t.name,t.slug,t.contact_email,t.subscription_plan,t.subscription_status].join(' ').toLowerCase().includes(q)});
  document.getElementById('tenantTable').innerHTML=rows.length?'<div class="pc-table-wrap"><table class="pc-table"><thead><tr><th>Business</th><th>Plan</th><th>Status</th><th>Setup</th><th>Usage</th><th>Last activity</th><th>Users</th><th>Actions</th></tr></thead><tbody>'+rows.map(function(t){var setup=[Number(t.product_count||0)>0,!!t.logo_url,Array.isArray(t.allowed_origins)&&t.allowed_origins.length>0,t.stripe_connect_status==="active"];var ready=setup.filter(Boolean).length;var last=[t.latest_design_at,t.latest_request_at].filter(Boolean).sort().at(-1);return '<tr><td><strong>'+esc(t.name)+'</strong><span class="pc-subtext">'+esc(t.slug)+(t.contact_email?' · '+esc(t.contact_email):'')+'</span></td><td>'+esc(t.subscription_plan||'trial')+'</td><td>'+status(t.subscription_status)+'</td><td><strong>'+ready+'/4 ready</strong><span class="pc-subtext">'+Number(t.active_product_count||0)+' active products · '+(Array.isArray(t.allowed_origins)?t.allowed_origins.length:0)+' domains</span></td><td><strong>'+Number(t.design_count||0)+' designs</strong><span class="pc-subtext">'+Number(t.quote_request_count||0)+' requests</span></td><td>'+datetime(last)+'</td><td>'+Number(t.member_count||0)+'</td><td><div class="pc-actions"><button class="pc-btn small" data-workspace="'+esc(t.slug)+'">Dashboard</button><button class="pc-btn small primary" data-designer="'+esc(t.slug)+'">Designer</button><button class="pc-btn small" data-manage="'+esc(t.slug)+'">Manage</button></div></td></tr>'}).join('')+'</tbody></table></div>':empty('No businesses match that search.');
  bindTenantActions();
 }
 document.getElementById('tenantSearch').oninput=paint;paint();
}
function bindTenantActions(){
 document.querySelectorAll('[data-workspace]').forEach(function(b){b.onclick=function(){setTenant(b.dataset.workspace);location.href='/dashboard/?tenantView=1#/overview';};});
 document.querySelectorAll('[data-designer]').forEach(function(b){b.onclick=function(){setTenant(b.dataset.designer);window.open('/designer/?tenant='+encodeURIComponent(b.dataset.designer)+'&admin=1','_blank','noopener');};});
 document.querySelectorAll('[data-manage]').forEach(function(b){b.onclick=function(){tenantModal(b.dataset.manage);};});
}
async function tenantModal(slug){
 var d=await api('/api/admin/tenants/'+encodeURIComponent(slug)),t=d.tenant,m=d.members||[];
 var backdrop=document.createElement('div');backdrop.className='pc-modal-backdrop';
 backdrop.innerHTML='<div class="pc-modal"><div class="pc-modal-head"><h2>'+esc(t.name)+'</h2><button class="pc-modal-close">×</button></div><div class="pc-modal-body"><div id="tenantMsg"></div>'+
  '<div class="pc-modal-field"><label>Business name</label><input id="tmName" value="'+esc(t.name)+'"></div>'+
  '<div class="pc-modal-field"><label>Contact email</label><input id="tmEmail" type="email" value="'+esc(t.contact_email||'')+'"></div>'+
  '<div class="pc-modal-field"><label>Trial ends</label><input id="tmTrial" type="date" value="'+esc(t.trial_ends_at?String(t.trial_ends_at).slice(0,10):'')+'"></div>'+
  '<div class="pc-actions"><button class="pc-btn primary" id="tmSave">Save business</button><button class="pc-btn" id="tmWorkspace">Open dashboard</button><button class="pc-btn" id="tmDesigner">Open designer</button></div>'+
  '<h3 style="margin:24px 0 8px;font-size:14px">Users & roles</h3><div>'+m.map(function(u){return '<div class="pc-member-row" data-member="'+esc(u.id)+'"><div><strong>'+esc(u.display_name||u.email)+'</strong><p>'+esc(u.email)+'</p></div><select class="pc-select pc-role-select" data-user="'+esc(u.id)+'"><option value="owner"'+(u.role==='owner'?' selected':'')+'>Owner</option><option value="admin"'+(u.role==='admin'?' selected':'')+'>Admin</option><option value="staff"'+(u.role==='staff'?' selected':'')+'>Staff</option><option value="viewer"'+(u.role==='viewer'?' selected':'')+'>Viewer</option></select><button class="pc-btn small danger pc-remove-member" data-user="'+esc(u.id)+'">Remove</button></div>';}).join('')+'</div></div></div>';
 document.body.appendChild(backdrop);
 function close(){backdrop.remove()} backdrop.querySelector('.pc-modal-close').onclick=close;backdrop.onclick=function(e){if(e.target===backdrop)close()};
 document.getElementById('tmWorkspace').onclick=function(){setTenant(slug);location.href='/dashboard/?tenantView=1#/overview';};
 document.getElementById('tmDesigner').onclick=function(){setTenant(slug);window.open('/designer/?tenant='+encodeURIComponent(slug)+'&admin=1','_blank','noopener');};
 document.getElementById('tmSave').onclick=async function(){var btn=this;btn.disabled=true;try{await api('/api/admin/tenants/'+encodeURIComponent(slug),{method:'PATCH',body:{name:document.getElementById('tmName').value,contactEmail:document.getElementById('tmEmail').value,trialEndsAt:document.getElementById('tmTrial').value||null}});document.getElementById('tenantMsg').innerHTML='<div class="pc-message success">Saved.</div>';setTimeout(function(){close();render()},500);}catch(err){document.getElementById('tenantMsg').innerHTML='<div class="pc-message error">'+esc(err.message)+'</div>';btn.disabled=false;}};
 backdrop.querySelectorAll('.pc-role-select').forEach(function(sel){sel.onchange=async function(){sel.disabled=true;try{await api('/api/admin/tenants/'+encodeURIComponent(slug)+'/members/'+encodeURIComponent(sel.dataset.user),{method:'PATCH',body:{role:sel.value}});document.getElementById('tenantMsg').innerHTML='<div class="pc-message success">User role updated.</div>';}catch(err){document.getElementById('tenantMsg').innerHTML='<div class="pc-message error">'+esc(err.message)+'</div>';}finally{sel.disabled=false;}};});
 backdrop.querySelectorAll('.pc-remove-member').forEach(function(btn){btn.onclick=async function(){if(!confirm('Remove this user from '+t.name+'?'))return;btn.disabled=true;try{await api('/api/admin/tenants/'+encodeURIComponent(slug)+'/members/'+encodeURIComponent(btn.dataset.user),{method:'DELETE'});btn.closest('.pc-member-row').remove();document.getElementById('tenantMsg').innerHTML='<div class="pc-message success">User removed from this business.</div>';}catch(err){document.getElementById('tenantMsg').innerHTML='<div class="pc-message error">'+esc(err.message)+'</div>';btn.disabled=false;}};});
}


async function users(){
 var d=await api('/api/admin/users?limit=500'),rows=d.users||[];
 var tenantUsers=rows.filter(function(u){return !u.is_platform_admin;}),multi=tenantUsers.filter(function(u){return (u.memberships||[]).length>1;});
 document.getElementById('pcContent').innerHTML=head('Account access','Users & access','Find every platform and tenant user, see which businesses they belong to, and jump directly into the related workspace.',
  '<a class="pc-btn" href="#businesses">Businesses</a><a class="pc-btn primary" href="#onboarding">Onboarding</a>')+
  '<section class="pc-grid metrics">'+
    metric('Tenant users',tenantUsers.length,'People attached to rental-company workspaces')+
    metric('Platform admins',rows.filter(function(u){return u.is_platform_admin;}).length,'Full platform access')+
    metric('Multi-business users',multi.length,'Users attached to more than one tenant')+
    metric('Accounts total',rows.length,'All login identities')+
  '</section>'+
  '<div class="pc-toolbar"><div class="pc-search"><input id="userSearch" type="search" placeholder="Search name, email, business or role…"></div></div>'+
  '<section class="pc-panel"><div id="usersTable"></div></section>';
 function paint(){
  var q=(document.getElementById('userSearch').value||'').toLowerCase();
  var filtered=rows.filter(function(u){
    return [u.display_name,u.email,(u.memberships||[]).map(function(m){return m.name+' '+m.slug+' '+m.role}).join(' ')].join(' ').toLowerCase().includes(q);
  });
  document.getElementById('usersTable').innerHTML=filtered.length?'<div class="pc-table-wrap"><table class="pc-table"><thead><tr><th>User</th><th>Access</th><th>Businesses</th><th>Created</th><th>Action</th></tr></thead><tbody>'+
    filtered.map(function(u){
      var memberships=u.memberships||[];
      var business=memberships.length?memberships.map(function(m){return '<span class="pc-chip">'+esc(m.name)+' · '+esc(m.role)+'</span>';}).join(' '):'<span class="pc-subtext">No tenant membership</span>';
      var first=memberships[0];
      return '<tr><td><strong>'+esc(u.display_name||u.email)+'</strong><span class="pc-subtext">'+esc(u.email)+'</span></td><td>'+status(u.is_platform_admin?'active':'tenant')+'</td><td><div class="pc-chip-wrap">'+business+'</div></td><td>'+date(u.created_at)+'</td><td>'+(first?'<button class="pc-btn small" data-user-workspace="'+esc(first.slug)+'">Open workspace</button>':'—')+'</td></tr>';
    }).join('')+
  '</tbody></table></div>':empty('No users match that search.');
  document.querySelectorAll('[data-user-workspace]').forEach(function(b){b.onclick=function(){setTenant(b.dataset.userWorkspace);location.href='/dashboard/?tenantView=1#/overview';};});
 }
 document.getElementById('userSearch').oninput=paint;paint();
}

async function onboarding(){
 var d=await api('/api/admin/onboarding'),rows=d.accounts||[];
 var ready=rows.filter(function(r){return r.progress===100;}).length;
 var avg=rows.length?Math.round(rows.reduce(function(s,r){return s+Number(r.progress||0);},0)/rows.length):0;
 document.getElementById('pcContent').innerHTML=head('Customer success','Tenant onboarding','See exactly where every rental business is stuck between signup and a launch-ready customer designer.',
  '<a class="pc-btn" href="#alerts">Setup alerts</a><a class="pc-btn primary" href="#businesses">Manage businesses</a>')+
  '<section class="pc-grid metrics">'+
    metric('Launch-ready',ready,rows.length+' total businesses')+
    metric('Average progress',avg+'%','Across catalog, pricing, visuals, branding, install and payments')+
    metric('No catalog',rows.filter(function(r){return !r.checks.catalog;}).length,'Cannot launch customer designer')+
    metric('Not installed',rows.filter(function(r){return !r.checks.install;}).length,'No allowed website domain')+
  '</section>'+
  '<section class="pc-panel"><div class="pc-panel-head"><div><h2>Onboarding pipeline</h2><p>Six launch checks per business.</p></div></div><div class="pc-table-wrap"><table class="pc-table"><thead><tr><th>Business</th><th>Progress</th><th>Catalog</th><th>Pricing</th><th>Visuals</th><th>Brand</th><th>Install</th><th>Payments</th><th>Activity</th><th>Open</th></tr></thead><tbody>'+
    rows.map(function(r){
      function check(k){return r.checks&&r.checks[k]?'<span class="pc-check yes">✓</span>':'<span class="pc-check no">–</span>';}
      return '<tr><td><strong>'+esc(r.name)+'</strong><span class="pc-subtext">'+esc(r.slug)+'</span></td><td><div class="pc-progress"><span style="width:'+Number(r.progress||0)+'%"></span></div><span class="pc-subtext">'+Number(r.complete||0)+' / '+Number(r.totalChecks||6)+' · '+Number(r.progress||0)+'%</span></td><td>'+check('catalog')+'</td><td>'+check('pricing')+'</td><td>'+check('visuals')+'</td><td>'+check('branding')+'</td><td>'+check('install')+'</td><td>'+check('payments')+'</td><td>'+datetime(r.latest_activity_at)+'</td><td><button class="pc-btn small" data-onboard="'+esc(r.slug)+'">Workspace</button></td></tr>';
    }).join('')+
  '</tbody></table></div></section>';
 document.querySelectorAll('[data-onboard]').forEach(function(b){b.onclick=function(){setTenant(b.dataset.onboard);location.href='/dashboard/?tenantView=1#/overview';};});
}

async function platformAnalytics(){
 var d=await Promise.all([
  api('/api/admin/console-overview'),
  api('/api/admin/tenants'),
  api('/api/admin/payments?limit=250'),
  api('/api/admin/designs?limit=250'),
  api('/api/admin/subscriptions?limit=250')
 ]);
 var o=d[0],tenants=d[1].tenants||[],payments=d[2].payments||[],designs=d[3].designs||[],subs=d[4].subscriptions||[];
 var now=Date.now(),monthAgo=now-30*86400000,weekAgo=now-7*86400000;
 var active30=tenants.filter(function(t){var ts=[t.latest_design_at,t.latest_request_at].filter(Boolean).map(function(v){return new Date(v).getTime()});return ts.length&&Math.max.apply(Math,ts)>=monthAgo;}).length;
 var active7=tenants.filter(function(t){var ts=[t.latest_design_at,t.latest_request_at].filter(Boolean).map(function(v){return new Date(v).getTime()});return ts.length&&Math.max.apply(Math,ts)>=weekAgo;}).length;
 var installed=tenants.filter(function(t){return Array.isArray(t.allowed_origins)&&t.allowed_origins.length>0;}).length;
 var connected=tenants.filter(function(t){return t.stripe_connect_status==='active';}).length;
 var ready=tenants.filter(function(t){return Number(t.product_count||0)>0&&!!t.logo_url&&Array.isArray(t.allowed_origins)&&t.allowed_origins.length>0;}).length;
 var eventPass=payments.filter(function(p){return p.kind==='event_pass'&&p.status==='paid';}),deposits=payments.filter(function(p){return p.kind==='deposit'&&p.status==='paid';});
 var monthPass=eventPass.filter(function(p){return new Date(p.created_at).getTime()>=monthAgo;}).reduce(function(s,p){return s+Number(p.amount_cents||0);},0);
 var monthDeposits=deposits.filter(function(p){return new Date(p.created_at).getTime()>=monthAgo;}).reduce(function(s,p){return s+Number(p.amount_cents||0);},0);
 var top=tenants.slice().sort(function(a,b){return (Number(b.design_count||0)+Number(b.quote_request_count||0))-(Number(a.design_count||0)+Number(a.quote_request_count||0));}).slice(0,8);
 var byPlan={};tenants.forEach(function(t){var k=t.subscription_plan||'trial';byPlan[k]=(byPlan[k]||0)+1;});
 var maxTop=Math.max(1,...top.map(function(t){return Number(t.design_count||0)+Number(t.quote_request_count||0);}));
 document.getElementById('pcContent').innerHTML=head('Platform intelligence','Analytics & adoption','See which businesses are set up, active, installed, and using RentSketch—not just how many accounts exist.',
  '<a class="pc-btn" href="#businesses">Review businesses</a><a class="pc-btn primary" href="/designer/?tenant=generic&admin=1" target="_blank" rel="noopener">Open RentSketch</a>')+
  '<section class="pc-grid metrics">'+
    metric('Active businesses · 30d',active30,active7+' active in the last 7 days')+
    metric('Launch-ready',ready,installed+' installed · '+connected+' Stripe-connected')+
    metric('Design activity',designs.length,'Recent saved designs in platform history')+
    metric('Revenue · 30d',money(monthPass+monthDeposits),money(monthPass)+' Event Pass · '+money(monthDeposits)+' deposits','positive')+
  '</section>'+
  '<div class="pc-split"><section class="pc-panel"><div class="pc-panel-head"><div><h2>Most active businesses</h2><p>Saved designs plus quote requests.</p></div></div><div class="pc-panel-body">'+
    (top.length?top.map(function(t){var total=Number(t.design_count||0)+Number(t.quote_request_count||0);return '<div class="pc-list-row"><div style="min-width:0;flex:1"><strong>'+esc(t.name)+'</strong><p>'+Number(t.design_count||0)+' designs · '+Number(t.quote_request_count||0)+' requests</p><div style="height:6px;background:#edf1f6;border-radius:999px;margin-top:7px;overflow:hidden"><span style="display:block;height:100%;width:'+Math.round(total/maxTop*100)+'%;background:#2f6fed"></span></div></div><span class="pc-status '+(total?'active':'')+'">'+total+'</span></div>';}).join(''):empty('No tenant usage yet.'))+
  '</div></section><aside class="pc-panel"><div class="pc-panel-head"><div><h2>Plan mix</h2><p>Current tenant plan labels.</p></div></div><div class="pc-panel-body">'+Object.keys(byPlan).sort().map(function(k){return '<div class="pc-list-row"><div><strong>'+esc(k)+'</strong><p>Tenant accounts</p></div><span class="pc-status">'+byPlan[k]+'</span></div>';}).join('')+'</div></aside></div>'+
  '<section class="pc-panel" style="margin-top:16px"><div class="pc-panel-head"><div><h2>Accounts needing setup attention</h2><p>Businesses missing products, branding, installation, or recent usage.</p></div></div><div class="pc-table-wrap"><table class="pc-table"><thead><tr><th>Business</th><th>Catalog</th><th>Branding</th><th>Installed</th><th>Stripe</th><th>Last activity</th><th>Open</th></tr></thead><tbody>'+
    tenants.filter(function(t){return Number(t.product_count||0)===0||!t.logo_url||!(Array.isArray(t.allowed_origins)&&t.allowed_origins.length)||t.stripe_connect_status!=='active';}).slice(0,30).map(function(t){var last=[t.latest_design_at,t.latest_request_at].filter(Boolean).sort().at(-1);return '<tr><td><strong>'+esc(t.name)+'</strong><span class="pc-subtext">'+esc(t.slug)+'</span></td><td>'+status(Number(t.product_count||0)>0?'active':'trialing')+'</td><td>'+status(t.logo_url?'active':'trialing')+'</td><td>'+status(Array.isArray(t.allowed_origins)&&t.allowed_origins.length?'active':'trialing')+'</td><td>'+status(t.stripe_connect_status==='active'?'active':'trialing')+'</td><td>'+datetime(last)+'</td><td><button class="pc-btn small" data-workspace="'+esc(t.slug)+'">Workspace</button></td></tr>';}).join('')+
  '</tbody></table></div></section>';
 bindTenantActions();
}

async function payments(kind){
 var query=kind&&kind!=='all'?'&kind='+encodeURIComponent(kind):'';
 var data=await Promise.all([api('/api/admin/payments?limit=200'+query),api('/api/admin/console-overview')]),rows=data[0].payments||[],overview=data[1];
 var paid=rows.filter(function(p){return p.status==='paid';}),refunded=rows.filter(function(p){return p.status==='refunded';});
 var paidTotal=paid.reduce(function(s,p){return s+Number(p.amount_cents||0);},0),refundTotal=refunded.reduce(function(s,p){return s+Number(p.amount_cents||0);},0);
 document.getElementById('pcContent').innerHTML=head('Money','Payments','One ledger for RentSketch Event Pass sales and tenant rental deposits. Refunds are sent through Stripe and recorded here.')+
  '<section class="pc-grid metrics">'+
    metric('Paid volume',money(paidTotal),paid.length+' paid transactions','positive')+
    metric('Event Pass revenue',money(overview.eventPassRevenue.cents),overview.eventPassRevenue.count+' paid Event Pass transactions','positive')+
    metric('Tenant deposit volume',money(overview.tenantDepositVolume.cents),overview.tenantDepositVolume.count+' paid deposits')+
    metric('Platform fees',money(overview.platformFeeRevenue.cents),'Recorded Connect application fees')+
    metric('Refunded ledger value',money(refundTotal),refunded.length+' refunded records')+
  '</section>'+
  '<div class="pc-toolbar"><div class="pc-search"><input id="paySearch" type="search" placeholder="Search customer, business or payment ID…"></div><select class="pc-select" id="payKind"><option value="all">All payments</option><option value="event_pass">Event Pass</option><option value="deposit">Rental deposits</option></select></div>'+
  '<section class="pc-panel"><div id="payTable">'+paymentTable(rows,true)+'</div></section>'+
  '<div class="pc-callout" style="margin-top:14px"><strong>Refund safety</strong><p>A refund requires an explicit confirmation. Event Pass refunds revoke the linked software entitlement. Rental-deposit refunds do not cancel the tenant’s event/order automatically.</p></div>';
 var sel=document.getElementById('payKind');sel.value=kind||'all';sel.onchange=function(){payments(sel.value)};
 function paint(){var q=(document.getElementById('paySearch').value||'').toLowerCase();var filtered=rows.filter(function(p){return [p.customer_email,p.customer_name,p.tenant_name,p.payment_intent_id,p.subtype].join(' ').toLowerCase().includes(q)});document.getElementById('payTable').innerHTML=paymentTable(filtered,true);bindRefunds();}
 document.getElementById('paySearch').oninput=paint;bindRefunds();
}
function bindRefunds(){document.querySelectorAll('[data-refund]').forEach(function(b){b.onclick=async function(){var amount=money(Number(b.dataset.amount||0));if(!confirm('Refund '+amount+'?\n\nThis sends a real Stripe refund. This action cannot be undone from RentSketch.'))return;b.disabled=true;b.textContent='Refunding…';try{await api('/api/admin/payments/'+encodeURIComponent(b.dataset.refund)+'/'+encodeURIComponent(b.dataset.id)+'/refund',{method:'POST',body:{confirm:true}});await payments(document.getElementById('payKind')?document.getElementById('payKind').value:'all');}catch(err){alert('Refund failed: '+err.message);b.disabled=false;b.textContent='Refund';}};});}

async function subscriptions(){
 var d=await api('/api/admin/subscriptions?limit=250'),rows=d.subscriptions||[];
 var active=rows.filter(function(s){return s.status==='active'}),attention=rows.filter(function(s){return ['past_due','unpaid','incomplete','paused'].includes(s.status)});
 document.getElementById('pcContent').innerHTML=head('Recurring revenue','Subscriptions','Manage business-plan subscriptions while Stripe remains the payment authority.')+
  '<section class="pc-grid metrics">'+metric('Active subscriptions',active.length,'Currently active records')+metric('Needs attention',attention.length,'Past due, unpaid, incomplete or paused')+metric('Trials',rows.filter(function(s){return s.status==='trialing'}).length,'Trialing subscription records')+metric('Cancel scheduled',rows.filter(function(s){return s.cancel_at_period_end}).length,'Will stop at end of billing period')+'</section>'+
  '<section class="pc-panel">'+(rows.length?'<div class="pc-table-wrap"><table class="pc-table"><thead><tr><th>Business</th><th>Plan</th><th>Status</th><th>Billing</th><th>Period ends</th><th>Stripe</th><th>Action</th></tr></thead><tbody>'+rows.map(function(s){var price=s.billing_interval==='annual'?s.annual_price:s.monthly_price;return '<tr><td><strong>'+esc(s.name)+'</strong><span class="pc-subtext">'+esc(s.slug)+'</span></td><td>'+esc(s.plan_id||'—')+(price!=null?'<span class="pc-subtext">'+moneyDollars(price)+(s.billing_interval==='annual'?' / year':' / month')+'</span>':'')+'</td><td>'+status(s.status)+'</td><td>'+esc(s.billing_interval||'—')+'</td><td>'+date(s.current_period_end)+'</td><td><span class="pc-subtext">'+esc(s.provider_subscription_id||'Not linked')+'</span></td><td>'+(s.provider_subscription_id?'<button class="pc-btn small '+(s.cancel_at_period_end?'':'danger')+'" data-sub="'+esc(s.id)+'" data-cancel="'+(s.cancel_at_period_end?'false':'true')+'">'+(s.cancel_at_period_end?'Keep subscription':'Cancel at period end')+'</button>':'—')+'</td></tr>'}).join('')+'</tbody></table></div>':empty('No subscription records yet.'))+'</section>';
 document.querySelectorAll('[data-sub]').forEach(function(b){b.onclick=async function(){var cancel=b.dataset.cancel==='true';if(cancel&&!confirm('Schedule this subscription to cancel at the end of its current billing period?'))return;b.disabled=true;try{await api('/api/admin/subscriptions/'+encodeURIComponent(b.dataset.sub),{method:'PATCH',body:{cancelAtPeriodEnd:cancel}});subscriptions();}catch(err){alert(err.message);b.disabled=false;}}});
}

async function eventPass(){
 var d=await Promise.all([api('/api/admin/console-overview'),api('/api/admin/payments?kind=event_pass&limit=200')]),o=d[0],rows=d[1].payments||[];
 document.getElementById('pcContent').innerHTML=head('Direct customer product','Event Pass','Track one-time $9.99 Event Pass purchases, renewals, access, and refunds.')+
  '<section class="pc-grid metrics">'+metric('All-time revenue',money(o.eventPassRevenue.cents),o.eventPassRevenue.count+' paid transactions','positive')+metric('This month',money(o.month.eventPassCents),'Paid Event Pass transactions this month','positive')+metric('Paid transactions',rows.filter(function(p){return p.status==='paid'}).length,'Current ledger selection')+metric('Refunded',rows.filter(function(p){return p.status==='refunded'}).length,'Refunded Event Pass transactions')+'</section>'+
  '<section class="pc-panel">'+paymentTable(rows,true)+'</section>';bindRefunds();
}

async function designs(){
 var d=await api('/api/admin/designs?limit=200'),rows=d.designs||[];
 document.getElementById('pcContent').innerHTML=head('Product activity','Saved designs','Recent RentSketch layouts across direct customers and rental-company workspaces.',
  '<a class="pc-btn primary" href="/designer/?tenant=generic&admin=1" target="_blank" rel="noopener">Create a design</a>')+
  '<section class="pc-panel">'+(rows.length?'<div class="pc-table-wrap"><table class="pc-table"><thead><tr><th>Design</th><th>Workspace</th><th>Event</th><th>Guests</th><th>Estimate</th><th>Access</th><th>Updated</th><th>Open</th></tr></thead><tbody>'+rows.map(function(d){return '<tr><td><strong>'+esc(String(d.id).slice(0,8))+'</strong><span class="pc-subtext">'+esc(d.id)+'</span></td><td>'+esc(d.tenant_name||d.tenant_slug)+'</td><td>'+esc(d.event_type||'—')+'</td><td>'+esc(d.guest_count||'—')+'</td><td>'+moneyDollars(d.estimate_total||0)+'</td><td>'+(d.active_access?status('active'):'<span class="pc-status">No active pass</span>')+'</td><td>'+datetime(d.updated_at)+'</td><td><a class="pc-btn small" target="_blank" rel="noopener" href="/designer/?tenant='+encodeURIComponent(d.tenant_slug||'generic')+'&adminDesign='+encodeURIComponent(d.id)+'&admin=1">Open</a></td></tr>'}).join('')+'</tbody></table></div>':empty('No saved designs yet.'))+'</section>';
}

async function activity(){
 var d=await api('/api/admin/activity?limit=200'),rows=d.activity||[];
 document.getElementById('pcContent').innerHTML=head('Accountability','Admin activity','A record of sensitive actions performed from the RentSketch platform console.')+
  '<section class="pc-panel"><div class="pc-panel-body">'+activityList(rows)+'</div></section>';
}


async function alerts(){
 var d=await api('/api/admin/alerts'),rows=d.alerts||[];
 var counts={high:0,medium:0,low:0};rows.forEach(function(a){counts[a.severity]=(counts[a.severity]||0)+1;});
 document.getElementById('pcContent').innerHTML=head('Operations','Alerts & attention','A prioritized queue of billing, setup, install, and customer-access issues that need a human review.',
  '<a class="pc-btn" href="#system">System health</a><a class="pc-btn primary" href="#onboarding">Onboarding</a>')+
  '<section class="pc-grid metrics">'+
    metric('High priority',counts.high||0,'Billing or platform delivery issues')+
    metric('Medium priority',counts.medium||0,'Launch blockers')+
    metric('Low priority',counts.low||0,'Setup improvements')+
    metric('Open alerts',rows.length,'Current derived attention queue')+
  '</section>'+
  '<section class="pc-panel"><div class="pc-panel-head"><div><h2>Needs attention</h2><p>Derived from production account and service state.</p></div></div><div class="pc-panel-body">'+
    (rows.length?'<div class="pc-alert-list">'+rows.map(function(a){return '<div class="pc-alert '+esc(a.severity)+'"><div class="pc-alert-icon">'+(a.severity==='high'?'!':a.severity==='medium'?'•':'i')+'</div><div class="pc-alert-copy"><strong>'+esc(a.title)+'</strong><p>'+esc(a.name)+' · '+esc(a.detail)+'</p></div>'+(a.slug?'<button class="pc-btn small" data-alert-workspace="'+esc(a.slug)+'">Open workspace</button>':'<a class="pc-btn small" href="#system">System health</a>')+'</div>';}).join('')+'</div>':empty('No current platform alerts.'))+
  '</div></section>';
 document.querySelectorAll('[data-alert-workspace]').forEach(function(b){b.onclick=function(){setTenant(b.dataset.alertWorkspace);location.href='/dashboard/?tenantView=1#/overview';};});
}

async function performance(){
 var d=await api('/api/admin/web-vitals?days=7'),o=d.overall||{},pages=d.pages||[],th=d.thresholds||{};
 function quality(value,good){if(value==null)return 'No data';return Number(value)<=Number(good)?'Good':'Review';}
 document.getElementById('pcContent').innerHTML=head('Experience quality','Web performance','First-party real-user performance from the last 7 days. This is customer traffic, not a synthetic score.',
  '<a class="pc-btn" href="#system">System health</a><a class="pc-btn primary" href="/">Open public site ↗</a>')+
  '<section class="pc-grid metrics">'+
    metric('LCP p75',o.lcp_p75_ms==null?'—':Math.round(o.lcp_p75_ms)+' ms',quality(o.lcp_p75_ms,th.lcpGoodMs||2500))+
    metric('INP p75',o.inp_p75_ms==null?'—':Math.round(o.inp_p75_ms)+' ms',quality(o.inp_p75_ms,th.inpGoodMs||200))+
    metric('CLS p75',o.cls_p75==null?'—':Number(o.cls_p75).toFixed(3),quality(o.cls_p75,th.clsGood||.1))+
    metric('Samples',o.samples||0,'Real-user measurement samples')+
  '</section>'+
  '<section class="pc-panel"><div class="pc-panel-head"><div><h2>Performance by page</h2><p>Pages with enough first-party measurements appear below.</p></div></div>'+
    (pages.length?'<div class="pc-table-wrap"><table class="pc-table"><thead><tr><th>Path</th><th>Samples</th><th>LCP p75</th><th>INP p75</th><th>CLS p75</th><th>FCP p75</th><th>TTFB p75</th></tr></thead><tbody>'+pages.map(function(p){return '<tr><td><strong>'+esc(p.path)+'</strong></td><td>'+Number(p.samples||0)+'</td><td>'+Math.round(Number(p.lcp_p75_ms||0))+' ms</td><td>'+Math.round(Number(p.inp_p75_ms||0))+' ms</td><td>'+Number(p.cls_p75||0).toFixed(3)+'</td><td>'+Math.round(Number(p.fcp_p75_ms||0))+' ms</td><td>'+Math.round(Number(p.ttfb_p75_ms||0))+' ms</td></tr>';}).join('')+'</tbody></table></div>':empty('No recent real-user web-vitals samples.'))+
  '</section>';
}

async function system(){
 var s=await api('/api/admin/system');
 document.getElementById('pcContent').innerHTML=head('Operations','System health','Check the core services that support RentSketch logins, payments, access, and customer email.')+
  '<section class="pc-panel"><div class="pc-panel-head"><div><h2>Production services</h2><p>Application-level readiness. Infrastructure deployment status remains in Railway.</p></div></div><div class="pc-panel-body">'+healthCards(s)+'</div></section>'+
  '<section class="pc-grid metrics" style="margin-top:16px">'+metric('Stripe webhooks',String(s.payments.processedWebhookEvents||0),'Processed webhook event IDs')+metric('Access email queued',String(s.email.pending||0),'Pending or sending messages')+metric('Access email failed',String(s.email.failed||0),'Needs delivery attention')+metric('Environment',String(s.app.nodeEnv||'—'),'API runtime mode')+'</section>';
}

async function boot(){
 try{await session.ready();}catch(error){if(error.sessionChanged)return;location.href='/dashboard/#/login';return;}
 if(!identity()){location.href='/dashboard/#/login';return;}
 try{
  var me=await api('/api/auth/me');
  if(!me.user||!me.user.isPlatformAdmin){location.href='/dashboard/#/overview';return;}
  state.user=me.user;state.tenants=me.tenants||[];
  state.route=route();app.className='';await render();
 }catch(err){if(err.sessionChanged)return;session.clear('signed-out');location.href='/dashboard/#/login';}
}
function lockConsole(){state.user=null;state.tenants=[];app.replaceChildren();}
window.addEventListener('rentsketch:dashboardSessionChanged',function(event){if(event.detail?.reason==='signed-in')return;lockConsole();if(event.detail?.reason==='refreshing')return;if(event.detail?.reason==='changed'&&identity()){boot();return;}location.replace('/dashboard/#/login');});
window.addEventListener('pagehide',lockConsole);
window.addEventListener('pageshow',function(event){if(event.persisted){lockConsole();boot();}});
window.addEventListener('hashchange',render);
boot();
})();