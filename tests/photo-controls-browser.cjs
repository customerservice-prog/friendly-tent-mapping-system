// Real browser interaction test for the production photo editor modules. The image
// is a deterministic interaction fixture, not a claim about reconstructed depth.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const repo=path.resolve(__dirname,'..'),out=process.env.RENTSKETCH_QA_OUT||path.join(require('node:os').tmpdir(),'rentsketch-photo-controls');fs.mkdirSync(out,{recursive:true});
const fixture=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/customer-experience.css"><link rel="stylesheet" href="/photo-workspace.css"><link rel="stylesheet" href="/photo-composition.css"><style>html,body{margin:0;width:100%;height:100%;font-family:system-ui,sans-serif}#editor{height:100dvh}button,input,select{font:inherit}button{cursor:pointer}</style><body class="photo-edit-mode"><div id="editor"></div><script type="module">
import * as photo from '/js/ui/photo-view.js';
import {defaultPhotoCalibration} from '/js/core/photo-geometry.js';
const scene={tent:{widthFt:20,lengthFt:20},photoSite:{widthFt:50,lengthFt:60},backgroundPhoto:{url:'/_image.svg',widthPx:1600,heightPx:1000},objects:[],photoComposition:{foregroundMasks:[{id:'hedge',label:'Foreground edge',enabled:true,featherPx:1.5,points:[{x:.2,y:.3},{x:.225,y:.3},{x:.25,y:.3},{x:.7,y:.3},{x:.7,y:.75},{x:.2,y:.75}]}]}};
scene.photoCalibration=defaultPhotoCalibration(scene.photoSite,scene.backgroundPhoto);
window.fixtureScene=scene;window.initialScene=structuredClone(scene);window.photo=photo;window.events=[];
photo.mount(document.getElementById('editor'),scene,{onCalibration:next=>{scene.photoCalibration=next;window.events.push('calibration');},onCompositionChange:next=>{scene.photoComposition=next;window.events.push('composition');}});photo.setTool('calibrate');
</script>`;
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://local').pathname;
 if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fixture);}
 if(pathname==='/_image.svg'){res.setHeader('Content-Type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="#bdd3de"/><rect y="430" width="1600" height="570" fill="#809966"/><path d="M200 550H1400V890H200Z" fill="#95ab7c"/><path d="M200 550H1400M200 720H1400M500 550V890M1100 550V890" stroke="#baca9f" stroke-width="4"/></svg>');}
 const file=path.resolve(repo,pathname.slice(1));if(!file.startsWith(repo+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css; charset=utf-8':'application/octet-stream');fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.RENTSKETCH_CHROMIUM||undefined});
  const context=await browser.newContext({viewport:{width:320,height:844},hasTouch:true,isMobile:true}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
  const cdp=await context.newCDPSession(page);
  async function touchDrag(x,y,dx,dy){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y:y+dy}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  const coordinates=async()=>page.evaluate(()=>structuredClone(window.fixtureScene));
  const stage=()=>page.locator('.photo-workspace-stage').boundingBox();
  for(const width of [320,390,1440]){
   await page.setViewportSize({width,height:844});await page.evaluate(()=>{Object.assign(window.fixtureScene,structuredClone(window.initialScene));window.photo.update(window.fixtureScene);window.photo.setTool('calibrate');});
   await page.waitForFunction(()=>Math.abs(document.querySelector('[data-cal-handle]').getBoundingClientRect().width-44)<.1);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   for(const corner of ['frontLeft','frontRight','backRight','backLeft']){
    const box=await page.locator('[data-cal-handle="'+corner+'"]').boundingBox();assert.ok(Math.abs(box.width-44)<.1&&Math.abs(box.height-44)<.1,'44 CSS pixel corner hit region at '+width);
   }
   assert.deepEqual(await page.locator('.photo-corner-label').allTextContents(),['Near left','Near right','Far right','Far left']);
   const before=await coordinates(),r=await stage(),p=before.photoCalibration.frontLeft;
   // Start 17px from the visible 6px dot, inside the transparent touch region.
   await touchDrag(r.x+p.x*r.width-17,r.y+p.y*r.height,-24,8);
   const after=await coordinates();assert.ok(Math.abs(after.photoCalibration.frontLeft.x-p.x+24/r.width)<.00001,'larger target does not jump to finger on drag: '+JSON.stringify({p,after:after.photoCalibration.frontLeft,r,events:await page.evaluate(()=>window.events)}));assert.ok(Math.abs(after.photoCalibration.frontLeft.y-p.y-8/r.height)<.00001);
   for(const corner of ['frontRight','backRight','backLeft'])assert.deepEqual(after.photoCalibration[corner],before.photoCalibration[corner]);
   const focus=page.locator('[data-cal-handle="frontLeft"]');await focus.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.keyboard.press('Shift+ArrowDown');
   const nudged=await coordinates();assert.ok(Math.abs(nudged.photoCalibration.frontLeft.x-after.photoCalibration.frontLeft.x-2/r.width)<.00001);assert.ok(Math.abs(nudged.photoCalibration.frontLeft.y-after.photoCalibration.frontLeft.y-10/r.height)<.00001);assert.equal(await page.evaluate(()=>document.activeElement.dataset.calHandle),'frontLeft','keyboard focus survives each redraw');
   await page.screenshot({path:path.join(out,width+'-calibration-controls.png')});
   await page.evaluate(()=>window.photo.setTool('mask'));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const maskBefore=await coordinates(),mr=await stage();
   for(const handle of await page.locator('[data-mask-vertex]').all()){const box=await handle.boundingBox();assert.ok(Math.abs(box.width-44)<.1&&Math.abs(box.height-44)<.1,'44 CSS pixel outline hit region at '+width);}
   // The closely spaced top-left vertices have overlapping hit areas. Pick the
   // nearest point, independent of which later SVG target is on top.
   const first=maskBefore.photoComposition.foregroundMasks[0].points[0];await touchDrag(mr.x+first.x*mr.width+1,mr.y+first.y*mr.height,0,24);
   let maskAfter=await coordinates();assert.ok(Math.abs(maskAfter.photoComposition.foregroundMasks[0].points[0].y-first.y-24/mr.height)<.00001,JSON.stringify({width,mr,first,points:maskAfter.photoComposition.foregroundMasks[0].points,status:await page.locator('[data-mask-status]').textContent()}));assert.deepEqual(maskAfter.photoComposition.foregroundMasks[0].points.slice(1),maskBefore.photoComposition.foregroundMasks[0].points.slice(1),'overlapping targets edit only the nearest vertex');
   assert.equal(await page.locator('[data-mask-edge="0"]').count(),0,'dense edges do not add competing midpoint targets');
   await page.locator('[data-mask-point-select]').selectOption('1');assert.equal(await page.locator('[data-mask-vertex="1"]').getAttribute('aria-pressed'),'true');
   await page.locator('[data-mask-vertex="1"]').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');maskAfter=await coordinates();assert.ok(Math.abs(maskAfter.photoComposition.foregroundMasks[0].points[1].y-maskBefore.photoComposition.foregroundMasks[0].points[1].y-2/mr.height)<.00001);assert.equal(await page.evaluate(()=>document.activeElement.dataset.maskVertex),'1');
   await page.locator('[data-mask-add-point]').click();assert.equal((await coordinates()).photoComposition.foregroundMasks[0].points.length,maskBefore.photoComposition.foregroundMasks[0].points.length+1);
   await page.screenshot({path:path.join(out,width+'-foreground-controls.png')});
   const registered=await coordinates();await page.setViewportSize({width:width===320?390:320,height:844});await page.waitForTimeout(30);assert.deepEqual((await coordinates()).photoComposition,registered.photoComposition,'resize preserves source coordinates');assert.deepEqual((await coordinates()).photoCalibration,registered.photoCalibration);
   await page.evaluate(()=>window.photo.update(window.fixtureScene));assert.deepEqual((await coordinates()).photoComposition,registered.photoComposition,'reopen/update preserves source coordinates');
   const current=await stage(),source=registered.photoComposition.foregroundMasks[0].points[1],dot=await page.locator('[data-mask-vertex="1"]').boundingBox();assert.ok(Math.abs(dot.x+dot.width/2-current.x-source.x*current.width)<.15&&Math.abs(dot.y+dot.height/2-current.y-source.y*current.height)<.15,'resized outline remains registered to source image');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  // Dense tracing must not auto-close when a new point lands near the start.
  await page.setViewportSize({width:320,height:844});await page.locator('[data-mask-new]').click();const r=await stage();for(const [x,y] of [[.4,.4],[.42,.4],[.43,.43],[.4,.44],[.38,.43]])await page.touchscreen.tap(r.x+x*r.width,r.y+y*r.height);
  assert.equal(await page.locator('[data-mask-draft-point]').count(),5);await page.locator('[data-mask-cancel]').click();assert.deepEqual(errors,[]);console.log('PASS photo control browser: 320/390/1440px touch targets, nearest-point overlap, offset-safe touch drag, keyboard nudging/focus, dense tracing, resize/reopen registration. Artifacts: '+out);
 }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
