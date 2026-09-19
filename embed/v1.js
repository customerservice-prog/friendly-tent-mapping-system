// RentSketch Embed Loader — validated, responsive, tenant catalog + designer.
(function () {
  'use strict';
  var RENTSKETCH_ORIGIN='https://rentsketch.com', API_ORIGIN='https://rentsketch-api-production.up.railway.app', VERSION='20260919-integration';
  var script=document.currentScript||document.scripts[document.scripts.length-1];
  function attr(name,fallback){var v=script.getAttribute(name);return v==null||v===''?fallback:v;}
  var tenant=attr('data-tenant',null),embedKey=attr('data-embed-key',''),targetId=attr('data-target','rentsketch-embed'),fixedHeight=attr('data-height',null),mode=attr('data-mode','inline'),orderId=attr('data-order-id',''),customerToken=attr('data-customer-token',''),showCatalog=attr('data-show-catalog','true')!=='false',modalOverlay=null,modalCleanup=null,returnFocus=null;
  var productId=attr('data-product-id',''),tentSlug=attr('data-tent-slug',''),tentName=attr('data-tent-name',''),preview=!!(productId||tentSlug||tentName),initialView=attr('data-view','3d')==='2d'?'2d':'3d';
  function target(){return document.getElementById(targetId);}
  function emit(el,name,detail){var host=target(),separate=el.tagName==='IFRAME'&&host&&!host.contains(el);el.dispatchEvent(new CustomEvent(name,{detail:detail||{},bubbles:!separate}));if(separate)host.dispatchEvent(new CustomEvent(name,{detail:detail||{},bubbles:true}));}
  function money(v){if(v===null||v===undefined||v==='')return'Ask for pricing';var n=Number(v);return Number.isFinite(n)?('$'+n.toFixed(2)+'/day'):'Ask for pricing';}
  function label(v){return String(v||'Other').replace(/_/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});}
  function messageBox(el,title,body){el.innerHTML='';var box=document.createElement('div');box.style.cssText='font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:24px;border:1px solid #dfe6ed;border-radius:14px;background:#fff;color:#172536;box-shadow:0 10px 35px rgba(25,45,70,.08)';var h=document.createElement('strong');h.textContent=title;h.style.display='block';h.style.marginBottom='6px';var p=document.createElement('span');p.textContent=body;p.style.color='#667589';p.style.fontSize='14px';box.appendChild(h);box.appendChild(p);el.appendChild(box);}
  function buildSrc(view,attempt){
    var p=new URLSearchParams({tenant:tenant,embed:'1',v:VERSION,parentOrigin:window.location.origin});
    if(embedKey)p.set('embedKey',embedKey);
    if(orderId)p.set('orderId',orderId);
    if(customerToken)p.set('customerToken',customerToken);
    if(preview){p.set('focus','tent');p.set('autoplace','1');p.set('view',view||initialView);}
    if(productId)p.set('productId',productId);
    if(tentSlug)p.set('tentSlug',tentSlug);
    if(tentName)p.set('tent',tentName);
    if(attempt)p.set('retry',String(attempt));
    return RENTSKETCH_ORIGIN+'/designer/?'+p.toString();
  }
  function closeModal(){
    if(modalCleanup)modalCleanup();modalCleanup=null;
    if(modalOverlay)modalOverlay.remove();modalOverlay=null;
    if(returnFocus&&returnFocus.isConnected)returnFocus.focus();
  }
  function mountDesigner(el,inModal){
    var attempt=0,timer=null,disposed=false,view=initialView,frame=document.createElement('iframe'),shell=document.createElement('div');
    var height=Number(fixedHeight),fixed=Number.isFinite(height)&&height>=320;
    shell.style.cssText='position:relative;width:100%;height:'+(inModal?'100%':(fixed?height+'px':'min(860px,90dvh)'))+';min-height:'+(inModal?'0':'400px')+';background:#fff';
    frame.title=tentName?tentName+' — RentSketch Preview':'RentSketch Event Designer';
    frame.setAttribute('allow','clipboard-write; fullscreen');frame.style.cssText='width:100%;height:100%;border:0;display:block';
    var status=document.createElement('div');status.setAttribute('role','status');status.style.cssText='position:absolute;top:10px;left:50%;transform:translateX(-50%);padding:8px 12px;border-radius:12px;background:#fff;box-shadow:0 2px 12px #0002;font:14px system-ui;pointer-events:none';
    var recovery=document.createElement('div');recovery.hidden=true;recovery.style.cssText='position:absolute;inset:0;background:#fff;padding:24px;box-sizing:border-box;overflow:auto;font:15px/1.5 system-ui;color:#203429';
    var message=document.createElement('p');recovery.appendChild(message);
    function button(text,action){var b=document.createElement('button');b.type='button';b.textContent=text;b.style.cssText='min-height:44px;padding:10px 16px;margin:5px;border:1px solid #ccd8cf;border-radius:9px;background:#f2f7f3;color:#203429;font:600 14px system-ui;cursor:pointer';b.onclick=action;recovery.appendChild(b);}
    button('Try Again',function(){load(view);});
    if(preview)button('Open in 2D',function(){load('2d');});
    var full=document.createElement('a');full.textContent='Open Full Screen';full.target='_blank';full.rel='noopener';full.style.cssText='display:inline-block;margin:12px;color:#245c36';recovery.appendChild(full);
    function failure(reason){clearTimeout(timer);status.hidden=true;message.textContent=reason||'The designer is taking longer than expected. Please retry or open it full screen.';recovery.hidden=false;emit(frame,'rentsketch:error',{tenant:tenant,reason:message.textContent});}
    function load(nextView){
      if(disposed)return;view=nextView;clearTimeout(timer);recovery.hidden=true;status.hidden=false;status.textContent=preview?'Loading your tent…':'Loading your event designer…';
      var src=buildSrc(view,++attempt);full.href=src;frame.src=src;
      timer=setTimeout(function(){failure();},25000);
    }
    function onMessage(event){
      if(disposed||event.origin!==RENTSKETCH_ORIGIN||event.source!==frame.contentWindow)return;
      var msg=event.data||{};if(msg.tenant&&msg.tenant!==tenant)return;
      if(msg.type==='rentsketch.ready'){
        if(preview&&(msg.mode!=='tent-preview'||(productId&&msg.productId!==productId)))return;
        clearTimeout(timer);status.hidden=true;recovery.hidden=true;emit(frame,'rentsketch:ready',msg);
      }else if(msg.type==='rentsketch.error')failure('We could not load this event preview. Please try again.');
      else if(msg.type==='rentsketch.resize'&&!fixed&&!inModal){var h=Number(msg.height);if(Number.isFinite(h))shell.style.height=Math.max(400,Math.min(1800,h))+'px';}
      else if(msg.type==='rentsketch.designSaved')emit(frame,'rentsketch:designSaved',msg);
      else if(msg.type==='rentsketch.quoteRequested')emit(frame,'rentsketch:quoteRequested',msg);
      else if(msg.type==='rentsketch.close'&&inModal)closeModal();
    }
    frame.addEventListener('error',function(){failure('The designer could not be loaded. Please try again.');});
    window.addEventListener('message',onMessage);shell.appendChild(frame);shell.appendChild(status);shell.appendChild(recovery);el.appendChild(shell);load(view);
    return function(){disposed=true;clearTimeout(timer);window.removeEventListener('message',onMessage);};
  }
  async function validate(){
    if(!tenant||!embedKey)throw new Error('This RentSketch installation is missing its tenant or embed key.');
    var controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},12000);
    try{var r=await fetch(API_ORIGIN+'/api/embed/validate',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({tenant:tenant,embedKey:embedKey,parentOrigin:window.location.origin})});var d=await r.json().catch(function(){return{};});if(!r.ok||!d.ok)throw new Error(d.error||'RentSketch could not validate this website.');return d;}
    finally{clearTimeout(timeout);}
  }
  async function getProducts(){
    var base=API_ORIGIN+'/api/tenants/'+encodeURIComponent(tenant),responses=await Promise.all([fetch(base),fetch(base+'/products')]);
    if(!responses.every(function(r){return r.ok;}))throw new Error('Catalog unavailable');
    var data=await Promise.all(responses.map(function(r){return r.json();}));
    return(data[1].products||[]).filter(function(p){return p.active!==false;}).map(function(p){return data[0].showPrices===false?Object.assign({},p,{price_per_day:null}):p;});
  }
  function catalogShell(products){var wrap=document.createElement('section');wrap.className='rentsketch-catalog';wrap.style.cssText='font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f7f9fc;border:1px solid #e2e8f0;border-radius:18px;padding:20px;margin:0 0 18px;color:#172536';var head=document.createElement('div');head.style.cssText='display:flex;gap:12px;justify-content:space-between;align-items:end;flex-wrap:wrap;margin-bottom:16px';head.innerHTML='<div><div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#667589">Rental Catalog</div><h2 style="margin:3px 0 0;font-size:24px;line-height:1.15">Browse Available Rentals</h2><div style="font-size:13px;color:#667589;margin-top:5px">'+products.length+' items from this rental company</div></div>';
    var search=document.createElement('input');search.type='search';search.placeholder='Search rentals…';search.style.cssText='width:min(330px,100%);padding:11px 13px;border:1px solid #ccd6e2;border-radius:10px;background:#fff;font:inherit;box-sizing:border-box';head.appendChild(search);wrap.appendChild(head);
    var cats=document.createElement('div');cats.style.cssText='display:flex;gap:7px;overflow:auto;padding-bottom:10px;margin-bottom:8px';var categories=['all'].concat(Array.from(new Set(products.map(function(p){return p.category||'other';}))).sort());categories.forEach(function(c){var b=document.createElement('button');b.type='button';b.textContent=c==='all'?'All':label(c);b.dataset.cat=c;b.style.cssText='white-space:nowrap;border:1px solid #d7e0ea;background:'+(c==='all'?'#172536':'#fff')+';color:'+(c==='all'?'#fff':'#334155')+';border-radius:999px;padding:7px 11px;font:700 12px system-ui;cursor:pointer';cats.appendChild(b);});wrap.appendChild(cats);
    var grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px';wrap.appendChild(grid);var active='all';
    function paint(){var q=search.value.trim().toLowerCase(),shown=products.filter(function(p){return(active==='all'||(p.category||'other')===active)&&(!q||[p.name,p.category,p.sku].join(' ').toLowerCase().indexOf(q)>=0);});grid.innerHTML='';shown.forEach(function(p){var card=document.createElement('article');card.style.cssText='background:#fff;border:1px solid #e1e7ef;border-radius:13px;overflow:hidden;min-width:0;box-shadow:0 2px 8px rgba(15,23,42,.04)';var media=document.createElement('div');media.style.cssText='height:135px;background:#eef2f6;display:flex;align-items:center;justify-content:center;overflow:hidden';if(p.photo_url){var img=document.createElement('img');img.src=p.photo_url;img.alt=p.name||'';img.loading='lazy';img.style.cssText='width:100%;height:100%;object-fit:cover;display:block';img.onerror=function(){media.innerHTML='<span style="font-size:34px">📦</span>';};media.appendChild(img);}else media.innerHTML='<span style="font-size:34px">📦</span>';var body=document.createElement('div');body.style.cssText='padding:11px 12px 13px';var cat=document.createElement('div');cat.textContent=label(p.category);cat.style.cssText='font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#7b8796;font-weight:800;margin-bottom:4px';var name=document.createElement('div');name.textContent=p.name||'Rental item';name.style.cssText='font-weight:750;font-size:14px;line-height:1.25;min-height:35px';var price=document.createElement('div');price.textContent=money(p.price_per_day);price.style.cssText='font-size:14px;font-weight:800;color:#1976e9;margin-top:8px';body.appendChild(cat);body.appendChild(name);body.appendChild(price);card.appendChild(media);card.appendChild(body);grid.appendChild(card);});if(!shown.length)grid.innerHTML='<div style="grid-column:1/-1;padding:24px;text-align:center;color:#667589">No rentals match this search.</div>';}
    search.addEventListener('input',paint);cats.addEventListener('click',function(e){var b=e.target.closest('button[data-cat]');if(!b)return;active=b.dataset.cat;Array.prototype.forEach.call(cats.children,function(x){var on=x.dataset.cat===active;x.style.background=on?'#172536':'#fff';x.style.color=on?'#fff':'#334155';});paint();});paint();return wrap;}
  async function renderInline(el){
    el.innerHTML='';
    // The designer starts immediately; a separate catalog never delays it.
    var catalog=document.createElement('div');el.appendChild(catalog);mountDesigner(el,false);
    if(showCatalog&&!preview)getProducts().then(function(products){if(products.length)catalog.appendChild(catalogShell(products));}).catch(function(e){console.warn('[RentSketch catalog]',e.message);});
  }
  function renderButton(el){
    el.innerHTML='';var btn=document.createElement('button');btn.type='button';btn.textContent=attr('data-label',el.getAttribute('data-label')||(preview?'See This Tent in a Layout':'Design My Event'));btn.style.cssText='background:#266238;color:#fff;border:0;padding:13px 20px;border-radius:10px;font:700 15px system-ui;cursor:pointer;min-height:44px';
    btn.addEventListener('click',function(){
      closeModal();returnFocus=btn;modalOverlay=document.createElement('div');modalOverlay.setAttribute('role','dialog');modalOverlay.setAttribute('aria-modal','true');modalOverlay.setAttribute('aria-label',tentName||'RentSketch Event Designer');modalOverlay.style.cssText='position:fixed;inset:0;background:#fff;z-index:2147483000;display:flex;flex-direction:column;font-family:system-ui';
      var bar=document.createElement('div');bar.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:52px;padding:0 16px;border-bottom:1px solid #dce4de;flex-shrink:0';var title=document.createElement('strong');title.textContent=tentName||'Design Your Event';bar.appendChild(title);
      var close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Close Event Designer');close.style.cssText='width:44px;height:44px;border:0;background:#fff;font-size:28px;cursor:pointer';close.onclick=closeModal;bar.appendChild(close);modalOverlay.appendChild(bar);
      var host=document.createElement('div');host.style.cssText='flex:1;min-height:0';modalOverlay.appendChild(host);document.body.appendChild(modalOverlay);
      var previousOverflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';
      var dispose=mountDesigner(host,true);function onKey(e){if(e.key==='Escape')closeModal();if(e.key==='Tab'&&e.shiftKey&&document.activeElement===close){e.preventDefault();host.querySelector('iframe').focus();}}
      document.addEventListener('keydown',onKey);modalCleanup=function(){dispose();document.removeEventListener('keydown',onKey);document.documentElement.style.overflow=previousOverflow;};close.focus();
    });el.appendChild(btn);
  }
  async function init(){var el=target();if(!el){console.error('[RentSketch] Missing #'+targetId);return;}messageBox(el,'Loading your event designer…','Connecting this website to RentSketch.');try{var handshake=await validate();if(mode==='button')renderButton(el);else await renderInline(el);emit(el,'rentsketch:validated',handshake);}catch(err){messageBox(el,'RentSketch needs attention',err.message||'This integration could not be loaded.');console.error('[RentSketch embed]',err);var retry=document.createElement('button');retry.type='button';retry.textContent='Try Again';retry.style.cssText='margin-top:12px;padding:12px 16px;cursor:pointer';retry.onclick=init;el.firstChild.appendChild(retry);emit(el,'rentsketch:error',{tenant:tenant,reason:err.message});}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();window.RentSketchEmbed={version:VERSION,close:closeModal};
})();