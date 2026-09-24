const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'qa-photo-match');fs.mkdirSync(out,{recursive:true});
const waitServer=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const tinyJpeg=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9k=','base64');
let webOrigin='',apiOrigin='',uploads=[];
const api=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://api.local');
  const cors=()=>{res.setHeader('Access-Control-Allow-Origin',webOrigin||'*');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization,X-RentSketch-Session');res.setHeader('Access-Control-Max-Age','60');res.setHeader('Cross-Origin-Resource-Policy','cross-origin');};
  cors();
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  const json=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
  if(u.pathname==='/api/consumer/event-pass/offer')return json(200,{required:true,available:true,priceCents:999,durationDays:30,renewalPriceCents:499,renewalDurationDays:30,previewDurationSeconds:300,recurring:false});
  if(u.pathname==='/api/consumer/event-pass/resume')return json(200,{id:'generic-photo-design',tenant:'generic',scene:{tentId:'pole-20x20',objects:[],surfaceType:'grass',lightingId:'lighting-none',customer:{name:'Photo Test',email:'',date:''}},anonymousSessionId:'generic-photo-owner',active:true,renewable:true,expiresAt:'2099-01-01T00:00:00.000Z',customerEmail:'photo@example.invalid',accessUrl:'https://example.invalid/private'});
  if(u.pathname==='/api/consumer/designs/generic-photo-design'&&req.method==='PATCH'){req.resume();return json(200,{ok:true,id:'generic-photo-design'});}
  if(u.pathname==='/api/consumer/designs/generic-photo-design/background-photo'&&req.method==='POST'){
    const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{
      const body=Buffer.concat(chunks),n=uploads.length+1;
      const item={bytes:body.length,contentType:req.headers['content-type'],session:req.headers['x-rentsketch-session']};uploads.push(item);
      json(201,{id:'photo-browser-fixture-'+n,path:'/api/consumer/background-photo/photo-browser-fixture-'+n+'?t=capability',mimeType:'image/jpeg',byteSize:body.length});
    });return;
  }
  if(/^\/api\/consumer\/background-photo\/photo-browser-fixture-\d+$/.test(u.pathname)&&req.method==='GET'){res.statusCode=200;res.setHeader('Content-Type','image/jpeg');res.end(tinyJpeg);return;}
  if(u.pathname==='/api/consumer/event-pass/preview'){req.resume();return json(200,{limited:false});}
  json(404,{error:'Unexpected QA API '+req.method+' '+u.pathname});
});
const web=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://web.local');
  if(u.pathname==='/designer/'||u.pathname==='/designer/index.html'){
    let html=fs.readFileSync(path.join(root,'designer/index.html'),'utf8');
    html=html.replace('<head>','<head><script>window.RENTSKETCH_API_URL='+JSON.stringify(apiOrigin)+'</script>');
    html=html.replaceAll('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js','/tests/node_modules/three/build/three.module.js');
    html=html.replaceAll('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/','/tests/node_modules/three/examples/jsm/');
    res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);
  }
  const rel=u.pathname==='/'?'index.html':u.pathname.replace(/^\//,'');
  const file=path.resolve(root,rel);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  const type=file.endsWith('.js')?'application/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':'application/octet-stream';
  res.setHeader('Content-Type',type);fs.createReadStream(file).pipe(res);
});
(async()=>{
  await waitServer(api);apiOrigin='http://127.0.0.1:'+api.address().port;
  await waitServer(web);webOrigin='http://127.0.0.1:'+web.address().port;
  const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const context=await browser.newContext({viewport:{width:1648,height:928}});
    await context.addInitScript(()=>{
      localStorage.setItem('rentsketch-anon-session','generic-photo-owner');
      localStorage.setItem('rentsketch-autosave:generic',JSON.stringify({id:'generic-photo-design',scene:{tentId:'pole-20x20',objects:[],surfaceType:'grass',lightingId:'lighting-none',customer:{name:'Photo Test',email:'',date:''}},savedAt:new Date().toISOString(),tenant:'generic',anonymousSessionId:'generic-photo-owner'}));
    });
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(webOrigin+'/designer/?tenant=generic&admin=1',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.RentSketchEventPass?.canEdit()===true&&window.FriendlyBridge?.getScene);
    assert.equal(new URL(page.url()).search,'?tenant=generic&admin=1');
    await page.locator('[data-drawer="site"]').click();
    const input=page.locator('[data-role="venue-photo-file"]');await input.waitFor();
    // Simulate another capture-layer consumer swallowing only the change event.
    // Photo Match must still work from the file input's input event.
    await page.evaluate(()=>document.addEventListener('change',e=>{if(e.target.matches?.('[data-role="venue-photo-file"]'))e.stopImmediatePropagation();},true));
    const payload=Buffer.alloc(1367406);payload[0]=0xff;payload[1]=0xd8;payload[2]=0xff;payload[3]=0xe0;
    await input.setInputFiles({name:'1368.jpg',mimeType:'application/octet-stream',buffer:payload});
    await page.waitForFunction(()=>document.querySelector('[data-role="venue-photo-status"]')?.dataset.kind==='success',{timeout:10000});
    assert.equal(uploads.length,1,'browser sends exactly one upload even though input+change both fire');
    assert.equal(uploads[0].bytes,1367406,'browser sent exact 1.37 MB file bytes');
    assert.equal(uploads[0].contentType,'image/jpeg','extension fallback normalizes Windows JPG MIME');
    assert.equal(uploads[0].session,'generic-photo-owner');
    const scene=await page.evaluate(()=>window.FriendlyBridge.getScene());
    assert.equal(scene.backgroundPhoto.id,'photo-browser-fixture-1');
    assert.match(scene.backgroundPhoto.url,/\/api\/consumer\/background-photo\/photo-browser-fixture-1\?t=capability$/);
    assert.match(await page.locator('[data-role="venue-photo-status"]').innerText(),/Applied/);
    assert.equal(await page.locator('.venue-photo-card.is-active').count(),1);

    // Match the user's actual Windows file size path: >3.4 MB JPG must be
    // decoded, resized and recompressed in-browser before upload.
    const largeInfo=await page.evaluate(async()=>{
      const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1536;
      const ctx=canvas.getContext('2d'),img=ctx.createImageData(canvas.width,canvas.height),d=img.data;
      let s=0x12345678;
      for(let i=0;i<d.length;i+=4){s=(1664525*s+1013904223)>>>0;d[i]=s&255;d[i+1]=(s>>>8)&255;d[i+2]=(s>>>16)&255;d[i+3]=255;}
      ctx.putImageData(img,0,0);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',1));
      const input=document.querySelector('[data-role="venue-photo-file"]');
      const file=new File([blob],'1368-large.jpg',{type:'image/jpeg',lastModified:Date.now()});
      const dt=new DataTransfer();dt.items.add(file);input.files=dt.files;
      input.dispatchEvent(new Event('input',{bubbles:true}));
      input.dispatchEvent(new Event('change',{bubbles:true}));
      return {originalBytes:file.size};
    });
    assert.ok(largeInfo.originalBytes>3.4*1024*1024,'generated JPEG actually enters the large-photo compression path: '+largeInfo.originalBytes);
    await page.waitForFunction(()=>document.querySelector('[data-role="venue-photo-status"]')?.dataset.kind==='success'&&window.FriendlyBridge.getScene().backgroundPhoto?.id==='photo-browser-fixture-2',{timeout:20000});
    assert.equal(uploads.length,2,'large JPG produces one additional upload');
    assert.ok(uploads[1].bytes<largeInfo.originalBytes,'large JPG is resized/compressed before upload');
    assert.ok(uploads[1].bytes<=3.4*1024*1024,'compressed JPG stays under target upload size');
    assert.equal(uploads[1].contentType,'image/jpeg');
    assert.match(await page.locator('[data-role="venue-photo-status"]').innerText(),/Applied/);
    await page.locator('#viewMode3d').click();await page.locator('#canvas canvas').waitFor({timeout:15000});
    await page.screenshot({path:path.join(out,'generic-admin-photo-applied.png'),fullPage:true});
    assert.deepEqual(errors,[],'no browser page errors during Photo Match');
    fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({url:page.url(),uploads,firstBackgroundPhoto:scene.backgroundPhoto,largePhotoOriginalBytes:largeInfo.originalBytes,status:'Applied',pageErrors:errors},null,2));
    console.log('PASS Photo Match Chromium: exact generic&admin=1 returning design, change-event blocked fallback, 1.37 MB direct JPG, >3.4 MB JPG resize/compress path, cross-origin binary uploads, Applied UI and 3D background state.');
    await context.close();
  }finally{await browser.close();await new Promise(r=>web.close(r));await new Promise(r=>api.close(r));}
})().catch(e=>{console.error(e);web.close();api.close();process.exitCode=1;});
