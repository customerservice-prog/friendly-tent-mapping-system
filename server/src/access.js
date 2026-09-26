// Authoritative server-side access resolution.
const db = require('./db');
const { EVENT_PASS_CENTS } = require('./pricing');
const { isPassEnabled } = require('./eventPass');
const FULL_CAPABILITIES = ['view','edit','save','3d','export','share'];
async function findActiveEntitlement(designId){if(!designId)return null;const r=await db.query(`SELECT * FROM entitlements WHERE design_id=$1 AND status='active' AND (expires_at IS NULL OR expires_at>now()) ORDER BY expires_at DESC NULLS LAST LIMIT 1`,[designId]);return r.rows[0]||null;}
async function resolveAccess({design,tenant,isStaff}){
  if(isStaff)return {context:'staff',access:'included',reason:'staff',expiresAt:null,capabilities:FULL_CAPABILITIES,paymentRequired:false,price:null,currency:'usd',tenant:tenant?tenant.slug:null};
  if(design?.project_root_id){const root=(await db.query('SELECT * FROM designs WHERE id=$1 AND tenant_id IS NOT DISTINCT FROM $2 AND project_root_id IS NULL',[design.project_root_id,design.tenant_id])).rows[0];design=root||null;}
  const entitlement=design?await findActiveEntitlement(design.id):null;
  if(!tenant){
    if(entitlement)return {context:'consumer',access:'paid',reason:entitlement.source,expiresAt:entitlement.expires_at,capabilities:entitlement.capabilities,paymentRequired:false,price:null,currency:'usd',tenant:null};
    return {context:'consumer',access:'preview',reason:'consumer_pass',expiresAt:null,capabilities:['view'],paymentRequired:true,price:EVENT_PASS_CENTS,currency:'usd',tenant:null};
  }
  if(!isPassEnabled(tenant) && (tenant.slug==='friendly' || (tenant.customer_access||'paid')==='free'))return {context:'tenant_customer',access:'included',reason:'tenant_free',expiresAt:null,capabilities:FULL_CAPABILITIES,paymentRequired:false,price:null,currency:'usd',tenant:tenant.slug};
  const policy=tenant.customer_access||'paid',tenantPrice=tenant.pass_price_cents!=null?tenant.pass_price_cents:EVENT_PASS_CENTS;
  if(policy==='order_then_paid'&&entitlement&&entitlement.source==='active_order')return {context:'tenant_customer',access:'included',reason:'active_order',expiresAt:entitlement.expires_at,capabilities:entitlement.capabilities,paymentRequired:false,price:null,currency:'usd',tenant:tenant.slug};
  if(entitlement)return {context:'tenant_customer',access:'paid',reason:entitlement.source,expiresAt:entitlement.expires_at,capabilities:entitlement.capabilities,paymentRequired:false,price:null,currency:'usd',tenant:tenant.slug};
  return {context:'tenant_customer',access:'preview',reason:'tenant_paid_pass',expiresAt:null,capabilities:['view'],paymentRequired:true,price:isPassEnabled(tenant)?EVENT_PASS_CENTS:tenantPrice,currency:'usd',tenant:tenant.slug};
}
module.exports={resolveAccess,findActiveEntitlement};
