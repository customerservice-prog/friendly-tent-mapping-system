// Full browser check of the public, read-only wedding demonstration.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'qa-wedding-story');
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const rel=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;
  const file=path.resolve(root,'.'+rel);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
    res.writeHead(404);return res.end();
  }
  const type=file.endsWith('.js')?'application/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream';
  res.setHeader('Content-Type',type);
  if(file.endsWith('.html')){
    const html=fs.readFileSync(file,'utf8').replaceAll('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js','/tests/node_modules/three/build/three.module.js').replaceAll('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/','/tests/node_modules/three/examples/jsm/');
    return res.end(html);
  }
  fs.createReadStream(file).pipe(res);
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const results=[];
  try{
    for(const route of ['/','/demo/']){
      const ctx=await browser.newContext({viewport:{width:1440,height:900}}),page=await ctx.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('https://rentsketch-api-production.up.railway.app/**',request=>{
        assert.equal(request.request().method(),'GET','marketing story must never write customer data');
        request.fulfill({contentType:'application/json',body:JSON.stringify({plans:[]})});
      });
      await page.goto(base+route);
      assert.equal(await page.locator('[data-wedding-story]').count(),1);
      assert.equal(await page.locator('.tour-poster').isVisible(),true,'a first-frame image appears before WebGL');
      await page.locator('[data-wedding-story]').scrollIntoViewIfNeeded();
      await page.locator('.story-has-webgl').waitFor({timeout:45000});
      const render=await page.locator('.tour-3d canvas').evaluate(el=>({w:el.width,h:el.height,lost:el.getContext('webgl2')?.isContextLost()}));
      assert(render.w>0&&render.h>0&&!render.lost,'actual WebGL scene rendered');
      await page.locator('[data-story-pause]').click();
      const before=await page.locator('[data-story-label]').innerText();
      await page.waitForTimeout(700);
      assert.equal(await page.locator('[data-story-label]').innerText(),before,'pause holds the current stage');
      await page.locator('[data-story-replay]').click();
      await page.waitForTimeout(900);
      assert.match(await page.locator('[data-story-label]').innerText(),/empty venue|Measure/);
      await page.locator('[data-view="2d"]').click();
      assert.equal(await page.locator('.story-canvas.show-plan').count(),1);
      await page.screenshot({path:path.join(out,route==='/'?'home-plan-desktop.png':'demo-plan-desktop.png')});
      await page.locator('[data-view="3d"]').click();
      assert.equal(await page.locator('[data-camera="outside"]').isVisible(),true);
      await page.locator('[data-camera="outside"]').click();
      await page.screenshot({path:path.join(out,route==='/'?'home-3d-desktop.png':'demo-3d-desktop.png')});
      if(route==='/demo/'){
        assert.equal(await page.locator('[data-story-scrub]').count(),1);
        await page.locator('[data-story-scrub]').evaluate(el=>{el.value='65';el.dispatchEvent(new Event('input',{bubbles:true}));});
        assert.match(await page.locator('[data-story-label]').innerText(),/bar|buffet/);
      }
      assert.deepEqual(errors,[]);
      results.push({route,desktop3d:render,replay:true,pause:true,switch2d:true,errors});
      await ctx.close();
    }
    for(const width of [320,390]){
      const ctx=await browser.newContext({viewport:{width,height:720},hasTouch:true}),page=await ctx.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base+'/');
      await page.locator('.story-canvas.is-playing').waitFor({timeout:20000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow at '+width);
      assert((await page.locator('.story-view').boundingBox()).y<720,'wedding build visible in first phone viewport');
      assert.equal(await page.locator('.tour-3d canvas').count(),0,'phone uses the lightweight plan');
      await page.screenshot({path:path.join(out,'home-mobile-'+width+'.png')});
      await page.locator('[data-view="2d"]').click();
      assert.equal(await page.locator('.story-canvas.show-plan').count(),1);
      await page.locator('[data-story-replay]').click();
      assert.equal(await page.locator('[data-view="3d"]').getAttribute('aria-pressed'),'true');
      assert.deepEqual(errors,[]);results.push({width,mobilePlan:true,noOverflow:true,firstViewport:true,errors});
      await ctx.close();
    }
    const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await ctx.newPage();
    await page.goto(base+'/');
    assert.equal(await page.locator('.story-timeline-actions').isVisible(),false);
    assert.equal(await page.locator('.tour-poster').isVisible(),true);
    assert.equal(await page.locator('.tour-3d canvas').count(),0);
    await page.screenshot({path:path.join(out,'home-reduced-motion.png')});
    results.push({reducedMotion:true,staticFinal:true});await ctx.close();
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
    console.log('PASS wedding story: desktop 3D, pause/replay, 2D switch, mobile build, first viewport, reduced motion and no browser errors.');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
