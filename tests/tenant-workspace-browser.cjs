// Browser QA for the redesigned tenant workspace. Local files + fixture APIs only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'qa-tenant-workspace');fs.mkdirSync(out,{recursive:true});
const summary={
 tenant:{slug:'fixture',name:'Lakeside Event Rentals',contactEmail:'hello@lakeside.invalid',website:'https://lakeside.invalid',subscriptionPlan:'pro',subscriptionStatus:'active',trialEndsAt:null,stripeConnectStatus:'active',allowedOrigins:['https://lakeside.invalid'],webhookConfigured:true},
 products:{total:26,active:24,mapped:23,missingVisual:1},designs:{total:48,month:12},
 requests:{total:17,new:3,booked:6,month:8,pipelineValue:7425.50,paidDepositCents:185000},team:{members:4},
 setup:{completed:3,total:4,percent:75,items:[
  {key:'catalog',label:'Build your catalog',complete:false,href:'#/products',detail:'1 product needs visual mapping'},
  {key:'branding',label:'Brand the customer experience',complete:true,href:'#/branding',detail:'Logo/contact/colors configured'},
  {key:'install',label:'Install the designer',complete:true,href:'#/install',detail:'1 approved website domain'},
  {key:'payments',label:'Connect payments',complete:true,href:'#/billing',detail:'Stripe Connect active'}
 ]},
 health:{designer:true,catalogReady:false,brandingReady:true,installReady:true,paymentsReady:true,webhookConfigured:true},
 recentRequests:[
  {id:'q1',customer_name:'Taylor Wedding',customer_email:'taylor@example.invalid',event_date:'2026-10-18',guest_count:120,event_type:'Wedding',estimate_total:1890,status:'new',payment_status:'unpaid',created_at:'2026-09-23T15:00:00Z'},
  {id:'q2',customer_name:'Jordan Party',customer_email:'jordan@example.invalid',event_date:'2026-10-25',guest_count:60,event_type:'Birthday',estimate_total:780,status:'quoted',payment_status:'unpaid',created_at:'2026-09-22T15:00:00Z'}
 ],
 activity:[
  {type:'request',id:'q1',title:'Taylor Wedding submitted a quote request',detail:'Wedding · 2026-10-18',at:'2026-09-23T15:00:00Z',status:'new'},
  {type:'design',id:'d1',title:'A design was saved',detail:'Wedding · 120 guests',at:'2026-09-23T14:00:00Z'}
 ],
 lastActivity:'2026-09-23T15:00:00Z'
};
const me={user:{id:'admin',email:'owner@example.invalid',displayName:'Bryan Owner',isPlatformAdmin:true},tenants:[{slug:'fixture',name:'Lakeside Event Rentals',role:'platform_admin'}]};
const requests={quoteRequests:summary.recentRequests};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname.startsWith('/api/')){
  res.setHeader('Content-Type','application/json');
  if(u.pathname==='/api/auth/me')return res.end(JSON.stringify(me));
  if(u.pathname==='/api/tenants/fixture/dashboard-summary')return res.end(JSON.stringify(summary));
  if(u.pathname==='/api/tenants/fixture/quote-requests')return res.end(JSON.stringify(requests));
  res.statusCode=404;return res.end(JSON.stringify({error:'fixture route missing: '+u.pathname}));
 }
 let rel=u.pathname;if(rel==='/dashboard/'||rel==='/dashboard')rel='/dashboard/index.html';
 const file=path.resolve(root,'.'+rel);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'application/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream');
 fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch();
 try{
  for(const v of [{width:1440,height:900,name:'desktop'},{width:390,height:844,name:'mobile'}]){
   const ctx=await browser.newContext({viewport:{width:v.width,height:v.height}});
   await ctx.addInitScript(url=>{localStorage.setItem('rentsketch_dashboard_token','fixture-token');localStorage.setItem('rentsketch_dashboard_tenant','fixture');window.RENTSKETCH_API_URL=url;},base);
   const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.goto(base+'/dashboard/?tenantView=1#/overview');
   await p.getByRole('heading',{name:'Lakeside Event Rentals'}).waitFor();
   assert.ok(await p.getByRole('link',{name:/Open customer designer/i}).count()>=1);
   assert.equal(await p.getByText('75%',{exact:true}).count()>0,true,'setup progress renders');
   assert.equal(await p.getByText('$7,425.50',{exact:true}).count(),1,'request pipeline metric renders');
   assert.equal(await p.getByText('$1,850.00',{exact:true}).count(),1,'deposit metric renders');
   assert.equal(await p.getByText('Super Admin tenant view.',{exact:false}).count()>0,true,'platform support context is explicit');
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'tenant workspace has no page overflow at '+v.width);
   if(v.name==='mobile'){await p.locator('#tenantMenuBtn').click();assert.equal(await p.locator('#tenantShell').evaluate(el=>el.classList.contains('menu-open')),true);}
   await p.screenshot({path:path.join(out,'tenant-'+v.name+'.png'),fullPage:true});
   await p.evaluate(()=>{location.hash='#/requests'});await p.getByRole('heading',{name:'Quote requests'}).waitFor();
   assert.equal(await p.getByPlaceholder(/Search customer/).count(),1);
   assert.deepEqual(errors,[]);
   await ctx.close();
  }
  console.log('PASS tenant workspace browser: premium owner/tenant overview, onboarding, KPIs, health, quick actions, request pipeline and mobile navigation.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
