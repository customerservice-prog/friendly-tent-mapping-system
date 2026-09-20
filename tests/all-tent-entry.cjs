// Frozen public catalog + real frontend. Never writes to a live API.
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'designer/index.html'),'utf8');
const {products}=require('./fixtures/friendly-catalog-20260920.json');
const tents=products.filter(p=>p.category==='tent'&&p.external_id.startsWith('fpr:'));
async function setup(query){
 const dom=new JSDOM(html,{url:'https://rentsketch.com/designer/?'+query,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.AbortController=AbortController;w.ResizeObserver=class{observe(){}disconnect(){}};
 const viewport=query.includes('productId=')?[320,377]:query.includes('tentSlug=')?[390,560]:[1280,700];
 Object.defineProperties(w.document.getElementById('plan2d'),{clientWidth:{value:viewport[0]},clientHeight:{value:viewport[1]}});
 const reads=[];w.fetch=async(url,options={})=>{assert.ok(!options.method||options.method==='GET','no network mutations');reads.push(url);if(!query.includes('tenant=friendly'))throw Error('generic must not fetch a rental catalog');return {ok:true,json:async()=>url.endsWith('/products')?{products}:{slug:'friendly',name:'Friendly Party Rental',showPrices:true}};};
 const cache=new Map(),ctx=dom.getInternalVMContext();
 function moduleFor(file,source){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(source??fs.readFileSync(file,'utf8'),{context:ctx,identifier:file,initializeImportMeta(meta){meta.url=require('node:url').pathToFileURL(file).href;}});cache.set(file,m);return m;}
 async function load(file,source){const m=moduleFor(file,source);if(m.status==='unlinked')await m.link((spec,ref)=>moduleFor(path.resolve(path.dirname(ref.identifier),spec)));await m.evaluate();return m;}
 await load(path.join(root,'designer/index.html'),html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]);
 await new Promise(resolve=>setImmediate(resolve));await load(path.join(root,'script.js'));
 if(query.includes('focus=tent'))w.eval(fs.readFileSync(path.join(root,'js/ui/tent-preview-entry.js'),'utf8'));else await load(path.join(root,'js/ui/intake.js'));
 return {dom,w,d:w.document,b:w.FriendlyBridge,reads};
}
(async()=>{
 let cases=0;
 for(const p of tents)for(const key of ['productId','tentSlug','tent']){
  const q=new URLSearchParams({tenant:'friendly',focus:'tent',autoplace:'1',view:'2d',[key]:key==='productId'?p.id:key==='tentSlug'?p.external_id.slice(4):p.name});
  const {w,d,b}=await setup(q.toString());
  try{
   assert.equal(d.getElementById('designMyEvent').disabled,false,p.name+' '+key);
   const chosen=b.TENTS.find(t=>t.id===b.getScene().tentId);
   assert.equal(chosen.productId,p.id,p.name+' exact product');assert.equal(chosen.name,p.name);
   const stage=d.querySelector('.plan2d-stage'),canvas=d.getElementById('plan2d');
   assert.ok(parseFloat(stage.style.width)<=canvas.clientWidth-32+.01,p.name+' fits canvas width');
   assert.ok(parseFloat(stage.style.height)<=canvas.clientHeight-32+.01,p.name+' fits canvas height');
   const size=p.name.match(/(\d+)\s*x\s*(\d+)/i);assert.equal(chosen.widthFt,+size[1]);assert.equal(chosen.lengthFt,+size[2]);
   assert.equal(chosen.type,/pole/i.test(p.name)?'pole':/frame/i.test(p.name)?'frame':'canopy');
   assert.equal(b.TENTS.length,17,'seed cards excluded, distinct misting canopy retained');
   assert.equal(b.buildPartyScene(),true,p.name+' gets a usable starter');
   const before=JSON.stringify(b.getScene().objects);d.getElementById('designMyEvent').click();
   assert.equal(JSON.stringify(b.getScene().objects),before);assert.equal(b.getScene().tentId,chosen.id);
   d.getElementById('btnToReview').click();assert.match(d.getElementById('reviewSummary').textContent,new RegExp(p.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
   const line=b.computeLineItems().find(l=>l.category==='tent');assert.equal(line.productId,p.id);assert.equal(line.amount,+p.price_per_day);
   d.getElementById('btnBackToDesigner').click();d.getElementById('btnUndo').click();assert.equal(b.getScene().objects.length,0);d.getElementById('btnRedo').click();assert.equal(JSON.stringify(b.getScene().objects),before);
   cases++;
  }finally{w.close();}
 }
 for(const query of ['', 'tenant=generic','demo=1']){
  const {w,d,b,reads}=await setup(query);
  try{assert.equal(reads.length,0);assert.equal(d.querySelector('.step.active').id,'step-designer');assert.ok(b.TENTS.every(t=>t.pricePerDay===null));assert.doesNotMatch(d.getElementById('statusBar').textContent,/\$250/);if(query==='demo=1')assert.ok(b.getScene().objects.length);else assert.ok(b.buildPartyScene());assert.equal(d.getElementById('btnEmailQuote').hidden,true);d.getElementById('btnToReview').click();assert.ok(b.computeLineItems().every(l=>l.amount===null));}finally{w.close();}
 }
 console.log(`PASS ${cases} exact entries: all 17 imported tent products by ID, slug and name → furnished layout → designer → correct quote product/price → undo/redo. Generic/direct/demo have no rental pricing or API dependency.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
