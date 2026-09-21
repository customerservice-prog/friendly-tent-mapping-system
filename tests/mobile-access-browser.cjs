const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'qa-mobile-access'); fs.mkdirSync(output, {recursive:true});
const offer = {required:true,priceCents:999,durationDays:30,renewalPriceCents:499,renewalDurationDays:30,previewDurationSeconds:300};
const fixture = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/event-pass.css"><style>body{margin:0}*{box-sizing:border-box}</style><button id="launch">Start</button><main id="designerApp"><div class="designer-shell"><div class="canvas-viewport"></div></div></main><script>window.RENTSKETCH_API_URL=location.origin;window.RENTSKETCH_CATALOG_READY=true;window.FriendlyBridge={loadScene:()=>true};window.RentSketchStartAutosave=()=>({start(){return this},flush:async()=> 'qa-design',getSessionId:()=> 'qa-session',adopt(){}});</script><script src="/js/ui/paywall.js"></script>`;
const server = http.createServer((req,res)=>{
  const url = new URL(req.url,'http://localhost');
  if(url.pathname==='/fixture'){res.setHeader('Content-Type','text/html');res.end(fixture);return;}
  if(url.pathname==='/api/consumer/event-pass/offer'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(offer));return;}
  const rel = url.pathname==='/' ? 'my-event/index.html' : url.pathname.replace(/^\//,'');
  const file=path.resolve(root,rel);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');fs.createReadStream(file).pipe(res);
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch(); const results=[];
  try {
    for(const [width,height] of [[320,568],[360,640],[375,667],[390,844],[412,915],[568,320],[844,390],[768,1024]]){
      const context=await browser.newContext({viewport:{width,height},hasTouch:true});const page=await context.newPage();
      await page.goto(base+'/fixture?tenant=friendly&purchase=1');
      await page.locator('#passEmail').waitFor();
      assert.equal(await page.locator('#passEmail').evaluate(el=>el===document.activeElement),false,'No keyboard-triggering autofocus');
      assert.equal(await page.locator('.paywall-content').evaluate(el=>el.scrollTop),0,'Offer starts at top');
      const initial=await page.locator('.paywall-price').boundingBox();assert(initial&&initial.y>=0&&initial.y+initial.height<=height,'Price visible initially');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal page overflow');
      assert.equal(await page.locator('.paywall-content').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'No horizontal dialog overflow');
      await page.screenshot({path:path.join(output,`purchase-${width}x${height}.png`)});
      await page.locator('.paywall-content').evaluate(el=>el.scrollTop=el.scrollHeight);
      const close=await page.locator('.pass-close').boundingBox();assert(close&&close.y>=0&&close.y+close.height<=height,'Close remains accessible');
      await page.locator('.pass-close').click();assert.equal(await page.locator('.paywall-overlay').count(),0);
      assert.equal(await page.evaluate(()=>document.body.style.overflow),'','Scroll lock restored');
      await page.goto(base+'/my-event/index.html?tenant=friendly&mode=order');
      assert.equal(await page.locator('#accessEmail').isVisible(),false);
      assert.equal(await page.locator('#orderAccessForm input').count(),2);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:path.join(output,`booking-${width}x${height}.png`),fullPage:true});
      results.push({width,height,priceVisible:true,closeAccessible:true,bookingNoEmail:true,overflow:false});await context.close();
    }
    const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});const page=await context.newPage();let calls=0;let mode='network';
    await page.route('https://rentsketch-api-production.up.railway.app/**',async route=>{
      calls++;const body=route.request().postDataJSON();assert.deepEqual(Object.keys(body).sort(),['firstName','orderNumber']);
      if(mode==='network')return route.abort('failed');
      if(mode==='decline')return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'No active booking matches those details.'})});
      if(mode==='invalid')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({accessUrl:'https://example.org/not-your-event'})});
      await new Promise(r=>setTimeout(r,200));return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({accessUrl:'https://rentsketch.com/designer/?tenant=friendly#recoveryToken=qa-fixture-only'})});
    });
    await page.route('https://rentsketch.com/designer/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Verified fixture event</h1>'}));
    await page.goto(base+'/my-event/index.html?tenant=friendly&mode=order');await page.fill('#orderFirstName','QA');await page.fill('#orderNumber','TEST-ONLY');
    await page.click('#orderAccessForm button');await page.waitForFunction(()=>document.querySelector('#orderAccessStatus').textContent.includes('couldn’t check'));
    assert.equal(await page.inputValue('#orderNumber'),'TEST-ONLY');
    mode='decline';await page.click('#orderAccessForm button');await page.waitForFunction(()=>document.querySelector('#orderAccessStatus').textContent.includes('No active booking'));
    mode='invalid';await page.click('#orderAccessForm button');await page.waitForFunction(()=>document.querySelector('#orderAccessStatus').textContent.includes('could not be opened'));
    mode='success';const before=calls;await page.evaluate(()=>{const form=document.querySelector('#orderAccessForm');form.requestSubmit();form.requestSubmit();});
    await page.waitForURL('https://rentsketch.com/designer/**');assert.equal(calls-before,1,'Duplicate submits blocked');
    results.push({simulatedBookingSuccess:true,networkErrorFriendly:true,decline:true,unsafeLinkRejected:true,duplicateSubmitBlocked:true,productionCustomerAccess:false});
    await context.close();
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(err=>{console.error(err);server.close();process.exitCode=1;});
