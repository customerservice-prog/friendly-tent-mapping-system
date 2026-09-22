// Real preview/paywall/player with isolated APIs and the production 3D renderer.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'qa-guided-preview');fs.mkdirSync(out,{recursive:true});
const offer={required:true,available:true,priceCents:999,durationDays:30,renewalPriceCents:499,renewalDurationDays:30,previewDurationSeconds:300};
const fixture=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/event-pass.css"><link rel="stylesheet" href="/guided-preview.css"><script type="importmap">{"imports":{"three":"/tests/node_modules/three/build/three.module.js","three/addons/":"/tests/node_modules/three/examples/jsm/"}}</script></head><body><main id="designerApp"><button id="before">Original editor</button><div class="designer-shell"><div class="canvas-viewport"></div></div></main><script>window.RENTSKETCH_API_URL=location.origin;window.RENTSKETCH_CATALOG_READY=true;window.savedWrites=0;window.loadedScenes=[];window.FriendlyBridge={loadScene:scene=>{window.loadedScenes.push(scene);return true}};window.RentSketchStartAutosave=()=>({start(){return this},flush:async()=>{window.savedWrites++;return 'original-design'},getSessionId:()=> 'qa-guided-preview-session',adopt(){}});</script><script src="/js/ui/preview-limit.js"></script><script src="/js/ui/guided-preview.js"></script><script src="/js/ui/paywall.js"></script></body></html>`;
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/fixture'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fixture);}
 if(u.pathname.startsWith('/api/consumer/')){
  let data;if(u.pathname.endsWith('/offer'))data=offer;
  else if(u.pathname.endsWith('/preview'))data={limited:true,remainingSeconds:300};
  else if(u.pathname.endsWith('/restore')||u.pathname.endsWith('/resume'))data={id:'paid-original',tenant:'friendly',active:true,renewable:true,scene:{objects:[{id:'do-not-overwrite'}]},expiresAt:'2099-01-01T00:00:00Z'};
  else{res.writeHead(403);return res.end(JSON.stringify({error:'Unexpected write during demo test'}));}
  res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(data));
 }
 const file=path.resolve(root,'.'+u.pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream');fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const results=[];
 try{
  for(const [width,height]of [[320,524],[320,568],[360,640],[390,844],[430,932],[568,320],[844,390],[768,1024],[1440,900]]){
   const ctx=await browser.newContext({viewport:{width,height},hasTouch:true}),p=await ctx.newPage();await p.goto(base+'/fixture?tenant=friendly');await p.locator('.gp-plan svg').waitFor();await p.locator('[data-pause]').click();
   assert.equal(await p.evaluate(()=>window.RentSketchEventPass.canEdit()),false);assert.equal(await p.evaluate(()=>window.savedWrites),0);assert.equal(await p.evaluate(()=>window.loadedScenes.length),0);
   assert.equal(await p.locator('.gp-scene').getAttribute('inert'),'');assert.equal(await p.locator('#designerApp').isVisible(),false);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await p.screenshot({path:path.join(out,`guided-initial-${width}x${height}.png`)});
   for(const sel of ['.gp-close','.gp-buy','.gp-booking','[data-pause]','[data-replay]','[data-narration]']){const r=await p.locator(sel).boundingBox();assert(r&&r.x>=0&&r.y>=0&&r.x+r.width<=width+1&&r.y+r.height<=height+1,sel+' fits '+width+'x'+height);}
   if(width===320)assert((await p.locator('.gp-stage').boundingBox()).height>=130,'Short phone keeps a useful scene size');
   assert.match(await p.locator('.gp-buy').innerText(),/\$9.99.*30 days/);assert.match(await p.locator('.gp-footer').innerText(),/Quick Demo.*watch-only.*replay anytime/i);assert.doesNotMatch(await p.locator('.gp-footer').innerText(),/five-minute|5-minute/i);await p.screenshot({path:path.join(out,`guided-${width}x${height}.png`)});
   await p.locator('.gp-close').click();assert.equal(await p.locator('.guided-preview').count(),0);assert.equal(await p.locator('#designerApp').getAttribute('inert'),null);assert.equal(await p.evaluate(()=>document.body.style.overflow),'');
   await p.locator('[data-guided-preview]').click();await p.locator('.gp-plan svg').waitFor();await p.locator('.gp-buy').click();await p.locator('#passEmail').waitFor();assert.equal(await p.locator('.guided-preview').count(),0);assert.equal(await p.evaluate(()=>window.savedWrites),0);
   console.log('PASS viewport',width,height);
   results.push({width,height,watchOnly:true,priceVisible:true,noOverflow:true,exitRestoresEditor:true,noSave:true});await ctx.close();
  }
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.clock.install();await p.goto(base+'/fixture?tenant=friendly');await p.locator('.gp-plan svg').waitFor();
  await p.clock.runFor(15000);assert(await p.locator('[data-sample-table]').count()>=2);const pointer=await p.locator('.gp-pointer').getAttribute('style');await p.clock.runFor(4000);assert.notEqual(await p.locator('.gp-pointer').getAttribute('style'),pointer);
  await p.locator('[data-pause]').click();const time=await p.locator('.gp-time').innerText();await p.clock.runFor(5000);assert.equal(await p.locator('.gp-time').innerText(),time);await p.locator('[data-pause]').click();
  await p.clock.runFor(26000);await p.waitForFunction(()=>!!document.querySelector('.gp-3d canvas'),null,{timeout:45000});await p.clock.runFor(1000);
  const canvas=await p.locator('.gp-3d canvas').evaluate(el=>({width:el.width,height:el.height,lost:el.getContext('webgl2')?.isContextLost()}));assert(canvas.width>0&&canvas.height>0&&canvas.lost===false);
  await p.screenshot({path:path.join(out,'guided-3d-390x844.png')});await p.clock.runFor(19000);await p.screenshot({path:path.join(out,'guided-night-390x844.png')});await p.clock.runFor(22000);
  assert.equal(await p.locator('.guided-preview').getAttribute('data-step'),'9');assert.match(await p.locator('.gp-summary').innerText(),/64 seats/);assert.equal(await p.evaluate(()=>window.savedWrites),0);assert.equal(await p.evaluate(()=>window.loadedScenes.length),0);assert.equal(await p.evaluate(()=>window.RentSketchEventPass.canEdit()),false);
  const deadline=await p.evaluate(()=>localStorage.getItem('rentsketch-preview-deadline:v1'));await p.locator('[data-replay]').click();await p.clock.runFor(2000);assert.equal(await p.evaluate(()=>localStorage.getItem('rentsketch-preview-deadline:v1')),deadline);
  await p.clock.fastForward(240000);assert.equal(await p.locator('.guided-preview').count(),0);assert.equal(await p.locator('.preview-limit-screen').isVisible(),true);assert.deepEqual(errors,[]);
  results.push({fullWalkthrough:true,real3d:canvas,pause:true,pointerMoves:true,noSavedLayoutMutation:true,deadlineEnforced:true,pageErrors:errors});await ctx.close();
  for(const mode of ['purchase','paid','expired','disabled','other-tenant','reduced-motion']){
   const c=await browser.newContext({viewport:{width:390,height:844},...(mode==='reduced-motion'?{reducedMotion:'reduce'}:{})}),page=await c.newPage();
   if(mode==='expired')await c.addInitScript(()=>localStorage.setItem('rentsketch-preview-deadline:v1',String(Date.now()-1000)));
   if(mode==='disabled')await page.route('**/event-pass/offer?**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({...offer,required:false})}));
   const query=mode==='purchase'?'?tenant=friendly&purchase=1':mode==='paid'?'?tenant=friendly#recoveryToken=qa-only':mode==='other-tenant'?'?tenant=other':'?tenant=friendly';
   await page.goto(base+'/fixture'+query);await page.waitForTimeout(700);
   if(mode==='reduced-motion'){await page.locator('.gp-plan svg').waitFor();assert.equal(await page.locator('[data-pause]').innerText(),'Play walkthrough');assert.equal(await page.locator('.gp-pointer').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');}
   else assert.equal(await page.locator('.guided-preview').count(),0,mode+' skips automatic demo');
   if(mode==='paid'){assert.equal(await page.evaluate(()=>window.RentSketchEventPass.canEdit()),true);assert.deepEqual(await page.evaluate(()=>window.loadedScenes),[{objects:[{id:'do-not-overwrite'}]}]);}
   results.push({mode,passed:true});await c.close();
  }
  const waiting=await browser.newContext({viewport:{width:390,height:844}}),wp=await waiting.newPage();
  await wp.goto(base+'/fixture?tenant=friendly&focus=tent&autoplace=1');await wp.waitForTimeout(500);
  assert.equal(await wp.locator('.guided-preview').count(),0,'Exact rental must report ready first');
  await wp.evaluate(()=>{window.RENTSKETCH_PRODUCT_PREVIEW_READY=true;window.dispatchEvent(new CustomEvent('rentsketch:productPreviewReady'));});
  await wp.locator('.gp-plan svg').waitFor();results.push({waitsForExactRentalReady:true});await waiting.close();
  const fallback=await browser.newContext({viewport:{width:390,height:844}}),fp=await fallback.newPage();await fp.route('**/js/ui/view3d.js',r=>r.abort());await fp.clock.install();await fp.goto(base+'/fixture?tenant=friendly');await fp.locator('.gp-plan svg').waitFor();await fp.clock.runFor(45000);await fp.locator('.gp-fallback').waitFor();assert.equal(await fp.locator('.gp-plan').isVisible(),true);results.push({webglFailureFallsBackTo2d:true});await fallback.close();
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
