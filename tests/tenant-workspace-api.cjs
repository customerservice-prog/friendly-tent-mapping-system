// Tenant workspace summary API regression: isolated PGlite, no production writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite'),express=require('express');
const root=path.resolve(__dirname,'..'),pg=new PGlite(),db={query:(sql,args)=>pg.query(sql,args)};
function load(file,deps){const mod={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),{module:mod,exports:mod.exports,require:id=>{if(!(id in deps))throw Error('Unexpected dependency '+id);return deps[id];},console,URL,Date,Number,String,Object,Array,Math,JSON},{filename:file});return mod.exports;}
const tenantGuard=()=>async(req,res,next)=>{const t=(await pg.query('SELECT * FROM tenants WHERE slug=$1',[req.params.slug])).rows[0];if(!t)return res.status(404).json({error:'Tenant not found'});req.tenant=t;req.user={tenantRole:'owner'};next();};
const routes=load('server/src/routes/tenants.js',{express,'../db':db,'../middleware/requireAuth':{requireTenantRole:tenantGuard},'../outboundWebhook':{validateWebhookUrl:value=>({ok:true,url:value})}});
const app=express();app.use(express.json());app.use('/api/tenants',routes);app.use((err,req,res,next)=>res.status(500).json({error:err.message}));
let server,base;
async function req(url){const r=await fetch(base+url);return{status:r.status,body:await r.json()};}
(async()=>{
 await pg.exec(`
 CREATE TABLE tenants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slug text UNIQUE,name text,logo_url text,contact_email text,phone text,website text,tagline text,primary_color text,secondary_color text,show_prices boolean,powered_by_enabled boolean,embed_key text,allowed_origins jsonb default '[]'::jsonb,webhook_url text,webhook_secret text,subscription_plan text,subscription_status text,trial_ends_at timestamptz,customer_access text,pass_price_cents int,pass_duration_days int,active_order_grace_days int,credit_pass_to_order boolean,stripe_connect_status text,created_at timestamptz default now(),updated_at timestamptz default now());
 CREATE TABLE products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,category text,active boolean default true,visual_model_id text);
 CREATE TABLE designs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,event_type text,guest_count int,estimate_total numeric,scene jsonb default '{}'::jsonb,created_at timestamptz default now(),updated_at timestamptz default now());
 CREATE TABLE quote_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,customer_name text,customer_email text,event_date date,guest_count int,event_type text,estimate_total numeric,status text,payment_status text,amount_paid_cents int,created_at timestamptz default now());
 CREATE TABLE tenant_memberships(tenant_id uuid,user_id uuid,role text);
 `);
 const t=(await pg.query(`INSERT INTO tenants(slug,name,logo_url,contact_email,website,primary_color,show_prices,powered_by_enabled,allowed_origins,webhook_url,subscription_plan,subscription_status,stripe_connect_status)
 VALUES('fixture','Fixture Rentals','https://example.invalid/logo.png','office@example.invalid','https://example.invalid','#2f6fed',true,true,'["https://example.invalid"]'::jsonb,'https://example.invalid/hook','pro','active','active') RETURNING id`)).rows[0];
 await pg.query("INSERT INTO products(tenant_id,category,active,visual_model_id) VALUES($1,'tent',true,'pole-20x20'),($1,'table',true,'round-5ft'),($1,'chair',true,NULL)",[t.id]);
 await pg.query("INSERT INTO designs(tenant_id,event_type,guest_count,estimate_total,scene) VALUES($1,'Wedding',120,1800,'{}'),($1,'Birthday',60,700,'{}')",[t.id]);
 await pg.query("INSERT INTO quote_requests(tenant_id,customer_name,customer_email,event_date,guest_count,event_type,estimate_total,status,payment_status,amount_paid_cents) VALUES($1,'Taylor','taylor@example.invalid',current_date+20,120,'Wedding',1800,'new','unpaid',0),($1,'Jordan','jordan@example.invalid',current_date+30,60,'Birthday',700,'booked','paid',50000)",[t.id]);
 await pg.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,gen_random_uuid(),'owner'),($1,gen_random_uuid(),'staff')",[t.id]);
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
 const r=await req('/api/tenants/fixture/dashboard-summary');assert.equal(r.status,200);
 assert.equal(r.body.products.total,3);assert.equal(r.body.products.missingVisual,1);assert.equal(r.body.designs.total,2);
 assert.equal(r.body.requests.total,2);assert.equal(r.body.requests.new,1);assert.equal(r.body.requests.booked,1);assert.equal(r.body.requests.paidDepositCents,50000);
 assert.equal(r.body.team.members,2);assert.equal(r.body.setup.percent,75,'catalog visual mapping keeps launch readiness below 100%');
 assert.equal(r.body.health.brandingReady,true);assert.equal(r.body.health.installReady,true);assert.equal(r.body.health.paymentsReady,true);assert.equal(r.body.health.catalogReady,false);
 assert.equal(r.body.recentRequests.length,2);assert.ok(r.body.activity.some(x=>x.type==='request'));assert.ok(r.body.activity.some(x=>x.type==='design'));
 console.log('PASS tenant workspace summary: setup readiness, catalog health, designs, requests, deposits, team and recent activity.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{server?.close();await pg.close();});
