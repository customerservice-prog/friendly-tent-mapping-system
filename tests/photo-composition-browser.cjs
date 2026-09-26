const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=process.env.RENTSKETCH_QA_OUT||require('node:os').tmpdir()+'/rentsketch-photo-composition';fs.mkdirSync(out,{recursive:true});
const waitServer=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const tinyJpeg=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9k=','base64');
function scanSvg(n){
  const shift=n===4?7:n===6?-7:0;
  let marks='';
  for(let i=0;i<460;i++){
    const x=(i*37+i*i*3)%192,y=(i*53+i*i*5)%128,w=2+(i%5),h=2+((i*3)%5);
    const r=(i*71)%256,g=(i*43+80)%256,b=(i*97+30)%256;
    marks+='<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="rgb('+r+','+g+','+b+')"/>';
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="128" viewBox="0 0 192 128"><rect width="192" height="128" fill="#9fc8e0"/><g transform="translate('+shift+' 0)"><rect y="54" width="192" height="74" fill="#658451"/><rect x="48" y="43" width="96" height="39" fill="#8297a2"/><path d="M43 44 L96 21 L149 44" fill="#3e4852"/><path d="M0 86 H192" stroke="#d8d8cc" stroke-width="3"/>'+marks+'</g></svg>';
}
let webOrigin='',apiOrigin='',uploads=[],savedPatches=[],savedRevision=1;
const api=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://api.local');
  const cors=()=>{res.setHeader('Access-Control-Allow-Origin',webOrigin||'*');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization,X-RentSketch-Session');res.setHeader('Access-Control-Max-Age','60');res.setHeader('Cross-Origin-Resource-Policy','cross-origin');};
  cors();
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  const json=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
  if(u.pathname==='/api/consumer/event-pass/offer')return json(200,{required:true,available:true,priceCents:999,durationDays:30,renewalPriceCents:499,renewalDurationDays:30,previewDurationSeconds:300,recurring:false});
  if(u.pathname==='/api/consumer/event-pass/resume')return json(200,{id:'generic-photo-design',revision:savedRevision,accessDesignId:'generic-photo-design',tenant:'generic',scene:savedPatches.at(-1)?.scene||{tentId:'pole-20x20',objects:[{id:'qa-photo-table',kind:'table',tableId:'round-5ft',shape:'round',widthFt:5,depthFt:5,x:6,y:7,seatCount:8,chairId:'resin-white',linenId:null}],surfaceType:'grass',lightingId:'lighting-none',customer:{name:'Photo Test',email:'',date:''}},anonymousSessionId:'generic-photo-owner',active:true,renewable:true,expiresAt:'2099-01-01T00:00:00.000Z',customerEmail:'photo@example.invalid',accessUrl:'https://example.invalid/private'});
  if(u.pathname==='/api/consumer/designs/generic-photo-design'&&req.method==='PATCH'){
    const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{
      let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch(_){return json(400,{error:'Invalid fixture request'});}
      if(!Number.isInteger(body.expectedRevision))return json(428,{code:'revision_required',error:'Expected revision is required'});
      if(body.expectedRevision!==savedRevision)return json(409,{code:'revision_conflict',currentRevision:savedRevision,error:'Project changed'});
      savedPatches.push(body);savedRevision++;json(200,{ok:true,id:'generic-photo-design',revision:savedRevision,updatedAt:new Date().toISOString()});
    });return;
  }
  if(u.pathname==='/api/consumer/designs/generic-photo-design/background-photo'&&req.method==='POST'){
    const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{
      const body=Buffer.concat(chunks),n=uploads.length+1;
      const item={bytes:body.length,contentType:req.headers['content-type'],session:req.headers['x-rentsketch-session'],cookie:req.headers.cookie,authorization:req.headers.authorization};uploads.push(item);
      json(201,{id:'photo-browser-fixture-'+n,path:'/api/consumer/background-photo/photo-browser-fixture-'+n+'?t=capability',mimeType:'image/jpeg',byteSize:body.length});
    });return;
  }
  if(/^\/api\/consumer\/background-photo\/photo-browser-fixture-\d+$/.test(u.pathname)&&req.method==='GET'){
    const n=Number(u.pathname.match(/(\d+)$/)?.[1]||0);res.statusCode=200;
    if(n>=4&&n<=6){res.setHeader('Content-Type','image/svg+xml');res.end(scanSvg(n));}
    else if(process.env.RENTSKETCH_PHOTO_FIXTURE){res.setHeader('Content-Type','image/jpeg');res.end(fs.readFileSync(process.env.RENTSKETCH_PHOTO_FIXTURE));}
    else{res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#96c9e8"/><rect y="520" width="1200" height="280" fill="#84aa44"/><path d="M696 536 Q732 494 792 542 L850 612 Q862 670 736 676 L694 620Z" fill="#244c24"/></svg>');}
    return;
  }
  if(u.pathname==='/api/consumer/event-pass/preview'){req.resume();return json(200,{limited:false});}
  json(404,{error:'Unexpected QA API '+req.method+' '+u.pathname});
});
const web=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://web.local');
  if(u.pathname==='/staff-api/api/auth/me'){res.writeHead(401,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Not signed into a staff dashboard'}));}
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
// Optional visual reference: Yinan Chen, public domain,
// https://commons.wikimedia.org/wiki/File:Gfp-house-on-a-nice-lawn.jpg
// Set RENTSKETCH_PHOTO_FIXTURE to a local authorized copy for real-photo evidence.
// CI defaults to a deterministic source image; no customer data or live writes.
(async()=>{
 await waitServer(api);apiOrigin='http://127.0.0.1:'+api.address().port;await waitServer(web);webOrigin='http://127.0.0.1:'+web.address().port;
 const browser=await chromium.launch({executablePath:process.env.RENTSKETCH_CHROMIUM||undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900}});await context.addInitScript(()=>{localStorage.setItem('rentsketch-anon-session','generic-photo-owner');localStorage.setItem('rentsketch-autosave:generic',JSON.stringify({id:'generic-photo-design',tenant:'generic',anonymousSessionId:'generic-photo-owner',savedAt:new Date().toISOString(),scene:{tentId:'pole-20x20',surfaceType:'grass',objects:[]}}));});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/INVALID_VALUE|texSubImage2D|texStorage2D|VALIDATE_STATUS|Shader Error/.test(m.text()))errors.push(m.text());});
  await page.goto(webOrigin+'/designer/?tenant=generic',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.RentSketchEventPass?.canEdit());
  await page.locator('[data-drawer="site"]').click();
  if(process.env.RENTSKETCH_PHOTO_FIXTURE)await page.locator('[data-role="venue-photo-file"]').setInputFiles(process.env.RENTSKETCH_PHOTO_FIXTURE);
  else{const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1200;c.height=800;c.getContext('2d').fillRect(0,0,1200,800);return c.toDataURL('image/png').split(',')[1];});await page.locator('[data-role="venue-photo-file"]').setInputFiles({name:'composition-fixture.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});}
  await page.locator('.photo-workspace').waitFor({timeout:20000});await page.locator('.photo-perspective-tools summary').click();
  await page.locator('[data-photo-horizon]').evaluate(el=>{el.value='67';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('[data-photo-done]').click();await page.locator('#canvas canvas').waitFor();await page.waitForTimeout(600);
  await page.evaluate(()=>document.getElementById('layoutNotice')?.remove());
  const canvas=page.locator('#canvas canvas');await page.screenshot({path:path.join(out,'desktop-before.png')});const before=await canvas.screenshot();
  const beforeScene=await page.evaluate(()=>window.FriendlyBridge.getScene());assert.equal(beforeScene.photoCalibration.scaleConfirmed,false);
  await page.locator('#view3dAdjustPhoto').click();await page.waitForFunction(()=>document.querySelector('.photo-workspace-image')?.complete);await page.locator('[data-photo-tool="mask"]').click();
  // Hand-traced silhouette of the visible center-right shrub, in source-image fractions.
  const outline=[[.585,.679],[.598,.668],[.620,.657],[.640,.655],[.657,.668],[.682,.673],[.701,.701],[.706,.738],[.699,.768],[.715,.782],[.704,.810],[.676,.832],[.649,.840],[.618,.837],[.600,.819],[.596,.791],[.576,.768],[.573,.729],[.580,.704]];
  const stage=await page.locator('.photo-workspace-stage').boundingBox();for(const [x,y] of outline)await page.mouse.click(stage.x+x*stage.width,stage.y+y*stage.height);
  await page.locator('[data-mask-finish]').click();await page.locator('.photo-mask-properties > summary').click();await page.locator('[data-mask-label]').fill('Foreground shrub');await page.locator('[data-mask-label]').dispatchEvent('change');
  await page.screenshot({path:path.join(out,'desktop-mask-editor.png')});
  const mask=await page.evaluate(()=>window.FriendlyBridge.getScene().photoComposition.foregroundMasks[0]);assert.equal(mask.points.length,outline.length);assert.equal(mask.label,'Foreground shrub');
  await page.locator('[data-photo-done]').click();await page.waitForTimeout(250);await page.screenshot({path:path.join(out,'desktop-after.png')});const after=await canvas.screenshot();
  const {PNG}=require('pngjs'),a=PNG.sync.read(before),b=PNG.sync.read(after);assert.equal(a.width,b.width);assert.equal(a.height,b.height);
  const imageRect=await page.evaluate(async()=>{const g=await import('/js/core/photo-geometry.js'),s=window.FriendlyBridge.getScene(),r=document.querySelector('#canvas canvas').getBoundingClientRect(),image=new Image();image.crossOrigin='anonymous';image.src=s.backgroundPhoto.url;await image.decode();return g.photoImageRect(r.width,r.height,image.naturalWidth,image.naturalHeight,s.backgroundPhoto);});
  const {pointInForegroundMask}=await import(require('node:url').pathToFileURL(path.join(root,'js/core/photo-composition.js')));let altered=0;for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){const point={x:(x-imageRect.x)/imageRect.width,y:(y-imageRect.y)/imageRect.height};if(!pointInForegroundMask(point,mask.points))continue;const i=(y*a.width+x)*4;if(Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2])>45)altered++;}
  assert.ok(altered>20,'actual WebGL foreground must visibly hide rental pixels: '+altered);
  assert.deepEqual(await page.evaluate(()=>window.FriendlyBridge.getScene().photoCalibration),beforeScene.photoCalibration,'tracing does not move or alter the calibrated camera');
  // Undo the label change, then the outline; redo both through the real coordinator.
  await page.locator('#btnUndo').click();await page.locator('#btnUndo').click();assert.equal(await page.evaluate(()=>window.FriendlyBridge.getScene().photoComposition.foregroundMasks.length),0);
  await page.locator('#btnRedo').click();await page.locator('#btnRedo').click();assert.deepEqual(await page.evaluate(()=>window.FriendlyBridge.getScene().photoComposition.foregroundMasks[0]),mask);
  await page.locator('#sceneControls > summary').click();await page.locator('.photo-lighting-controls > summary').click();
  await page.locator('[data-photo-light="azimuthDeg"]').focus();await page.locator('[data-photo-light="azimuthDeg"]').press('Home');await page.locator('[data-photo-light="azimuthDeg"]').evaluate(el=>{el.value='40';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.locator('[data-photo-light="elevationDeg"]').evaluate(el=>{el.value='28';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.locator('[data-photo-light="shadowSoftness"]').evaluate(el=>{el.value='4';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.screenshot({path:path.join(out,'desktop-lighting-controls.png')});await page.locator('#sceneControls > summary').click();await page.waitForTimeout(150);await page.screenshot({path:path.join(out,'desktop-lighting-after.png')});
  const saved=await page.evaluate(()=>window.FriendlyBridge.getScene().photoComposition);assert.equal(saved.lighting.azimuthDeg,40);assert.equal(saved.lighting.elevationDeg,28);assert.equal(saved.lighting.shadowSoftness,4);
  await page.evaluate(()=>window.RentSketchAutosave.flush());await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.FriendlyBridge?.getScene().backgroundPhoto);assert.deepEqual(await page.evaluate(()=>window.FriendlyBridge.getScene().photoComposition),saved,'photo composition survives API save/reopen');
  for(const width of [390,320,1440]){
   await page.setViewportSize({width,height:width===1440?900:844});await page.locator('#viewModePhoto').click();await page.waitForTimeout(250);await page.screenshot({path:path.join(out,width+'-preview.png')});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow at '+width);
   await page.locator('#view3dFit').click();assert.deepEqual(await page.evaluate(()=>window.FriendlyBridge.getScene().photoComposition),saved,'Fit photo preserves source-image mask points');
   await page.locator('#view3dAdjustPhoto').click();await page.locator('[data-photo-tool="mask"]').click();await page.waitForFunction(()=>{const image=document.querySelector('.photo-workspace-image');return image?.complete&&image.naturalWidth>0;});await page.screenshot({path:path.join(out,width+'-editor.png')});await page.locator('[data-photo-done]').click();
  }
  // Review/print captures the composed WebGL frame rather than the flat source image.
  await page.evaluate(()=>window.FriendlyBridge.goToReview());const review=page.locator('.review-layout-visual img');await review.waitFor();assert.match(await review.getAttribute('src'),/^data:image\/jpeg/);await page.screenshot({path:path.join(out,'review-composed.png')});
  assert.ok(savedPatches.some(p=>p.scene?.photoComposition?.foregroundMasks?.length===1));assert.deepEqual(errors,[]);console.log('PASS actual WebGL photo composition: traced foreground occlusion ('+altered+' changed pixels), undo/redo, manual lights, API save/reopen, fit/resize, and review capture. Artifacts: '+out);
 }finally{await browser.close();web.close();api.close();}
})().catch(error=>{console.error(error);web.close();api.close();process.exitCode=1;});
