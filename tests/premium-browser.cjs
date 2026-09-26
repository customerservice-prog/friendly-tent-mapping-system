// Isolated browser QA: real UI and WebGL, mocked edit entitlement, no production API writes.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../qa-premium');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://local');if(u.pathname==='/analytics-config.js'){res.setHeader('Content-Type','text/javascript');return res.end('');}let file=path.join(root,u.pathname==='/designer/'?'designer/index.html':u.pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 let data=fs.readFileSync(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.png')?'image/png':'application/octet-stream');
 if(file.endsWith('designer/index.html')){let html=data.toString().replace(/<script[^>]*src="[^\"]*\/(?:paywall|autosave|preview-limit|customer-entry|guided-preview)\.js[^\"]*"[^>]*><\/script>/g,'');html=html.replace('<head>','<head><script>window.RentSketchEventPass={canEdit:()=>true,hasPaidEvent:()=>false};</script>');html=html.replaceAll('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js','/tests/node_modules/three/build/three.module.js').replaceAll('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/','/tests/node_modules/three/examples/jsm/');data=html;}
 res.end(data);
});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.RENTSKETCH_CHROMIUM||undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 try{for(const viewport of [{width:1440,height:940},{width:390,height:844}]){
 const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message);});page.on('console',m=>{if(m.type()==='error')console.error('CONSOLE',m.text());});page.on('requestfailed',r=>console.error('REQUEST FAILED',r.url()));await page.route('https://**/*',route=>route.abort());
 await page.goto(base+'/designer/?tenant=generic&focus=tent&autoplace=1&tentSlug=pole-20x20&view=2d');
 await page.screenshot({path:path.join(out,'entry-'+viewport.width+'.png')});await page.locator('#designMyEvent').click({timeout:10000});await page.locator('[data-drawer="inventory"]').click();await page.locator('[data-role="inventory-query"]').fill('foam');await page.screenshot({path:path.join(out,'catalog-'+viewport.width+'.png')});
 await page.locator('[data-role="equipment-card"]').click();await page.locator('#placementConfirm').click();
 await page.locator('[data-role="insp-duplicate"]').click();await page.locator('#btnUndo').click();
 await page.locator('[data-drawer="inventory"]').click();await page.locator('[data-role="inventory-query"]').fill('');await page.locator('[data-role="inventory-category"][data-category="inflatable"]').click();await page.locator('[data-role="inflatable-card"]').first().click();await page.locator('#placementConfirm').click();
 const scene=await page.evaluate(()=>window.FriendlyBridge.getScene());assert.equal(scene.tentId,'pole-20x20');assert.equal(scene.objects.filter(o=>o.kind==='equipment').length,1);assert.equal(scene.objects.filter(o=>o.kind==='inflatable').length,1);
 await page.locator('#viewMode3d').click();await page.waitForFunction(()=>!!document.querySelector('#canvas canvas'));await page.waitForTimeout(1800);await page.locator('#view3dFit').click();await page.screenshot({path:path.join(out,'scene-'+viewport.width+'.png')});
 await page.locator('#btnToReview').click();await page.locator('#reviewSummary').getByText('Foam machine',{exact:true}).waitFor();assert.equal(errors.length,0,errors.join('\n'));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'no document horizontal overflow');await page.close();console.log('PASS real browser '+viewport.width+': search, place, undo, mixed scene, WebGL mount and review');
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
