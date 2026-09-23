(function(){
'use strict';
var API=window.RENTSKETCH_API_URL||'https://rentsketch-api-production.up.railway.app';
var TOKEN_KEY='rentsketch_dashboard_token',TENANT_KEY='rentsketch_dashboard_tenant';
var app=document.getElementById('platformApp');
var state={user:null,tenants:[],route:'overview',menu:false};

var nav=[
 {label:'Platform',items:[
  ['overview','Overview','⌂'],['businesses','Businesses','▦'],['payments','Payments','＄'],['subscriptions','Subscriptions','↻']
 ]},
 {label:'Intelligence',items:[
  ['insights','Insights','⌁'],['alerts','Needs attention','!']
 ]},
 {label:'Product',items:[
  ['event-pass','Event Pass','◇'],['designs','Saved designs','✦']
 ]},
 {label:'Operations',items:[
  ['activity','Admin activity','≡'],['system','System health','●']
 ]}
];

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]});}
function money(cents){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(cents||0)/100);}
function moneyDollars(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0));}
function date(v){if(!v)return '—';try{return new Date(v).toLocaleDateString();}catch(_){return '—';}}
function datetime(v){if(!v)return '—';try{return new Date(v).toLocaleString();}catch(_){return '—';}}
function status(v){var s=String(v||'unknown');return '<span class="pc-status '+esc(s)+'">'+esc(s.replaceAll('_',' '))+'</span>';}
function initials(name){return String(name||'RS').trim().split(/\s+/).slice(0,2).map(function(x){return x[0]||''}).join('').toUpperCase();}
function token(){try{return localStorage.getItem(TOKEN_KEY)||''}catch(_){return''}}
function setToken(v){try{if(v)localStorage.setItem(TOKEN_KEY,v);else localStorage.removeItem(TOKEN_KEY)}catch(_){}}
function setTenant(v){try{if(v)localStorage.setItem(TENANT_KEY,v);else localStorage.removeItem(TENANT_KEY)}catch(_){}}

async function api(path,opts){
 opts=opts||{};var headers=Object.assign({Accept:'application/json'},opts.headers||{});
 if(token())headers.Authorization='Bearer '+token();
 var body=opts.body;
 if(body&&typeof body==='object'){headers['Content-Type']='application/json';body=JSON.stringify(body);}
 var r=await fetch(API+path,{method:opts.method||'GET',headers:headers,body:body,cache:'no-store'});
 var d=await r.json().catch(function(){return{}});
 if(!r.ok){var e=new Error(d.error||('Request failed ('+r.status+')'));e.status=r.status;throw e;}
 return d;
}

function route(){var r=(location.hash||'#overview').replace(/^#/,'').split('?')[0];return nav.flatMap(function(g){return g.items.map(function(i){return i[0]})}).includes(r)?r:'overview';}
function routeTitle(r){for(var g of nav)for(var i of g.items)if(i[0]===r)return i[1];return'Overview';}
function shell(){
 var navHtml=nav.map(function(g){return '<div class="pc-nav-group"><div class="pc-nav-label">'+esc(g.label)+'</div>'+g.items.map(function(i){return '<a href="#'+i[0]+'" class="'+(state.route===i[0]?'active':'')+'"><span class="pc-nav-icon">'+i[2]+'</span><span>'+esc(i[1])+'</span></a>'}).join('')+'</div>'}).join('');
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
function fail(err){document.getElementById('pcContent').innerHTML='<div class="pc-message error">'+esc(err.message||err)+'</div>'}
function bindShell(){
 document.getElementById('pcLogout').onclick=function(){setToken(null);setTenant(null);location.href='/dashboard/#/login';};
 var menu=document.getElementById('pcMenu');if(menu)menu.onclick=function(){state.menu=!state.menu;document.getElementById('pcShell').classList.toggle('menu-open',state.menu);};
 document.querySelectorAll('.pc-nav a').forEach(function(a){a.onclick=function(){state.menu=false;};});
}
async function render(){
 state.route=route();app.innerHTML=shell();bindShell();
 try{
  if(state.route==='overview')await overview();
  else if(state.route==='businesses')await businesses();
  else if(state.route==='payments')await payments('all');
  else if(state.route==='subscriptions')await subscriptions();
  else if(state.route==='event-pass')await eventPass();
  else if(state.route==='designs')await designs();
  else if(state.route==='insights')await insights();
  else if(state.route==='alerts')await alerts();
  else if(state.route==='activity')await activity();
  else if(state.route==='system')await system();
 }catch(err){if(err.status===401||err.status===403){setToken(null);location.href='/dashboard/#/login';return;}fail(err);}
}

async function overview(){
 var d=await Promise.all([
  api('/api/admin/console-overview'),api('/api/admin/payments?limit=7'),api('/api/admin/activity?limit=7'),api('/api/admin/system'),api('/api/admin/alerts')
 ]);
 var o=d[0],p=d[1].payments||[],a=d[2].activity||[],s=d[3],attention=d[4]||{counts:{}};
 var attentionTotal=Object.values(attention.counts||{}).reduce(function(sum,n){return sum+Number(n||0)},0);
 var content=head('Platform overview','Your RentSketch business','Revenue, customers, subscriptions, product activity and operational health in one owner workspace.',
  '<a class="pc-btn" href="#alerts">Needs attention'+(attentionTotal?' · '+attentionTotal:'')+'</a><a class="pc-btn" href="#payments">Review payments</a><a class="pc-btn primary" href="/designer/?tenant=generic&admin=1" target="_blank" rel="noopener">✦ Use RentSketch now</a>')+
  '<section class="pc-grid metrics">'+
   metric('List-price MRR',moneyDollars(o.subscriptions&&o.subscriptions.list_mrr),'Active subscriptions at configured list pricing','positive')+
   metric('Event Pass revenue',money(o.eventPassRevenue.cents),o.eventPassRevenue.count+' paid Event Pass transactions','positive')+
   metric('Rental deposit volume',money(o.tenantDepositVolume.cents),o.tenantDepositVolume.count+' recorded tenant deposits')+
   metric('Rental businesses',o.tenants,(o.subscriptions.active||0)+' active subscriptions · '+(o.subscriptions.trialing||0)+' trials')+
  '</section>'+
  '<section class="pc-pulse-grid">'+
   '<a href="#insights" class="pc-pulse"><span>Saved designs this month</span><strong>'+Number(o.month&&o.month.designs||0)+'</strong><small>'+Number(o.designs||0)+' all-time designs</small></a>'+
   '<a href="#alerts" class="pc-pulse '+(Number(o.newRequests||0)?'attention':'')+'"><span>New quote requests</span><strong>'+Number(o.newRequests||0)+'</strong><small>'+Number(o.month&&o.month.requests||0)+' requests this month</small></a>'+
   '<a href="#businesses" class="pc-pulse"><span>New businesses · 30 days</span><strong>'+Number(o.recentTenants||0)+'</strong><small>'+Number(o.installedTenants||0)+' businesses installed on a website</small></a>'+
   '<a href="#subscriptions" class="pc-pulse '+(Number(o.subscriptions&&o.subscriptions.attention||0)?'attention':'')+'"><span>Billing attention</span><strong>'+Number(o.subscriptions&&o.subscriptions.attention||0)+'</strong><small>Past due, unpaid, incomplete or paused</small></a>'+
   '<a href="#payments" class="pc-pulse"><span>Refunded Event Passes</span><strong>'+Number(o.refundedPayments||0)+'</strong><small>'+Number(o.failedPayments||0)+' failed Event Pass records</small></a>'+
  '</section>'+
  '<div class="pc-split"><section class="pc-panel"><div class="pc-panel-head"><div><h2>Recent payments</h2><p>Event Pass sales and tenant rental deposits.</p></div><a class="pc-btn small" href="#payments">All payments</a></div>'+paymentTable(p,false)+'</section>'+
  '<aside class="pc-stack"><section class="pc-panel"><div class="pc-panel-head"><div><h2>Owner priorities</h2><p>Operational work that needs review.</p></div><a class="pc-btn small" href="#alerts">Open alerts</a></div><div class="pc-panel-body">'+
    priorityRow('New quote requests',attention.counts&&attention.counts.newRequests,'Customer requests waiting for follow-up','#alerts')+
    priorityRow('Billing issues',attention.counts&&attention.counts.billing,'Subscriptions requiring attention','#alerts')+
    priorityRow('Failed access email',attention.counts&&attention.counts.failedMail,'Customer access messages that failed','#alerts')+
    priorityRow('Uninstalled businesses',attention.counts&&attention.counts.uninstalled,'Older tenant workspaces without an approved domain','#alerts')+
  '</div></section>'+
  '<section class="pc-panel"><div class="pc-panel-head"><div><h2>Admin activity</h2><p>Sensitive changes from the owner console.</p></div><a class="pc-btn small" href="#activity">Audit log</a></div><div class="pc-panel-body">'+activityList(a)+'</div></section></aside></div>'+
  '<section class="pc-panel" style="margin-top:16px"><div class="pc-panel-head"><div><h2>System snapshot</h2><p>Critical services that keep checkout and customer access working.</p></div><a class="pc-btn small" href="#system">System health</a></div><div class="pc-panel-body">'+healthCards(s)+'</div></section>';
 document.getElementById('pcContent').innerHTML=content;
}
function priorityRow(label,value,detail,href){
 value=Number(value||0);
 return '<a class="pc-priority" href="'+href+'"><span><strong>'+esc(label)+'</strong><small>'+esc(detail)+'</small></span><b class="'+(value?'hot':'')+'">'+value+'</b></a>';
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
 document.getElementById('pcContent').innerHTML=head('Business accounts','Rental businesses','Manage every tenant workspace, onboarding state, product usage and support context.',
  '<a class="pc-btn" href="#alerts">Review setup alerts</a><a class="pc-btn primary" href="/designer/?tenant=generic&admin=1" target="_blank" rel="noopener">✦ Open RentSketch</a>')+
  '<div class="pc-toolbar"><div class="pc-search"><input id="tenantSearch" type="search" placeholder="Search business, slug or email…"></div><select id="tenantStatus" class="pc-select"><option value="">All billing states</option><option value="active">Active</option><option value="trialing">Trialing</option><option value="past_due">Past due</option><option value="canceled">Canceled</option></select><select id="tenantSetup" class="pc-select"><option value="">All setup states</option><option value="ready">Launch ready</option><option value="needs_setup">Needs setup</option></select></div>'+
  '<section class="pc-grid metrics">'+metric('Businesses',state.tenants.length,'All tenant workspaces')+metric('Installed',state.tenants.filter(function(t){return Array.isArray(t.allowed_origins)&&t.allowed_origins.length}).length,'Approved website domain configured')+metric('Active products',state.tenants.reduce(function(n,t){return n+Number(t.active_product_count||0)},0),'Across tenant catalogs')+metric('New requests',state.tenants.reduce(function(n,t){return n+Number(t.new_request_count||0)},0),'Waiting across all businesses')+'</section>'+
  '<section class="pc-panel"><div id="tenantTable"></div></section>';
 function setupScore(t){
  var checks=[Number(t.active_product_count||0)>0,!!t.contact_email,Array.isArray(t.allowed_origins)&&t.allowed_origins.length>0];
  return Math.round(checks.filter(Boolean).length/checks.length*100);
 }
 function lastActivity(t){
  var values=[t.last_design_at,t.last_request_at].filter(Boolean).map(function(v){return new Date(v).getTime()});
  return values.length?new Date(Math.max.apply(Math,values)).toISOString():t.created_at;
 }
 function paint(){
  var q=(document.getElementById('tenantSearch').value||'').toLowerCase(),st=document.getElementById('tenantStatus').value,setupFilter=document.getElementById('tenantSetup').value;
  var rows=state.tenants.filter(function(t){
    var score=setupScore(t),setupOk=setupFilter==='ready'?score===100:setupFilter==='needs_setup'?score<100:true;
    return [t.name,t.slug,t.contact_email,t.subscription_plan,t.subscription_status].join(' ').toLowerCase().includes(q)&&(!st||t.subscription_status===st)&&setupOk;
  });
  document.getElementById('tenantTable').innerHTML=rows.length?'<div class="pc-table-wrap"><table class="pc-table"><thead><tr><th>Business</th><th>Plan</th><th>Setup</th><th>Usage</th><th>Requests</th><th>Last activity</th><th>Support</th><th>Actions</th></tr></thead><tbody>'+rows.map(function(t){
    var score=setupScore(t);
    return '<tr><td><strong>'+esc(t.name)+'</strong><span class="pc-subtext">'+esc(t.slug)+(t.contact_email?' · '+esc(t.contact_email):'')+'</span></td><td>'+esc(t.subscription_plan||'trial')+'<span class="pc-subtext">'+status(t.subscription_status)+'</span></td><td><div class="pc-setup-mini"><span><i style="width:'+score+'%"></i></span><b>'+score+'%</b></div><span class="pc-subtext">'+Number(t.active_product_count||0)+' active products · '+(Array.isArray(t.allowed_origins)?t.allowed_origins.length:0)+' domains</span></td><td><strong>'+Number(t.design_count||0)+' designs</strong><span class="pc-subtext">'+Number(t.design_month_count||0)+' in 30 days</span></td><td><strong>'+Number(t.quote_request_count||0)+'</strong><span class="pc-subtext">'+Number(t.new_request_count||0)+' new</span></td><td>'+datetime(lastActivity(t))+'</td><td><strong>'+Number(t.member_count||0)+' users</strong><span class="pc-subtext">'+Number(t.note_count||0)+' internal notes</span></td><td><div class="pc-actions"><button class="pc-btn small" data-workspace="'+esc(t.slug)+'">Workspace</button><button class="pc-btn small primary" data-designer="'+esc(t.slug)+'">Designer</button><button class="pc-btn small" data-manage="'+esc(t.slug)+'">Manage</button></div></td></tr>';
  }).join('')+'</tbody></table></div>':empty('No businesses match those filters.');
  bindTenantActions();
 }
 document.getElementById('tenantSearch').oninput=paint;document.getElementById('tenantStatus').onchange=paint;document.getElementById('tenantSetup').onchange=paint;paint();
}
function bindTenantActions(){
 document.querySelectorAll('[data-workspace]').forEach(function(b){b.onclick=function(){setTenant(b.dataset.workspace);location.href='/dashboard/?tenantView=1#/overview';};});
 document.querySelectorAll('[data-designer]').forEach(function(b){b.onclick=function(){setTenant(b.dataset.designer);window.open('/designer/?tenant='+encodeURIComponent(b.dataset.designer)+'&admin=1','_blank','noopener');};});
 document.querySelectorAll('[data-manage]').forEach(function(b){b.onclick=function(){tenantModal(b.dataset.manage);};});
}
async function tenantModal(slug){
 var loaded=await Promise.all([api('/api/admin/tenants/'+encodeURIComponent(slug)),api('/api/admin/tenants/'+encodeURIComponent(slug)+'/notes')]);
 var d=loaded[0],t=d.tenant,m=d.members||[],notes=loaded[1].notes||[];
 var backdrop=document.createElement('div');backdrop.className='pc-modal-backdrop';
 function membersHtml(){
  if(!m.length)return '<div class="pc-empty">No tenant users found.</div>';
  return '<div class="pc-member-list">'+m.map(function(u){return '<div class="pc-member-row" data-member="'+esc(u.id)+'"><div><strong>'+esc(u.display_name||u.email)+'</strong><small>'+esc(u.email)+'</small></div><select class="pc-select" data-member-role="'+esc(u.id)+'"><option value="owner"'+(u.role==='owner'?' selected':'')+'>Owner</option><option value="admin"'+(u.role==='admin'?' selected':'')+'>Admin</option><option value="staff"'+(u.role==='staff'?' selected':'')+'>Staff</option><option value="viewer"'+(u.role==='viewer'?' selected':'')+'>Viewer</option></select><button class="pc-btn small danger" data-remove-member="'+esc(u.id)+'">Remove</button></div>'}).join('')+'</div>';
 }
 function notesHtml(){
  if(!notes.length)return '<div class="pc-empty pc-empty-small">No internal notes yet.</div>';
  return '<div class="pc-note-list">'+notes.map(function(n){return '<div class="pc-note"><div><strong>'+esc(n.admin_name||n.admin_email||'Platform admin')+'</strong><time>'+datetime(n.created_at)+'</time></div><p>'+esc(n.body)+'</p><button class="pc-btn small" data-delete-note="'+esc(n.id)+'">Delete</button></div>'}).join('')+'</div>';
 }
 backdrop.innerHTML='<div class="pc-modal pc-modal-wide"><div class="pc-modal-head"><div><h2>'+esc(t.name)+'</h2><p>'+esc(t.slug)+' · '+esc(t.subscription_plan||'trial')+' · '+esc(t.subscription_status||'unknown')+'</p></div><button class="pc-modal-close">×</button></div><div class="pc-modal-body"><div id="tenantMsg"></div>'+
  '<div class="pc-modal-grid"><section><h3>Business account</h3><div class="pc-modal-field"><label>Business name</label><input id="tmName" value="'+esc(t.name)+'"></div><div class="pc-modal-field"><label>Contact email</label><input id="tmEmail" type="email" value="'+esc(t.contact_email||'')+'"></div><div class="pc-modal-field"><label>Trial ends</label><input id="tmTrial" type="date" value="'+esc(t.trial_ends_at?String(t.trial_ends_at).slice(0,10):'')+'"></div><div class="pc-actions"><button class="pc-btn primary" id="tmSave">Save business</button><button class="pc-btn" id="tmWorkspace">Open workspace</button><button class="pc-btn" id="tmDesigner">Open designer</button></div><div class="pc-support-facts"><span><b>Website</b>'+esc(t.website||'Not set')+'</span><span><b>Stripe</b>'+esc(t.stripe_connect_status||'not connected')+'</span><span><b>Approved domains</b>'+((t.allowed_origins||[]).length||0)+'</span><span><b>Webhook</b>'+(t.webhook_url?'Configured':'Not configured')+'</span></div></section>'+
  '<section><h3>Tenant users</h3><p class="pc-modal-help">Change workspace roles or remove access. The only owner cannot be removed.</p>'+membersHtml()+'</section></div>'+
  '<section class="pc-modal-notes"><div class="pc-modal-notes-head"><div><h3>Internal support notes</h3><p>Visible only to RentSketch platform admins.</p></div></div><form id="noteForm"><textarea id="noteBody" maxlength="4000" rows="3" placeholder="Add context for future support work…"></textarea><button class="pc-btn primary" type="submit">Add note</button></form><div id="notesList">'+notesHtml()+'</div></section></div></div>';
 document.body.appendChild(backdrop);
 function close(){backdrop.remove()} backdrop.querySelector('.pc-modal-close').onclick=close;backdrop.onclick=function(e){if(e.target===backdrop)close()};
 document.getElementById('tmWorkspace').onclick=function(){setTenant(slug);location.href='/dashboard/?tenantView=1#/overview';};
 document.getElementById('tmDesigner').onclick=function(){setTenant(slug);window.open('/designer/?tenant='+encodeURIComponent(slug)+'&admin=1','_blank','noopener');};
 document.getElementById('tmSave').onclick=async function(){var btn=this;btn.disabled=true;try{await api('/api/admin/tenants/'+encodeURIComponent(slug),{method:'PATCH',body:{name:document.getElementById('tmName').value,contactEmail:document.getElementById('tmEmail').value,trialEndsAt:document.getElementById('tmTrial').value||null}});document.getElementById('tenantMsg').innerHTML='<div class="pc-message success">Business details saved.</div>';btn.disabled=false;}catch(err){document.getElementById('tenantMsg').innerHTML='<div class="pc-message error">'+esc(err.message)+'</div>';btn.disabled=false;}};
 document.querySelectorAll('[data-member-role]').forEach(function(sel){sel.onchange=async function(){var old=m.find(function(u){return String(u.id)===String(sel.dataset.memberRole)});sel.disabled=true;try{await api('/api/admin/tenants/'+encodeURIComponent(slug)+'/members/'+encodeURIComponent(sel.dataset.memberRole),{method:'PATCH',body:{role:sel.value}});if(old)old.role=sel.value;}catch(err){alert(err.message);if(old)sel.value=old.role;}finally{sel.disabled=false;}};});
 document.querySelectorAll('[data-remove-member]').forEach(function(btn){btn.onclick=async function(){if(!confirm('Remove this user from '+t.name+'?'))return;btn.disabled=true;try{await api('/api/admin/tenants/'+encodeURIComponent(slug)+'/members/'+encodeURIComponent(btn.dataset.removeMember),{method:'DELETE'});btn.closest('.pc-member-row').remove();}catch(err){alert(err.message);btn.disabled=false;}};});
 document.getElementById('noteForm').onsubmit=async function(e){e.preventDefault();var body=document.getElementById('noteBody').value.trim();if(!body)return;var btn=this.querySelector('button');btn.disabled=true;try{var result=await api('/api/admin/tenants/'+encodeURIComponent(slug)+'/notes',{method:'POST',body:{body:body}});notes.unshift({id:result.note.id,body:result.note.body,created_at:result.note.created_at,admin_name:state.user&&state.user.displayName,admin_email:state.user&&state.user.email});document.getElementById('noteBody').value='';document.getElementById('notesList').innerHTML=notesHtml();bindNoteDeletes();}catch(err){alert(err.message);}finally{btn.disabled=false;}};
 function bindNoteDeletes(){document.querySelectorAll('[data-delete-note]').forEach(function(btn){btn.onclick=async function(){if(!confirm('Delete this internal note?'))return;btn.disabled=true;try{await api('/api/admin/tenants/'+encodeURIComponent(slug)+'/notes/'+encodeURIComponent(btn.dataset.deleteNote),{method:'DELETE'});notes=notes.filter(function(n){return String(n.id)!==String(btn.dataset.deleteNote)});document.getElementById('notesList').innerHTML=notesHtml();bindNoteDeletes();}catch(err){alert(err.message);btn.disabled=false;}};});}
 bindNoteDeletes();
}
async function payments(kind){
 var query=kind&&kind!=='all'?'&kind='+encodeURIComponent(kind):'';
 var d=await api('/api/admin/payments?limit=200'+query),rows=d.payments||[];
 document.getElementById('pcContent').innerHTML=head('Money','Payments','One ledger for RentSketch Event Pass sales and tenant rental deposits. Refunds are sent through Stripe and recorded here.')+
  '<div class="pc-toolbar"><div class="pc-search"><input id="paySearch" type="search" placeholder="Search customer, business or payment ID…"></div><select class="pc-select" id="payKind"><option value="all">All payments</option><option value="event_pass">Event Pass</option><option value="deposit">Rental deposits</option></select><select class="pc-select" id="payStatus"><option value="">All statuses</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="refunded">Refunded</option><option value="failed">Failed</option></select><button class="pc-btn" id="exportPayments">Export CSV</button></div>'+
  '<section class="pc-panel"><div id="payTable">'+paymentTable(rows,true)+'</div></section>'+
  '<div class="pc-callout" style="margin-top:14px"><strong>Refund safety</strong><p>A refund requires an explicit confirmation. Event Pass refunds revoke the linked software entitlement. Rental-deposit refunds do not cancel the tenant’s event/order automatically.</p></div>';
 var sel=document.getElementById('payKind');sel.value=kind||'all';sel.onchange=function(){payments(sel.value)};
 function currentRows(){var q=(document.getElementById('paySearch').value||'').toLowerCase(),st=document.getElementById('payStatus').value;return rows.filter(function(p){return [p.customer_email,p.customer_name,p.tenant_name,p.payment_intent_id,p.subtype].join(' ').toLowerCase().includes(q)&&(!st||p.status===st)});}
 function paint(){document.getElementById('payTable').innerHTML=paymentTable(currentRows(),true);bindRefunds();}
 document.getElementById('paySearch').oninput=paint;document.getElementById('payStatus').onchange=paint;
 document.getElementById('exportPayments').onclick=function(){var data=currentRows();var cols=['kind','subtype','status','amount_cents','currency','customer_name','customer_email','tenant_name','tenant_slug','payment_intent_id','created_at'];function csv(v){v=String(v==null?'':v);return '"'+v.replaceAll('"','""')+'"';}var content=[cols.join(',')].concat(data.map(function(row){return cols.map(function(key){return csv(row[key]);}).join(',');})).join('\n');var blob=new Blob([content],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='rentsketch-payments-'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(function(){URL.revokeObjectURL(url)},1000);};
 bindRefunds();
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


async function insights(){
 var d=await Promise.all([api('/api/admin/analytics'),api('/api/admin/console-overview')]),a=d[0],o=d[1],trend=a.trend||[],top=a.topTenants||[];
 var designTotal=trend.reduce(function(n,r){return n+Number(r.designs||0)},0),requestTotal=trend.reduce(function(n,r){return n+Number(r.requests||0)},0),passCount=trend.reduce(function(n,r){return n+Number(r.event_passes||0)},0),passCents=trend.reduce(function(n,r){return n+Number(r.event_pass_cents||0)},0);
 var max=Math.max.apply(Math,trend.map(function(r){return Math.max(Number(r.designs||0),Number(r.requests||0),Number(r.event_passes||0))}).concat([1]));
 var chart='<div class="pc-trend-chart">'+trend.map(function(r){var h=Math.max(3,Math.round(Math.max(Number(r.designs||0),Number(r.requests||0),Number(r.event_passes||0))/max*100));return '<div class="pc-trend-day" title="'+esc(r.day)+' · '+r.designs+' designs · '+r.requests+' requests · '+r.event_passes+' passes"><i style="height:'+h+'%"></i><span>'+esc(String(r.day).slice(5))+'</span></div>';}).join('')+'</div>';
 document.getElementById('pcContent').innerHTML=head('Product intelligence','Insights','Thirty-day product activity and the tenant workspaces using RentSketch most.')+
  '<section class="pc-grid metrics">'+metric('Designs · 30 days',designTotal,'Saved design activity')+metric('Quote requests · 30 days',requestTotal,'Customer quote requests')+metric('Event Passes · 30 days',passCount,money(passCents)+' paid revenue','positive')+metric('Installed businesses',o.installedTenants||0,'Tenant workspaces with approved domains')+'</section>'+
  '<section class="pc-panel"><div class="pc-panel-head"><div><h2>30-day activity</h2><p>Daily peak across designs, requests and paid Event Passes.</p></div></div><div class="pc-panel-body">'+chart+'<div class="pc-chart-legend"><span><i class="pc-dot"></i>Activity volume</span><span>Hover each day for the exact mix.</span></div></div></section>'+
  '<section class="pc-panel" style="margin-top:16px"><div class="pc-panel-head"><div><h2>Most active tenant workspaces</h2><p>Usage based on saved designs and quote requests.</p></div><a class="pc-btn small" href="#businesses">All businesses</a></div>'+(top.length?'<div class="pc-table-wrap"><table class="pc-table"><thead><tr><th>Business</th><th>Designs</th><th>Requests</th><th>Booked</th><th>Last activity</th><th></th></tr></thead><tbody>'+top.map(function(t){return '<tr><td><strong>'+esc(t.name)+'</strong><span class="pc-subtext">'+esc(t.slug)+'</span></td><td>'+Number(t.design_count||0)+'</td><td>'+Number(t.request_count||0)+'</td><td>'+Number(t.booked_count||0)+'</td><td>'+datetime(t.last_activity)+'</td><td><button class="pc-btn small" data-insight-workspace="'+esc(t.slug)+'">Open workspace</button></td></tr>'}).join('')+'</tbody></table></div>':empty('No tenant activity yet.'))+'</section>';
 document.querySelectorAll('[data-insight-workspace]').forEach(function(btn){btn.onclick=function(){setTenant(btn.dataset.insightWorkspace);location.href='/dashboard/?tenantView=1#/overview';};});
}

async function alerts(){
 var a=await api('/api/admin/alerts'),counts=a.counts||{};
 document.getElementById('pcContent').innerHTML=head('Operations queue','Needs attention','A focused queue of customer, billing, setup and delivery issues that need human review.',
  '<a class="pc-btn" href="#businesses">Businesses</a><a class="pc-btn" href="#system">System health</a>')+
  '<section class="pc-grid metrics">'+metric('New requests',counts.newRequests||0,'Customer quote requests awaiting follow-up',Number(counts.newRequests)?'':'')+metric('Billing issues',counts.billing||0,'Past due, unpaid, incomplete or paused')+metric('Failed email',counts.failedMail||0,'Access messages that failed')+metric('Uninstalled',counts.uninstalled||0,'Older businesses with no approved domain')+'</section>'+
  alertSection('New quote requests','Customer requests that still have status “new”.',a.newRequests||[],function(r){return '<strong>'+esc(r.customer_name||'Customer')+'</strong><span class="pc-subtext">'+esc(r.name)+' · '+moneyDollars(r.estimate_total||0)+' · '+datetime(r.created_at)+'</span>';},'request')+
  alertSection('Billing issues','Subscriptions requiring owner review.',a.billing||[],function(r){return '<strong>'+esc(r.name)+'</strong><span class="pc-subtext">'+esc(r.plan_id||'plan')+' · '+esc(r.status)+' · period ends '+date(r.current_period_end)+'</span>';},'business')+
  alertSection('Failed access email','Customer access messages that exhausted the current send attempt.',a.failedMail||[],function(r){return '<strong>'+esc(r.customer_email||'Unknown recipient')+'</strong><span class="pc-subtext">'+esc(r.tenant_slug||'generic')+' · '+Number(r.attempts||0)+' attempts · '+esc(r.last_error||'Delivery failed')+'</span>';},'none')+
  alertSection('Businesses not installed','Tenant workspaces older than two days without an approved website origin.',a.uninstalled||[],function(r){return '<strong>'+esc(r.name)+'</strong><span class="pc-subtext">'+esc(r.slug)+' · created '+date(r.created_at)+'</span>';},'business')+
  alertSection('Catalog visual mapping','Active catalog items that require a visual model before customers can use them.',a.unmapped||[],function(r){return '<strong>'+esc(r.name)+'</strong><span class="pc-subtext">'+Number(r.missing||0)+' active products need visual mapping</span>';},'business');
 document.querySelectorAll('[data-alert-workspace]').forEach(function(btn){btn.onclick=function(){setTenant(btn.dataset.alertWorkspace);location.href='/dashboard/?tenantView=1#/overview';};});
 document.querySelectorAll('[data-alert-request]').forEach(function(btn){btn.onclick=function(){setTenant(btn.dataset.alertRequest);location.href='/dashboard/?tenantView=1#/requests';};});
}
function alertSection(title,description,rows,renderer,action){
 if(!rows.length)return '<section class="pc-panel pc-alert-panel resolved"><div class="pc-panel-head"><div><h2>'+esc(title)+'</h2><p>'+esc(description)+'</p></div><span class="pc-status active">Clear</span></div></section>';
 return '<section class="pc-panel pc-alert-panel"><div class="pc-panel-head"><div><h2>'+esc(title)+'</h2><p>'+esc(description)+'</p></div><span class="pc-status past_due">'+rows.length+' open</span></div><div class="pc-alert-list">'+rows.map(function(r){var slug=r.slug||r.tenant_slug||'';var button=action==='request'?'<button class="pc-btn small" data-alert-request="'+esc(slug)+'">Open requests</button>':action==='business'?'<button class="pc-btn small" data-alert-workspace="'+esc(slug)+'">Open workspace</button>':'';return '<div class="pc-alert-row"><div>'+renderer(r)+'</div>'+button+'</div>';}).join('')+'</div></section>';
}

async function activity(){
 var d=await api('/api/admin/activity?limit=200'),rows=d.activity||[];
 document.getElementById('pcContent').innerHTML=head('Accountability','Admin activity','A record of sensitive actions performed from the RentSketch platform console.')+
  '<section class="pc-panel"><div class="pc-panel-body">'+activityList(rows)+'</div></section>';
}

async function system(){
 var s=await api('/api/admin/system');
 document.getElementById('pcContent').innerHTML=head('Operations','System health','Check the core services that support RentSketch logins, payments, access, and customer email.')+
  '<section class="pc-panel"><div class="pc-panel-head"><div><h2>Production services</h2><p>Application-level readiness. Infrastructure deployment status remains in Railway.</p></div></div><div class="pc-panel-body">'+healthCards(s)+'</div></section>'+
  '<section class="pc-grid metrics" style="margin-top:16px">'+metric('Stripe webhooks',String(s.payments.processedWebhookEvents||0),'Processed webhook event IDs')+metric('Access email queued',String(s.email.pending||0),'Pending or sending messages')+metric('Access email failed',String(s.email.failed||0),'Needs delivery attention')+metric('Environment',String(s.app.nodeEnv||'—'),'API runtime mode')+'</section>';
}

async function boot(){
 if(!token()){location.href='/dashboard/#/login';return;}
 try{
  var me=await api('/api/auth/me');
  if(!me.user||!me.user.isPlatformAdmin){location.href='/dashboard/#/overview';return;}
  state.user=me.user;state.tenants=me.tenants||[];
  state.route=route();app.className='';await render();
 }catch(err){setToken(null);location.href='/dashboard/#/login';}
}
window.addEventListener('hashchange',render);
boot();
})();