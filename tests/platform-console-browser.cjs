// Browser QA for the platform owner console. Local static files + mocked APIs only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'qa-platform-console');fs.mkdirSync(out,{recursive:true});
const fixtures={
 me:{user:{id:'admin',email:'owner@example.invalid',displayName:'RentSketch Owner',isPlatformAdmin:true},tenants:[{slug:'friendly',name:'Friendly Party Rental',role:'platform_admin'}]},
 overview:{tenants:3,tenantUsers:8,designs:42,subscriptions:{active:2,trialing:1,attention:1,list_mrr:'148.00'},eventPassRevenue:{count:23,cents:22977},tenantDepositVolume:{count:5,cents:50250},platformFeeRevenue:{cents:1250},month:{eventPassCents:5994,depositCents:20000,designs:14,requests:6},recentTenants:1,newRequests:3,refundedPayments:2,failedPayments:1,installedTenants:2},
 payments:{payments:[
  {id:'pay-1',kind:'event_pass',subtype:'consumer_event_pass',status:'paid',amount_cents:999,currency:'USD',customer_email:'buyer@example.invalid',tenant_slug:'generic',tenant_name:'Direct consumer',payment_intent_id:'pi_fixture',created_at:'2026-09-23T12:00:00Z'},
  {id:'dep-1',kind:'deposit',subtype:'rental_deposit',status:'paid',amount_cents:5000,currency:'USD',customer_name:'Deposit Buyer',customer_email:'deposit@example.invalid',tenant_slug:'friendly',tenant_name:'Friendly Party Rental',payment_intent_id:'pi_dep',created_at:'2026-09-22T12:00:00Z'}
 ]},
 activity:{activity:[{id:'a1',action:'payment.refunded',target_type:'consumer_payment',target_label:'buyer@example.invalid',created_at:'2026-09-23T13:00:00Z'}]},
 system:{database:{ok:true,serverTime:'2026-09-23T14:00:00Z'},payments:{stripeConfigured:true,webhookConfigured:true,eventPassEnabled:true,processedWebhookEvents:29},email:{pending:0,failed:0},app:{nodeEnv:'production'}},
 alerts:{counts:{billing:1,newRequests:3,failedMail:0,uninstalled:1,unmapped:2},billing:[],newRequests:[],failedMail:[],uninstalled:[],unmapped:[]},
 analytics:{trend:Array.from({length:30},(_,i)=>({day:'2026-09-'+String(i+1).padStart(2,'0'),designs:i%4,requests:i%3,event_passes:i%2,event_pass_cents:(i%2)*999})),topTenants:[],eventPassBreakdown:[]},
 vitals:{overall:{samples:120,lcp_p75_ms:1800,inp_p75_ms:140,cls_p75:0.03},pages:[]},

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
  if(u.pathname==='/api/admin/alerts')return res.end(JSON.stringify(fixtures.alerts));
  if(u.pathname==='/api/admin/analytics')return res.end(JSON.stringify(fixtures.analytics));
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
 const browser=await chromium.launch();
 try{
  for(const viewport of [{width:1440,height:900,name:'desktop'},{width:390,height:844,name:'mobile'}]){
   const ctx=await browser.newContext({viewport:{width:viewport.width,height:viewport.height}});
   await ctx.addInitScript(url=>{localStorage.setItem('rentsketch_dashboard_token','fixture-admin-token');window.RENTSKETCH_API_URL=url;},base);
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
   await page.evaluate(()=>{location.hash='payments'});await page.getByRole('heading',{name:'Payments'}).waitFor();
   assert.equal(await page.getByText('Event Pass',{exact:true}).count()>0,true);assert.equal(await page.getByRole('button',{name:'Refund'}).count(),2);
   await page.evaluate(()=>{location.hash='insights'});await page.getByRole('heading',{name:'Insights'}).waitFor();assert.equal(await page.getByText('Designs · 30 days',{exact:true}).count(),1);
   await page.evaluate(()=>{location.hash='alerts'});await page.getByRole('heading',{name:'Needs attention'}).waitFor();assert.equal(await page.getByText('Billing issues',{exact:true}).count()>0,true);
   await page.evaluate(()=>{location.hash='businesses'});await page.getByRole('heading',{name:'Rental businesses'}).waitFor();await page.getByRole('button',{name:/Create business/}).click();assert.equal(await page.getByRole('heading',{name:'Create rental business'}).count(),1);await page.locator('.pc-modal-close').click();
   assert.deepEqual(errors,[]);
   await ctx.close();
  }
  console.log('PASS platform console browser: desktop/mobile owner console, operating metrics, payment ledger, insights and attention queue render without browser errors.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
