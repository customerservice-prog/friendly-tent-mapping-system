// Actual Chromium project panel verification; isolated local API, no live data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=process.env.RENTSKETCH_QA_DIR||path.resolve(root,'../qa-project-workspace');fs.mkdirSync(out,{recursive:true});
let design,versions=[];
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/js/ui/project-panel.css"><style>body{margin:0;background:#eef3ec;font-family:system-ui}main{padding:32px}button{padding:16px;border-radius:10px;border:1px solid #bacaba;background:white}</style></head><body><main><h1>RentSketch project verification</h1><p>Isolated layout fixture · no customer information</p><button id="projects">Projects</button><button id="edit">Move table</button></main><script>
var fixtureScene={tentId:'frame',objects:[{id:'one',kind:'table',tableId:'six',widthFt:6,depthFt:2.5,x:4,y:5}]};
window.RENTSKETCH_API_URL=location.origin;window.RENTSKETCH_TENANT_SLUG='friendly';window.RENTSKETCH_CATALOG_READY=true;window.fixtureEditable=true;window.fixturePaid=false;window.fixtureAccessCalls=[];window.RentSketchEventPass={canEdit:()=>window.fixtureEditable,hasPaidEvent:()=>window.fixturePaid,requestAccess:()=>window.fixtureAccessCalls.push('access'),showRecovery:()=>window.fixtureAccessCalls.push('recover')};
window.FriendlyBridge={state:{},getScene:()=>JSON.parse(JSON.stringify(fixtureScene)),loadScene:s=>{fixtureScene=s;return true},closeDrawer:()=>{},computeLineItems:()=>[{label:'6 ft table',qty:1}],getChecks:()=>[{message:'Verify the delivery path.'}]};
</script><script src="/js/ui/autosave.js"></script><script src="/js/ui/project-panel.js"></script><script>projects.onclick=()=>RentSketchProjects.open();edit.onclick=()=>{fixtureScene.objects[0].x++;dispatchEvent(new CustomEvent('rentsketch:requestSave'))}</script></body></html>`;
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end(html);}
 if(u.pathname.startsWith('/api/')){
  res.setHeader('Content-Type','application/json');let raw='';for await(const piece of req)raw+=piece;const body=raw?JSON.parse(raw):{};
  if(req.method==='POST'&&u.pathname.endsWith('/designs')){design={id:'test-design',tenant:'friendly',revision:1,scene:body.scene,projectName:'Garden reception',siteNotes:'Confirm access path and installation area.'};versions=[];return res.end(JSON.stringify(design));}
  if(u.pathname.endsWith('/revisions')&&req.method==='GET')return res.end(JSON.stringify({revisions:versions}));
  if(u.pathname.endsWith('/alternatives'))return res.end(JSON.stringify({alternatives:[design]}));
  if(u.pathname.endsWith('/shares'))return res.end(JSON.stringify({shares:[],legacySharesEnabled:false}));
  if(req.method==='GET')return res.end(JSON.stringify(design));
  if(body.expectedRevision!==design.revision){res.statusCode=409;return res.end(JSON.stringify({error:'Another device saved a newer revision.',currentRevision:design.revision}));}
  if(u.pathname.endsWith('/revisions')){const checkpoint={id:'version-1',name:body.name,sourceRevision:design.revision,createdAt:new Date().toISOString()};versions.push(checkpoint);return res.end(JSON.stringify({checkpoint,revision:design.revision}));}
  Object.assign(design,body,{revision:design.revision+1});return res.end(JSON.stringify(design));
 }
 const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css; charset=utf-8':'application/javascript; charset=utf-8');res.end(fs.readFileSync(file));
});
let browser;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,...(process.env.RENTSKETCH_CHROMIUM?{executablePath:process.env.RENTSKETCH_CHROMIUM}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.getByRole('button',{name:'Projects',exact:true}).click();
  await page.getByLabel('Project name',{exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('[name=projectName]').value==='Garden reception');
  await page.locator('[role=dialog]').focus();await page.keyboard.press('Shift+Tab');assert.equal(await page.locator(':focus').getAttribute('data-action'),'print','Initial dialog Shift+Tab wraps inside');
  await page.getByLabel('Version name',{exact:true}).fill('Before final review');await page.getByRole('button',{name:'Save version',exact:true}).click();await page.getByText('Before final review',{exact:true}).waitFor();
  const overflow=await page.locator('.rs-project-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1);assert.equal(overflow,false,'No panel overflow at '+width);
  const targets=await page.locator('.rs-project-panel button').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height).filter(h=>h>0));assert.ok(targets.every(h=>h>=43),'Accessible button targets at '+width);
  await page.locator('.rs-project-dialog').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(out,'projects-'+width+'.png')});
  await page.getByRole('button',{name:'Close projects'}).focus();await page.keyboard.press('Shift+Tab');assert.equal(await page.locator(':focus').getAttribute('data-action'),'print','Focus wraps inside panel');
  await page.keyboard.press('Escape');await page.locator('.rs-project-panel').waitFor({state:'detached'});assert.equal(await page.locator(':focus').getAttribute('id'),'projects','Close restores launcher focus');
  design.revision++;await page.getByRole('button',{name:'Move table',exact:true}).click();await page.getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('button',{name:'Save layout now'}).click();
  await page.getByText('Keep both layouts safe',{exact:true}).waitFor();await page.locator('.rs-project-dialog').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(out,'projects-conflict-'+width+'.png')});
  assert.match(await page.locator('[data-save-status]').innerText(),/another session/);assert.equal(errors.length,0,errors.join('\n'));
  await page.keyboard.press('Escape');await page.evaluate(()=>{window.fixtureEditable=false;});await page.getByRole('button',{name:'Projects',exact:true}).click();await page.locator('[data-access-state=preview]').waitFor();assert.doesNotMatch(await page.locator('[data-save-status]').innerText(),/saved on this device|Shared/);assert.ok(await page.locator('.rs-project-panel').evaluate(el=>el.contains(document.activeElement)));await page.screenshot({path:path.join(out,'projects-preview-'+width+'.png')});await page.getByRole('button',{name:'See Event Pass options'}).click();assert.deepEqual(await page.evaluate(()=>window.fixtureAccessCalls),['access']);assert.equal(await page.locator('.rs-project-panel').count(),0);
  await page.getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('button',{name:'Open my saved event'}).click();assert.deepEqual(await page.evaluate(()=>window.fixtureAccessCalls),['access','recover']);
  await context.close();
 }
 console.log('PASS actual Chromium Projects panel: 1440/390/320px, named version, visible conflict controls, 44px buttons, no overflow, keyboard focus trap and Escape restore. Screenshots: '+out);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
