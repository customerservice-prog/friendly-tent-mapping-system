// RentSketch customer review actions.
(function(){
'use strict';
var quoteSubmitting=false;
function allowPaidAction(){var slug=window.RENTSKETCH_TENANT_SLUG||new URLSearchParams(location.search).get('tenant')||'generic';if(!['friendly','generic'].includes(slug)||window.RentSketchEventPass?.canEdit()===true)return true;window.RentSketchEventPass?.requestAccess();return false;}
function $(id){return document.getElementById(id);}function tenant(){return window.ACTIVE_TENANT||{};}function bridge(){return window.FriendlyBridge||{};}
function details(){return{name:($('customerName')||{}).value||'',email:($('customerEmail')||{}).value||'',date:($('customerDate')||{}).value||''};}function scene(){var b=bridge();return b.getScene?b.getScene():null;}
function summaryText(){var b=bridge(),s=scene(),t=tenant(),d=details();if(!s)return'RentSketch event layout';var tent=(b.TENTS||[]).find(function(x){return x.id===s.tentId;}),tables=(s.objects||[]).filter(function(x){return x.kind==='table';}),seats=tables.reduce(function(n,x){return n+(Number(x.seatCount)||0);},0);return['RentSketch Event Plan',t.name||'',s.eventName||'',d.name?('Customer: '+d.name):'',d.email?('Email: '+d.email):'',d.date?('Event date: '+d.date):'',s.guestCount?('Guests: '+s.guestCount):'',tent?('Tent: '+tent.name):'',tables.length?('Tables: '+tables.length):'',seats?('Planned seats: '+seats):'',quoteItems(s).map(function(line){return line.qty+' × '+line.label+' — '+(line.amount==null?'Confirm pricing':'$'+Number(line.amount).toFixed(2));}).join('\n'),'Visual planning draft — final pricing, availability, placement, anchoring and installation must be confirmed by the rental company.'].filter(Boolean).join('\n');}
function quoteItems(s){var b=bridge(),lines=b.computeLineItems?b.computeLineItems():[],pricing=b.currentReviewPricing?.();if(pricing&&tenant().slug==='friendly')return lines.concat([{label:'Delivery'+(pricing.zip?' — ZIP '+pricing.zip:''),qty:1,unitPrice:pricing.deliveryFee,amount:pricing.deliveryFee,productId:null,category:'delivery'},{label:'Sales tax'+(pricing.taxRate==null?'':' ('+pricing.taxRate+'%)'),qty:1,unitPrice:pricing.taxAmount,amount:pricing.taxAmount,productId:null,category:'tax'}]);return lines;}
function estimate(lines,s){if(!lines.length||lines.some(function(x){return x.amount==null;}))return null;return lines.reduce(function(n,x){return n+Math.round(Number(x.amount)*100);},0)/100;}
function download(){if(!allowPaidAction())return;var payload={version:1,createdAt:new Date().toISOString(),tenant:{slug:window.RENTSKETCH_TENANT_SLUG||'',name:tenant().name||''},customer:details(),scene:scene(),pricing:bridge().currentReviewPricing?.()||null};var blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='rentsketch-event-plan.json';document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1000);}
async function share(){
 if(!allowPaidAction())return;
 var text=summaryText(),url=null,s=scene(),slug=window.RENTSKETCH_TENANT_SLUG||new URLSearchParams(location.search).get('tenant')||'generic';
 try{
   var verified=window.RentSketchEventPass?.getAccessUrl?.();
   if(verified)url=verified;
   else if(slug!=='generic'){
     var autosave=window.RentSketchAutosave;
     if(!autosave?.flush)throw new Error('Your design is still saving. Please try again in a moment.');
     var id=await autosave.flush();
     if(!id)throw new Error('Your design could not be saved yet.');
     var shared=await jsonFetch(window.RENTSKETCH_API_URL+'/api/tenants/'+encodeURIComponent(slug)+'/designs/'+encodeURIComponent(id)+'/share',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({anonymousSessionId:autosave.getSessionId()})});
     url=shared.url||null;
   }
   var payload={title:'RentSketch Event Plan',text:text};if(url)payload.url=url;
   if(navigator.share){await navigator.share(payload);return;}
   var copied=url||text;await navigator.clipboard.writeText(copied);
   alert(url?'Private layout link copied. Anyone with the link can view this saved layout.':'Event plan summary copied to your clipboard.');
 }catch(e){if(e&&e.name==='AbortError')return;prompt(url?'Copy your private layout link:':'Copy your event plan:',url||text);}
}
function sessionId(){var k='rentsketch-anon-session';try{var id=localStorage.getItem(k);if(!id){id=(crypto.randomUUID?crypto.randomUUID():'rs-'+Date.now()+'-'+Math.random().toString(36).slice(2));localStorage.setItem(k,id);}return id;}catch(e){return null;}}
async function jsonFetch(url,options){var r=await fetch(url,options),data={};try{data=await r.json();}catch(e){}if(!r.ok)throw new Error(data.error||('Request failed ('+r.status+')'));return data;}
function notifyParent(type,detail){if(!window.parent||window.parent===window)return false;try{window.parent.postMessage(Object.assign({type:type},detail||{}),'*');return true;}catch(e){return false;}}
async function saveDesign(api,slug,s,st){var autosave=window.RentSketchAutosave;if(autosave&&typeof autosave.flush==='function'){var id=await autosave.flush();if(id)return{id:id};}return jsonFetch(api+'/api/tenants/'+encodeURIComponent(slug)+'/designs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scene:s,eventType:st.eventType||null,guestCount:st.guestCount||null,anonymousSessionId:sessionId(),schemaVersion:1})});}
async function quote(e){if(e)e.preventDefault();if(!allowPaidAction())return;var btn=$('btnEmailQuote');if(quoteSubmitting||(btn&&btn.getAttribute('data-sent')==='true'))return;var d=details(),t=tenant(),b=bridge(),s=scene(),st=b.state||{},slug=t.slug||window.RENTSKETCH_TENANT_SLUG||'',api=window.RENTSKETCH_API_URL;if(!d.name||!d.email||!d.date){alert('Please enter your name, email, and event date before requesting a quote.');return;}if(!api||!slug||!s){alert('RentSketch cannot submit this request right now. Your design is still available here; please try again.');return;}var old=btn&&btn.textContent;quoteSubmitting=true;if(btn){btn.setAttribute('aria-disabled','true');btn.style.pointerEvents='none';btn.textContent='Sending…';}var success=false;try{var saved=await saveDesign(api,slug,s,st),items=quoteItems(s),total=estimate(items,s);var q=await jsonFetch(api+'/api/tenants/'+encodeURIComponent(slug)+'/quote-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({designId:saved.id,anonymousSessionId:window.RentSketchAutosave?.getSessionId()||sessionId(),customerName:d.name,customerEmail:d.email,eventDate:d.date,guestCount:st.guestCount||null,eventType:st.eventType||null,lineItems:items,estimateTotal:total,notes:summaryText()})});success=true;if(btn){btn.setAttribute('data-sent','true');btn.textContent=q.notificationSent===false?'Request Saved':'Quote Request Sent';}if(q.notificationSent===false){alert('Your quote request was saved as request '+q.id+', but RentSketch could not confirm an automatic notification to '+(t.name||'the rental company')+'. Please contact the rental company directly so they know to review it.');return;}var embeddedNotified=notifyParent('rentsketch.quoteRequested',{tenant:slug,quoteRequestId:q.id,designId:saved.id,notificationSent:q.notificationSent!==false});if(!embeddedNotified)alert('Your quote request was received by '+(t.name||'the rental company')+'. Request '+q.id+'.');}catch(err){alert(err.message||'We could not submit your quote request. Your design has not been lost; please try again.');if(btn)btn.textContent=old||'Request a Quote';}finally{quoteSubmitting=false;if(btn&&!success){btn.removeAttribute('aria-disabled');btn.style.pointerEvents='';}}}
function bind(){
 var p=$('btnPrint'),qp=$('btnQuickPrint'),d=$('btnDownload'),s=$('btnShare'),qs=$('btnQuickShare'),q=$('btnEmailQuote');
 async function printNow(){if(!allowPaidAction())return;var review=$('step-review');if(review&&!review.classList.contains('active')){if(bridge().goToReview)await bridge().goToReview();else{$('btnToReview')?.click();await new Promise(function(resolve){setTimeout(resolve,80);});}}window.print();}
 if(p)p.addEventListener('click',printNow);if(qp)qp.addEventListener('click',printNow);if(d)d.addEventListener('click',download);if(s)s.addEventListener('click',share);if(qs)qs.addEventListener('click',share);if(q)q.addEventListener('click',quote);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
