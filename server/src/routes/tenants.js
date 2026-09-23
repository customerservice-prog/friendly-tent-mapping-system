const express=require('express');
const db=require('../db');
const {requireTenantRole}=require('../middleware/requireAuth');
const {validateWebhookUrl}=require('../outboundWebhook');
const router=express.Router();
function publicShape(t){return{id:t.id,slug:t.slug,name:t.name,logoUrl:t.logo_url,contactEmail:t.contact_email,phone:t.phone,website:t.website,tagline:t.tagline,primaryColor:t.primary_color,secondaryColor:t.secondary_color,showPrices:t.show_prices,poweredByEnabled:t.powered_by_enabled};}
function cleanOrigins(value){if(!Array.isArray(value))return{error:'allowedOrigins must be an array'};if(value.length>50)return{error:'Too many allowed origins'};const out=[];for(const raw of value){if(typeof raw!=='string'||raw.length>500)return{error:'Invalid allowed origin'};let u;try{u=new URL(raw);}catch(_){return{error:'Allowed origins must be valid http(s) origins'};}if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)return{error:'Allowed origins must contain only scheme, host, and optional port'};const origin=u.origin;if(!out.includes(origin))out.push(origin);}return{value:out};}
router.get('/generic',async(req,res)=>{const t=(await db.query('SELECT * FROM tenants WHERE slug=$1',['generic'])).rows[0];if(!t)return res.status(404).json({error:'Generic tenant not found'});res.json(publicShape(t));});
router.get('/:slug',async(req,res)=>{const t=(await db.query('SELECT * FROM tenants WHERE slug=$1',[req.params.slug])).rows[0];if(!t)return res.status(404).json({error:'Tenant not found'});res.json(publicShape(t));});
router.get('/:slug/admin',requireTenantRole('viewer'),async(req,res)=>{const t=req.tenant;res.json(Object.assign(publicShape(t),{embedKey:t.embed_key,allowedOrigins:t.allowed_origins,webhookUrl:t.webhook_url,hasWebhookSecret:Boolean(t.webhook_secret),subscriptionPlan:t.subscription_plan,subscriptionStatus:t.subscription_status,trialEndsAt:t.trial_ends_at,customerAccess:t.customer_access,passPriceCents:t.pass_price_cents,passDurationDays:t.pass_duration_days,activeOrderGraceDays:t.active_order_grace_days,creditPassToOrder:t.credit_pass_to_order,role:req.user.tenantRole}));});
router.patch('/:slug',requireTenantRole('admin'),async(req,res)=>{const body=req.body||{};const map={name:'name',logoUrl:'logo_url',contactEmail:'contact_email',phone:'phone',website:'website',tagline:'tagline',primaryColor:'primary_color',secondaryColor:'secondary_color',showPrices:'show_prices',poweredByEnabled:'powered_by_enabled',allowedOrigins:'allowed_origins',webhookUrl:'webhook_url',webhookSecret:'webhook_secret',customerAccess:'customer_access',passPriceCents:'pass_price_cents',passDurationDays:'pass_duration_days',activeOrderGraceDays:'active_order_grace_days',creditPassToOrder:'credit_pass_to_order'};const sets=[],values=[];let i=1;for(const [key,rawValue] of Object.entries(body)){const col=map[key];if(!col)continue;let value=rawValue;if(col==='webhook_url'){const checked=validateWebhookUrl(value);if(!checked.ok)return res.status(400).json({error:checked.error});value=checked.url;}else if(col==='webhook_secret'){if(value!=null&&typeof value!=='string')return res.status(400).json({error:'webhookSecret must be text'});if(typeof value==='string'&&value.length>512)return res.status(400).json({error:'webhookSecret is too long'});value=value||null;}else if(col==='allowed_origins'){const checked=cleanOrigins(value);if(checked.error)return res.status(400).json({error:checked.error});value=JSON.stringify(checked.value);}sets.push(`${col}=$${i++}`);values.push(value);}if(!sets.length)return res.status(400).json({error:'No valid fields to update'});sets.push('updated_at=now()');values.push(req.tenant.id);const r=await db.query(`UPDATE tenants SET ${sets.join(',')} WHERE id=$${i} RETURNING *`,values);res.json({tenant:publicShape(r.rows[0])});});

router.get('/:slug/dashboard-summary',requireTenantRole('viewer'),async(req,res)=>{
  const t=req.tenant;
  const [products,designs,requests,recentRequests,recentDesigns,members]=await Promise.all([
    db.query(\`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE active)::int AS active,
      COUNT(*) FILTER (WHERE active AND visual_model_id IS NOT NULL)::int AS mapped,
      COUNT(*) FILTER (WHERE active AND category IN ('tent','table','chair','dance_floor','lighting','linen') AND visual_model_id IS NULL)::int AS missing_visual
      FROM products WHERE tenant_id=$1\`,[t.id]),
    db.query(\`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE created_at>=now()-interval '30 days')::int AS month,
      MAX(updated_at) AS last_activity
      FROM designs WHERE tenant_id=$1\`,[t.id]),
    db.query(\`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status='new')::int AS new_count,
      COUNT(*) FILTER (WHERE status='booked')::int AS booked,
      COUNT(*) FILTER (WHERE created_at>=now()-interval '30 days')::int AS month,
      COALESCE(SUM(estimate_total) FILTER (WHERE status NOT IN ('declined')),0)::numeric(12,2) AS pipeline_value,
      COALESCE(SUM(amount_paid_cents) FILTER (WHERE payment_status='paid'),0)::bigint AS paid_deposit_cents,
      MAX(created_at) AS last_activity
      FROM quote_requests WHERE tenant_id=$1\`,[t.id]),
    db.query(\`SELECT id,customer_name,customer_email,event_date,guest_count,event_type,estimate_total,status,payment_status,amount_paid_cents,created_at
      FROM quote_requests WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 8\`,[t.id]),
    db.query(\`SELECT id,event_type,guest_count,estimate_total,created_at,updated_at
      FROM designs WHERE tenant_id=$1 ORDER BY updated_at DESC LIMIT 8\`,[t.id]),
    db.query(\`SELECT COUNT(*)::int AS total FROM tenant_memberships WHERE tenant_id=$1\`,[t.id])
  ]);
  const p=products.rows[0],d=designs.rows[0],q=requests.rows[0];
  const origins=Array.isArray(t.allowed_origins)?t.allowed_origins:[];
  const branding=Boolean(t.name && t.contact_email && (t.logo_url || t.primary_color));
  const catalog=Number(p.active||0)>0 && Number(p.missing_visual||0)===0;
  const install=origins.length>0;
  const billing=t.stripe_connect_status==='active';
  const setup=[
    {key:'catalog',label:'Build your catalog',complete:catalog,href:'#/products',detail:catalog?Number(p.active||0)+' active products ready':'Add products and map required visuals'},
    {key:'branding',label:'Brand the customer experience',complete:branding,href:'#/branding',detail:branding?'Logo/contact/colors configured':'Add your logo, colors and contact details'},
    {key:'install',label:'Install the designer',complete:install,href:'#/install',detail:install?origins.length+' approved website '+(origins.length===1?'domain':'domains'):'Approve your website domain and copy the embed'},
    {key:'payments',label:'Connect payments',complete:billing,href:'#/billing',detail:billing?'Stripe Connect active':'Optional: connect Stripe for rental deposits'}
  ];
  const completed=setup.filter(x=>x.complete).length;
  const activity=[];
  recentRequests.rows.forEach(row=>activity.push({type:'request',id:row.id,title:(row.customer_name||'Customer')+' submitted a quote request',detail:[row.event_type,row.event_date].filter(Boolean).join(' · '),at:row.created_at,status:row.status}));
  recentDesigns.rows.forEach(row=>activity.push({type:'design',id:row.id,title:'A design was saved',detail:[row.event_type,row.guest_count?row.guest_count+' guests':null].filter(Boolean).join(' · '),at:row.updated_at}));
  activity.sort((a,b)=>new Date(b.at)-new Date(a.at));
  const lastCandidates=[d.last_activity,q.last_activity].filter(Boolean).map(x=>new Date(x).getTime());
  res.setHeader('Cache-Control','no-store');
  res.json({
    tenant:{slug:t.slug,name:t.name,contactEmail:t.contact_email,website:t.website,logoUrl:t.logo_url,primaryColor:t.primary_color,subscriptionPlan:t.subscription_plan,subscriptionStatus:t.subscription_status,trialEndsAt:t.trial_ends_at,stripeConnectStatus:t.stripe_connect_status,allowedOrigins:origins,webhookConfigured:Boolean(t.webhook_url)},
    products:{total:Number(p.total||0),active:Number(p.active||0),mapped:Number(p.mapped||0),missingVisual:Number(p.missing_visual||0)},
    designs:{total:Number(d.total||0),month:Number(d.month||0)},
    requests:{total:Number(q.total||0),new:Number(q.new_count||0),booked:Number(q.booked||0),month:Number(q.month||0),pipelineValue:Number(q.pipeline_value||0),paidDepositCents:Number(q.paid_deposit_cents||0)},
    team:{members:Number(members.rows[0].total||0)},
    setup:{completed,total:setup.length,percent:Math.round(completed/setup.length*100),items:setup},
    health:{designer:true,catalogReady:catalog,brandingReady:branding,installReady:install,paymentsReady:billing,webhookConfigured:Boolean(t.webhook_url)},
    recentRequests:recentRequests.rows,
    activity:activity.slice(0,10),
    lastActivity:lastCandidates.length?new Date(Math.max(...lastCandidates)).toISOString():null
  });
});

module.exports=router;
