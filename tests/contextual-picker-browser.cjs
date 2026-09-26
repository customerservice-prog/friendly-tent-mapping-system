const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.RENTSKETCH_QA_OUT||path.join(root,'../qa-contextual-picker'));fs.mkdirSync(out,{recursive:true});
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
let webOrigin='',apiOrigin='',uploads=[],savedPatches=[],revision=1;
const initialScene={tentId:'pole-20x20',objects:[{id:'qa-photo-table',kind:'table',tableId:'round-5ft',shape:'round',widthFt:5,depthFt:5,x:6,y:7,seatCount:8,chairId:'resin-white',linenId:null}],surfaceType:'grass',lightingId:'lighting-none',customer:{name:'Photo Test',email:'',date:''}};
const api=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://api.local');
  const cors=()=>{res.setHeader('Access-Control-Allow-Origin',webOrigin||'*');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization,X-RentSketch-Session');res.setHeader('Access-Control-Max-Age','60');res.setHeader('Cross-Origin-Resource-Policy','cross-origin');};
  cors();
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  const json=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
  if(u.pathname==='/api/consumer/event-pass/offer')return json(200,{required:true,available:true,priceCents:999,durationDays:30,renewalPriceCents:499,renewalDurationDays:30,previewDurationSeconds:300,recurring:false});
  if(u.pathname==='/api/consumer/event-pass/resume')return json(200,{id:'generic-photo-design',accessDesignId:'generic-photo-design',revision,tenant:'generic',scene:savedPatches.at(-1)?.scene||initialScene,anonymousSessionId:'generic-photo-owner',active:true,renewable:true,expiresAt:'2099-01-01T00:00:00.000Z',customerEmail:'photo@example.invalid',accessUrl:'https://example.invalid/private'});
  if(u.pathname==='/api/consumer/designs/generic-photo-design'&&req.method==='GET')return json(200,{id:'generic-photo-design',revision,scene:savedPatches.at(-1)?.scene||initialScene});
  if(u.pathname==='/api/consumer/designs/generic-photo-design'&&req.method==='PATCH'){
    const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch(_){return json(400,{error:'Invalid fixture request'});}if(body.expectedRevision!==revision)return json(409,{error:'Project changed',currentRevision:revision});savedPatches.push(body);revision++;json(200,{ok:true,id:'generic-photo-design',revision});});return;
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
    else{res.setHeader('Content-Type','image/jpeg');res.end(fs.readFileSync('/tmp/rentsketch-lawn-reference.jpg'));}
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
const products=[{id:'gold-plate',name:'Gold charger plate',category:'accessory',price_per_day:2},{id:'linen-white',name:'120 Round Polyester White Linen',category:'linen',price_per_day:20},{id:'linen-black',name:'120 Round Polyester Black Linen',category:'linen',price_per_day:25},{id:'light-a',name:'20x20 Tent Lighting A',category:'lighting',visual_model_id:'lighting-tent',width_ft:20,length_ft:20,price_per_day:95},{id:'light-b',name:'20x20 Tent Lighting B',category:'lighting',visual_model_id:'lighting-tent',width_ft:20,length_ft:20,price_per_day:125},{id:'wall20',name:'Solid20ft Sidewall',category:'sidewall',width_ft:20,price_per_day:60}];
(async()=>{
 await waitServer(api);apiOrigin='http://127.0.0.1:'+api.address().port;await waitServer(web);webOrigin='http://127.0.0.1:'+web.address().port;
 const browser=await chromium.launch({executablePath:process.env.RENTSKETCH_CHROMIUM||undefined,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900}});await context.addInitScript(()=>{localStorage.setItem('rentsketch-anon-session','generic-photo-owner');if(!localStorage.getItem('rentsketch-autosave:generic'))localStorage.setItem('rentsketch-autosave:generic',JSON.stringify({id:'generic-photo-design',pending:false,tenant:'generic',anonymousSessionId:'generic-photo-owner',savedAt:new Date().toISOString(),scene:{tentId:'pole-20x20',surfaceType:'grass',objects:[]}}));});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(webOrigin+'/designer/?tenant=generic',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.RentSketchEventPass?.canEdit()&&window.FriendlyBridge?.getScene);
  await page.evaluate(products=>{window.ACTIVE_TENANT={slug:'friendly',name:'Friendly Party Rental'};window.dispatchEvent(new CustomEvent('rentsketch:catalogReady',{detail:{tenant:window.ACTIVE_TENANT,products}}));window.FriendlyBridge.loadScene({tentId:'pole-20x20',surfaceType:'grass',lightingId:'lighting-none',objects:[{id:'round1',kind:'table',tableId:'round-5ft',shape:'round',widthFt:5,depthFt:5,x:2,y:2,seatCount:8,chairId:'plastic-white'},{id:'round2',kind:'table',tableId:'round-5ft',shape:'round',widthFt:5,depthFt:5,x:11,y:3,seatCount:6,chairId:'plastic-white'}]});},products);
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:900});await page.locator('[data-drawer="inventory"]').click();await page.locator('[data-role="inventory-category"][data-category="linen"]').click();await page.locator('[data-role="inventory-context"][data-id="linen-black"]').click();
   await page.screenshot({path:path.join(out,'contextual-linen-'+width+'.png')});
   const bounds=await page.locator('.context-target').first().boundingBox();assert.ok(bounds.height>=44);assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.locator('[data-role="context-apply-table"][data-id="round1"]').click();assert.equal(await page.evaluate(()=>window.FriendlyBridge.getScene().objects[0].linenProductId),'linen-black');
   await page.locator('[data-role="inspector-close"]').click();
  }
  await page.locator('[data-drawer="inventory"]').click();await page.locator('[data-role="inventory-category"][data-category="tabletop"]').click();await page.locator('[data-role="inventory-context"][data-id="gold-plate"]').click();await page.locator('[data-role="context-apply-table"][data-id="round2"]').click();assert.equal(await page.evaluate(()=>window.FriendlyBridge.computeLineItems().find(l=>l.productId==='gold-plate').qty),6);
  // All three view labels must fit their actual mobile targets. Keep plan mode so this test remains GPU-independent.
  await page.evaluate(()=>{const scene=window.FriendlyBridge.getScene();scene.backgroundPhoto={id:'view-tabs',url:'https://example.invalid/photo.jpg',widthPx:1200,heightPx:800};scene.viewMode='plan';window.FriendlyBridge.loadScene(scene);});
  await page.setViewportSize({width:320,height:900});
  const tabFit=await page.locator('.view-toggle-btn:not([hidden])').evaluateAll(buttons=>buttons.map(button=>{const range=document.createRange();range.selectNodeContents(button);const text=range.getBoundingClientRect(),box=button.getBoundingClientRect();return {id:button.id,height:box.height,fits:text.left>=box.left&&text.right<=box.right};}));
  assert.equal(tabFit.length,3);for(const tab of tabFit){assert.ok(tab.fits,tab.id+' text fits without clipping or overlap');assert.ok(tab.height>=44);}
  await page.screenshot({path:path.join(out,'workspace-tabs-320.png')});
  await page.evaluate(()=>window.RentSketchAutosave.flush());assert.equal(savedPatches.at(-1).scene.objects[0].linenProductId,'linen-black');assert.equal(savedPatches.at(-1).scene.objects[1].tabletop[0].productId,'gold-plate');assert.deepEqual(errors,[]);
  console.log('PASS actual contextual inventory browser: desktop/mobile320/390 selection tocompatible table, exactsavedSKU andper-seatquantity,44pxtargets,nooverflow. All APIs isolated.');
 }finally{await browser.close();web.close();api.close();}
})().catch(error=>{console.error(error);web.close();api.close();process.exitCode=1;});
