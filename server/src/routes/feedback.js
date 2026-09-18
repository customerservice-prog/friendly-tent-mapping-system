const crypto=require('crypto');
const express=require('express');
const db=require('../db');
const {getMailer}=require('../mailer');
const router=express.Router();
const buckets=new Map();
const VALID_TYPES=new Set(['general','problem','idea']);
function limited(key){const now=Date.now(),windowMs=60*60*1000,max=8;let b=buckets.get(key);if(!b||now-b.start>windowMs)b={start:now,count:0};b.count++;buckets.set(key,b);return b.count>max;}
function text(v,max){return typeof v==='string'?v.trim().slice(0,max):'';}
function clientIp(req){return(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').toString().split(',')[0].trim();}
async function webhook(tenant,data){if(!tenant.webhook_url)return{attempted:false,sent:false};try{const payload={id:crypto.randomUUID(),type:'feedback.created',createdAt:new Date().toISOString(),data},body=JSON.stringify(payload),signature=tenant.webhook_secret?crypto.createHmac('sha256',tenant.webhook_secret).update(body).digest('hex'):'';const r=await fetch(tenant.webhook_url,{method:'POST',headers:{'Content-Type':'application/json','X-RentSketch-Signature':signature},body});if(!r.ok)throw new Error(`HTTP ${r.status}: ${(await r.text().catch(()=>'' )).slice(0,300)}`);return{attempted:true,sent:true};}catch(err){console.error('[feedback-webhook] failed for tenant',tenant.slug,err.message);return{attempted:true,sent:false};}}
async function emailNotify(tenant,data){const mailer=getMailer(),notify=process.env.FEEDBACK_NOTIFY_EMAIL||process.env.PLATFORM_ADMIN_EMAIL||tenant.contact_email;if(!mailer||!notify)return{attempted:false,sent:false};try{const result=await mailer.send(notify,`RentSketch feedback — ${tenant.name}`,`Type: ${data.feedbackType}\nTenant: ${tenant.name} (${tenant.slug})\nEmail: ${data.customerEmail||'not provided'}\nEntry: ${data.entryMode||'unknown'}\nProduct: ${data.productId||'none'}\nView: ${data.viewMode||'unknown'}\nPage: ${data.pageUrl||'unknown'}\n\n${data.message}`);if(result&&result.error)throw new Error(result.error.message||String(result.error));return{attempted:true,sent:true};}catch(err){console.error('[feedback-mail] failed:',err.message);return{attempted:true,sent:false};}}
router.post('/:slug/feedback',async(req,res)=>{
  const tenant=(await db.query('SELECT id,slug,name,contact_email,webhook_url,webhook_secret FROM tenants WHERE slug=$1',[req.params.slug])).rows[0];
  if(!tenant)return res.status(404).json({error:'Tenant not found'});
  if(limited(`${tenant.id}:${clientIp(req)}`))return res.status(429).json({error:'Too many feedback submissions. Please try again later.'});
  const body=req.body||{},message=text(body.message,4000),requestedType=text(body.feedbackType,40)||'general',feedbackType=VALID_TYPES.has(requestedType)?requestedType:'general',email=text(body.customerEmail,254),entryMode=text(body.entryMode,80)||null,productId=text(body.productId,160)||null,viewMode=text(body.viewMode,20)||null,pageUrl=text(body.pageUrl,1000)||null;
  if(message.length<3)return res.status(400).json({error:'Please enter feedback before sending.'});
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:'Please enter a valid email address.'});
  const r=await db.query(`INSERT INTO feedback (tenant_id,feedback_type,message,customer_email,entry_mode,product_id,view_mode,page_url,user_agent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,created_at`,[tenant.id,feedbackType,message,email||null,entryMode,productId,viewMode,pageUrl,text(req.headers['user-agent'],500)||null]);
  const data={id:r.rows[0].id,createdAt:r.rows[0].created_at,feedbackType,message,customerEmail:email||null,entryMode,productId,viewMode,pageUrl};
  const [webhookResult,emailResult]=await Promise.all([webhook(tenant,data),emailNotify(tenant,data)]);
  const notificationSent=Boolean(webhookResult.sent||emailResult.sent),notificationAttempted=Boolean(webhookResult.attempted||emailResult.attempted);
  res.status(201).json({id:r.rows[0].id,createdAt:r.rows[0].created_at,sent:true,notificationSent,notificationAttempted});
});
module.exports=router;
