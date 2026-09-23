import { marketingReception, marketingWeddingBuildStages } from './js/data/marketing-reception.js';

// Public, read-only marketing example. Never opens a preview entitlement,
// writes customer data, creates orders, saves designs or submits quote requests.
const studio=document.querySelector('[data-tour]');
if(studio){
 const target=studio.querySelector('.tour-3d'),status=studio.querySelector('.tour-status');
 const note=studio.querySelector('.tour-note'),poster=studio.querySelector('.tour-poster');
 const plan=studio.querySelector('.plan-img'),actions=studio.querySelector('.tour-actions');
 const buttons=[...studio.querySelectorAll('[data-view]')];
 const cinematic=!!studio.closest('.homepage-hero');
 const stages=cinematic?marketingWeddingBuildStages():[];
 let view=null,pendingView=null,loading=null,selected='3d',camera='reception',night=false,failed=false,disposed=false,generation=0;
 let buildGeneration=0,buildRunning=false,buildStopped=false,buildHud=null,buildCurtain=null;
 const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const autoLoad=studio.classList.contains('demo-studio')||(cinematic&&!reducedMotion);

 function say(message){status.textContent=message;status.hidden=!message;note.hidden=!!message;}
 function show(){
  const is3D=selected==='3d';
  plan.hidden=is3D;poster.hidden=!is3D||!!view;
  target.classList.toggle('active',is3D&&!!view);
  target.setAttribute('aria-hidden',String(!is3D||!view));
  actions.hidden=!is3D||!view;
  buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===selected)));
  if(cinematic&&!view&&!failed)note.textContent=reducedMotion?'Complete wedding reception preview':'Wedding build loads after the first frame';
  else note.textContent=is3D?(view?(buildRunning?'Building the wedding…':'Drag to explore · scroll or pinch to zoom'):(autoLoad?'3D reception preview':'3D preview image · choose 3D view to explore')):'Overhead plan · the same reception layout';
  if(!is3D||view)say('');
  else if(failed)say('Showing the 3D preview image. Interactive 3D is unavailable in this browser.');
 }

 function ensureBuildUi(){
  if(!cinematic||buildHud)return;
  const viewBox=studio.querySelector('.tour-view');
  buildHud=document.createElement('div');
  buildHud.className='wedding-build-hud';
  buildHud.innerHTML='<div class="wedding-build-copy"><span class="wedding-build-kicker">Watch RentSketch build the wedding</span><strong data-build-label>Empty event space</strong><small data-build-detail>Start with the footprint</small></div><div class="wedding-build-progress" aria-hidden="true"><span></span></div><button type="button" class="wedding-replay">Replay build</button>';
  buildCurtain=document.createElement('div');
  buildCurtain.className='wedding-build-curtain';
  buildCurtain.innerHTML='<span>Empty event space</span>';
  viewBox.append(buildCurtain,buildHud);
  buildHud.querySelector('.wedding-replay').addEventListener('click',event=>{
   event.preventDefault();event.stopPropagation();
   buildStopped=false;startWeddingBuild(true);
  });
 }

 function updateBuildHud(stage,index){
  if(!buildHud)return;
  buildHud.querySelector('[data-build-label]').textContent=stage.label;
  buildHud.querySelector('[data-build-detail]').textContent=stage.detail;
  buildHud.querySelector('.wedding-build-progress span').style.width=((index+1)/stages.length*100)+'%';
  buildHud.dataset.stage=stage.key;
 }

 function pause(ms,ticket){
  return new Promise(resolve=>{
   const started=performance.now();
   function wait(now){
    if(disposed||ticket!==buildGeneration)return resolve(false);
    if(document.hidden){requestAnimationFrame(wait);return;}
    if(now-started>=ms)return resolve(true);
    requestAnimationFrame(wait);
   }
   requestAnimationFrame(wait);
  });
 }

 function stopWeddingBuild(){
  if(!cinematic)return;
  buildStopped=true;buildRunning=false;buildGeneration++;
  studio.classList.remove('wedding-building','wedding-resetting');
  if(buildHud)buildHud.querySelector('.wedding-replay').hidden=false;
  show();
 }

 async function startWeddingBuild(force=false){
  if(!cinematic||!view||reducedMotion||disposed||selected!=='3d')return;
  if(buildRunning&&!force)return;
  buildGeneration++;const ticket=buildGeneration;
  buildStopped=false;buildRunning=true;
  ensureBuildUi();
  studio.classList.add('wedding-building');
  studio.classList.remove('wedding-resetting');
  buildHud.querySelector('.wedding-replay').hidden=true;

  buildCurtain.classList.add('is-visible');
  buildCurtain.querySelector('span').textContent='Empty event space';
  updateBuildHud(stages[0],0);
  await pause(850,ticket);
  if(ticket!==buildGeneration)return;

  for(let index=1;index<stages.length;index++){
   if(ticket!==buildGeneration||buildStopped||disposed||selected!=='3d')return;
   const stage=stages[index];
   updateBuildHud(stage,index);
   view.rebuild(stage.scene);
   view.setScene({
    motion:stage.key==='evening',
    guests:stage.key==='evening',
    styling:stage.styling,
    night:stage.night
   });

   if(index===1){
    view.fitCamera();
    buildCurtain.classList.remove('is-visible');
    view.playTimelapse();
   }else if(stage.cameraTransition){
    view.transitionCamera(stage.camera||'reception',1450);
   }else if(stage.camera==='outside'){
    view.fitCamera();
   }else if(stage.camera==='reception'&&index<stages.length-1){
    view.reception();
   }

   if(stage.animate?.length)view.playItemTimelapse(stage.animate,index===2||index===3?820:680);

   const dwell={
    tent:1850,
    tables:1450,
    chairs:1450,
    sweetheart:1250,
    dance:1250,
    style:1250,
    lighting:1250,
    reception:1800,
    evening:2800
   }[stage.key]||1200;
   const ok=await pause(dwell,ticket);
   if(!ok)return;
  }

  if(ticket!==buildGeneration||buildStopped||disposed)return;
  buildRunning=false;
  studio.classList.remove('wedding-building');
  buildHud.querySelector('.wedding-replay').hidden=false;
  show();

  const held=await pause(2600,ticket);
  if(!held||buildStopped||disposed||selected!=='3d')return;
  studio.classList.add('wedding-resetting');
  buildCurtain.querySelector('span').textContent='Building the next reception…';
  buildCurtain.classList.add('is-visible');
  await pause(650,ticket);
  if(ticket!==buildGeneration||buildStopped||disposed)return;
  studio.classList.remove('wedding-resetting');
  startWeddingBuild();
 }

 async function load(){
  const ticket=++generation;failed=false;
  if(!cinematic)say('Opening the interactive 3D reception…');
  try{
   const renderer=await import('/js/ui/view3d.js');
   if(disposed||ticket!==generation)return;
   target.classList.add('active');target.style.visibility='hidden';
   const next=renderer.init(target,{registerActive:false});pendingView=next;
   try{
    const first=cinematic?stages[0].scene:marketingReception();
    next.rebuild(first);
    next.setScene({motion:false,guests:false,styling:!cinematic,night:false});
    next.fitCamera();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(disposed||ticket!==generation){if(pendingView===next){next.destroy();pendingView=null;}return;}
    view=next;pendingView=null;target.style.visibility='';
    ensureBuildUi();show();
    if(cinematic)startWeddingBuild();
    else if(!reducedMotion&&selected==='3d')view.playTimelapse();
   }catch(error){if(pendingView===next){next.destroy();pendingView=null;}throw error;}
  }catch(error){
   if(disposed||ticket!==generation)return;
   view=null;failed=true;target.style.visibility='';target.classList.remove('active');show();
  }finally{if(ticket===generation)loading=null;}
 }

 function ensure3D(){if(!disposed&&selected==='3d'&&!view&&!loading)loading=load();}

 buttons.forEach(button=>button.addEventListener('click',()=>{
  if(cinematic)stopWeddingBuild();
  selected=button.dataset.view;show();
  if(selected==='3d'){
   ensure3D();
   if(view){if(camera==='reception')view.reception();else view.fitCamera();}
  }
 }));

 studio.querySelectorAll('[data-camera]').forEach(button=>button.addEventListener('click',()=>{
  if(cinematic)stopWeddingBuild();
  camera=button.dataset.camera;
  studio.querySelectorAll('[data-camera]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
  if(camera==='reception')view?.transitionCamera?.('reception',800)||view?.reception();else view?.transitionCamera?.('outside',800)||view?.fitCamera();
 }));

 studio.querySelector('[data-night]').addEventListener('click',event=>{
  if(cinematic)stopWeddingBuild();
  night=!night;event.currentTarget.setAttribute('aria-pressed',String(night));view?.night(night);
 });

 if(cinematic){
  target.addEventListener('pointerdown',stopWeddingBuild,{capture:true});
  target.addEventListener('wheel',stopWeddingBuild,{capture:true,passive:true});
 }

 show();

 if(autoLoad){
  const start=()=>{
   const run=()=>ensure3D();
   if('requestIdleCallback' in window)requestIdleCallback(run,{timeout:1200});
   else setTimeout(run,cinematic?650:0);
  };
  if('IntersectionObserver' in window){
   const observer=new IntersectionObserver(entries=>{
    if(entries.some(e=>e.isIntersecting)){observer.disconnect();start();}
   },{rootMargin:cinematic?'80px':'220px'});
   observer.observe(studio);
  }else start();
 }

 window.addEventListener('pagehide',()=>{
  disposed=true;generation++;buildGeneration++;
  view?.destroy();pendingView?.destroy();view=null;pendingView=null;loading=null;
 });
 window.addEventListener('pageshow',event=>{
  if(event.persisted){disposed=false;show();if(autoLoad)ensure3D();}
 });
}
