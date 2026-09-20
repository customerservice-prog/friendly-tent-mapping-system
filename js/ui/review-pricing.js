import {reviewTotals} from '../core/reviewTotals.js';
let rates=null,request=0,controller=null,zip='',host=null;
// Save the customer's location with the event; always fetch prices again.
export function reviewDeliveryZip(){return zip;}
export function restoreReviewDeliveryZip(value){
 controller?.abort();request++;rates=null;host=null;
 zip=typeof value==='string'&&/^\d{0,5}$/.test(value.trim())?value.trim():'';
}
const money=n=>n==null?'Confirm pricing':'$'+n.toFixed(2);
function totals(){return reviewTotals(window.FriendlyBridge?.computeLineItems?.()||[],rates);}
export function currentReviewPricing(){return {...totals(),status:rates?.available?'connected':'unavailable'};}
function render(){
 if(!host?.isConnected)return;
 const value=totals();
 host.querySelector('.review-cost-lines').innerHTML=`<div><span>Rental subtotal</span><strong>${money(value.rentalSubtotal)}</strong></div><div><span>Delivery${value.zip?' · '+value.zip:''}</span><strong>${rates?.deliveryFee==null?'Enter ZIP / confirm':money(value.deliveryFee)}</strong></div><div><span>Sales tax${value.taxRate==null?'':' ('+value.taxRate+'%)'}</span><strong>${money(value.taxAmount)}</strong></div><div class="review-grand-total"><span>Estimated total</span><strong>${money(value.total)}</strong></div>`;
 host.querySelector('.review-cost-note').textContent=value.rentalSubtotal==null?'Known rentals: '+money(value.knownSubtotal)+'. Items marked “Confirm pricing” still need a price before a complete total is available.':'One-day rental with standard delivery. Event duration, availability, ballast and optional services are confirmed with your rental company.';
}
async function calculate(){
 const input=host.querySelector('input'),value=input.value.trim(),status=host.querySelector('.review-pricing-status');
 if(value&&!/^\d{5}$/.test(value)){status.textContent='Enter a five-digit delivery ZIP code.';input.focus();return;}
 zip=value;const token=++request;controller?.abort();controller=new AbortController();rates=null;render();status.textContent='Checking current delivery and tax…';
 const button=host.querySelector('button');button.disabled=true;
 const activeController=controller,timer=setTimeout(()=>activeController.abort(),10000);
 try{
  const slug=window.ACTIVE_TENANT?.slug||window.RENTSKETCH_TENANT_SLUG,api=window.RENTSKETCH_API_URL;
  if(!api||!slug)throw new Error('unavailable');
  const response=await fetch(api+'/api/tenants/'+encodeURIComponent(slug)+'/review-pricing'+(zip?'?zip='+zip:''),{signal:controller.signal});
  if(!response.ok)throw new Error('unavailable');const result=await response.json();if(token!==request)return;
  rates=result;render();status.textContent=!result.available?'Delivery and tax are not connected for this rental company. Request confirmation with your quote.':!zip?'Enter the event delivery ZIP to complete your estimate.':result.deliveryFee==null?'That ZIP could not be priced. Check it and try again, or request confirmation.':result.taxRate==null?'Delivery is available; sales tax still needs confirmation.':'Delivery and tax updated from your rental company’s checkout.';
 }catch(error){if(token!==request)return;rates=null;render();status.textContent='Delivery and tax could not be checked. Your layout is safe. Try again or request pricing confirmation.';}
 finally{clearTimeout(timer);if(token===request)button.disabled=false;}
}
export function mountReviewPricing(container){
 controller?.abort();request++;host=container;rates=null;
 host.innerHTML='<section class="review-costs"><h3>Your event estimate</h3><p>Enter the event delivery ZIP to include available delivery charges and sales tax.</p><form class="review-location"><label>Delivery ZIP<input name="deliveryZip" autocomplete="postal-code" inputmode="numeric" maxlength="5" pattern="[0-9]{5}" aria-label="Event delivery ZIP"></label><button type="submit" class="btn-secondary">Calculate total</button></form><p class="review-pricing-status" role="status"></p><div class="review-cost-lines" aria-live="polite"></div><p class="review-cost-note"></p></section>';
 const input=host.querySelector('input');input.value=zip;
 host.querySelector('form').addEventListener('submit',e=>{e.preventDefault();calculate();});
 input.addEventListener('input',()=>{controller?.abort();request++;rates=null;zip=input.value.trim();host.querySelector('button').disabled=false;render();host.querySelector('.review-pricing-status').textContent='Select Calculate total to update delivery and tax.';window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));});
 render();calculate();
}
