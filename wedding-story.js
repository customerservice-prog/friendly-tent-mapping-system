import { marketingReception } from './js/data/marketing-reception.js';
import { drawMarketingPlan } from './js/ui/marketing-plan.js';

// A presentation-only sample. No API call, order, entitlement, quote or save.
const scene=marketingReception();
const labels=[
  [0,'An empty venue'],[.045,'Measure the tent footprint'],[.12,'Raise the tent structure'],
  [.26,'Arrange eight guest tables'],[.39,'Seat the guests'],[.45,'Place the sweetheart table'],
  [.49,'Lay the dance floor'],[.57,'Set the DJ'],[.62,'Build the bar'],
  [.65,'Prepare the buffet'],[.69,'Add cocktail tables'],[.74,'Dress the tables'],
  [.79,'Place the centerpieces'],[.86,'String the lights'],[.92,'Step inside the reception']
];
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const mobile=matchMedia('(max-width: 760px)');
const duration=17500;

document.querySelectorAll('[data-wedding-story]').forEach(studio=>{
  const poster=studio.querySelector('.tour-poster');
  const canvas=studio.querySelector('.story-canvas');
  const target=studio.querySelector('.tour-3d');
  const label=studio.querySelector('[data-story-label]');
  const count=studio.querySelector('[data-story-count]');
  const meter=studio.querySelector('[data-story-progress]');
  const scrub=studio.querySelector('[data-story-scrub]');
  const replay=studio.querySelector('[data-story-replay]');
  const pause=studio.querySelector('[data-story-pause]');
  const controls=studio.querySelector('.tour-actions');
  const cameraButtons=[...studio.querySelectorAll('[data-camera]')];
  const modeButtons=[...studio.querySelectorAll('[data-view]')];
  const dimmer=studio.querySelector('.story-reset');
  let view=null,pending=null,loaded=false,failed=false,disposed=false,playing=false,visible=false;
  let progress=reduce.matches?1:0,frame=0,last=0,hold=0,selected='3d',night=false;
  const draw=()=>{
    // Limit the phone canvas to 1.5 device pixels for predictable GPU memory.
    const dpr=Math.min(devicePixelRatio||1,1.5),w=Math.round(canvas.clientWidth*dpr),h=Math.round(canvas.clientHeight*dpr);
    if(w>0&&h>0&&(canvas.width!==w||canvas.height!==h)){canvas.width=w;canvas.height=h;}
    if(canvas.width&&canvas.height)drawMarketingPlan(canvas,scene,selected==='2d'?1:progress);
  };
  const update=(value)=>{
    progress=Math.max(0,Math.min(1,value));
    const i=labels.reduce((last,item,n)=>progress>=item[0]?n:last,0);
    label.textContent=labels[i][1];count.textContent=String(i+1).padStart(2,'0')+' / '+String(labels.length).padStart(2,'0');
    meter.style.transform=`scaleX(${progress})`;
    if(scrub)scrub.value=String(Math.round(progress*100));
    studio.dataset.phase=progress>=.91?'finished':'building';
    if(view&&selected==='3d')view.setMarketingProgress(progress);
    else draw();
    poster.classList.toggle('story-final',!view&&selected==='3d'&&progress>=.89);
  };
  function stop(){playing=false;cancelAnimationFrame(frame);frame=0;last=0;pause.textContent='Play';pause.setAttribute('aria-label','Play wedding build');}
  function tick(now){
    if(!playing||disposed||!visible||selected!=='3d')return;
    if(!last)last=now;
    const dt=Math.min(50,now-last);last=now;
    if(progress<1)update(progress+dt/duration);
    else{
      hold+=dt;
      if(hold>=3000){hold=0;dimmer.classList.add('is-visible');
        stop();setTimeout(()=>{
          if(disposed||!visible||selected!=='3d')return;
          update(0);dimmer.classList.remove('is-visible');
          setTimeout(()=>{if(!disposed&&visible&&selected==='3d')play();},550);
        },540);return;
      }
    }
    frame=requestAnimationFrame(tick);
  }
  function play(){
    if(reduce.matches||!visible||selected!=='3d'||playing)return;
    playing=true;hold=0;last=0;pause.textContent='Pause';pause.setAttribute('aria-label','Pause wedding build');
    frame=requestAnimationFrame(tick);
  }
  function setView(mode){
    selected=mode;modeButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===mode)));
    if(mode==='2d'){
      stop();draw();canvas.classList.add('show-plan');target.classList.remove('active');poster.classList.remove('story-final');
      controls.hidden=true;
    }else{
      canvas.classList.remove('show-plan');target.classList.toggle('active',!!view);
      controls.hidden=!view;
      update(view?1:progress);if(view)view.setMarketingProgress(1);
    }
  }
  async function start(){
    if(loaded||disposed)return;loaded=true;
    // The immediate, dimensioned poster remains LCP. This code runs after
    // first paint and only while the stage is near the viewport.
    if(reduce.matches){update(1);return;}
    if(mobile.matches){canvas.classList.add('is-playing');draw();poster.classList.remove('story-final');play();return;}
    try{
      const renderer=await import('/js/ui/view3d.js');if(disposed)return;
      target.style.visibility='hidden';target.classList.add('active');
      pending=renderer.init(target,{marketingOnly:true,registerActive:false});
      pending.rebuild(scene);pending.setScene({motion:false,guests:false,styling:true,night:false});
      pending.setMarketingProgress(0);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(disposed){pending.destroy();pending=null;return;}
      view=pending;pending=null;target.style.visibility='';controls.hidden=false;
      studio.classList.add('story-has-webgl');update(0);play();
    }catch(error){
      pending?.destroy();pending=null;failed=true;target.style.visibility='';target.classList.remove('active');
      canvas.classList.add('is-playing');draw();play();
    }
  }
  replay.addEventListener('click',()=>{stop();hold=0;dimmer.classList.remove('is-visible');setView('3d');update(0);if(!loaded)start();else if(!reduce.matches)play();});
  pause.addEventListener('click',()=>{if(!loaded)start();if(playing)stop();else if(progress>=1){update(0);play();}else play();});
  modeButtons.forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  cameraButtons.forEach(b=>b.addEventListener('click',()=>{
    stop();update(1);if(b.dataset.camera==='outside')view?.fitCamera();else view?.reception();
    cameraButtons.forEach(other=>other.setAttribute('aria-pressed',String(other===b)));
  }));
  studio.querySelector('[data-night]')?.addEventListener('click',event=>{
    night=!night;event.currentTarget.setAttribute('aria-pressed',String(night));view?.night(night);
  });
  scrub?.addEventListener('input',()=>{stop();update(Number(scrub.value)/100);});
  window.addEventListener('resize',draw,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else if(visible&&loaded&&!reduce.matches&&progress<1)play();});
  const observer=new IntersectionObserver(entries=>{
    visible=entries.some(e=>e.isIntersecting);
    if(visible){if(!loaded)requestAnimationFrame(()=>setTimeout(start,320));else if(!reduce.matches&&progress<1)play();}
    else stop();
  },{rootMargin:'120px',threshold:.08});observer.observe(studio);
  window.addEventListener('pagehide',()=>{disposed=true;stop();observer.disconnect();view?.destroy();pending?.destroy();});
  update(progress);
});
