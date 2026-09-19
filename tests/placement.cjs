// Customer placement gestures, store/estimate isolation and undo in an offline DOM.
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dom=new JSDOM(fs.readFileSync(path.join(root,'designer/index.html'),'utf8'),{url:'https://rentsketch.com/designer/?tenant=friendly',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,d=w.document;w.ResizeObserver=class{observe(){}disconnect(){}};w.ACTIVE_TENANT={slug:'friendly',name:'Friendly Party Rental'};w.fetch=()=>{throw Error('No live writes');};
const context=dom.getInternalVMContext(),cache=new Map();
async function load(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file,initializeImportMeta(meta){meta.url=require('node:url').pathToFileURL(file).href;}});cache.set(file,m);await m.link((spec,ref)=>load(path.resolve(path.dirname(ref.identifier),spec)));return m;}
const click=selector=>{const el=d.querySelector(selector);assert.ok(el,selector);el.click();};
function pointer(el,type,x,y,id=1){const event=new w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});Object.defineProperties(event,{pointerId:{value:id},pointerType:{value:'touch'}});el.dispatchEvent(event);}
(async()=>{
 await(await load(path.join(root,'script.js'))).evaluate();await(await load(path.join(root,'js/ui/intake.js'))).evaluate();
 const b=w.FriendlyBridge,objects=()=>JSON.parse(JSON.stringify(b.getScene().objects));
 const beginTable=id=>{click('[data-drawer="tables"]');click('[data-role="table-card"][data-id="'+id+'"]');};
 beginTable('round-5ft');assert.equal(objects().length,0);assert.ok(!d.getElementById('placementBar').hidden);assert.ok(d.querySelector('[data-preview="true"]'));assert.equal(b.computeLineItems().filter(l=>l.category==='table').length,0);
 click('#placementCancel');assert.equal(objects().length,0);assert.ok(d.getElementById('placementBar').hidden);
 beginTable('banquet-6ft');click('#placementRotate');click('#placementConfirm');assert.equal(objects()[0].widthFt,2.5);assert.equal(objects()[0].depthFt,6);
 click('#btnUndo');assert.equal(objects().length,0);click('#btnRedo');assert.equal(objects().length,1);click('#btnUndo');
 beginTable('round-5ft');
 const stage=d.querySelector('.plan2d-stage');stage.getBoundingClientRect=()=>({left:0,top:0,width:parseFloat(stage.style.width),height:parseFloat(stage.style.height)});
 const scale=parseFloat(stage.style.width)/20;
 pointer(stage,'pointerdown',scale*5,scale*6);pointer(stage,'pointercancel',scale*5,scale*6);assert.equal(objects().length,0,'cancelled touch never commits');
 pointer(stage,'pointerdown',scale*5,scale*6,1);pointer(stage,'pointerdown',scale*10,scale*10,2);pointer(stage,'pointerup',scale*10,scale*10,2);pointer(stage,'pointerup',scale*5,scale*6,1);assert.equal(objects().length,0,'pinch never accidentally adds furniture');
 pointer(stage,'pointerdown',scale*5,scale*6);pointer(stage,'pointermove',scale*7,scale*8);pointer(stage,'pointerup',scale*7,scale*8);
 assert.equal(objects().length,1);assert.equal(objects()[0].x,4.5);assert.equal(objects()[0].y,5.5);assert.equal(objects()[0].seatCount,8);assert.equal(b.getScene().tentId,'pole-20x20');
 click('[data-drawer="dance"]');click('[data-role="dance-size-card"][data-id="6x6"]');assert.equal(objects().filter(o=>o.kind==='dance').length,0);
 pointer(stage,'pointerdown',scale*16,scale*16);pointer(stage,'pointerup',scale*16,scale*16);assert.equal(objects().filter(o=>o.kind==='dance').length,4);
 const floor=objects().filter(o=>o.kind==='dance');assert.equal(Math.min(...floor.map(o=>o.x)),13);assert.equal(Math.min(...floor.map(o=>o.y)),13);
 click('#btnUndo');assert.equal(objects().filter(o=>o.kind==='dance').length,0);assert.equal(objects().filter(o=>o.kind==='table').length,1);click('#btnRedo');assert.equal(objects().filter(o=>o.kind==='dance').length,4);
 const floorBefore=objects().filter(o=>o.kind==='dance'),section=d.querySelector('[data-item-id="'+floorBefore[0].id+'"]');
 pointer(section,'pointerdown',scale*14,scale*14);pointer(w,'pointermove',scale*12,scale*12);pointer(w,'pointerup',scale*12,scale*12);
 assert.ok(objects().filter(o=>o.kind==='dance').every((o,i)=>o.x===floorBefore[i].x-2&&o.y===floorBefore[i].y-2),'drag keeps the full floor together');
 click('#btnUndo');assert.deepEqual(objects().filter(o=>o.kind==='dance'),floorBefore,'one undo restores a floor move');
 const selectedTable=objects().find(o=>o.kind==='table'),tableEl=d.querySelector('[data-item-id="'+selectedTable.id+'"]');
 pointer(tableEl,'pointerdown',scale*7,scale*8);pointer(w,'pointermove',scale*8,scale*9);pointer(w,'pointercancel',scale*8,scale*9);assert.equal(objects().find(o=>o.kind==='table').x,selectedTable.x,'cancelled drag restores the table and chairs');
 beginTable('round-5ft');click('#btnToReview');assert.ok(d.getElementById('placementBar').hidden);assert.equal(objects().filter(o=>o.kind==='table').length,1);assert.equal(b.computeLineItems().find(l=>l.category==='table').qty,1);
 assert.ok(!('weather' in b.getScene())&&!('guests' in b.getScene()),'scene decorations are not rental state');
 console.log('PASS placement: preview/estimate isolation, cancel, rotate, custom touch position, pointer cancel/pinch, floor placement, atomic undo/redo, exact tent and review preserved');w.close();
})().catch(e=>{console.error(e);w.close();process.exitCode=1;});
