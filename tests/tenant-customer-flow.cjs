// Real frontend modules + isolated tenant API fixture. No network writes.
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'designer/index.html'),'utf8');
const dom=new JSDOM(html,{url:'https://rentsketch.com/designer/?tenant=lakeside&embed=1&focus=tent&autoplace=1&view=2d&productId=lake-tent',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,requests=[],messages=[];let release;const catalogGate=new Promise(resolve=>release=resolve);
w.AbortController=AbortController;w.ResizeObserver=class{observe(){}disconnect(){}};w.alert=s=>messages.push(s);
const products=[
 {id:'lake-tent',external_id:'lake:20x20-frame',category:'tent',visual_model_id:'frame-20x20',name:'Lakeside White Frame Tent',price_per_day:399},
 {id:'lake-table',category:'table',visual_model_id:'round-5ft',name:'Lakeside Round Table',price_per_day:19},
 {id:'lake-chair',category:'chair',visual_model_id:'resin-white',name:'Lakeside Resin Chair',price_per_day:4},
 {id:'lake-gold-chair',category:'chair',visual_model_id:'chiavari-gold',name:'Lakeside Gold Chair',price_per_day:6.50},
];
w.fetch=async(url,options={})=>{
 requests.push({url,method:options.method||'GET',body:options.body&&JSON.parse(options.body)});
 if(url.endsWith('/products')){await catalogGate;return{ok:true,json:async()=>({products})};}
 if(url.endsWith('/api/tenants/lakeside')){await catalogGate;return{ok:true,json:async()=>({slug:'lakeside',name:'Lakeside Events',primaryColor:'#553399',showPrices:true})};}
 if(url.endsWith('/lakeside/designs'))return{ok:true,json:async()=>({id:'lake-design'})};
 if(url.endsWith('/lakeside/quote-requests'))return{ok:true,json:async()=>({id:'mock-quote',notificationSent:true})};
 throw new Error('Unexpected request: '+url);
};
const context=dom.getInternalVMContext(),cache=new Map();
async function load(file,source){
 file=file.split('?')[0];if(cache.has(file))return cache.get(file);
 const m=new vm.SourceTextModule(source??fs.readFileSync(file,'utf8'),{context,identifier:file,initializeImportMeta(meta){meta.url=require('node:url').pathToFileURL(file).href;}});cache.set(file,m);
 await m.link((spec,ref)=>load(path.resolve(path.dirname(ref.identifier),spec)));return m;
}
const evalScript=filename=>w.eval(fs.readFileSync(path.join(root,filename),'utf8'));
const settle=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 const bootstrap=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
 await(await load(path.join(root,'designer/index.html'),bootstrap)).evaluate();
 await(await load(path.join(root,'script.js'))).evaluate();
 evalScript('js/ui/intake-bootstrap.js');evalScript('js/ui/autosave.js');evalScript('js/ui/tent-preview-entry.js');
 assert.equal(w.RENTSKETCH_CATALOG_READY,undefined);assert.equal(w.document.getElementById('intakeWizard').children.length,0);assert.equal(w.RentSketchAutosave,undefined);
 release();await new Promise(resolve=>setTimeout(resolve,100));
 const b=w.FriendlyBridge;
 assert.equal(b.getScene().tentId,'frame-20x20');assert.equal(b.TENTS.length,1);assert.equal(b.TENTS[0].productId,'lake-tent');assert.equal(b.CHAIRS[0].productId,'lake-chair');
 assert.match(w.document.getElementById('toolbarEventTitle').textContent,/Lakeside/);assert.doesNotMatch(w.document.getElementById('toolbarEventMeta').textContent,/Friendly/);
 assert.equal(w.document.documentElement.style.getPropertyValue('--primary'),'#553399');
 evalScript('js/ui/customer-entry.js');assert.equal(w.document.querySelector('.rs-entry'),null,'2D exact preview is not covered by onboarding');
 w.document.getElementById('designMyEvent').click();
 assert.match(w.document.querySelector('.rs-entry').textContent,/Lakeside Events/);assert.doesNotMatch(w.document.querySelector('.rs-entry').textContent,/Friendly Party Rental/);
 w.document.querySelector('[data-start]').click();
 assert.equal(b.getScene().tentId,'frame-20x20');
 w.document.querySelector('[data-drawer="tables"]').click();w.document.querySelector('[data-role="table-card"]').click();w.document.querySelector('#placementConfirm').click();
 assert.equal(b.getScene().objects[0].chairId,'resin-white');
 w.document.querySelector('[data-drawer="chairs"]').click();
 assert.equal(w.document.querySelectorAll('[data-role="chair-card"]').length,2);
 assert.doesNotMatch(w.document.getElementById('drawerBody').textContent,/Friendly|Plastic/);
 w.document.querySelector('[data-role="chair-card"][data-id="chiavari-gold"]').click();
 assert.equal(b.getScene().objects[0].chairId,'chiavari-gold');
 w.document.getElementById('btnToReview').click();
 assert.match(w.document.getElementById('reviewSummary').textContent,/Lakeside White Frame Tent/);assert.match(w.document.getElementById('reviewSummary').textContent,/\$470.00/);
 assert.deepEqual(Array.from(b.computeLineItems(),x=>x.productId),['lake-tent','lake-table','lake-gold-chair']);
 evalScript('js/ui/review-actions.js');
 w.document.getElementById('customerName').value='Test Customer';w.document.getElementById('customerEmail').value='qa@example.invalid';w.document.getElementById('customerDate').value='2026-10-10';
 await w.RentSketchAutosave.flush();w.document.getElementById('btnEmailQuote').click();await settle();await settle();
 const saves=requests.filter(r=>r.method==='POST'&&r.url.endsWith('/designs')),quotes=requests.filter(r=>r.url.endsWith('/quote-requests'));
 assert.equal(saves.length,1);assert.equal(quotes.length,1);assert.equal(quotes[0].body.designId,'lake-design');assert.equal(quotes[0].body.estimateTotal,470);assert.equal(quotes[0].body.lineItems[0].productId,'lake-tent');
 assert.ok(requests.every(r=>!r.url.includes('/friendly')));assert.match(messages.join(' '),/Lakeside Events/);
 console.log('PASS: delayed second-tenant hydration → exact 2D preview → tenant acknowledgment → own equipment/prices → complete review → mocked quote reuses same tenant design; no network writes');
 dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});
