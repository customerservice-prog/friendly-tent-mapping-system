// Browser QA for the platform owner console. Local static files + mocked APIs only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'qa-platform-console');fs.mkdirSync(out,{recursive:true});
const fixtures={
 me:{user:{id:'admin',email:'owner@example.invalid',displayName:'RentSketch Owner',isPlatformAdmin:true},tenants:[{slug:'friendly',name:'Friendly Party Rental',role:'platform_admin'}]},
 overview:{tenants:3,tenantUsers:8,designs:42,subscriptions:{active:2,trialing:1,attention:0,list_mrr:'148.00'},eventPassRevenue:{count:23,cents:22977},tenantDepositVolume:{count:5,cents:50250},platformFeeRevenue:{cents:1250},month:{eventPassCents:5994,depositCents:20000}},
 payments:{payments:[
  {id:'pay-1',kind:'event_pass',subtype:'consumer_event_pass',status:'paid',amount_cents:999,currency:'USD',customer_email:'buyer@example.invalid',tenant_slug:'generic',tenant_name:'Direct consumer',payment_intent_id:'pi_fixture',created_at:'2026-09-23T12:00:00Z'},
  {id:'dep-1',kind:'deposit',subtype:'rental_deposit',status:'paid',amount_cents:5000,currency:'USD',customer_name:'Deposit Buyer',customer_email:'deposit@example.invalid',tenant_slug:'friendly',tenant_name:'Friendly Party Rental',payment_intent_id:'pi_dep',created_at:'2026-09-22T12:00:00Z'}
 ]},
 activity:{activity:[{id:'a1',action:'payment.refunded',target_type:'consumer_payment',target_label:'buyer@example.invalid',created_at:'2026-09-23T13:00:00Z'}]},
 system:{database:{ok:true,serverTime:'2026-09-23T14:00:00Z'},payments:{stripeConfigured:true,webhookConfigured:true,eventPassEnabled:true,processedWebhookEvents:29},email:{pending:0,failed:0},app:{nodeEnv:'production'}},
 onboarding:{accounts:[{id:'t1',slug:'friendly',name:'Friendly Party Rental',contact_email:'office@example.invalid',subscription_plan:'pro',subscription_status:'active',stripe_connect_status:'active',product_count:8,active_product_count:8,priced_product_count:8,mapped_product_count:8,request_count:12,design_count:20,checks:{catalog:true,pricing:true,visuals:true,branding:true,install:true,payments:true},complete:6,totalChecks:6,progress:100,latest_activity_at:'2026-09-23T13:00:00Z'},{id:'t2',slug:'starter',name:'Starter Rentals',contact_email:'starter@example.invalid',subscription_plan:'trial',subscription_status:'trialing',stripe_connect_status:'not_connected',product_count:0,active_product_count:0,priced_product_count:0,mapped_product_count:0,request_count:0,design_count:0,checks:{catalog:false,pricing:false,visuals:false,branding:false,install:false,payments:false},complete:0,totalChecks:6,progress:0,latest_activity_at:null}]},
 alerts:{alerts:[{severity:'medium',type:'setup',slug:'starter',name:'Starter Rentals',title:'No products added',detail:'Customer designer cannot launch without a catalog.'}]},
 users:{users:[{id:'u1',email:'owner@example.invalid',display_name:'RentSketch Owner',is_platform_admin:true,created_at:'2026-09-01T12:00:00Z',memberships:[]},{id:'u2',email:'tenant@example.invalid',display_name:'Tenant Owner',is_platform_admin:false,created_at:'2026-09-10T12:00:00Z',memberships:[{slug:'friendly',name:'Friendly Party Rental',role:'owner'}]}]},
 vitals:{days:7,thresholds:{lcpGoodMs:2500,clsGood:.1,inpGoodMs:200},overall:{path:'ALL',samples:120,lcp_p75_ms:1700,cls_p75:.02,inp_p75_ms:120,fcp_p75_ms:900,ttfb_p75_ms:250},pages:[{path:'/',samples:80,lcp_p75_ms:1750,cls_p75:.02,inp_p75_ms:130,fcp_p75_ms:920,ttfb_p75_ms:240}]},
};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname.startsWith('/api/')){
  res.setHeader('Content-Type','application/json');
  if(u.pathname==='/api/auth/me')return res.end(JSON.stringify(fixtures.me));
  if(u.pathname==='/api/admin/console-overview')return res.end(JSON.stringify(fixtures.overview));
  if(u.pathname==='/api/admin/payments')return res.end(JSON.stringify(fixtures.payments));
  if(u.pathname==='/api/admin/activity')return res.end(JSON.stringify(fixtures.activity));
  if(u.pathname==='/api/admin/system')return res.end(JSON.stringify(fixtures.system));
  if(u.pathname==='/api/admin/onboarding')return res.end(JSON.stringify(fixtures.onboarding));
  if(u.pathname==='/api/admin/alerts')return res.end(JSON.stringify(fixtures.alerts));
  if(u.pathname==='/api/admin/users')return res.end(JSON.stringify(fixtures.users));
  if(u.pathname==='/api/admin/web-vitals')return res.end(JSON.stringify(fixtures.vitals));
  if(u.pathname==='/api/admin/tenants')return res.end(JSON.stringify({tenants:[]}));
  if(u.pathname==='/api/admin/subscriptions')return res.end(JSON.stringify({subscriptions:[]}));
  if(u.pathname==='/api/admin/designs')return res.end(JSON.stringify({designs:[]}));
  res.statusCode=404;return res.end(JSON.stringify({error:'fixture route missing'}));
 }
 const rel=u.pathname==='/'?'/dashboard/platform.html':u.pathname;
 const file=path.resolve(root,'.'+rel);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'application/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream');
 fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.RENTSKETCH_CHROMIUM||undefined});
 try{
  for(const viewport of [{width:1440,height:900,name:'desktop'},{width:390,height:844,name:'mobile'}]){
   const ctx=await browser.newContext({viewport:{width:viewport.width,height:viewport.height}});
   await ctx.addInitScript(url=>{
    const expiresAt=Date.now()+60*60*1000;
    const token='fixture.'+btoa(JSON.stringify({kind:'dashboard_session',sub:'admin',jti:'platform-browser-fixture',exp:Math.floor(expiresAt/1000)}))+'.isolated-signature';
    localStorage.setItem('rentsketch_dashboard_session',JSON.stringify({lastActivity:Date.now(),expiresAt}));
    localStorage.setItem('rentsketch_dashboard_token',token);window.RENTSKETCH_API_URL=url;
   },base);
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/dashboard/platform.html#overview');
   await page.getByRole('heading',{name:'Your RentSketch business'}).waitFor();
   assert.equal(await page.getByText('$148.00',{exact:true}).count(),1,'MRR metric renders');
   assert.ok(await page.getByRole('link',{name:/Open RentSketch/}).count()>=1,'admin has direct designer button');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'console has no horizontal page overflow at '+viewport.width);
   if(viewport.name==='mobile'){
    await page.locator('#pcMenu').click();assert.equal(await page.locator('#pcShell').evaluate(el=>el.classList.contains('menu-open')),true);
   }
   await page.screenshot({path:path.join(out,'platform-'+viewport.name+'.png'),fullPage:true});
   await page.evaluate(()=>{location.hash='onboarding'});await page.getByRole('heading',{name:'Tenant onboarding'}).waitFor();assert.equal(await page.getByText(/6 \/ 6 · 100%/).count()>0,true);
   await page.evaluate(()=>{location.hash='users'});await page.getByRole('heading',{name:'Users & access'}).waitFor();assert.equal(await page.getByText('Tenant Owner',{exact:true}).count(),1);
   await page.evaluate(()=>{location.hash='alerts'});await page.getByRole('heading',{name:'Alerts & attention'}).waitFor();assert.equal(await page.getByText('No products added',{exact:true}).count(),1);
   await page.evaluate(()=>{location.hash='performance'});await page.getByRole('heading',{name:'Web performance'}).waitFor();assert.equal(await page.getByText('120',{exact:true}).count()>0,true);
   await page.evaluate(()=>{location.hash='payments'});await page.getByRole('heading',{name:'Payments'}).waitFor();
   assert.equal(await page.getByText('Event Pass',{exact:true}).count()>0,true);assert.equal(await page.getByRole('button',{name:'Refund'}).count(),2);
   assert.deepEqual(errors,[]);
   await ctx.close();
  }
  console.log('PASS platform console browser: desktop/mobile layout, owner metrics, users, onboarding, alerts, web performance, payment ledger and refund controls render without browser errors.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
