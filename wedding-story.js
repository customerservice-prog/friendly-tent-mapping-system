import { marketingReception } from './js/data/marketing-reception.js';

// Public, presentation-only wedding story. No API calls, orders, entitlements,
// quote requests, saved designs or customer data are created by this module.
const scene=marketingReception();
const steps=[
  {p:0,label:'An empty venue',detail:'Start with the open event space'},
  {p:.055,label:'Measure the tent footprint',detail:'Mark out the 40 × 60 footprint'},
  {p:.13,label:'Raise the tent structure',detail:'Add the tent and center poles'},
  {p:.25,label:'Arrange eight guest tables',detail:'Build the reception seating plan'},
  {p:.36,label:'Seat the guests',detail:'Place 64 Gold Chiavari chairs'},
  {p:.44,label:'Place the sweetheart table',detail:'Create the head-table focal point'},
  {p:.51,label:'Lay the dance floor',detail:'Build the 12 × 12 dance floor'},
  {p:.58,label:'Set the DJ',detail:'Reserve the entertainment area'},
  {p:.64,label:'Build the bar',detail:'Add beverage service'},
  {p:.69,label:'Prepare the buffet',detail:'Add two catering tables'},
  {p:.74,label:'Add cocktail tables',detail:'Create gathering points'},
  {p:.80,label:'Dress the tables',detail:'Add wedding linens'},
  {p:.85,label:'Place the centerpieces',detail:'Finish each guest table'},
  {p:.91,label:'String the lights',detail:'Add bistro lighting'},
  {p:1,label:'Step inside the reception',detail:'Reveal the finished 3D wedding'}
];
const stageDelays=[650,700,850,900,900,720,760,620,620,620,620,760,680,850,1500];
const reduce=matchMedia('(prefers-reduced-motion: reduce)');

function svgNode(name,attrs={}){
  const node=document.createElementNS('http://www.w3.org/2000/svg',name);
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
  return node;
}

// Rotate the 40 × 60 planning coordinates into a 60 × 40 landscape diagram.
function mapPoint(x,y){return [y,40-x];}
function rectFor(o){return {x:o.y,y:40-(o.x+o.widthFt),width:o.depthFt,height:o.widthFt};}
function centerOf(o){return mapPoint(o.x+o.widthFt/2,o.y+o.depthFt/2);}

function layer(svg,key,threshold){
  const g=svgNode('g',{'data-story-layer':key,'data-threshold':threshold});
  svg.appendChild(g);
  return g;
}

function buildPlanSvg(){
  const svg=svgNode('svg',{
    class:'story-build-plan',
    viewBox:'0 0 60 40',
    preserveAspectRatio:'xMidYMid slice',
    role:'img',
    'aria-label':'Animated overhead wedding layout building from an empty venue to a complete reception'
  });

  const defs=svgNode('defs');
  const grid=svgNode('pattern',{id:'story-grid',width:3,height:3,patternUnits:'userSpaceOnUse'});
  grid.appendChild(svgNode('path',{d:'M3 0H0V3',fill:'none',stroke:'#78926f','stroke-width':'.07',opacity:'.28'}));
  defs.appendChild(grid);
  svg.appendChild(defs);

  const base=svgNode('g',{class:'story-build-base'});
  base.appendChild(svgNode('rect',{x:0,y:0,width:60,height:40,fill:'#e8f1df'}));
  base.appendChild(svgNode('rect',{x:0,y:0,width:60,height:40,fill:'url(#story-grid)'}));
  svg.appendChild(base);

  const footprint=layer(svg,'footprint',1);
  footprint.appendChild(svgNode('rect',{x:.7,y:.7,width:58.6,height:38.6,rx:1,fill:'none',stroke:'#71906f','stroke-width':'.18','stroke-dasharray':'.65 .55'}));
  footprint.appendChild(svgNode('line',{x1:2,y1:2.1,x2:58,y2:2.1,stroke:'#78926f','stroke-width':'.1'}));
  footprint.appendChild(svgNode('line',{x1:2,y1:1.7,x2:2,y2:2.5,stroke:'#78926f','stroke-width':'.1'}));
  footprint.appendChild(svgNode('line',{x1:58,y1:1.7,x2:58,y2:2.5,stroke:'#78926f','stroke-width':'.1'}));

  const tentLayer=layer(svg,'tent',2);
  tentLayer.appendChild(svgNode('rect',{x:1.1,y:1.1,width:57.8,height:37.8,rx:1.1,fill:'#fffdf8',stroke:'#6f856a','stroke-width':'.32'}));
  tentLayer.appendChild(svgNode('line',{x1:1.8,y1:20,x2:58.2,y2:20,stroke:'#b0bda9','stroke-width':'.11','stroke-dasharray':'.7 .65'}));
  for(const pole of scene.tent.centerPoles||[]){
    const [cx,cy]=mapPoint(pole.x,pole.y);
    tentLayer.appendChild(svgNode('circle',{cx,cy,r:.38,fill:'#566d50',stroke:'#fff','stroke-width':'.14'}));
  }

  const tablesLayer=layer(svg,'tables',3);
  const chairsLayer=layer(svg,'chairs',4);
  const sweetheartLayer=layer(svg,'sweetheart',5);
  const danceLayer=layer(svg,'dance',6);
  const djLayer=layer(svg,'dj',7);
  const barLayer=layer(svg,'bar',8);
  const buffetLayer=layer(svg,'buffet',9);
  const cocktailLayer=layer(svg,'cocktail',10);
  const linensLayer=layer(svg,'linens',11);
  const centerpiecesLayer=layer(svg,'centerpieces',12);
  const lightingLayer=layer(svg,'lighting',13);

  const guestTables=scene.objects.filter(o=>o.id?.startsWith('wedding-table-'));
  guestTables.forEach((o,index)=>{
    const [cx,cy]=centerOf(o);
    tablesLayer.appendChild(svgNode('circle',{
      cx,cy,r:2.45,fill:index%2?'#f7f2e8':'#fbf7ef',stroke:'#8d948b','stroke-width':'.2'
    }));
    for(let seat=0;seat<8;seat++){
      const angle=(Math.PI*2*seat/8)-Math.PI/2;
      const x=cx+Math.cos(angle)*3.35,y=cy+Math.sin(angle)*3.35;
      chairsLayer.appendChild(svgNode('rect',{
        x:x-.43,y:y-.29,width:.86,height:.58,rx:.14,
        fill:'#d9b95e',stroke:'#8d7840','stroke-width':'.08',
        transform:`rotate(${seat*45} ${x} ${y})`
      }));
    }
    linensLayer.appendChild(svgNode('circle',{cx,cy,r:2.17,fill:'#fffdf7',stroke:'#e4d7c3','stroke-width':'.12',opacity:.94}));
    centerpiecesLayer.appendChild(svgNode('circle',{cx,cy,r:.43,fill:'#6f8f59',stroke:'#f7ead0','stroke-width':'.15'}));
    centerpiecesLayer.appendChild(svgNode('circle',{cx,cy,r:.14,fill:'#f2d183'}));
  });

  const serviceObject=id=>scene.objects.find(o=>o.id===id);
  function drawService(o,target,fill='#f7f2e7'){
    if(!o)return;
    const [cx,cy]=centerOf(o);
    if(o.shape==='round'||o.tableId==='cocktail'){
      target.appendChild(svgNode('circle',{cx,cy,r:Math.max(.9,o.widthFt/2),fill,stroke:'#75858b','stroke-width':'.19'}));
    }else{
      const r=rectFor(o);
      target.appendChild(svgNode('rect',{x:r.x,y:r.y,width:r.width,height:r.height,rx:.34,fill,stroke:'#75858b','stroke-width':'.19'}));
    }
  }

  drawService(serviceObject('wedding-sweetheart'),sweetheartLayer,'#f6eadc');
  drawService(serviceObject('wedding-dj'),djLayer,'#324655');
  drawService(serviceObject('wedding-bar'),barLayer,'#263746');
  drawService(serviceObject('wedding-buffet-a'),buffetLayer,'#f8f3e9');
  drawService(serviceObject('wedding-buffet-b'),buffetLayer,'#f8f3e9');
  drawService(serviceObject('wedding-cocktail-a'),cocktailLayer,'#f5ead3');
  drawService(serviceObject('wedding-cocktail-b'),cocktailLayer,'#f5ead3');

  scene.objects.filter(o=>o.kind==='dance').forEach(o=>{
    const r=rectFor(o);
    danceLayer.appendChild(svgNode('rect',{x:r.x,y:r.y,width:r.width,height:r.height,fill:'#d1aa77',stroke:'#a27b50','stroke-width':'.07'}));
  });

  for(const x of [7,17,27,37,47,57]){
    lightingLayer.appendChild(svgNode('path',{
      d:`M${x} 2 C${x-2} 12 ${x+2} 28 ${x} 38`,
      fill:'none',stroke:'#8a6d42','stroke-width':'.11',opacity:.78
    }));
    for(const y of [6,12,18,24,30,36]){
      lightingLayer.appendChild(svgNode('circle',{cx:x,cy:y,r:.17,fill:'#ffd77b',stroke:'#fff4c8','stroke-width':'.08'}));
    }
  }

  return svg;
}

document.querySelectorAll('[data-wedding-story]').forEach(studio=>{
  const poster=studio.querySelector('.tour-poster');
  const target=studio.querySelector('.tour-3d');
  const label=studio.querySelector('[data-story-label]');
  const count=studio.querySelector('[data-story-count]');
  const meter=studio.querySelector('[data-story-progress]');
  const scrub=studio.querySelector('[data-story-scrub]');
  const replay=studio.querySelector('[data-story-replay]');
  const pause=studio.querySelector('[data-story-pause]');
  const explore=studio.querySelector('[data-story-explore]');
  const controls=studio.querySelector('.tour-actions');
  const cameraButtons=[...studio.querySelectorAll('[data-camera]')];
  const modeButtons=[...studio.querySelectorAll('[data-view]')];
  const storyView=studio.querySelector('.story-view');
  const demo=!!scrub;

  let view=null,pending=null,loading=null,failed=false,disposed=false,visible=false;
  let progress=reduce.matches?1:0,playing=false,timer=0,selected='3d',night=false;

  const plan=buildPlanSvg();
  poster.after(plan);

  function stepIndex(value){
    let index=0;
    steps.forEach((step,i)=>{if(value>=step.p)index=i;});
    return index;
  }

  function syncPlan(index){
    plan.querySelectorAll('[data-story-layer]').forEach(node=>{
      const threshold=Number(node.dataset.threshold||0);
      node.classList.toggle('is-visible',index>=threshold);
    });
  }

  function setProgress(value,{fromScrub=false}={}){
    progress=Math.max(0,Math.min(1,value));
    const index=stepIndex(progress);
    const step=steps[index];
    label.textContent=step.label;
    count.textContent=String(index+1).padStart(2,'0')+' / '+String(steps.length).padStart(2,'0');
    meter.style.transform=`scaleX(${progress})`;
    if(scrub&&!fromScrub)scrub.value=String(Math.round(progress*100));
    studio.dataset.phase=index===steps.length-1?'finished':'building';

    if(view&&selected==='3d'){
      view.setMarketingProgress(progress);
      plan.classList.add('is-hidden');
      poster.classList.remove('story-final');
    }else if(selected==='2d'){
      syncPlan(steps.length-2);
      plan.classList.add('show-plan');
      plan.classList.remove('is-finished','is-hidden');
      poster.classList.remove('story-final');
    }else{
      syncPlan(index);
      plan.classList.remove('show-plan','is-hidden');
      plan.classList.toggle('is-finished',index===steps.length-1);
      poster.classList.toggle('story-final',index===steps.length-1);
    }
  }

  function stop(){
    playing=false;
    clearTimeout(timer);
    timer=0;
    if(pause){
      pause.textContent='Play';
      pause.setAttribute('aria-label','Play wedding build');
    }
  }

  function scheduleNext(){
    if(!playing||disposed||!visible||selected!=='3d'||view)return;
    const index=stepIndex(progress);
    if(index>=steps.length-1){
      stop();
      return;
    }
    const next=index+1;
    timer=setTimeout(()=>{
      if(!playing||disposed||!visible||selected!=='3d'||view)return;
      setProgress(steps[next].p);
      scheduleNext();
    },stageDelays[index]||750);
  }

  function play(){
    if(reduce.matches||disposed||!visible||selected!=='3d'||view||playing)return;
    if(progress>=1)setProgress(0);
    playing=true;
    pause.textContent='Pause';
    pause.setAttribute('aria-label','Pause wedding build');
    scheduleNext();
  }

  async function ensure3D(){
    if(view||loading||disposed)return view;
    loading=(async()=>{
      try{
        const renderer=await import('/js/ui/view3d.js');
        if(disposed)return null;
        target.style.visibility='hidden';
        target.classList.add('active');
        pending=renderer.init(target,{marketingOnly:true,registerActive:false});
        pending.rebuild(scene);
        pending.setScene({motion:false,guests:false,styling:true,night:false});
        pending.setMarketingProgress(progress);
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        if(disposed){pending.destroy();pending=null;return null;}
        view=pending;pending=null;
        target.style.visibility='';
        studio.classList.add('story-has-webgl');
        plan.classList.add('is-hidden');
        poster.classList.remove('story-final');
        controls.hidden=false;
        return view;
      }catch(error){
        pending?.destroy();pending=null;failed=true;
        target.style.visibility='';target.classList.remove('active');
        studio.classList.remove('story-has-webgl');
        plan.classList.remove('is-hidden');
        poster.classList.add('story-final');
        controls.hidden=true;
        return null;
      }finally{
        loading=null;
      }
    })();
    return loading;
  }

  async function showInteractive3D(){
    stop();
    selected='3d';
    modeButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view==='3d')));
    setProgress(1);
    const active=await ensure3D();
    if(active){
      active.setMarketingProgress(1);
      active.reception();
      controls.hidden=false;
    }
  }

  function show2D(){
    stop();
    selected='2d';
    modeButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view==='2d')));
    controls.hidden=true;
    target.classList.remove('active');
    studio.classList.remove('story-has-webgl');
    setProgress(1);
    label.textContent='Complete reception floor plan';
  }

  replay.addEventListener('click',()=>{
    if(view){
      view.destroy();view=null;
      studio.classList.remove('story-has-webgl');
      target.classList.remove('active');
      controls.hidden=true;
    }
    selected='3d';
    modeButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view==='3d')));
    setProgress(0);
    if(!reduce.matches)play();
  });

  pause.addEventListener('click',()=>{
    if(playing)stop();
    else play();
  });

  explore?.addEventListener('click',showInteractive3D);

  modeButtons.forEach(button=>button.addEventListener('click',()=>{
    if(button.dataset.view==='2d')show2D();
    else showInteractive3D();
  }));

  cameraButtons.forEach(button=>button.addEventListener('click',async()=>{
    const active=await ensure3D();
    if(!active)return;
    stop();selected='3d';setProgress(1);
    if(button.dataset.camera==='outside')active.fitCamera();else active.reception();
    cameraButtons.forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
  }));

  studio.querySelector('[data-night]')?.addEventListener('click',async event=>{
    const active=await ensure3D();
    if(!active)return;
    night=!night;
    event.currentTarget.setAttribute('aria-pressed',String(night));
    active.night(night);
  });

  scrub?.addEventListener('input',()=>{
    stop();
    const value=Number(scrub.value)/100;
    if(view&&selected==='3d')view.setMarketingProgress(value);
    setProgress(value,{fromScrub:true});
  });

  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)stop();
    else if(visible&&!demo&&!reduce.matches&&progress<1&&!view)play();
  });

  const observer=new IntersectionObserver(entries=>{
    visible=entries.some(entry=>entry.isIntersecting);
    if(!visible){stop();return;}
    if(demo&&!reduce.matches){
      setTimeout(async()=>{
        if(disposed||!visible||view)return;
        const active=await ensure3D();
        if(active){
          active.setMarketingProgress(progress);
          if(progress<1)play();
        }
      },450);
    }else if(!reduce.matches&&progress<1&&!view){
      setTimeout(()=>{if(!disposed&&visible&&!view)play();},220);
    }
  },{rootMargin:'120px',threshold:.08});
  observer.observe(studio);

  window.addEventListener('pagehide',()=>{
    disposed=true;stop();observer.disconnect();view?.destroy();pending?.destroy();
  });

  if(reduce.matches){
    syncPlan(steps.length-2);
    plan.classList.add('is-finished');
    poster.classList.add('story-final');
  }
  setProgress(progress);
});
