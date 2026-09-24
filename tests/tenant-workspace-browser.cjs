// Browser QA for redesigned tenant workspace. Local files + mocked API only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'qa-tenant-workspace');fs.mkdirSync(out,{recursive:true});
const tenant='friendly';
const fixture='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/dashboard/tenant-v2.css"></head><body><div id="app"></div><script src="/dashboard/app.js"></script></body></html>';
const requests=[
 {id:'q1',customer_name:'Jamie Wedding',customer_email:'jamie@example.invalid',customer_phone:'3155550101',event_date:'2026-10-20',guest_count:120,event_type:'Wedding',estimate_total:1750,status:'new',payment_status:'unpaid',created_at:'2026-09-23T20:00:00Z'},
 {id:'q2',customer_name:'Alex Party',customer_email:'alex@example.invalid',customer_phone:'3155550102',event_date:'2026-10-05',guest_count:60,event_type:'Birthday',estimate_total:620,status:'booked',payment_status:'paid',amount_paid_cents:12400,created_at:'2026-09-22T18:00:00Z'}
];
const designs=[
 {id:'d1',event_type:'Wedding',guest_count:120,estimate_total:1750,created_at:'2026-09-23T19:00:00Z'},
 {id:'d2',event_type:'Birthday',guest_count:60,estimate_total:620,created_at:'2026-09-21T19:00:00Z'}
];
const products=[
 {id:'p1',category:'tent',name:'20x40 Pole Tent',price_per_day:400,visual_model_id:'pole-20x40',active:true},
 {id:'p2',category:'chair',name:'White Resin Chair',price_per_day:4.75,visual_model_id:'resin-white',active:true}
];
const admin={slug:tenant,name:'Friendly Party Rental',contactEmail:'office@example.invalid',logoUrl:'https://example.invalid/logo.png',primaryColor:'#2f6fed',secondaryColor:'#0b1b3a',subscriptionPlan:'pro',subscriptionStatus:'active',allowedOrigins:['https://www.example.com'],showPrices:true,poweredByEnabled:true};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/fixture'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fixture);}
 if(u.pathname.startsWith('/api/')){
  res.setHeader('Content-Type','application/json');
  if(u.pathname==='/api/auth/me')return res.end(JSON.stringify({user:{id:'u1',email:'owner@example.invalid',displayName:'Owner',isPlatformAdmin:false},tenants:[{slug:tenant,name:'Friendly Party Rental',role:'owner'}]}));
  if(u.pathname===`/api/tenants/${tenant}/admin`)return res.end(JSON.stringify(admin));
  if(u.pathname===`/api/tenants/${tenant}/designs`)return res.end(JSON.stringify({designs}));
  if(u.pathname===`/api/tenants/${tenant}/quote-requests`)return res.end(JSON.stringify({quoteRequests:requests}));
  if(u.pathname===`/api/tenants/${tenant}/products`)return res.end(JSON.stringify({products}));
  if(u.pathname===`/api/tenants/${tenant}/connect/status`)return res.end(JSON.stringify({status:'active',hasAccount:true}));
  if(u.pathname.startsWith(`/api/tenants/${tenant}/quote-requests/`)&&req.method==='PATCH')return res.end(JSON.stringify({ok:true}));
  res.statusCode=404;return res.end(JSON.stringify({error:'fixture API missing '+u.pathname}));
 }
 const file=path.resolve(root,'.'+u.pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/plain');
 fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch();
 try{
  for(const v of [{width:1440,height:900,name:'desktop'},{width:390,height:844,name:'mobile'}]){
   const ctx=await browser.newContext({viewport:{width:v.width,height:v.height}});
   await ctx.addInitScript(url=>{localStorage.setItem('rentsketch_dashboard_token','fixture-token');localStorage.setItem('rentsketch_dashboard_tenant','friendly');window.RENTSKETCH_API_URL=url;},base);
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/fixture#/overview');
   await page.getByRole('heading',{name:'Friendly Party Rental'}).waitFor();
   assert.equal(await page.getByText('Finish your customer designer',{exact:false}).count()+await page.getByText('Your designer is launch-ready',{exact:false}).count()>0,true);
   assert.equal(await page.getByText('Business health',{exact:true}).count(),1);
   assert.equal(await page.getByRole('link',{name:/Open RentSketch/}).count()>=1,true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'workspace no page overflow '+v.width);
   if(v.name==='mobile'){await page.locator('#tenantMobileMenu').click();assert.equal(await page.locator('#tenantShell').evaluate(el=>el.classList.contains('menu-open')),true);}
   await page.screenshot({path:path.join(out,'tenant-'+v.name+'.png'),fullPage:true});
   await page.evaluate(()=>location.hash='#/analytics');await page.getByRole('heading',{name:'Customer planning activity'}).waitFor();
   assert.equal(await page.getByText('Request → booked',{exact:true}).count(),1);
   await page.evaluate(()=>location.hash='#/requests');await page.getByRole('heading',{name:'Quote requests'}).waitFor();
   await page.locator('#requestSearch').fill('Jamie');assert.equal(await page.locator('#requestTable').getByText('Jamie Wedding',{exact:false}).count(),1);assert.equal(await page.locator('#requestTable').getByText('Alex Party',{exact:false}).count(),0);
   assert.deepEqual(errors,[]);
   await ctx.close();
  }
  console.log('PASS tenant workspace browser: premium overview, health, onboarding, analytics, request search and mobile navigation.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});