const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),root=path.resolve(__dirname,'..');
(async()=>{
 const dom=new JSDOM('<div id="plan"></div>',{pretendToBeVisual:true,runScripts:'outside-only'}),w=dom.window,host=w.document.getElementById('plan');
 let width=1200,height=800;Object.defineProperties(host,{clientWidth:{get:()=>width},clientHeight:{get:()=>height}});w.ResizeObserver=class{observe(){}disconnect(){}};
 const context=dom.getInternalVMContext(),cache=new Map();
 function moduleFor(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});cache.set(file,m);return m;}
 const mod=moduleFor(path.join(root,'js/ui/plan2d.js'));await mod.link((s,ref)=>moduleFor(path.resolve(path.dirname(ref.identifier),s)));await mod.evaluate();
 const tabletop=cache.get(path.join(root,'js/data/tabletop.js')).namespace;tabletop.TABLETOP.push({id:'fixture-plate',name:'Dinner Plate',type:'plate',perSeat:true});
 const chair=cache.get(path.join(root,'js/data/chairs.js')).namespace.byId('crossback-natural');
 const positions=cache.get(path.join(root,'js/core/seating.js')).namespace.chairPositions;
 const template={tent:{id:'site',isSite:true,widthFt:40,lengthFt:20},objects:[],selectedId:'sweet'};
 const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
 for(const mobile of [false,true])for(const rotationDeg of [0,90,180,270]){
  width=mobile?390:1200;height=mobile?844:800;const turned=rotationDeg%180!==0;
  const item={id:'sweet',kind:'table',tableId:'sweetheart-half-round-60',shape:'half-round',widthFt:turned?2.5:5,depthFt:turned?5:2.5,modelWidthFt:5,modelDepthFt:2.5,footprintOriented:true,x:8,y:6,rotationDeg,seatCount:2,chairId:chair.id,tabletop:[{productId:'fixture-plate',qty:1,perSeat:true}]};
  const data={...template,objects:[item]},before=JSON.stringify(data);if(!host.children.length)mod.namespace.mount(host,data,{});mod.namespace.update(data);
  const stage=host.querySelector('.plan2d-stage'),scale=parseFloat(stage.style.width)/(mobile?20:40),wrap=host.querySelector('[data-item-id="sweet"]');
  near(parseFloat(wrap.style.width),(mobile?2.5:5)*scale);near(parseFloat(wrap.style.height),(mobile?5:2.5)*scale);assert.equal(wrap.style.transform,`rotate(${(mobile?-1:1)*rotationDeg}deg)`);
  assert.equal(wrap.classList.contains('plan2d-half-round--axis-swapped'),mobile);assert.equal(wrap.dataset.dimensionsEstimated,'true');assert.match(wrap.getAttribute('aria-label'),/approximate dimensions/);
  const actual=[...host.querySelectorAll('[data-chair-for="sweet"]')],expected=positions(item,chair);assert.equal(actual.length,2);
  for(let i=0;i<2;i++){near(Number(actual[i].dataset.modelX),item.x+item.widthFt/2+expected[i].x);near(Number(actual[i].dataset.modelY),item.y+item.depthFt/2+expected[i].y);assert.ok(actual[i].classList.contains('plan2d-chair--crossback'));}
  const svg=wrap.querySelector('.tabletop-overlay');assert.equal(svg.getAttribute('viewBox'),mobile?'-1.25 -2.5 2.5 5':'-2.5 -1.25 5 2.5','nested place settings keep local dimensions, not the rotated footprint');
  const plateGroups=[...svg.querySelectorAll('g[transform^="translate"]')];assert.equal(plateGroups.length,2);
  for(const plate of plateGroups){assert.match(plate.getAttribute('transform'),/rotate\(-90\)/,'settings remain table-local before the wrapper rotates');const y=Number(plate.getAttribute('transform').match(/^translate\([^ ]+ ([^)]+)/)[1]);assert.ok(y<0,'settings stay by the straight edge');}
  assert.equal(JSON.stringify(data),before,'plan rendering preserves saved product identity, pose and geometry');
 }
 mod.namespace.unmount();w.close();console.log('PASS furniture plan: D-shaped local footprint, two straight-edge crossback seats, all quarter turns, mobile presentation axis swap, single tabletop rotation, estimated-dimension labels, immutable snapshots.');
})().catch(e=>{console.error(e);process.exitCode=1;});
