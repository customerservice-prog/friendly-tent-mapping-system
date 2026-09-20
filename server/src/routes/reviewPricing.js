const express=require('express'),db=require('../db');
const {reviewPricing}=require('../reviewPricing');
const router=express.Router();
router.get('/:slug/review-pricing',async(req,res,next)=>{
 try{
  const zip=String(req.query.zip||'').trim();
  if(zip&&!/^\d{5}$/.test(zip))return res.status(400).json({error:'Enter a five-digit delivery ZIP code.'});
  const tenant=(await db.query('SELECT slug,show_prices FROM tenants WHERE slug=$1',[req.params.slug])).rows[0];
  if(!tenant)return res.status(404).json({error:'Tenant not found'});
  res.setHeader('Cache-Control','no-store');res.json(await reviewPricing(tenant,zip));
 }catch(error){next(error);}
});
module.exports=router;
