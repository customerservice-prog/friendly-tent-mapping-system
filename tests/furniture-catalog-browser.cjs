const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.RENTSKETCH_QA_OUT||path.join(root,'../qa-furniture-catalog'));fs.mkdirSync(out,{recursive:true});
const ids={plastic:'8223e7ab-ca2b-40d5-9604-ce5f94c0aaca',crossback:'6416c1b8-efbf-4427-80c4-50d30207272c',sweetheart:'4fb360d1-b024-4595-9269-21887c70a55f',white:'fixture-white-folding'};
const models={plastic:'banquet-6ft',crossback:'crossback-natural',sweetheart:'sweetheart-half-round-60'};
const products=[
 {id:ids.plastic,external_id:'fpr:6ft-plastic-folding-table',name:'6ft Plastic Folding Table',price_per_day:'13.00',capacity:6},
 {id:ids.crossback,external_id:'fpr:cross-back-farmhouse-chair',name:'Cross-Back Farmhouse Chair',price_per_day:'14.00',capacity:2},
 {id:ids.sweetheart,external_id:'fpr:sweetheart-table-60in-half-round',name:'Sweetheart Table (60in Half-Round)',price_per_day:'35.00',capacity:2},
].map(p=>({...p,category:'other',visual_model_id:null,width_ft:null,length_ft:null,active:true,photo_url:'/tests/fixtures/furniture/'+p.external_id.slice(4)+'.png'}));
products.push({id:ids.white,external_id:'fpr:white-plastic-folding-chair',name:'White Plastic Folding Chair',category:'chair',visual_model_id:'plastic-white',price_per_day:2.5,active:true});
const initialScene={tentId:null,objects:[],siteWidthFt:22,siteLengthFt:22,surfaceType:'grass',lightingId:'lighting-none',chairId:'plastic-white',sceneOptions:{guests:false,motion:false,styling:false,night:false}};
let apiOrigin='',webOrigin='',revision=1,savedScene=initialScene;const writes=[],unexpected=[];
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const api=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://api.test');res.setHeader('Access-Control-Allow-Origin',webOrigin);res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,X-RentSketch-Session');res.setHeader('Cross-Origin-Resource-Policy','cross-origin');
 if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 const detail=()=>({id:'furniture-fixture',tenant:'friendly',accessDesignId:'furniture-fixture',anonymousSessionId:'furniture-owner',revision,scene:savedScene,active:true,renewable:true,expiresAt:'2099-01-01T00:00:00.000Z'});
 if(u.pathname==='/api/tenants/friendly')return json(200,{slug:'friendly',name:'Friendly Party Rental',showPrices:true});
 if(u.pathname==='/api/tenants/friendly/products')return json(200,{products});
 if(u.pathname==='/api/consumer/event-pass/offer')return json(200,{required:true,available:true,priceCents:999,durationDays:30,renewalPriceCents:499,renewalDurationDays:30});
 if(u.pathname==='/api/consumer/event-pass/resume'){req.resume();return json(200,detail());}
 if(u.pathname==='/api/tenants/friendly/designs/furniture-fixture'&&req.method==='GET')return json(200,detail());
 if(u.pathname==='/api/tenants/friendly/designs/furniture-fixture'&&req.method==='PATCH'){
  const chunks=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{const payload=JSON.parse(Buffer.concat(chunks).toString());if(req.headers['x-rentsketch-session']!=='furniture-owner')return json(403,{error:'Wrong fixture owner'});if(payload.expectedRevision!==revision)return json(409,{error:'Project changed',currentRevision:revision});savedScene=payload.scene;writes.push(payload);revision++;json(200,{id:'furniture-fixture',revision,updatedAt:new Date().toISOString()});});return;
 }
 if(u.pathname==='/api/tenants/friendly/review-pricing')return json(200,{available:true,deliveryFee:null,taxRate:8});
 unexpected.push(req.method+' '+u.pathname);json(404,{error:'Unexpected fixture route'});
});
const web=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://web.test');if(u.pathname==='/staff-api/api/auth/me'){res.writeHead(401,{'Content-Type':'application/json'});return res.end('{"error":"Not signed in"}');}
 if(u.pathname==='/designer/'||u.pathname==='/designer/index.html'){
  let html=fs.readFileSync(path.join(root,'designer/index.html'),'utf8').replace('<head>','<head><script>window.RENTSKETCH_API_URL='+JSON.stringify(apiOrigin)+'</script>');
  html=html.replaceAll('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js','/tests/node_modules/three/build/three.module.js').replaceAll('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/','/tests/node_modules/three/examples/jsm/');res.setHeader('Content-Type','text/html');return res.end(html);
 }
 const file=path.resolve(root,u.pathname.slice(1));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':'application/octet-stream');fs.createReadStream(file).pipe(res);
});
(async()=>{
 await listen(api);apiOrigin='http://127.0.0.1:'+api.address().port;await listen(web);webOrigin='http://127.0.0.1:'+web.address().port;
 const browser=await chromium.launch({executablePath:process.env.RENTSKETCH_CHROMIUM||undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await context.addInitScript(scene=>{localStorage.setItem('rentsketch-anon-session','furniture-owner');if(!localStorage.getItem('rentsketch-autosave:friendly'))localStorage.setItem('rentsketch-autosave:friendly',JSON.stringify({id:'furniture-fixture',tenant:'friendly',anonymousSessionId:'furniture-owner',revision:1,pending:false,savedAt:new Date().toISOString(),scene}));},initialScene);
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('[browser pageerror]',error.message);});page.on('console',message=>{if(['warning','error'].includes(message.type()))console.error('[browser '+message.type()+']',message.text());});
  await page.goto(webOrigin+'/designer/?tenant=friendly',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.RentSketchEventPass?.canEdit()&&window.RENTSKETCH_CATALOG_READY&&window.FriendlyBridge?.getScene);
  const resolved=await page.evaluate(()=>({tables:window.FriendlyBridge.TABLES,chairs:window.FriendlyBridge.CHAIRS,equipment:window.FriendlyBridge.EQUIPMENT}));
  for(const [kind,key] of [['tables','plastic'],['tables','sweetheart'],['chairs','crossback']]){const p=resolved[kind].find(p=>p.productId===ids[key]);assert.ok(p,key+' is correctly classified by production hydration');assert.equal(p.id,models[key]);assert.equal(p.dimensionsConfirmed,false,'missing live dimensions stay unverified');assert.equal(resolved.equipment.some(p=>p.productId===ids[key]),false,'resolved furniture is not also a generic accessory');}
  async function drawer(category){if(!await page.locator('#drawer').isHidden())await page.locator('#drawerClose').click();await page.locator('[data-drawer="inventory"]').first().click();await page.locator('[data-role="inventory-category"][data-category="'+category+'"]').click();}
  async function fits(selector){const boxes=await page.locator(selector).evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,right:r.right,height:r.height};}));for(const box of boxes){assert.ok(box.x>=-1&&box.right<=page.viewportSize().width+1,'control fits viewport: '+JSON.stringify(box));assert.ok(box.height>=40,'control keeps a usable touch target');}assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'no document horizontal overflow');}
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:width===320?740:width===390?844:1000});await drawer('table');assert.equal(await page.locator('.inventory-card[data-role="table-card"]').count(),2);assert.equal(await page.locator('.inventory-unmapped').count(),0);
   await fits('.inventory-card');await page.screenshot({path:path.join(out,'tables-'+width+'.png')});
   await drawer('chair');assert.equal(await page.locator('.inventory-card[data-id="'+models.crossback+'"]').count(),1);assert.match(await page.locator('.inventory-card[data-id="'+models.crossback+'"]').innerText(),/\$14\.00/);await fits('.inventory-card');await page.screenshot({path:path.join(out,'chairs-'+width+'.png')});
  }
  await page.setViewportSize({width:1440,height:1000});
  async function addTable(id){await drawer('table');await page.locator('.inventory-card[data-id="'+id+'"]').click();await page.locator('#placementConfirm').click();return page.evaluate(model=>window.FriendlyBridge.getScene().objects.find(o=>o.tableId===model),id);}
  const plastic=await addTable(models.plastic),sweetheart=await addTable(models.sweetheart);assert.equal(plastic.seatCount,6);assert.equal(sweetheart.seatCount,2);assert.equal(sweetheart.shape,'half-round');
  await drawer('chair');await page.locator('.inventory-card[data-id="'+models.crossback+'"]').click();await page.locator('#drawerClose').click();
  assert.deepEqual(await page.evaluate(()=>window.FriendlyBridge.getScene().objects.map(o=>o.chairId)),[models.crossback,models.crossback]);
  async function select(id){await page.locator('.plan2d-object[data-item-id="'+id+'"]').press('Enter');}
  await select(plastic.id);await page.locator('#inspectorPanel [data-role="insp-seats"][data-delta="-1"]').click();
  await page.locator('#inspectorPanel [data-role="insp-chair"]').selectOption('plastic-white');
  let lines=await page.evaluate(()=>window.FriendlyBridge.computeLineItems());assert.equal(lines.find(p=>p.productId===ids.white)?.qty,5);assert.equal(lines.find(p=>p.productId===ids.crossback)?.qty,2);
  await page.locator('#inspectorPanel [data-role="insp-chair"]').selectOption(models.crossback);
  lines=await page.evaluate(()=>window.FriendlyBridge.computeLineItems());for(const [productId,qty,unitPrice,amount] of [[ids.plastic,1,13,13],[ids.sweetheart,1,35,35],[ids.crossback,7,14,98]]){const line=lines.find(p=>p.productId===productId);assert.ok(line,'review retains exact product identity');assert.deepEqual([line.qty,line.unitPrice,line.amount],[qty,unitPrice,amount]);}
  await page.locator('#inspectorPanel [data-role="insp-rotate"]').click();assert.equal(await page.evaluate(id=>window.FriendlyBridge.getScene().objects.find(o=>o.id===id).rotationDeg,plastic.id),90);
  const rotationEvidence=[];
  for(const angle of [0,90,180,270]){
   await select(sweetheart.id);if(angle)await page.locator('#inspectorPanel [data-role="insp-rotate"]').click();
   const evidence=await page.evaluate(async({id,angle})=>{
    const item=window.FriendlyBridge.getScene().objects.find(o=>o.id===id),theta=angle*Math.PI/180,cx=item.x+item.widthFt/2,cy=item.y+item.depthFt/2;
    const dots=Array.from(document.querySelectorAll('.plan2d-chair')).filter(el=>el.dataset.chairFor===id).map(el=>({x:Number(el.dataset.modelX)-cx,y:Number(el.dataset.modelY)-cy}));
    const local=dots.map(p=>({x:p.x*Math.cos(theta)+p.y*Math.sin(theta),y:-p.x*Math.sin(theta)+p.y*Math.cos(theta)}));
    const {makeTable}=await import('/js/ui/equipment3d.js'),THREE=await import('three');
    const model=makeTable({...item,widthFt:item.modelWidthFt||5,depthFt:item.modelDepthFt||2.5,rotationDeg:0});model.rotation.y=-theta;model.updateMatrixWorld(true);
    const batch=model.children.find(child=>child.isInstancedMesh&&child.userData.role==='chairs'),matrix=new THREE.Matrix4(),mesh=[];
    if(batch)for(let i=0;i<batch.count;i++){batch.getMatrixAt(i,matrix);const v=new THREE.Vector3().setFromMatrixPosition(matrix).applyMatrix4(model.matrixWorld);mesh.push({x:v.x,y:v.z});}
    model.traverse(p=>{p.geometry?.dispose();if(p.material)for(const m of Array.isArray(p.material)?p.material:[p.material])m.dispose();});
    return {angle:item.rotationDeg||0,width:item.widthFt,depth:item.depthFt,local,dots,mesh};
   },{id:sweetheart.id,angle});
   assert.equal(evidence.angle,angle);assert.equal(evidence.local.length,2);assert.ok(evidence.local.every(p=>p.y<-1.25),'both sweetheart chairs stay behind the straight edge at '+angle+'°');assert.ok(Math.abs(evidence.local[0].y-evidence.local[1].y)<1e-6,'chairs stay side by side');assert.equal(evidence.mesh.length,2);
   for(let i=0;i<2;i++)assert.ok(Math.hypot(evidence.mesh[i].x-evidence.dots[i].x,evidence.mesh[i].y-evidence.dots[i].y)<1e-5,'actual 3D chair instances agree with 2D at '+angle+'°');rotationEvidence.push(evidence);
  }
  await page.locator('[data-role="inspector-close"]').click();await page.screenshot({path:path.join(out,'furniture-plan.png')});
  await page.locator('#viewMode3d').click();await page.locator('#canvas canvas').waitFor({timeout:20000});await page.waitForFunction(()=>window.FriendlyBridge.state.viewMode==='3d'&&document.querySelector('#viewMode3d').getAttribute('aria-selected')==='true');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:path.join(out,'furniture-scene-3d.png')});
  await page.locator('#viewModePlan').click();
  for(const [name,item] of [['plastic',plastic],['sweetheart',sweetheart]]){
   await select(item.id);await page.locator('#inspectorPanel [data-role="insp-design-table"]').click();await page.locator('.ts-three canvas').waitFor({timeout:20000});assert.equal(await page.locator('.ts-dialog').getAttribute('data-view'),'3d');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.screenshot({path:path.join(out,name+'-studio-1440.png')});
   if(name==='sweetheart')for(const width of [390,320]){await page.setViewportSize({width,height:width===320?740:844});await fits('.ts-dialog [data-ts="close"],.ts-dialog [data-ts="done"]');assert.ok((await page.locator('.ts-three canvas').boundingBox()).height>=100,'3D preview retains visible height beside mobile controls');await page.screenshot({path:path.join(out,name+'-studio-'+width+'.png')});}
   await page.locator('.ts-dialog [data-ts="close"]').click();await page.setViewportSize({width:1440,height:1000});
  }
  await page.evaluate(()=>window.RentSketchAutosave.flush());const before=await page.evaluate(()=>({objects:window.FriendlyBridge.getScene().objects,lines:window.FriendlyBridge.computeLineItems()}));assert.ok(writes.length);assert.equal(savedScene.objects.length,2);
  await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.RentSketchEventPass?.canEdit()&&window.FriendlyBridge?.getScene().objects.length===2);
  assert.deepEqual(await page.evaluate(()=>window.FriendlyBridge.getScene().objects),before.objects,'placement, seats, chair identity and rotation survive genuine save/reload');assert.deepEqual(await page.evaluate(()=>window.FriendlyBridge.computeLineItems()),before.lines,'exact product IDs and pricing survive reload');
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({viewports:[1440,390,320],products:ids,lines:before.lines,rotationEvidence,saveRevision:revision,isolatedApi:true},null,2));
  console.log('PASS Friendly furniture browser: actual other/null catalog repair, table/chair browsing, placement, seat and chair changes, exact SKU pricing, half-round0/90/180/270 seat registration, 3D/Table Studio, mobile320/390, and save/reload. APIs isolated.');
 }finally{await browser.close();web.close();api.close();}
})().catch(error=>{console.error(error);web.close();api.close();process.exitCode=1;});
