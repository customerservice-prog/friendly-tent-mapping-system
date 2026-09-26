const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),dom=new JSDOM('<div id="plan"></div>',{pretendToBeVisual:true,runScripts:'outside-only'}),w=dom.window,host=w.document.getElementById('plan');
let width=1200,height=800;Object.defineProperties(host,{clientWidth:{get:()=>width},clientHeight:{get:()=>height}});
w.requestAnimationFrame=()=>1;w.ResizeObserver=class{observe(){}disconnect(){}};
const context=dom.getInternalVMContext(),cache=new Map();
function moduleFor(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});cache.set(file,m);return m;}
async function load(file){const m=moduleFor(file);if(m.status==='unlinked')await m.link((s,ref)=>moduleFor(path.resolve(path.dirname(ref.identifier),s)));return m;}
const number=(el,key)=>parseFloat(el.style[key]);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function pointer(el,type,x,y){el.dispatchEvent(new w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y}));}
(async()=>{
 const mod=await load(path.join(root,'js/ui/plan2d.js'));await mod.evaluate();const plan=mod.namespace,moves=[];
 const data={tent:{id:'pole-20x30',name:'20×30 Pole Tent',type:'pole',widthFt:20,lengthFt:30,centerPoles:[{x:10,y:15}]},photoSite:{widthFt:80,lengthFt:60},backgroundPhoto:{url:'https://example.test/photo'},photoTentPlacement:{x:30,y:10,rotationDeg:90},lightingId:'lighting-bistro',lightingOn:true,anchoringMethod:'stake',sidewalls:[{side:'front',startFt:0,lengthFt:10,type:'window'}],objects:[{id:'table',kind:'table',tableId:'banquet-6ft',widthFt:6,depthFt:3,x:2,y:3,seatCount:4},{id:'a',kind:'dance',widthFt:3,depthFt:3,x:0,y:0,photoPlacement:{x:10,y:40}},{id:'b',kind:'dance',widthFt:3,depthFt:3,x:3,y:0,photoPlacement:{x:13,y:40}}]};
 const before=JSON.stringify(data);plan.mount(host,data,{onMove:(...args)=>moves.push(args)});plan.update(data);
 const stage=host.querySelector('.plan2d-stage'),scale=number(stage,'width')/80;
 assert.equal(stage.dataset.dimensions,'80 × 60 ft');
 let layer=host.querySelector('.plan2d-tent-layer');near(number(layer,'left'),30*scale);near(number(layer,'top'),10*scale);assert.equal(layer.style.transform,'rotate(90deg)');
 for(const selector of ['.plan-tent-footprint','.plan2d-pole','.plan2d-sidewall-layer','.plan2d-lighting-layer','.plan2d-anchor-stake'])assert.ok(layer.querySelector(selector),selector+' stays attached to transformed tent');
 let table=host.querySelector('[data-item-id="table"]');near(number(table,'left'),47.5*scale);near(number(table,'top'),18.5*scale);assert.equal(table.style.transform,'rotate(90deg)');assert.equal(host.querySelectorAll('[data-chair-for="table"]').length,4);
 pointer(table,'pointerdown',200,200);pointer(w,'pointermove',200+2*scale,200+3*scale);pointer(w,'pointerup',200+2*scale,200+3*scale);assert.equal(moves.length,1);assert.equal(moves[0][0],'table');near(moves[0][1],49.5);near(moves[0][2],21.5);
 plan.update(data);const dance=host.querySelector('[data-item-id="a"]');pointer(dance,'pointerdown',200,200);pointer(w,'pointermove',200+2*scale,200+3*scale);near(number(host.querySelector('[data-item-id="a"]'),'left'),12*scale);near(number(host.querySelector('[data-item-id="b"]'),'left'),15*scale);pointer(w,'pointerup',200+2*scale,200+3*scale);assert.equal(moves.length,2);assert.equal(moves[1][0],'a');near(moves[1][1],12);near(moves[1][2],43);
 // Portrait presentation swaps display axes without moving a rental in world space.
 width=390;height=844;plan.update(data);const phoneScale=number(stage,'width')/60;layer=host.querySelector('.plan2d-tent-layer');assert.equal(layer.style.transform,'rotate(-90deg)');near(number(layer,'left'),10*phoneScale);near(number(layer,'top'),30*phoneScale);
 table=host.querySelector('[data-item-id="table"]');near(number(table,'left'),18.5*phoneScale);near(number(table,'top'),47.5*phoneScale);
 pointer(table,'pointerdown',100,100);pointer(w,'pointermove',100+phoneScale,100+2*phoneScale);pointer(w,'pointercancel',100+phoneScale,100+2*phoneScale);assert.equal(moves.length,2,'cancel never commits a move');near(number(host.querySelector('[data-item-id="table"]'),'left'),18.5*phoneScale);
 assert.equal(JSON.stringify(data),before,'render and drag never mutate the saved snapshot');plan.unmount();w.close();console.log('PASS photo site plan: world positions, transformed tent/poles/walls/lights/anchors, seating, dance group drag, mobile axis swap, cancellation, non-mutating snapshots');
})().catch(e=>{console.error(e);w.close();process.exitCode=1;});
