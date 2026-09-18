const express=require('express');
const db=require('../db');
const {getMailer}=require('../mailer');
const router=express.Router();
const buckets=new Map();
const VALID_TYPES=new Set(['general','problem','idea']);
function limited(key){const now=Date.now(),windowMs=60*60*1000,max=8;let b=buckets.get(key);if(!b||now-b.start>windowMs)b={start:now,count:0};b.count++;buckets.set(key,b);return b.count>max;}
function text(v,max){return typeof v==='string'?v.trim().slice(0,max):'';}
function clientIp(req){return(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').toString().split(',')[0].trim();}
router.post('/:slug/feedback',async(req,res)=>{
  const tenant=(await db.query('SELECT id,slug,name,contact_email FROM tenants WHERE slug=$1',[req.params.slug])).rows[0];
  if(!tenant)return res.status(404).json({error:'Tenant not found'});
  if(limited(`${tenant.id}:${clientIp(req)}`))return res.status(429).json({error:'Too many feedback submissions. Please try again later.'});
  const body=req.body||{},message=text(body.message,4000),requestedType=text(body.feedbackType,40)||'general',feedbackType=VALID_TYPES.has(requestedType)?requestedType:'general',email=text(body.customerEmail,254);
  if(message.length<3)return res.status(400).json({error:'Please enter feedback before sending.'});
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:'Please enter a valid email address.'});
  const r=await db.query(`INSERT INTO feedback (tenant_id,feedback_type,message,customer_email,entry_mode,product_id,view_mode,page_url,user_agent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,created_at`,[tenant.id,feedbackType,message,email||null,text(body.entryMode,80)||null,text(body.productId,160)||null,text(body.viewMode,20)||null,text(body.pageUrl,1000)||null,text(req.headers['user-agent'],500)||null]);
  const mailer=getMailer(),notify=process.env.FEEDBACK_NOTIFY_EMAIL||process.env.PLATFORM_ADMIN_EMAIL||tenant.contact_email;
  if(mailer&&notify){mailer.send(notify,`RentSketch feedback — ${tenant.name}`,`Type: ${feedbackType}\nTenant: ${tenant.name} (${tenant.slug})\nEmail: ${email||'not provided'}\nEntry: ${text(body.entryMode,80)||'unknown'}\nProduct: ${text(body.productId,160)||'none'}\nView: ${text(body.viewMode,20)||'unknown'}\nPage: ${text(body.pageUrl,1000)||'unknown'}\n\n${message}`).catch(err=>console.error('[feedback-mail] failed:',err.message));}
  res.status(201).json({id:r.rows[0].id,createdAt:r.rows[0].created_at,sent:true});
});
module.exports=router;
