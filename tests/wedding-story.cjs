const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

const root=path.resolve(__dirname,'..');
const settle=(ms=80)=>new Promise(resolve=>setTimeout(resolve,ms));

async function fixture({page='index.html',reduced=false,fail=false}={}){
  const url='https://rentsketch.com/'+(page==='index.html'?'':page.replace(/index\.html$/,''));
  const dom=new JSDOM(fs.readFileSync(path.join(root,page),'utf8'),{
    url,pretendToBeVisual:true,runScripts:'outside-only'
  });
  const w=dom.window,d=w.document;
  let intersectionCallback=null,imports=0,created=0,destroyed=0,rebuilds=[],progress=[],cameras=[],nightCalls=0;

  const matchMedia=query=>({matches:query.includes('prefers-reduced-motion')?reduced:false,media:query,addEventListener(){},removeEventListener(){}});
  w.matchMedia=matchMedia;
  class Observer{
    constructor(fn){intersectionCallback=fn;}
    observe(){}
    disconnect(){}
  }
  w.IntersectionObserver=Observer;
  w.requestAnimationFrame=fn=>setTimeout(()=>fn(Date.now()),0);
  w.cancelAnimationFrame=id=>clearTimeout(id);

  const context=vm.createContext({
    window:w,document:d,console,
    matchMedia,
    IntersectionObserver:Observer,
    requestAnimationFrame:w.requestAnimationFrame,
    cancelAnimationFrame:w.cancelAnimationFrame,
    setTimeout:(fn,ms,...args)=>setTimeout(fn,Math.min(Number(ms)||0,5),...args),
    clearTimeout,
    Object,Array,Number,String,Math,Promise,Date
  });

  const renderer=new vm.SyntheticModule(['init'],function(){
    this.setExport('init',()=>{
      imports++;created++;
      if(fail)throw Error('WebGL unavailable');
      return {
        rebuild:scene=>rebuilds.push(scene),
        setScene(){},
        setMarketingProgress:value=>progress.push(value),
        reception(){cameras.push('reception');},
        fitCamera(){cameras.push('outside');return true;},
        night(){nightCalls++;},
        destroy(){destroyed++;}
      };
    });
  },{context});
  await renderer.link(()=>{});
  await renderer.evaluate();

  const data=new vm.SourceTextModule(fs.readFileSync(path.join(root,'js/data/marketing-reception.js'),'utf8'),{context});
  await data.link(()=>{});
  await data.evaluate();

  const story=new vm.SourceTextModule(fs.readFileSync(path.join(root,'wedding-story.js'),'utf8'),{
    context,
    importModuleDynamically:async()=>renderer
  });
  await story.link(specifier=>{
    if(specifier==='./js/data/marketing-reception.js')return data;
    throw Error('Unexpected import '+specifier);
  });
  await story.evaluate();

  return {
    dom,w,d,
    intersect:()=>intersectionCallback?.([{isIntersecting:true}]),
    leave:()=>intersectionCallback?.([{isIntersecting:false}]),
    metrics:()=>({imports,created,destroyed,rebuilds,progress,cameras,nightCalls})
  };
}

(async()=>{
  const source=fs.readFileSync(path.join(root,'wedding-story.js'),'utf8');
  assert.doesNotMatch(source,/drawMarketingPlan|marketing-plan\.js/,'homepage autoplay must not continuously draw the canvas plan');
  assert.match(source,/data-story-layer/);
  assert.match(source,/Explore 3D|data-story-explore/);

  const home=await fixture();
  assert.equal(home.metrics().imports,0,'initial homepage must not import Three.js');
  assert.ok(home.d.querySelector('[data-story-explore]'),'homepage exposes explicit 3D handoff');
  home.intersect();
  await settle(140);
  assert.equal(home.metrics().imports,0,'homepage autoplay must remain WebGL-free');
  assert.equal(home.metrics().created,0,'homepage autoplay creates no renderer');
  const plan=home.d.querySelector('.story-build-plan');
  assert.ok(plan,'homepage creates the staged SVG wedding plan');
  assert.equal(plan.querySelectorAll('[data-story-layer="chairs"] rect').length,64,'all 64 guest chairs are represented');
  assert.equal(plan.querySelectorAll('[data-story-layer="dance"] rect').length,16,'all 16 dance-floor sections are represented');
  assert.ok(plan.querySelectorAll('[data-story-layer="sweetheart"] > *').length>=1,'sweetheart table is represented');
  assert.ok(plan.querySelectorAll('[data-story-layer="dj"] > *').length>=1,'DJ area is represented');
  assert.ok(plan.querySelectorAll('[data-story-layer="bar"] > *').length>=1,'bar is represented');
  assert.ok(plan.querySelectorAll('[data-story-layer="buffet"] > *').length>=2,'buffet tables are represented');
  assert.ok(plan.querySelectorAll('[data-story-layer="cocktail"] > *').length>=2,'cocktail tables are represented');
  assert.ok(plan.querySelectorAll('[data-story-layer="centerpieces"] > *').length>=16,'centerpiece details are represented');
  assert.ok(plan.querySelectorAll('[data-story-layer="lighting"] > *').length>20,'bistro lighting is represented');
  assert.equal(home.d.querySelector('[data-story-count]').textContent,'15 / 15');
  assert.match(home.d.querySelector('[data-story-label]').textContent,/Step inside the reception/);
  assert.ok(plan.classList.contains('is-finished'),'finished build crossfades to the rendered 3D poster');

  home.d.querySelector('[data-story-replay]').click();
  await settle(20);
  assert.equal(home.metrics().imports,0,'Replay stays lightweight');
  home.d.querySelector('[data-story-pause]').click();
  home.d.querySelector('[data-view="2d"]').click();
  assert.equal(home.metrics().imports,0,'2D floor plan never imports Three.js');
  assert.ok(plan.classList.contains('show-plan'));

  home.d.querySelector('[data-story-explore]').click();
  await settle(50);
  assert.equal(home.metrics().imports,1,'Explore 3D imports the renderer once');
  assert.equal(home.metrics().created,1);
  assert.equal(home.metrics().rebuilds.length,1);
  assert.ok(home.metrics().rebuilds[0].objects.length>20,'interactive 3D uses the complete wedding scene');
  assert.ok(home.metrics().cameras.includes('reception'));
  home.w.dispatchEvent(new home.w.PageTransitionEvent('pagehide'));
  assert.equal(home.metrics().destroyed,1);
  home.dom.window.close();

  const reduced=await fixture({reduced:true});
  reduced.intersect();
  await settle(30);
  assert.equal(reduced.metrics().imports,0,'reduced-motion homepage stays static and WebGL-free');
  assert.equal(reduced.d.querySelector('[data-story-count]').textContent,'15 / 15');
  assert.ok(reduced.d.querySelector('.story-build-plan').classList.contains('is-finished'));
  reduced.dom.window.close();

  const fallback=await fixture({fail:true});
  fallback.d.querySelector('[data-story-explore]').click();
  await settle(40);
  assert.equal(fallback.metrics().imports,1);
  assert.equal(fallback.d.querySelector('.tour-poster').classList.contains('story-final'),true,'poster remains as fallback when WebGL is unavailable');
  fallback.dom.window.close();

  const demo=await fixture({page:'demo/index.html'});
  demo.intersect();
  await settle(80);
  assert.equal(demo.metrics().imports,1,'dedicated demo still auto-loads interactive 3D');
  assert.equal(demo.metrics().created,1);
  assert.ok(demo.metrics().progress.length>2,'demo progresses through the wedding stages in the renderer');
  assert.equal(demo.d.querySelector('[data-story-count]').textContent,'15 / 15');
  demo.dom.window.close();

  console.log('PASS wedding story: complete staged wedding, zero homepage autoplay WebGL, explicit 3D handoff, reduced-motion fallback, and interactive demo auto-load.');
})().catch(err=>{console.error(err);process.exitCode=1;});
