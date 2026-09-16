const express=require('express');
const {query}=require('../db');
const {EVENT_PASS_DURATION_DAYS,EVENT_PASS_RENEWAL_DURATION_DAYS}=require('../pricing');
const {syncOrderEntitlement}=require('../orderProviders/friendlyOrderProvider');
const router=express.Router();
function getStripe(){if(!process.env.STRIPE_SECRET_KEY)return null;const Stripe=require('stripe');return new Stripe(process.env.STRIPE_SECRET_KEY);}
async function upsertBusinessSubscription(sub,metadata={}){
  const tenantId=metadata.tenantId||sub.metadata?.tenantId;if(!tenantId)return;
  const planId=metadata.planId||sub.metadata?.planId||'starter';
  const interval=metadata.interval||sub.metadata?.interval||'monthly';
  const status=sub.status||'active';
  const start=sub.current_period_start?new Date(sub.current_period_start*1000):null;
  const end=sub.current_period_end?new Date(sub.current_period_end*1000):null;
  await query(`INSERT INTO subscriptions(tenant_id,plan_id,provider_customer_id,provider_subscription_id,status,billing_interval,current_period_start,current_period_end,cancel_at_period_end)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT(provider_subscription_id) DO UPDATE SET plan_id=EXCLUDED.plan_id,status=EXCLUDED.status,billing_interval=EXCLUDED.billing_interval,current_period_start=EXCLUDED.current_period_start,current_period_end=EXCLUDED.current_period_end,cancel_at_period_end=EXCLUDED.cancel_at_period_end`,
    [tenantId,planId,String(sub.customer||''),sub.id,status,interval,start,end,!!sub.cancel_at_period_end]);
  await query('UPDATE tenants SET subscription_plan=$1,subscription_status=$2,updated_at=now() WHERE id=$3',[planId,status,tenantId]);
}
router.post('/',async(req,res)=>{
 const stripe=getStripe();if(!stripe)return res.status(503).send('Payments not configured');
 let event;try{event=stripe.webhooks.constructEvent(req.body,req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET);}catch(err){console.error('[stripe webhook] signature verification failed',err.message);return res.status(400).send('Invalid signature');}
 const idem=await query('INSERT INTO processed_stripe_events(id,event_type) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id',[event.id,event.type]);if(!idem.rows.length)return res.json({received:true,duplicate:true});
 try{
  if(event.type==='checkout.session.completed'){
   const s=event.data.object,m=s.metadata||{};
   if(m.kind==='consumer_event_pass'){
    const expiresAt=new Date(Date.now()+EVENT_PASS_DURATION_DAYS*86400000);const e=await query(`INSERT INTO entitlements(design_id,customer_email,source,status,starts_at,expires_at,payment_reference) VALUES($1,$2,'consumer_purchase','active',now(),$3,$4) RETURNING id`,[m.designId,m.customerEmail,expiresAt,s.payment_intent]);await query(`UPDATE consumer_payments SET status='paid',stripe_payment_intent_id=$1,entitlement_id=$2 WHERE stripe_checkout_session_id=$3`,[s.payment_intent,e.rows[0].id,s.id]);
   }else if(m.kind==='consumer_event_pass_renewal'){
    const cur=await query(`SELECT expires_at FROM entitlements WHERE design_id=$1 AND status='active' AND (expires_at IS NULL OR expires_at>now()) ORDER BY expires_at DESC NULLS LAST LIMIT 1`,[m.designId]);const base=Math.max(Date.now(),cur.rows[0]?.expires_at?new Date(cur.rows[0].expires_at).getTime():0),expiresAt=new Date(base+EVENT_PASS_RENEWAL_DURATION_DAYS*86400000);const e=await query(`INSERT INTO entitlements(design_id,customer_email,source,status,starts_at,expires_at,payment_reference) VALUES($1,$2,'consumer_renewal','active',now(),$3,$4) RETURNING id`,[m.designId,m.customerEmail,expiresAt,s.payment_intent]);await query(`UPDATE consumer_payments SET status='paid',stripe_payment_intent_id=$1,entitlement_id=$2 WHERE stripe_checkout_session_id=$3`,[s.payment_intent,e.rows[0].id,s.id]);
   }else if(m.kind==='business_subscription'&&s.subscription){const sub=await stripe.subscriptions.retrieve(s.subscription);await upsertBusinessSubscription(sub,m);
   }else if(m.quoteRequestId){const u=await query(`UPDATE quote_requests SET payment_status='paid',status='booked',amount_paid_cents=$1,stripe_payment_intent_id=$2 WHERE id=$3 RETURNING *`,[s.amount_total,s.payment_intent,m.quoteRequestId]);if(u.rows[0]){const tr=await query('SELECT * FROM tenants WHERE id=$1',[u.rows[0].tenant_id]);await syncOrderEntitlement(u.rows[0],tr.rows[0]);}}
  }else if(event.type==='customer.subscription.updated'||event.type==='customer.subscription.created'){await upsertBusinessSubscription(event.data.object);
  }else if(event.type==='customer.subscription.deleted'){const sub=event.data.object;await upsertBusinessSubscription(sub);const tenantId=sub.metadata?.tenantId;if(tenantId)await query(`UPDATE tenants SET subscription_status='canceled',updated_at=now() WHERE id=$1`,[tenantId]);}
 }catch(err){console.error('[stripe webhook] processing failed',event.id,err);return res.status(500).send('Webhook processing failed');}
 res.json({received:true});
});
module.exports=router;
