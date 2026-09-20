// Read the same public pricing sources as Friendly's checkout. Never writes an order.
const ORIGIN='https://www.friendlypartyrental.com';
const cache=new Map();
function amount(value){if(value==null||value==='')return null;const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;}
async function read(path,fetcher){
 const response=await fetcher(ORIGIN+path,{signal:AbortSignal.timeout(8000),redirect:'error'});
 if(!response.ok)throw new Error('Pricing source unavailable');
 return response.json();
}
async function reviewPricing(tenant,zip,fetcher=fetch){
 if(tenant.slug!=='friendly'||tenant.show_prices===false)return {available:false,taxRate:null,deliveryFee:null};
 const key=zip||'',saved=cache.get(key);
 if(fetcher===fetch&&saved&&Date.now()-saved.at<60000)return saved.value;
 const [tax,delivery]=await Promise.allSettled([read('/api/tax-rate',fetcher),zip?read('/api/delivery-fee?zip='+encodeURIComponent(zip),fetcher):Promise.resolve(null)]);
 const taxRate=tax.status==='fulfilled'&&tax.value?.rate?.isActive!==false?amount(tax.value?.rate?.rate):null;
 const deliveryFee=delivery.status==='fulfilled'?amount(delivery.value?.fee):null;
 const value={available:true,source:'Friendly Party Rental checkout',zip:zip||null,taxRate:taxRate!=null&&taxRate<=100?taxRate:null,taxDelivery:true,deliveryFee,distanceMiles:delivery.status==='fulfilled'?amount(delivery.value?.distance):null,checkedAt:new Date().toISOString()};
 if(fetcher===fetch&&value.taxRate!=null&&(!zip||deliveryFee!=null)){if(cache.size>1000)cache.clear();cache.set(key,{at:Date.now(),value});}
 return value;
}
module.exports={reviewPricing};
