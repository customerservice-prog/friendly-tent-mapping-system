const {JSDOM}=require('jsdom');
const fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../embed/v1.js'),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function setup({tenant='lakeside',productId='lake-tent',mode='button',valid=true,showPrices=true}={}){
 const dom=new JSDOM(`<div id="rentsketch-embed"></div><script data-tenant="${tenant}" data-embed-key="${tenant}-key" data-mode="${mode}" ${productId?`data-product-id="${productId}" data-tent-name="Lakeside 20×20 Tent"`:''}></script>`,{url:`https://${tenant}.example/rentals`,runScripts:'outside-only'});
 const w=dom.window,timers=new Map(),requests=[],events=[];let id=0;
 w.AbortController=AbortController;w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,ms});return id;};w.clearTimeout=id=>timers.delete(id);
 w.fetch=async(url,opts={})=>{requests.push({url,body:opts.body&&JSON.parse(opts.body)});return{ok:valid,json:async()=>url.endsWith('/validate')?{ok:valid,error:'Invalid embed key'}:url.endsWith('/products')?{products:[{id:'table',name:'Lakeside Round Table',category:'table',price_per_day:19}]}:{name:'Lakeside Events',showPrices}};};
 w.document.getElementById('rentsketch-embed').addEventListener('rentsketch:ready',e=>events.push(e.detail));
 w.eval(source);await settle();await settle();
 return{dom,w,timers,requests,events};
}
(async()=>{
 const x=await setup(),{w}=x;
 assert.equal(x.requests[0].body.tenant,'lakeside');assert.equal(x.requests[0].body.parentOrigin,'https://lakeside.example');
 const launch=w.document.querySelector('button');launch.click();
 let frame=w.document.querySelector('iframe'),url=new URL(frame.src);
 assert.equal(url.searchParams.get('tenant'),'lakeside');assert.equal(url.searchParams.get('productId'),'lake-tent');assert.equal(url.searchParams.get('focus'),'tent');
 const send=(data,source=frame.contentWindow)=>w.dispatchEvent(new w.MessageEvent('message',{origin:'https://rentsketch.com',source,data}));
 send({type:'rentsketch.ready',tenant:'friendly',mode:'tent-preview',productId:'lake-tent'});assert.equal(x.events.length,0);
 send({type:'rentsketch.ready',tenant:'lakeside',mode:'designer'});assert.equal(x.events.length,0);
 send({type:'rentsketch.ready',tenant:'lakeside',mode:'tent-preview',productId:'wrong'});assert.equal(x.events.length,0);
 send({type:'rentsketch.ready',tenant:'lakeside',mode:'tent-preview',productId:'lake-tent'},w);assert.equal(x.events.length,0);
 const watchdog=[...x.timers.values()].find(t=>t.ms===25000);assert.ok(watchdog);watchdog.fn();
 assert.match(w.document.body.textContent,/taking longer/);
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='Open in 2D').click();
 url=new URL(frame.src);assert.equal(url.searchParams.get('view'),'2d');assert.equal(url.searchParams.get('productId'),'lake-tent');assert.equal(url.searchParams.get('retry'),'2');
 send({type:'rentsketch.ready',tenant:'lakeside',mode:'tent-preview',productId:'lake-tent',renderer:'2d'});assert.equal(x.events.length,1);
 assert.equal(w.document.querySelector('[role="status"]').hidden,true);
 const oldWindow=frame.contentWindow;
 w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(w.document.querySelector('iframe'),null);assert.equal(w.document.activeElement,launch);assert.equal(w.document.documentElement.style.overflow,'');
 launch.click();frame=w.document.querySelector('iframe');
 send({type:'rentsketch.ready',tenant:'lakeside',mode:'tent-preview',productId:'lake-tent'},oldWindow);assert.equal(x.events.length,1);
 x.dom.window.close();
 const hidden=await setup({mode:'inline',productId:'',showPrices:false});assert.match(hidden.w.document.body.textContent,/Lakeside Round Table/);assert.doesNotMatch(hidden.w.document.body.textContent,/\$19/);hidden.dom.window.close();
 const denied=await setup({valid:false});assert.equal(denied.w.document.querySelector('iframe'),null);assert.match(denied.w.document.body.textContent,/Invalid embed key/);denied.dom.window.close();
 console.log('PASS: second-tenant product embed, trusted frame/tenant/product readiness, bounded loading, exact-product 2D retry, close/reopen cleanup, hidden pricing, invalid-key rejection');
})().catch(e=>{console.error(e);process.exitCode=1;});
