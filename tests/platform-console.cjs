// Platform console API regression: isolated PGlite + fake Stripe, never production.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite'),express=require('express');
const root=path.resolve(__dirname,'..'),pg=new PGlite();
const refundCalls=[],subscriptionCalls=[];
const db={
  query:(sql,args)=>pg.query(sql,args),
  pool:{connect:async()=>({query:(sql,args)=>pg.query(sql,args),release(){}})}
};
class Stripe{
  refunds={create:async(args,opts)=>{refundCalls.push({args,opts});return{id:'re_fixture_'+refundCalls.length,status:'succeeded',amount:args.payment_intent==='pi_event'?999:2000};}};
  subscriptions={update:async(id,args)=>{subscriptionCalls.push({id,args});return{id,status:'active',cancel_at_period_end:!!args.cancel_at_period_end,current_period_end:1893456000};}};
}
function load(file,deps){
  const mod={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),{
    module:mod,exports:mod.exports,require:id=>{if(!(id in deps))throw Error('Unexpected dependency '+id);return deps[id];},
    process:{env:{NODE_ENV:'test',STRIPE_SECRET_KEY:'fixture-secret',STRIPE_WEBHOOK_SECRET:'fixture-webhook',EVENT_PASS_ENABLED:'true'}},
    console,Date,Number,String,Object,Array,Math,JSON,URL
  },{filename:file});
  return mod.exports;
}
const guard=(req,res,next)=>{req.user={userId:'00000000-0000-4000-8000-000000000099',isPlatformAdmin:true};next();};
const routes=load('server/src/routes/admin.js',{express,'../db':db,'../middleware/requireAuth':{requirePlatformAdmin:guard},stripe:Stripe});
const app=express();app.use(express.json());app.use('/api/admin',routes);app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:err.message});});
let server,base;
async function req(url,{method='GET',body}={}){
 const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 return{status:r.status,body:await r.text().then(t=>{try{return JSON.parse(t)}catch{return t}})};
}
(async()=>{
 await pg.exec(`
 CREATE TABLE users(id uuid PRIMARY KEY,email text,display_name text,is_platform_admin boolean default false);
 CREATE TABLE tenants(
   id uuid PRIMARY KEY,slug text UNIQUE,name text,contact_email text,subscription_plan text,subscription_status text,
   trial_ends_at timestamptz,stripe_connect_status text,stripe_connect_account_id text,created_at timestamptz default now(),
   updated_at timestamptz default now()
 );
 CREATE TABLE products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid);
 CREATE TABLE tenant_memberships(tenant_id uuid,user_id uuid,role text,created_at timestamptz default now());
 CREATE TABLE designs(
   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,owner_user_id uuid,event_type text,guest_count int,
   estimate_total numeric,created_at timestamptz default now(),updated_at timestamptz default now()
 );
 CREATE TABLE entitlements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),design_id uuid,status text,expires_at timestamptz,revoked_at timestamptz);
 CREATE TABLE consumer_payments(
   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),design_id uuid,customer_email text,payment_type text,amount_cents int,currency text,
   status text,stripe_checkout_session_id text,stripe_payment_intent_id text,entitlement_id uuid,created_at timestamptz default now()
 );
 CREATE TABLE quote_requests(
   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,design_id uuid,customer_name text,customer_email text,
   payment_status text,deposit_amount_cents int,amount_paid_cents int,platform_fee_cents int,
   stripe_checkout_session_id text,stripe_payment_intent_id text,created_at timestamptz default now()
 );
 CREATE TABLE plans(id text PRIMARY KEY,monthly_price numeric,annual_price numeric);
 CREATE TABLE subscriptions(
   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,plan_id text,status text,billing_interval text,
   current_period_start timestamptz,current_period_end timestamptz,cancel_at_period_end boolean default false,
   provider_customer_id text,provider_subscription_id text,created_at timestamptz default now()
 );
 CREATE TABLE platform_admin_audit(
   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),admin_user_id uuid,action text,target_type text,target_id text,target_label text,
   metadata jsonb default '{}'::jsonb,created_at timestamptz default now()
 );
 CREATE TABLE event_pass_emails(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),status text);
 CREATE TABLE processed_stripe_events(id text PRIMARY KEY,event_type text);
 `);
 const admin='00000000-0000-4000-8000-000000000099',tenant='00000000-0000-4000-8000-000000000001';
 await pg.query("INSERT INTO users(id,email,display_name,is_platform_admin) VALUES($1,'owner@example.invalid','Owner',true)",[admin]);
 await pg.query("INSERT INTO tenants(id,slug,name,contact_email,subscription_plan,subscription_status,stripe_connect_status,stripe_connect_account_id) VALUES($1,'friendly','Friendly Fixture','office@example.invalid','pro','active','active','acct_fixture')",[tenant]);
 await pg.query("INSERT INTO products(tenant_id) VALUES($1),($1)",[tenant]);
 await pg.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'owner')",[tenant,admin]);
 const design=(await pg.query("INSERT INTO designs(tenant_id,event_type,guest_count,estimate_total) VALUES($1,'wedding',80,1200) RETURNING id",[tenant])).rows[0];
 const ent=(await pg.query("INSERT INTO entitlements(design_id,status,expires_at) VALUES($1,'active',now()+interval '30 days') RETURNING id",[design.id])).rows[0];
 const pass=(await pg.query("INSERT INTO consumer_payments(design_id,customer_email,payment_type,amount_cents,currency,status,stripe_checkout_session_id,stripe_payment_intent_id,entitlement_id) VALUES($1,'buyer@example.invalid','consumer_event_pass',999,'usd','paid','cs_event','pi_event',$2) RETURNING id",[design.id,ent.id])).rows[0];
 const deposit=(await pg.query("INSERT INTO quote_requests(tenant_id,design_id,customer_name,customer_email,payment_status,deposit_amount_cents,amount_paid_cents,platform_fee_cents,stripe_checkout_session_id,stripe_payment_intent_id) VALUES($1,$2,'Deposit Buyer','deposit@example.invalid','paid',2000,2000,100,'cs_dep','pi_dep') RETURNING id",[tenant,design.id])).rows[0];
 await pg.query("INSERT INTO plans(id,monthly_price,annual_price) VALUES('pro',99,990)");
 const sub=(await pg.query("INSERT INTO subscriptions(tenant_id,plan_id,status,billing_interval,current_period_start,current_period_end,provider_customer_id,provider_subscription_id) VALUES($1,'pro','active','monthly',now(),now()+interval '1 month','cus_fixture','sub_fixture') RETURNING id",[tenant])).rows[0];
 await pg.query("INSERT INTO event_pass_emails(status) VALUES('pending'),('failed')");
 await pg.query("INSERT INTO processed_stripe_events(id,event_type) VALUES('evt_1','checkout.session.completed')");
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;

 let r=await req('/api/admin/console-overview');assert.equal(r.status,200);assert.equal(r.body.tenants,1);assert.equal(r.body.designs,1);assert.equal(r.body.eventPassRevenue.cents,999);assert.equal(r.body.tenantDepositVolume.cents,2000);assert.equal(r.body.platformFeeRevenue.cents,100);assert.equal(Number(r.body.subscriptions.list_mrr),99);
 r=await req('/api/admin/payments');assert.equal(r.status,200);assert.equal(r.body.payments.length,2);assert.deepEqual(new Set(r.body.payments.map(p=>p.kind)),new Set(['event_pass','deposit']));
 assert.equal((await req('/api/admin/payments?kind=event_pass')).body.payments.length,1);
 assert.equal((await req('/api/admin/payments/event_pass/'+pass.id+'/refund',{method:'POST',body:{}})).status,400,'refund requires explicit confirmation');
 r=await req('/api/admin/payments/event_pass/'+pass.id+'/refund',{method:'POST',body:{confirm:true}});assert.equal(r.status,200);assert.equal(refundCalls[0].args.payment_intent,'pi_event');
 assert.equal((await pg.query('SELECT status FROM consumer_payments WHERE id=$1',[pass.id])).rows[0].status,'refunded');
 assert.equal((await pg.query('SELECT status FROM entitlements WHERE id=$1',[ent.id])).rows[0].status,'revoked');
 r=await req('/api/admin/payments/deposit/'+deposit.id+'/refund',{method:'POST',body:{confirm:true}});assert.equal(r.status,200);assert.equal(refundCalls[1].args.payment_intent,'pi_dep');assert.equal(refundCalls[1].args.reverse_transfer,true);assert.equal(refundCalls[1].args.refund_application_fee,true);
 assert.equal((await pg.query('SELECT payment_status FROM quote_requests WHERE id=$1',[deposit.id])).rows[0].payment_status,'refunded');
 r=await req('/api/admin/subscriptions');assert.equal(r.status,200);assert.equal(r.body.subscriptions.length,1);
 r=await req('/api/admin/subscriptions/'+sub.id,{method:'PATCH',body:{cancelAtPeriodEnd:true}});assert.equal(r.status,200);assert.equal(r.body.cancelAtPeriodEnd,true);assert.equal(subscriptionCalls[0].id,'sub_fixture');
 assert.equal((await pg.query('SELECT cancel_at_period_end FROM subscriptions WHERE id=$1',[sub.id])).rows[0].cancel_at_period_end,true);
 r=await req('/api/admin/designs');assert.equal(r.status,200);assert.equal(r.body.designs.length,1);assert.equal(r.body.designs[0].active_access,false,'refunded Event Pass revoked active access');
 r=await req('/api/admin/system');assert.equal(r.status,200);assert.equal(r.body.database.ok,true);assert.equal(r.body.payments.stripeConfigured,true);assert.equal(r.body.email.pending,1);assert.equal(r.body.email.failed,1);
 r=await req('/api/admin/activity');assert.equal(r.status,200);assert.ok(r.body.activity.some(a=>a.action==='payment.refunded'));assert.ok(r.body.activity.some(a=>a.action==='subscription.cancel_scheduled'));
 assert.ok((await pg.query('SELECT COUNT(*)::int AS n FROM platform_admin_audit')).rows[0].n>=3,'sensitive actions are audited');
 console.log('PASS platform console: revenue, payment ledger, guarded Stripe refunds, entitlement revocation, subscription cancellation, designs, health and audit logging.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{server?.close();await pg.close();});
