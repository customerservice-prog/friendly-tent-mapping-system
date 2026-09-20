import {buildBookingHandoff,friendlyBookingUrl} from '../core/bookingHandoff.js';

let products=[],busy=false;
const params=new URLSearchParams(location.search);
const section=document.getElementById('friendlyBooking'),button=document.getElementById('btnBookRentals'),status=document.getElementById('bookingStatus');
function tenant(){return window.ACTIVE_TENANT?.slug||window.RENTSKETCH_TENANT_SLUG;}
function show(){if(section)section.hidden=tenant()!=='friendly';}
window.addEventListener('rentsketch:catalogReady',event=>{products=event.detail?.products||[];show();});
window.addEventListener('rentsketch:tenantReady',show);
show();
button?.addEventListener('click',async()=>{
  if(busy||tenant()!=='friendly')return;
  busy=true;button.disabled=true;status.textContent='Preparing your rentals…';
  try {
    if(!products.length) {
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
      try {
        const response=await fetch(window.RENTSKETCH_API_URL+'/api/tenants/friendly/products',{signal:controller.signal});
        if(!response.ok)throw new Error('Could not check your rentals. Please try again.');
        products=(await response.json()).products||[];
      }finally{clearTimeout(timer);}
    }
    const bridge=window.FriendlyBridge,scene=bridge?.getScene?.();
    let payload=buildBookingHandoff({tenant:tenant(),lines:bridge?.computeLineItems?.(),products,eventDate:document.getElementById('customerDate')?.value,source:params.get('source')||'designer',surfaceType:scene?.surfaceType});
    const autosave=window.RentSketchAutosave;
    if(!autosave?.flush)throw new Error('Your design is still starting. Please try again in a moment.');
    payload.designId=await autosave.flush();
    if(!payload.designId)throw new Error('Your design could not be saved yet. Please try again.');
    const url=friendlyBookingUrl(payload),parent=params.get('parentOrigin');
    if(window.parent!==window&&['https://www.friendlypartyrental.com','https://friendlypartyrental.com'].includes(parent)) {
      window.parent.postMessage({type:'rentsketch.bookingRequested',tenant:'friendly',booking:payload},parent);
      status.replaceChildren(document.createTextNode('Your rentals are ready. '));
      const link=document.createElement('a');link.href=url;link.target='_top';link.textContent='Continue on Friendly Party Rental';status.appendChild(link);
    }else window.location.assign(url);
  }catch(error){status.textContent=error.name==='AbortError'?'The catalog check timed out. Please try again.':error.message||'Could not prepare your rentals. Please try again.';}
  finally{busy=false;button.disabled=false;}
});
