// Frozen public catalog + real frontend. Never writes to a live API.
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'designer/index.html'),'utf8');
const {products:base}=require('./fixtures/friendly-catalog-20260920.json');
const {products:inflatables}=require('./fixtures/friendly-inflatables-20260920.json');
const products=base.concat(inflatables);
const tents=products.filter(p=>p.category==='tent'&&p.external_id.startsWith('fpr:'));
async function setup(query,tenant='friendly',tenantProducts=products){
 const dom=new JSDOM(html,{url:'https://rentsketch.com/designer/?'+query,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.AbortController=AbortController;// Isolated paid-event context; no real payment or entitlement is created.
w.RentSketchEventPass={canEdit:()=>true,hasPaidEvent:()=>false};
w.ResizeObserver=class{observe(){}disconnect(){}};
 const viewport=query.includes('productId=')?[320,377]:query.includes('tentSlug=')?[390,560]:[1280,700];
 Object.defineProperties(w.document.getElementById('plan2d'),{clientWidth:{value:viewport[0]},clientHeight:{value:viewport[1]}});
 const reads=[];w.fetch=async(url,options={})=>{assert.ok(!options.method||options.method==='GET','no network mutations');reads.push(url);if(!query.includes('tenant='+tenant))throw Error('generic must not fetch a rental catalog');return {ok:true,json:async()=>url.endsWith('/products')?{products:tenantProducts}:{slug:tenant,name:tenant==='friendly'?'Friendly Party Rental':'Lakeside Play',showPrices:true}};};
 const cache=new Map(),ctx=dom.getInternalVMContext();
 function moduleFor(file,source){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(source??fs.readFileSync(file,'utf8'),{context:ctx,identifier:file,initializeImportMeta(meta){meta.url=require('node:url').pathToFileURL(file).href;}});cache.set(file,m);return m;}
 async function load(file,source){const m=moduleFor(file,source);if(m.status==='unlinked')await m.link((spec,ref)=>moduleFor(path.resolve(path.dirname(ref.identifier),spec)));await m.evaluate();return m;}
 await load(path.join(root,'designer/index.html'),html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]);
 await new Promise(resolve=>setImmediate(resolve));await load(path.join(root,'script.js'));
 if(query.includes('focus=tent')||query.includes('focus=inflatable'))w.eval(fs.readFileSync(path.join(root,'js/ui/tent-preview-entry.js'),'utf8'));else await load(path.join(root,'js/ui/intake.js'));
 return {dom,w,d:w.document,b:w.FriendlyBridge,reads};
}
(async()=>{
 let cases=0;
 for(const p of inflatables)for(const key of ['productId','productSlug','product']){
  const query=new URLSearchParams({tenant:'friendly',focus:'inflatable',autoplace:'1',view:'2d',[key]:key==='productId'?p.id:key==='productSlug'?p.external_id.slice(4):p.name});
  const {w,d,b}=await setup(query.toString());
  try{
   assert.equal(b.INFLATABLES.length,11);assert.equal(b.getScene().tentId,null);assert.equal(b.getScene().objects.length,1);
   assert.equal(d.getElementById('designMyEvent').disabled,false,p.name+' ready');assert.equal(d.querySelectorAll('.plan2d-pole,.plan2d-anchor-stake').length,0);
   const object=b.getScene().objects[0],original=JSON.stringify(b.getScene()),product=b.INFLATABLES.find(p=>p.id===object.inflatableId);
   assert.equal(product.productId,p.id);assert.equal(product.name,p.name);assert.equal(product.dimensionsConfirmed,false);
   assert.ok(d.querySelector('.plan2d-object.inflatable svg'));assert.match(d.getElementById('toolbarEventMeta').textContent,/confirm dimensions/);
   assert.equal(b.computeLineItems().length,1);assert.equal(b.computeLineItems()[0].productId,p.id);assert.equal(b.computeLineItems()[0].amount,+p.price_per_day);
   d.getElementById('designMyEvent').click();assert.equal(b.getScene().tentId,null);assert.equal(JSON.stringify(b.getScene().objects),JSON.parse(original)&&JSON.stringify(JSON.parse(original).objects));
   b.state.selectedId=object.id;b.refreshAll();
   d.querySelector('[data-role="insp-rotate"]').click();assert.equal(b.getScene().objects[0].rotationDeg,90);assert.equal(b.getScene().objects[0].widthFt,object.depthFt);
   const rotated=b.getScene(),rotatedItem=rotated.objects[0];assert.ok(rotatedItem.x>=0&&rotatedItem.y>=0&&rotatedItem.x+rotatedItem.widthFt<=rotated.siteWidthFt&&rotatedItem.y+rotatedItem.depthFt<=rotated.siteLengthFt,'initial outdoor space accommodates a quarter turn');
   d.querySelector('[data-role="insp-duplicate"]').click();assert.equal(b.computeLineItems()[0].qty,2);assert.equal(b.computeLineItems()[0].amount,2*Number(p.price_per_day));
   d.getElementById('btnUndo').click();assert.equal(b.computeLineItems()[0].qty,1);d.getElementById('btnRedo').click();assert.equal(b.computeLineItems()[0].qty,2);
   b.loadScene(JSON.parse(original));assert.equal(b.getScene().tentId,null);assert.equal(b.getScene().objects[0].rotationDeg,0);
   b.openDrawer('tables');const card=d.querySelector('[data-role="table-card"]');assert.ok(card);card.click();assert.equal(b.getScene().objects.length,1,'ghost is not committed');d.getElementById('placementConfirm').click();assert.equal(b.getScene().objects.length,2);
   const row=b.computeLineItems().find(l=>l.category==='inflatable');assert.equal(row.productId,p.id);assert.ok(!b.computeLineItems().some(l=>l.category==='tent'));
   b.openDrawer('inflatables');d.querySelector('[data-role="inflatable-card"]').click();d.getElementById('placementRotate').click();d.getElementById('placementCancel').click();assert.equal(b.getScene().objects.length,2,'canceled inflatable not billed');
   d.getElementById('btnToReview').click();assert.match(d.getElementById('reviewSummary').textContent,/Rental estimate/);assert.ok(d.getElementById('reviewSummary').textContent.includes(p.name));assert.doesNotMatch(d.getElementById('reviewSummary').textContent,/Tent — confirm selection|tent boundary/);
   cases++;
  }finally{w.close();}
 }
 const second=await setup('tenant=lakeside&focus=inflatable&autoplace=1&view=2d&productId=lake-slide','lakeside',[{id:'lake-slide',category:'other',name:'Lakeside Water Slide',external_id:'lake:water-slide',price_per_day:321,width_ft:14,length_ft:28,metadata:{heightFt:16}}]);
 assert.equal(second.b.TENTS.length,0);assert.equal(second.b.INFLATABLES.length,1);assert.equal(second.b.getScene().tentId,null);assert.equal(second.b.computeLineItems()[0].productId,'lake-slide');assert.equal(second.b.computeLineItems()[0].amount,321);assert.equal(second.b.INFLATABLES[0].dimensionsConfirmed,true);assert.doesNotMatch(second.d.getElementById('toolbarEventMeta').textContent,/Friendly/);second.d.getElementById('designMyEvent').click();second.d.getElementById('btnToReview').click();assert.match(second.d.getElementById('reviewSummary').textContent,/Lakeside/);second.w.close();
 const bad=await setup('tenant=friendly&focus=inflatable&autoplace=1&view=2d&productId=missing&productSlug=crayon-bounce-house');
 assert.equal(bad.d.getElementById('designMyEvent').disabled,true,'bad authoritative ID cannot silently substitute');assert.match(bad.d.getElementById('tentPreviewStatus').textContent,/couldn’t load this exact inflatable/);bad.w.close();
 console.log('PASS '+cases+' exact inflatable entries: no tent, correct product/price, preview continuity, rotate/duplicate/undo/redo, save/resume, equipment placement and review. No live writes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
