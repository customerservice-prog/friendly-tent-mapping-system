const crypto=require('crypto');
const express=require('express');
const db=require('../db');
const {getMailer}=require('../mailer');
const {requireTenantRole}=require('../middleware/requireAuth');
const {syncOrderEntitlement}=require('../orderProviders/quoteRequestOrderProvider');
const {validateWebhookUrl}=require('../outboundWebhook');
const {isPassEnabled}=require('../eventPass');
const {activePass}=require('../eventPassAccess');
const router=express.Router();
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const buckets=new Map();
const VALID_STATUSES=new Set(['new','contacted','quoted','booked','declined']);
function text(v,max){return typeof v==='string'?v.trim().slice(0,max):'';}
function limited(key){const now=Date.now(),windowMs=60*60*1000,max=10;let b=buckets.get(key);if(!b||now-b.start>windowMs)b={start:now,count:0};b.count++;buckets.set(key,b);return b.count>max;}
function clientIp(req){return(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').toString().split(',')[0].trim();}
function finite(v,min,max){if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):null;}
function sanitizeLineItems(value){if(!Array.isArray(value))return[];return value.slice(0,200).map(item=>{item=item&&typeof item==='object'?item:{};const label=text(item.label,240);if(!label)return null;return{label,qty:finite(item.qty,0,10000)||0,unitPrice:finite(item.unitPrice,0,1000000),amount:finite(item.amount,0,100000000),productId:text(item.productId,160)||null,category:text(item.category,40)||null};}).filter(Boolean);}
async function sendWebhook(tenant,eventType,data){if(!tenant.webhook_url)return{attempted:false,sent:false};const checked=validateWebhookUrl(tenant.webhook_url);if(!checked.ok){console.error('[webhook] blocked unsafe destination for tenant',tenant.slug,checked.error);return{attempted:true,sent:false};}try{const payload={id:crypto.randomUUID(),type:eventType,createdAt:new Date().toISOString(),data};const body=JSON.stringify(payload);const signature=tenant.webhook_secret?crypto.createHmac('sha256',tenant.webhook_secret).update(body).digest('hex'):'';const response=await fetch(checked.url,{method:'POST',headers:{'Content-Type':'application/json','X-RentSketch-Signature':signature},body,redirect:'error'});if(!response.ok){const detail=(await response.text().catch(()=>'' )).slice(0,300);throw new Error(`HTTP ${response.status}${detail?': '+detail:''}`);}return{attempted:true,sent:true};}catch(err){console.error('[webhook] delivery failed for tenant',tenant.slug,err.message);return{attempted:true,sent:false};}}
async function sendTenantEmail(tenant,subject,body){const mailer=getMailer();if(!mailer||!tenant.contact_email)return{attempted:false,sent:false};try{const result=await mailer.send(tenant.contact_email,subject,body);if(result&&result.error)throw new Error(result.error.message||String(result.error));return{attempted:true,sent:true};}catch(err){console.error('[quote-mail] failed:',err.message);return{attempted:true,sent:false};}}
router.post('/:slug/quote-requests',wrap(async(req,res)=>{
 const tenant=(await db.query('SELECT * FROM tenants WHERE slug=$1',[req.params.slug])).rows[0];if(!tenant)return res.status(404).json({error:'Tenant not found'});
 if(limited(`${tenant.id}:${clientIp(req)}`))return res.status(429).json({error:'Too many quote requests. Please try again later.'});
 const body=req.body||{},designId=text(body.designId,80)||null,customerName=text(body.customerName,160),customerEmail=text(body.customerEmail,254),customerPhone=text(body.customerPhone,50),eventDate=text(body.eventDate,20),eventType=text(body.eventType,100),notes=text(body.notes,8000),guestCount=Number.isFinite(Number(body.guestCount))?Math.max(1,Math.min(100000,Number(body.guestCount))):null,estimateTotal=finite(body.estimateTotal,0,100000000),lineItems=sanitizeLineItems(body.lineItems);
 if(!customerName||!customerEmail)return res.status(400).json({error:'Name and email are required.'});if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))return res.status(400).json({error:'Please enter a valid email address.'});if(eventDate&&!/^\d{4}-\d{2}-\d{2}$/.test(eventDate))return res.status(400).json({error:'Invalid event date.'});
 if(isPassEnabled(tenant)){
  if(!designId)return res.status(402).json({error:'An Event Pass is required to send a RentSketch design for a quote.',code:'event_pass_required'});
  const owned=(await db.query('SELECT id FROM designs WHERE id=$1 AND tenant_id=$2 AND anonymous_session_id=$3',[designId,tenant.id,text(body.anonymousSessionId,160)])).rows[0];
  if(!owned)return res.status(404).json({error:'Open your private event link before sending this design.'});
  if(!await activePass(designId))return res.status(402).json({error:'An active Event Pass is required to send this design.',code:'event_pass_required'});
 }
 if(designId){const d=(await db.query('SELECT tenant_id FROM designs WHERE id=$1',[designId])).rows[0];if(!d||d.tenant_id!==tenant.id)return res.status(400).json({error:'designId does not belong to this tenant'});}
 const r=await db.query(`INSERT INTO quote_requests (tenant_id,design_id,customer_name,customer_email,customer_phone,event_date,guest_count,event_type,line_items,estimate_total,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,created_at`,[tenant.id,designId,customerName,customerEmail,customerPhone||null,eventDate||null,guestCount,eventType||null,JSON.stringify(lineItems),estimateTotal,notes||null]);
 const data={id:r.rows[0].id,createdAt:r.rows[0].created_at,designId,customerName,customerEmail,customerPhone:customerPhone||null,eventDate:eventDate||null,eventType:eventType||null,guestCount,estimateTotal,lineItems,notes:notes||null};
 const itemText=lineItems.length?'\nItems:\n'+lineItems.map(i=>`- ${i.qty||1} x ${i.label}${i.amount==null?'':` — $${Number(i.amount).toFixed(2)}`}`).join('\n'):'';
 const [webhook,email]=await Promise.all([
   sendWebhook(tenant,'quote_request.created',data),
   sendTenantEmail(tenant,`New RentSketch quote request — ${customerName}`,`Customer: ${customerName}\nEmail: ${customerEmail}\nPhone: ${customerPhone||'not provided'}\nEvent date: ${eventDate||'not provided'}\nGuests: ${guestCount||'not provided'}\nEvent type: ${eventType||'not provided'}\nDesign ID: ${designId||'not saved'}\nQuote request ID: ${r.rows[0].id}${estimateTotal==null?'':`\nSubmitted estimate: $${estimateTotal.toFixed(2)}`}${itemText}\n\n${notes||''}`)
 ]);
 const notificationSent=Boolean(webhook.sent||email.sent),notificationAttempted=Boolean(webhook.attempted||email.attempted);
 res.status(201).json({id:r.rows[0].id,createdAt:r.rows[0].created_at,received:true,notificationSent,notificationAttempted});
}));
router.get('/:slug/quote-requests',requireTenantRole('viewer'),async(req,res)=>{const r=await db.query(`SELECT qr.*,d.scene FROM quote_requests qr LEFT JOIN designs d ON d.id=qr.design_id WHERE qr.tenant_id=$1 ORDER BY qr.created_at DESC`,[req.tenant.id]);res.json({quoteRequests:r.rows});});
router.patch('/:slug/quote-requests/:id',requireTenantRole('staff'),async(req,res)=>{const body=req.body||{},status=body.status==null?null:text(body.status,40),notes=body.notes==null?null:text(body.notes,8000);if(status&&!VALID_STATUSES.has(status))return res.status(400).json({error:'Invalid quote request status'});if(body.notes!=null&&typeof body.notes!=='string')return res.status(400).json({error:'notes must be text'});const r=await db.query(`UPDATE quote_requests SET status=COALESCE($1,status),notes=COALESCE($2,notes) WHERE id=$3 AND tenant_id=$4 RETURNING *`,[status,notes,req.params.id,req.tenant.id]);if(!r.rows[0])return res.status(404).json({error:'Quote request not found'});if(status)await syncOrderEntitlement(r.rows[0],req.tenant);res.json({quoteRequest:r.rows[0]});});
module.exports=router;
