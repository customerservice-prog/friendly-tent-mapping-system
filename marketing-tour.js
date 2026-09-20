import { marketingReception } from './js/data/marketing-reception.js';

// Public, read-only example. Never opens a preview entitlement or customer data.
const studio=document.querySelector('[data-tour]');
if(studio){
 const target=studio.querySelector('.tour-3d'),status=studio.querySelector('.tour-status');
 const note=studio.querySelector('.tour-note'),poster=studio.querySelector('.tour-poster');
 const plan=studio.querySelector('.plan-img'),actions=studio.querySelector('.tour-actions');
 const buttons=[...studio.querySelectorAll('[data-view]')];
 let view=null,pendingView=null,loading=null,selected='3d',camera='reception',night=false,failed=false,disposed=false,generation=0;
 const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 function say(message){status.textContent=message;status.hidden=!message;note.hidden=!!message;}
 function show(){
  const is3D=selected==='3d';
  plan.hidden=is3D;poster.hidden=!is3D||!!view;
  target.classList.toggle('active',is3D&&!!view);
  target.setAttribute('aria-hidden',String(!is3D||!view));
  actions.hidden=!is3D||!view;
  buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===selected)));
  note.textContent=is3D?(view?'Drag to explore · scroll or pinch to zoom':'3D reception preview'):'Overhead plan · the same 64-seat layout';
  if(!is3D||view)say('');
  else if(failed)say('Showing the 3D preview image. Interactive 3D is unavailable in this browser.');
 }
 async function load(){
  const ticket=++generation;failed=false;say('Opening the interactive 3D reception…');
  try{
   const renderer=await import('/js/ui/view3d.js');
   if(disposed||ticket!==generation)return;
   // Establish a real viewport before creating/fitting the renderer. The poster
   // remains visible until the first scene frame is ready.
   target.classList.add('active');target.style.visibility='hidden';
   const next=renderer.init(target);pendingView=next;
   try{
    next.rebuild(marketingReception());
    next.setScene({motion:false,guests:false,styling:true,night});
    if(camera==='reception')next.reception();else next.fitCamera();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(disposed||ticket!==generation){if(pendingView===next){next.destroy();pendingView=null;}return;}
    view=next;pendingView=null;target.style.visibility='';show();
    if(!reducedMotion&&selected==='3d')view.playTimelapse();
   }catch(error){if(pendingView===next){next.destroy();pendingView=null;}throw error;}
  }catch(error){
   if(disposed||ticket!==generation)return;
   view=null;failed=true;target.style.visibility='';target.classList.remove('active');show();
  }finally{if(ticket===generation)loading=null;}
 }
 function ensure3D(){if(!disposed&&selected==='3d'&&!view&&!loading)loading=load();}
 buttons.forEach(button=>button.addEventListener('click',()=>{
  selected=button.dataset.view;show();if(selected==='3d'){ensure3D();if(view){if(camera==='reception')view.reception();else view.fitCamera();}}
 }));
 studio.querySelectorAll('[data-camera]').forEach(button=>button.addEventListener('click',()=>{
  camera=button.dataset.camera;
  studio.querySelectorAll('[data-camera]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
  if(camera==='reception')view?.reception();else view?.fitCamera();
 }));
 studio.querySelector('[data-night]').addEventListener('click',event=>{
  night=!night;event.currentTarget.setAttribute('aria-pressed',String(night));view?.night(night);
 });
 show();
 // Load automatically near the viewport after the first paint. No start click.
 if('IntersectionObserver' in window){
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();requestAnimationFrame(ensure3D);}},{rootMargin:'220px'});
  observer.observe(studio);
 }else requestAnimationFrame(ensure3D);
 window.addEventListener('pagehide',()=>{disposed=true;generation++;view?.destroy();pendingView?.destroy();view=null;pendingView=null;loading=null;});
 window.addEventListener('pageshow',event=>{if(event.persisted){disposed=false;show();ensure3D();}});
}
