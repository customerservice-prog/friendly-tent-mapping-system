const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const dom=new JSDOM(fs.readFileSync(path.join(root,'designer/index.html'),'utf8'),{url:'https://rentsketch.com/designer/?tenant=friendly&parentOrigin=https%3A%2F%2Fwww.friendlypartyrental.com&source=product_detail',runScripts:'outside-only'});
const w=dom.window,d=w.document,context=dom.getInternalVMContext(),messages=[];
Object.defineProperty(w,'parent',{value:{postMessage:(data,origin)=>messages.push({data,origin})}});
w.ACTIVE_TENANT={slug:'friendly'};w.RENTSKETCH_TENANT_SLUG='friendly';
let saves=0,lines=[{productId:'tent-id',label:'Pole tent',qty:1,amount:250,category:'tent'}];
// Isolated paid-event context; no real payment or entitlement is created.
w.RentSketchEventPass={canEdit:()=>true,hasPaidEvent:()=>false};
w.FriendlyBridge={computeLineItems:()=>lines,getScene:()=>({surfaceType:'grass'})};w.RentSketchAutosave={flush:async()=>{saves++;return'00000000-0000-4000-8000-000000000001';}};
w.fetch=async()=>{throw Error('Unexpected network request');};
const cache=new Map();function moduleFor(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});cache.set(file,m);return m;}
const settle=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const m=moduleFor(path.join(root,'js/ui/booking-handoff.js'));await m.link((spec,ref)=>moduleFor(path.resolve(path.dirname(ref.identifier),spec)));await m.evaluate();
 w.dispatchEvent(new w.CustomEvent('rentsketch:catalogReady',{detail:{products:[{id:'tent-id',external_id:'fpr:20x20-pole-tent',active:true}]}}));
 d.getElementById('customerDate').value='2027-06-01';assert.equal(d.getElementById('friendlyBooking').hidden,false);
 d.getElementById('btnBookRentals').click();d.getElementById('btnBookRentals').click();await settle();await settle();
 assert.equal(saves,1);assert.equal(messages.length,1);assert.equal(messages[0].origin,'https://www.friendlypartyrental.com');assert.equal(messages[0].data.booking.source,'product_detail');assert.equal(messages[0].data.booking.eventDate,'2027-06-01');assert.equal(messages[0].data.booking.items[0].slug,'20x20-pole-tent');assert.ok(d.querySelector('#bookingStatus a[href^="https://www.friendlypartyrental.com/design-your-event/book#"]'));
 lines.push({label:'Concrete ballast',amount:null,qty:1,category:'installation'});d.getElementById('btnBookRentals').click();await settle();assert.equal(saves,1);assert.equal(messages.length,1);assert.match(d.getElementById('bookingStatus').textContent,/Concrete ballast.*Request a Quote/);
 w.ACTIVE_TENANT={slug:'other'};w.dispatchEvent(new w.Event('rentsketch:tenantReady'));assert.equal(d.getElementById('friendlyBooking').hidden,true);
 console.log('PASS booking handoff: real review button, exact products, saved design reuse, explicit parent origin, busy guard, quote fallback, tenant isolation. No live writes.');w.close();
})().catch(e=>{console.error(e);w.close();process.exitCode=1;});
