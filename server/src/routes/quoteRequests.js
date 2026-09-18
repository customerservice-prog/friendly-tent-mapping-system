const crypto=require('crypto');
const express=require('express');
const db=require('../db');
const {getMailer}=require('../mailer');
const {requireTenantRole}=require('../middleware/requireAuth');
const {syncOrderEntitlement}=require('../orderProviders/friendlyOrderProvider');
const router=express.Router();
const buckets=new Map();
function text(v,max){return typeof v==='string'?v.trim().slice(0,max):'';}
function limited(key){const now=Date.now(),windowMs=60*60*1000,max=10;let b=buckets.get(key);if(!b||now-b.start>windowMs)b={start:now,count:0};b.count++;buckets.set(key,b);return b.count>max;}
async function sendWebhook(tenant,eventType,data){if(!tenant.webhook_url)return;try{const payload={id:crypto.randomUUID(),type:eventType,createdAt:new Date().toISOString(),data};const body=JSON.stringify(payload);const signature=tenant.webhook_secret?crypto.createHmac('sha256',tenant.webhook_secret).update(body).digest('hex'):'';await fetch(tenant.webhook_url,{method:'POST',headers:{'Content-Type':'application/json','X-RentSketch-Signature':signature},body});}catch(err){console.error('[webhook] delivery failed for tenant',tenant.slug,err.message);}}
router.post('/:slug/quote-requests',async(req,res)=>{
 const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').toString().split(',')[0].trim();if(limited(ip))return res.status(429).json({error:'Too many quote requests. Please try again later.'});
 const tenant=(await db.query('SELECT * FROM tenants WHERE slug=$1',[req.params.slug])).rows[0];if(!tenant)return res.status(404).json({error:'Tenant not found'});
 const body=req.body||{},designId=body.designId||null,customerName=text(body.customerName,160),customerEmail=text(body.customerEmail,254),customerPhone=text(body.customerPhone,50),eventDate=text(body.eventDate,20),eventType=text(body.eventType,100),notes=text(body.notes,8000),guestCount=Number.isFinite(Number(body.guestCount))?Math.max(1,Math.min(100000,Number(body.guestCount))):null,estimateTotal=Number.isFinite(Number(body.estimateTotal))?Math.max(0,Number(body.estimateTotal)):null,lineItems=Array.isArray(body.lineItems)?body.lineItems.slice(0,200):[];
 if(!customerName||!customerEmail)return res.status(400).json({error:'Name and email are required.'});if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))return res.status(400).json({error:'Please enter a valid email address.'});if(eventDate&&!/^\d{4}-\d{2}-\d{2}$/.test(eventDate))return res.status(400).json({error:'Invalid event date.'});
 if(designId){const d=(await db.query('SELECT tenant_id FROM designs WHERE id=$1',[designId])).rows[0];if(!d||d.tenant_id!==tenant.id)return res.status(400).json({error:'designId does not belong to this tenant'});}
 const r=await db.query(`INSERT INTO quote_requests (tenant_id,design_id,customer_name,customer_email,customer_phone,event_date,guest_count,event_type,line_items,estimate_total,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,created_at`,[tenant.id,designId,customerName,customerEmail,customerPhone||null,eventDate||null,guestCount,eventType||null,JSON.stringify(lineItems),estimateTotal,notes||null]);
 const data={id:r.rows[0].id,createdAt:r.rows[0].created_at,customerName,customerEmail,eventDate:eventDate||null,guestCount,estimateTotal};sendWebhook(tenant,'quote_request.created',data);
 const mailer=getMailer();if(mailer&&tenant.contact_email){mailer.send(tenant.contact_email,`New RentSketch quote request — ${customerName}`,`Customer: ${customerName}\nEmail: ${customerEmail}\nPhone: ${customerPhone||'not provided'}\nEvent date: ${eventDate||'not provided'}\nGuests: ${guestCount||'not provided'}\nEvent type: ${eventType||'not provided'}\nDesign ID: ${designId||'not saved'}\nQuote request ID: ${r.rows[0].id}\n\n${notes||''}`).catch(err=>console.error('[quote-mail] failed:',err.message));}
 res.status(201).json({id:r.rows[0].id,createdAt:r.rows[0].created_at,received:true});
});
router.get('/:slug/quote-requests',requireTenantRole('viewer'),async(req,res)=>{const r=await db.query(`SELECT qr.*,d.scene FROM quote_requests qr LEFT JOIN designs d ON d.id=qr.design_id WHERE qr.tenant_id=$1 ORDER BY qr.created_at DESC`,[req.tenant.id]);res.json({quoteRequests:r.rows});});
router.patch('/:slug/quote-requests/:id',requireTenantRole('staff'),async(req,res)=>{const {status,notes}=req.body||{};const r=await db.query(`UPDATE quote_requests SET status=COALESCE($1,status),notes=COALESCE($2,notes) WHERE id=$3 AND tenant_id=$4 RETURNING *`,[status||null,notes||null,req.params.id,req.tenant.id]);if(!r.rows[0])return res.status(404).json({error:'Quote request not found'});if(status)await syncOrderEntitlement(r.rows[0],req.tenant);res.json({quoteRequest:r.rows[0]});});
module.exports=router;
