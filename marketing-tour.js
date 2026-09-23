import { marketingReception, marketingWeddingBuildStages } from './js/data/marketing-reception.js';

// Public, read-only marketing example. The automatic homepage sequence is a
// lightweight SVG visualization derived from the same RentSketch scene data.
// The real Three.js scene loads only after an explicit interactive-3D request.
const studio=document.querySelector('[data-tour]');
if(studio){
 const target=studio.querySelector('.tour-3d'),status=studio.querySelector('.tour-status');
 const note=studio.querySelector('.tour-note'),poster=studio.querySelector('.tour-poster');
 const plan=studio.querySelector('.plan-img'),actions=studio.querySelector('.tour-actions');
 const buttons=[...studio.querySelectorAll('[data-view]')];
 const cinematic=!!studio.closest('.homepage-hero');
 const stages=cinematic?marketingWeddingBuildStages():[];
 const weddingScene=cinematic?marketingReception():null;
 let view=null,pendingView=null,loading=null,selected='3d',camera='reception',night=false,failed=false,disposed=false,generation=0;
 let buildGeneration=0,buildRunning=false,buildStopped=false,buildHud=null,buildPlan=null,buildTimer=0;
 const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const autoLoad=studio.classList.contains('demo-studio');

 function say(message){status.textContent=message;status.hidden=!message;}

 function svgNode(name,attrs={}){
  const node=document.createElementNS('http://www.w3.org/2000/svg',name);
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
  return node;
 }

 // Rotate the 40x60 planning coordinates into a 60x40 landscape drawing.
 function mapPoint(x,y){return [y,40-x];}
 function rectForObject(o){
  return {x:o.y,y:40-(o.x+o.widthFt),width:o.depthFt,height:o.widthFt};
 }
 function objectCenter(o){return mapPoint(o.x+o.widthFt/2,o.y+o.depthFt/2);}

 function layer(svg,key,threshold){
  const g=svgNode('g',{'data-build-layer':key,'data-threshold':threshold});
  svg.appendChild(g);return g;
 }

 function makeWeddingPlan(){
  const svg=svgNode('svg',{
   class:'wedding-build-plan',
   viewBox:'0 0 60 40',
   preserveAspectRatio:'xMidYMid slice',
   role:'img',
   'aria-label':'Animated overhead wedding layout building from an empty tent to a complete reception'
  });
  const defs=svgNode('defs');
  const pattern=svgNode('pattern',{id:'wedding-grid',width:'3',height:'3',patternUnits:'userSpaceOnUse'});
  pattern.appendChild(svgNode('path',{d:'M3 0H0V3',fill:'none',stroke:'#78926f','stroke-width':'.08',opacity:'.28'}));
  defs.appendChild(pattern);
  svg.appendChild(defs);

  const base=svgNode('g',{class:'wedding-build-base'});
  base.appendChild(svgNode('rect',{x:0,y:0,width:60,height:40,fill:'#e8f1df'}));
  base.appendChild(svgNode('rect',{x:0,y:0,width:60,height:40,fill:'url(#wedding-grid)'}));
  svg.appendChild(base);

  const tentLayer=layer(svg,'tent',1);
  tentLayer.appendChild(svgNode('rect',{x:.6,y:.6,width:58.8,height:38.8,rx:1.1,fill:'#fffdf8',stroke:'#708969','stroke-width':'.34'}));
  tentLayer.appendChild(svgNode('line',{x1:1.2,y1:20,x2:58.8,y2:20,stroke:'#a9b9a2','stroke-width':'.13','stroke-dasharray':'.8 .7'}));
  for(const pole of weddingScene.tent.centerPoles||[]){
   const [cx,cy]=mapPoint(pole.x,pole.y);
   tentLayer.appendChild(svgNode('circle',{cx,cy,r:.38,fill:'#566d50',stroke:'#fff','stroke-width':'.14'}));
  }

  const tableLayer=layer(svg,'tables',2);
  const chairLayer=layer(svg,'chairs',3);
  const serviceLayer=layer(svg,'service',4);
  const danceLayer=layer(svg,'dance',5);
  const styleLayer=layer(svg,'style',6);
  const lightingLayer=layer(svg,'lighting',7);

  const guestTables=weddingScene.objects.filter(o=>o.id?.startsWith('wedding-table-'));
  guestTables.forEach((o,index)=>{
   const [cx,cy]=objectCenter(o);
   const item=svgNode('g',{'data-layout-item':o.id,class:'wedding-plan-item'});
   item.appendChild(svgNode('circle',{cx,cy,r:2.5,fill:index%2?'#fbf7ee':'#fffaf1',stroke:'#9b9d91','stroke-width':'.22'}));
   tableLayer.appendChild(item);
   for(let seat=0;seat<8;seat++){
    const angle=(Math.PI*2*seat/8)-Math.PI/2;
    const x=cx+Math.cos(angle)*3.4,y=cy+Math.sin(angle)*3.4;
    chairLayer.appendChild(svgNode('rect',{
     x:x-.43,y:y-.29,width:.86,height:.58,rx:.14,
     fill:'#d8b85d',stroke:'#8e7b43','stroke-width':'.09',
     transform:`rotate(${seat*45} ${x} ${y})`
    }));
   }
   styleLayer.appendChild(svgNode('circle',{cx,cy,r:.44,fill:'#6c8d54',stroke:'#f8f0d8','stroke-width':'.16'}));
   styleLayer.appendChild(svgNode('circle',{cx,cy,r:.15,fill:'#f6d58b'}));
  });

  const service=weddingScene.objects.filter(o=>o.kind==='table'&&!o.id?.startsWith('wedding-table-'));
  service.forEach(o=>{
   const [cx,cy]=objectCenter(o);
   if(o.shape==='round'||o.tableId==='cocktail'){
    serviceLayer.appendChild(svgNode('circle',{cx,cy,r:Math.max(.9,o.widthFt/2),fill:'#f7f1df',stroke:'#788a91','stroke-width':'.2'}));
   }else{
    const r=rectForObject(o);
    serviceLayer.appendChild(svgNode('rect',{x:r.x,y:r.y,width:r.width,height:r.height,rx:.35,fill:o.id==='wedding-bar'?'#263746':'#f8f3e8',stroke:'#77888f','stroke-width':'.2'}));
   }
  });

  weddingScene.objects.filter(o=>o.kind==='dance').forEach(o=>{
   const r=rectForObject(o);
   danceLayer.appendChild(svgNode('rect',{x:r.x,y:r.y,width:r.width,height:r.height,fill:'#d1aa77',stroke:'#a27b50','stroke-width':'.08'}));
  });

  for(const x of [7,17,27,37,47,57]){
   lightingLayer.appendChild(svgNode('path',{d:`M${x} 2 C${x-2} 12 ${x+2} 28 ${x} 38`,fill:'none',stroke:'#8a6d42','stroke-width':'.12',opacity:.78}));
   for(const y of [6,12,18,24,30,36])lightingLayer.appendChild(svgNode('circle',{cx:x,cy:y,r:.17,fill:'#ffd77b',stroke:'#fff4c8','stroke-width':'.08'}));
  }

  return svg;
 }

 function ensureBuildUi(){
  if(!cinematic||buildHud)return;
  const viewBox=studio.querySelector('.tour-view');
  buildPlan=makeWeddingPlan();
  buildHud=document.createElement('div');
  buildHud.className='wedding-build-hud';
  buildHud.innerHTML='<div class="wedding-build-copy"><span class="wedding-build-kicker">Watch RentSketch build the wedding</span><strong data-build-label>Empty event space</strong><small data-build-detail>Start with the footprint</small></div><div class="wedding-build-progress" aria-hidden="true"><span></span></div><div class="wedding-build-buttons"><button type="button" class="wedding-replay">Replay</button><button type="button" class="wedding-explore">Explore interactive 3D</button></div>';
  viewBox.append(buildPlan,buildHud);

  buildHud.querySelector('.wedding-replay').addEventListener('click',event=>{
   event.preventDefault();event.stopPropagation();
   if(view)return;
   selected='3d';buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view==='3d')));
   show();startWeddingBuild(true);
  });
  buildHud.querySelector('.wedding-explore').addEventListener('click',event=>{
   event.preventDefault();event.stopPropagation();
   stopWeddingBuild();
   selected='3d';buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view==='3d')));
   ensure3D();
  });
 }

 function updateBuildHud(stage,index){
  if(!buildHud)return;
  buildHud.querySelector('[data-build-label]').textContent=stage.label;
  buildHud.querySelector('[data-build-detail]').textContent=stage.detail;
  buildHud.querySelector('.wedding-build-progress span').style.width=((index+1)/stages.length*100)+'%';
  buildHud.dataset.stage=stage.key;
 }

 function applyLightweightStage(stage,index){
  ensureBuildUi();
  updateBuildHud(stage,index);
  if(!buildPlan)return;
  buildPlan.dataset.stage=stage.key;
  buildPlan.querySelectorAll('[data-build-layer]').forEach(node=>{
   const threshold=Number(node.getAttribute('data-threshold')||0);
   node.classList.toggle('is-visible',index>=threshold);
  });
  const finished=['reception','evening'].includes(stage.key);
  buildPlan.classList.toggle('is-finished',finished);
  studio.classList.toggle('wedding-evening',stage.key==='evening');
 }

 function wait(ms,ticket){
  return new Promise(resolve=>{
   clearTimeout(buildTimer);
   buildTimer=setTimeout(()=>resolve(!disposed&&ticket===buildGeneration),ms);
  });
 }

 function stopWeddingBuild(){
  if(!cinematic)return;
  buildStopped=true;buildRunning=false;buildGeneration++;clearTimeout(buildTimer);
  studio.classList.remove('wedding-building','wedding-resetting');
  if(buildHud)buildHud.querySelector('.wedding-replay').hidden=false;
  show();
 }

 async function startWeddingBuild(force=false){
  if(!cinematic||reducedMotion||disposed||selected!=='3d'||view)return;
  if(buildRunning&&!force)return;
  const ticket=++buildGeneration;
  buildStopped=false;buildRunning=true;
  ensureBuildUi();
  studio.classList.add('wedding-building');
  buildHud.querySelector('.wedding-replay').hidden=true;
  buildPlan.hidden=false;
  buildPlan.classList.remove('is-finished');
  studio.classList.remove('wedding-evening');

  const dwell={space:700,tent:1000,tables:900,chairs:900,sweetheart:900,dance:900,style:900,lighting:1050,reception:1200,evening:1600};
  for(let index=0;index<stages.length;index++){
   if(ticket!==buildGeneration||buildStopped||disposed||selected!=='3d'||view)return;
   const stage=stages[index];
   applyLightweightStage(stage,index);
   const ok=await wait(dwell[stage.key]||850,ticket);
   if(!ok)return;
  }

  if(ticket!==buildGeneration||buildStopped||disposed)return;
  buildRunning=false;studio.classList.remove('wedding-building');
  buildHud.querySelector('.wedding-replay').hidden=false;
  applyLightweightStage(stages[stages.length-1],stages.length-1);
  show();
 }

 function show(){
  const is3D=selected==='3d';
  if(cinematic&&!view){
   plan.hidden=is3D;
   poster.hidden=!is3D;
   target.classList.remove('active');
   target.setAttribute('aria-hidden','true');
   actions.hidden=true;
   if(buildPlan)buildPlan.hidden=!is3D||reducedMotion;
   if(buildHud)buildHud.hidden=!is3D;
  }else{
   plan.hidden=is3D;
   poster.hidden=!is3D||!!view;
   target.classList.toggle('active',is3D&&!!view);
   target.setAttribute('aria-hidden',String(!is3D||!view));
   actions.hidden=!is3D||!view;
  }
  buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===selected)));
  if(cinematic&&!view&&!failed){
   note.textContent=reducedMotion?'Complete wedding reception preview':buildRunning?'Building the wedding…':'Wedding reception preview · choose interactive 3D to explore';
  }else{
   note.textContent=is3D?(view?'Drag to explore · scroll or pinch to zoom':(autoLoad?'3D reception preview':'3D preview image · choose 3D view to explore')):'Overhead plan · the same reception layout';
  }
  if(!is3D||view)say('');
  else if(failed)say('Showing the 3D preview image. Interactive 3D is unavailable in this browser.');
 }

 async function load(){
  const ticket=++generation;failed=false;
  if(cinematic)say('Opening the interactive 3D reception…');
  else say('Opening the interactive 3D reception…');
  try{
   const renderer=await import('/js/ui/view3d.js');
   if(disposed||ticket!==generation)return;
   target.classList.add('active');target.style.visibility='hidden';
   const next=renderer.init(target,{registerActive:false});pendingView=next;
   try{
    next.rebuild(marketingReception());
    next.setScene({motion:false,guests:cinematic,styling:true,night:cinematic});
    if(cinematic)next.reception();else next.fitCamera();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(disposed||ticket!==generation){if(pendingView===next){next.destroy();pendingView=null;}return;}
    view=next;pendingView=null;target.style.visibility='';
    if(buildPlan)buildPlan.hidden=true;
    if(buildHud)buildHud.hidden=true;
    show();
    if(!cinematic&&!reducedMotion&&selected==='3d')view.playTimelapse();
   }catch(error){if(pendingView===next){next.destroy();pendingView=null;}throw error;}
  }catch(error){
   if(disposed||ticket!==generation)return;
   view=null;failed=true;target.style.visibility='';target.classList.remove('active');
   if(cinematic){ensureBuildUi();applyLightweightStage(stages[stages.length-1],stages.length-1);}
   show();
  }finally{if(ticket===generation)loading=null;}
 }

 function ensure3D(){if(!disposed&&selected==='3d'&&!view&&!loading)loading=load();}

 buttons.forEach(button=>button.addEventListener('click',()=>{
  if(cinematic)stopWeddingBuild();
  selected=button.dataset.view;show();
  if(selected==='3d'){
   // On the homepage, an explicit 3D-button click means "make it interactive".
   ensure3D();
   if(view){if(camera==='reception')view.reception();else view.fitCamera();}
  }
 }));

 studio.querySelectorAll('[data-camera]').forEach(button=>button.addEventListener('click',()=>{
  camera=button.dataset.camera;
  studio.querySelectorAll('[data-camera]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
  if(camera==='reception'){
   if(view?.transitionCamera)view.transitionCamera('reception',800);else view?.reception();
  }else{
   if(view?.transitionCamera)view.transitionCamera('outside',800);else view?.fitCamera();
  }
 }));

 studio.querySelector('[data-night]').addEventListener('click',event=>{
  night=!night;event.currentTarget.setAttribute('aria-pressed',String(night));view?.night(night);
 });

 show();

 if(cinematic){
  ensureBuildUi();
  if(reducedMotion){
   applyLightweightStage(stages[stages.length-1],stages.length-1);
   if(buildPlan)buildPlan.hidden=true;
   if(buildHud){buildHud.querySelector('.wedding-replay').hidden=true;buildHud.dataset.stage='evening';}
   show();
  }else if('IntersectionObserver' in window){
   const observer=new IntersectionObserver(entries=>{
    if(entries.some(e=>e.isIntersecting)){observer.disconnect();startWeddingBuild();}
   },{rootMargin:'80px'});
   observer.observe(studio);
  }else startWeddingBuild();
 }else if(autoLoad){
  const start=()=>{
   const run=()=>ensure3D();
   if('requestIdleCallback' in window)requestIdleCallback(run,{timeout:1200});else run();
  };
  if('IntersectionObserver' in window){
   const observer=new IntersectionObserver(entries=>{
    if(entries.some(e=>e.isIntersecting)){observer.disconnect();start();}
   },{rootMargin:'220px'});
   observer.observe(studio);
  }else start();
 }

 window.addEventListener('pagehide',()=>{
  disposed=true;generation++;buildGeneration++;clearTimeout(buildTimer);
  view?.destroy();pendingView?.destroy();view=null;pendingView=null;loading=null;
 });
 window.addEventListener('pageshow',event=>{
  if(event.persisted){
   disposed=false;show();
   if(cinematic&&!reducedMotion&&!view)startWeddingBuild();
   else if(autoLoad)ensure3D();
  }
 });
}
