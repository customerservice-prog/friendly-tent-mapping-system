const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out='qa-guided-live';fs.mkdirSync(out,{recursive:true});
const staged=process.env.GUIDED_USE_WORKTREE==='1';
const files=new Map([['/designer/','designer/index.html'],['/guided-preview.css','guided-preview.css'],['/js/ui/guided-preview.js','js/ui/guided-preview.js'],['/js/ui/paywall.js','js/ui/paywall.js'],['/js/ui/preview-limit.js','js/ui/preview-limit.js'],['/js/ui/view3d.js','js/ui/view3d.js'],['/js/ui/tent-preview-entry.js','js/ui/tent-preview-entry.js']]);
(async()=>{
 const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const results=[];
 try{
  for(const width of [320,390]){
   const height=width===320?568:844;
   const ctx=await browser.newContext({viewport:{width,height},hasTouch:true});
   if(staged)await ctx.route('https://rentsketch.com/**',async r=>{const f=files.get(new URL(r.request().url()).pathname);if(!f)return r.continue();await r.fulfill({status:200,contentType:f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.css')?'text/css; charset=utf-8':'application/javascript; charset=utf-8',body:fs.readFileSync(f)});});
   const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.clock.install();
   try{
    if(width===320){
     await p.goto('https://www.friendlypartyrental.com/design-your-event',{waitUntil:'domcontentloaded',timeout:60000});
     await p.locator('[data-rentsketch-access] a').filter({hasText:'Try a free 5-minute preview'}).click();
     await p.locator('iframe[src*="rentsketch.com/designer"]').waitFor();
    }else await p.goto('https://rentsketch.com/designer/?tenant=friendly&focus=tent&autoplace=1&tentSlug=20x20-pole-tent&view=3d',{waitUntil:'domcontentloaded',timeout:60000});
    const frame=width===320?await (await p.locator('iframe[src*="rentsketch.com/designer"]').elementHandle()).contentFrame():p.mainFrame();
    await frame.locator('.guided-preview').waitFor({timeout:45000});await frame.locator('.gp-plan svg').waitFor();
    await frame.waitForFunction(()=>!!window.FriendlyBridge?.getScene());
    const original=await frame.evaluate(()=>JSON.parse(JSON.stringify(window.FriendlyBridge.getScene())));
    assert.equal(original.objects.length,0,'Original selected rental is still bare');
    assert.equal(await frame.evaluate(()=>window.RentSketchEventPass.canEdit()),false);
    await p.clock.runFor(20000);
    assert(await frame.locator('[data-sample-table]').count()>=3);
    assert.equal(await frame.locator('.gp-scene').getAttribute('inert'),'');
    for(const s of ['.gp-close','.gp-buy','.gp-booking','[data-pause]']){
     const inside=await frame.locator(s).evaluate(el=>{let b=el.getBoundingClientRect();return b.top>=0&&b.left>=0&&b.right<=innerWidth+1&&b.bottom<=innerHeight+1;});assert(inside,s+' fits '+width);
    }
    assert.equal(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await p.screenshot({path:path.join(out,`${staged?'STAGED':'LIVE'}-guided-${width}.png`)});
    if(width===320){
     await p.clock.fastForward(28000);
     assert.equal(await p.getByText('We ran into a problem loading the Event Designer.').count(),0,'Friendly parent must not time out');
     assert.equal(await p.getByText('Loading your Friendly Event Designer...').count(),0,'Parent ready received');
    }else{
     await p.clock.runFor(24500);await frame.locator('.gp-3d canvas').waitFor({timeout:45000});await p.clock.runFor(1500);
     const gpu=await frame.locator('.gp-3d canvas').evaluate(el=>({width:el.width,height:el.height,lost:el.getContext('webgl2')?.isContextLost()}));assert(gpu.width>0&&gpu.height>0&&gpu.lost===false);
     await p.screenshot({path:path.join(out,`${staged?'STAGED':'LIVE'}-guided-3d-${width}.png`)});
     await p.clock.runFor(18000);await p.screenshot({path:path.join(out,`${staged?'STAGED':'LIVE'}-guided-night-${width}.png`)});
     results.push({actual3d:gpu,physicalPhone:false});
    }
    const after=await frame.evaluate(()=>JSON.parse(JSON.stringify(window.FriendlyBridge.getScene())));
    assert.deepEqual(after,original,'Demo must not change actual scene');
    const booking=await frame.locator('.gp-booking').getAttribute('href');assert.equal(booking,'https://rentsketch.com/my-event/?tenant=friendly&mode=order');
    await frame.locator('.gp-buy').click();await frame.locator('#passEmail').waitFor();
    assert.match(await frame.locator('.paywall-price').innerText(),/\$9\.99/);assert.match(await frame.locator('.paywall-content').innerText(),/30 days/);
    assert.equal(await frame.evaluate(()=>document.activeElement===document.querySelector('#passEmail')),false);
    await frame.locator('.pass-close').click();assert.equal(await frame.locator('.guided-preview').count(),0);
    assert.equal(await frame.evaluate(()=>window.RentSketchEventPass.canEdit()),false);
    assert.equal(await frame.evaluate(()=>window.FriendlyBridge.getScene().objects.length),0);
    results.push({width,height,entry:width===320?'Friendly embedded preview':'direct selected rental preview',watchOnly:true,originalScenePreserved:true,purchaseOffer:true,bookingLink:true,noHorizontalOverflow:true,pageErrors:errors});
    assert.deepEqual(errors,[]);console.log('PASS public entry',width,'staged:',staged);
   }catch(e){await p.screenshot({path:path.join(out,`FAILED-${width}.png`)}).catch(()=>{});fs.writeFileSync(path.join(out,`failure-${width}.json`),JSON.stringify({error:e.message,errors,frames:p.frames().map(f=>f.url())},null,2));throw e;}
   finally{await ctx.close();}
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({staged,results,realPayment:false,realCustomerLogin:false},null,2));console.log(JSON.stringify({staged,results},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
