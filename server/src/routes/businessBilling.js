const express = require('express');
const { requireTenantAccess } = require('../middleware/requireAuth');
const db = require('../db');
const { BUSINESS_PLANS } = require('../pricing');

const router = express.Router();
function stripeClient(){ if(!process.env.STRIPE_SECRET_KEY) return null; const Stripe=require('stripe'); return new Stripe(process.env.STRIPE_SECRET_KEY); }
function safeOrigin(req){ const configured=(process.env.APP_URL||'https://rentsketch.com').replace(/\/$/,''); const candidate=req.headers.origin; return candidate && /^https:\/\/([a-z0-9-]+\.)?rentsketch\.com$/i.test(candidate) ? candidate : configured; }

// Public plan catalog. Prices shown by clients should come from here.
router.get('/plans', (req,res)=>res.json({currency:'usd',plans:Object.values(BUSINESS_PLANS)}));

// Starts a recurring Stripe subscription for an authenticated tenant.
router.post('/:slug/billing/checkout-session', requireTenantAccess, async (req,res)=>{
  const stripe=stripeClient();
  if(!stripe) return res.status(503).json({error:'Payments are not configured.'});
  const planId=String(req.body?.plan||'').toLowerCase();
  const interval=req.body?.interval==='annual'?'annual':'monthly';
  const plan=BUSINESS_PLANS[planId];
  if(!plan || planId==='enterprise') return res.status(400).json({error:'Choose Starter, Pro, or Business.'});
  const amount=interval==='annual'?plan.annualCents:plan.monthlyCents;
  const recurringInterval=interval==='annual'?'year':'month';
  const tenant=req.tenant;
  let customerId=tenant.stripe_billing_customer_id || null;
  if(!customerId){
    const customer=await stripe.customers.create({email:tenant.contact_email||undefined,name:tenant.name,metadata:{tenantId:tenant.id,tenantSlug:tenant.slug}});
    customerId=customer.id;
    await db.query('UPDATE tenants SET stripe_billing_customer_id=$1, updated_at=now() WHERE id=$2',[customerId,tenant.id]);
  }
  const origin=safeOrigin(req);
  const session=await stripe.checkout.sessions.create({
    mode:'subscription', customer:customerId,
    line_items:[{price_data:{currency:'usd',unit_amount:amount,recurring:{interval:recurringInterval},product_data:{name:`RentSketch ${plan.name}`,description:`RentSketch ${plan.name} business subscription`}},quantity:1}],
    metadata:{kind:'business_subscription',tenantId:tenant.id,tenantSlug:tenant.slug,planId,interval},
    subscription_data:{metadata:{kind:'business_subscription',tenantId:tenant.id,tenantSlug:tenant.slug,planId,interval}},
    success_url:`${origin}/dashboard/?billing=success`, cancel_url:`${origin}/business/pricing.html?billing=cancelled`
  });
  res.json({url:session.url});
});

module.exports=router;
