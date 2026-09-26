// Exercise production picker HTML/CSS in Chromium, with a local catalog and no API writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.RENTSKETCH_QA_OUT||path.join(root,'../qa-inventory-media'));
fs.mkdirSync(out,{recursive:true});
const fixture=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/inventory-browser.css"><style>*{box-sizing:border-box}body{margin:0;background:#edf2ed;font:14px system-ui;color:#17332e}main{width:min(470px,100%);padding:18px;background:white;margin:0 auto}h1{font-size:12px;font-weight:500;color:#617568;margin:0 0 20px}.fixture-errors{margin:28px 0 0}</style></head><body><main><h1>RentSketch · isolated catalog visual check</h1><section id="picker"></section><section class="fixture-errors" id="fallback"></section></main><script type="module">
import {inventoryBrowser,equipmentPhoto} from '/js/ui/inventory-browser.js';
import {TABLES} from '/js/data/tables.js';import {CHAIRS} from '/js/data/chairs.js';import {TENTS} from '/js/data/tents.js';import {INFLATABLE_PROFILES} from '/js/data/inflatables.js';import {genericEquipment} from '/js/data/equipment.js';
const catalog={tents:[TENTS[0]],tables:TABLES.filter(p=>['round-5ft','banquet-6ft','fill-chill-4ft'].includes(p.id)),chairs:CHAIRS.filter(p=>['resin-white','chiavari-gold'].includes(p.id)),inflatables:[{...INFLATABLE_PROFILES[0],id:'castle',name:'Bounce house',dimensionsConfirmed:false}],equipment:genericEquipment().filter(p=>['foam-machine','fan','cooler'].includes(p.type))};
const render=(category='all')=>{document.getElementById('picker').innerHTML=inventoryBrowser(catalog,[],{category});};render();
document.getElementById('picker').addEventListener('click',e=>{const b=e.target.closest('[data-role="inventory-category"]');if(b)render(b.dataset.category);});
document.getElementById('fallback').innerHTML=equipmentPhoto({...CHAIRS.find(p=>p.id==='resin-white'),photoUrl:'/missing-product-photo.png',name:'Broken photo fixture'},{category:'chair'});
window.inventoryReady=true;
</script></body></html>`;
const web=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://test.invalid');
 if(u.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fixture);return;}
 const file=path.resolve(root,u.pathname.slice(1));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'application/octet-stream');fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(resolve=>web.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.RENTSKETCH_CHROMIUM||undefined,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+web.address().port+'/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.inventoryReady);
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1050});
   await page.locator('[data-category="all"]').click();
   await page.locator('.inventory-preview-image').first().waitFor({state:'visible'});
   const fits=await page.locator('.inventory-card').evaluateAll(cards=>cards.every(card=>{const r=card.getBoundingClientRect();return r.width>100&&r.x>=0&&r.right<=innerWidth;}));
   assert.equal(fits,true,'picker cards stay within '+width+'px viewport');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:path.join(out,'inventory-media-'+width+'.png'),fullPage:true});
   await page.locator('[data-category="chair"]').click();
   assert.equal(await page.locator('[data-role="chair-card"]').count(),2);
   assert.equal(await page.locator('.inventory-card .inventory-preview-image').evaluateAll(imgs=>imgs.every(img=>img.complete&&img.naturalWidth>0)),true,'renderer thumbnail files load');
  }
  await page.locator('#fallback').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('#fallback .inventory-photo-layer').hidden);
  assert.equal(await page.locator('#fallback .inventory-illustration').isVisible(),true);
  assert.equal(await page.locator('#fallback .inventory-preview-image').evaluate(img=>img.complete&&img.naturalWidth>0),true);
  await page.route('**/assets/equipment/resin-white.png*',route=>route.abort());
  await page.reload({waitUntil:'networkidle'});await page.locator('#fallback').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>{const img=document.querySelector('#fallback .inventory-preview-image');return img?.parentElement.hidden&&img.parentElement.nextElementSibling.hidden===false;});
  assert.equal(await page.locator('#fallback .inventory-illustration svg').isVisible(),true,'second failure falls back to the chair symbol');
  await page.screenshot({path:path.join(out,'inventory-broken-photo-320.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS inventory browser: distinct furniture and rental previews, 1440/390/320px fit, working filters, native image error -> model -> symbol fallback, no external writes.');
 }finally{await browser.close();web.close();}
})().catch(error=>{console.error(error);web.close();process.exitCode=1;});
