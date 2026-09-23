// Interaction/state checks without a GPU. Live browser QA verifies rendering.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),root=path.resolve(__dirname,'..');
const settle=(ms=45)=>new Promise(r=>setTimeout(r,ms));

async function fixture({fail=false,page='index.html',reduced=true}={}){
 const url='https://rentsketch.com/'+(page==='index.html'?'':page.replace(/index\.html$/,''));
 const dom=new JSDOM(fs.readFileSync(path.join(root,page),'utf8'),{url,pretendToBeVisual:true}),w=dom.window;
 let intersect,imports=0,created=0,destroyed=0,rebuilds=[],cameras=[],scenes=[],timelapses=0,itemAnimations=[],cameraTransitions=[];
 w.matchMedia=query=>({matches:query.includes('prefers-reduced-motion')?reduced:false});
 w.requestIdleCallback=fn=>setTimeout(()=>fn({didTimeout:false,timeRemaining:()=>20}),0);
 class Observer{constructor(fn){intersect=fn;}observe(){}disconnect(){}}
 w.IntersectionObserver=Observer;
 const context=vm.createContext({
   window:w,document:w.document,console,IntersectionObserver:Observer,
   requestAnimationFrame:fn=>setTimeout(()=>fn(performance.now()),0),
   cancelAnimationFrame:id=>clearTimeout(id),
   performance,requestIdleCallback:w.requestIdleCallback,setTimeout,clearTimeout
 });
 const renderer=new vm.SyntheticModule(['init'],function(){
   this.setExport('init',()=>{
     created++;if(fail)throw Error('WebGL disabled');
     return {
       rebuild:scene=>rebuilds.push(scene),
       setScene:o=>scenes.push(o),
       reception(){cameras.push('reception');},
       fitCamera(){cameras.push('outside');return true;},
       night(){},
       playTimelapse(){timelapses++;},
       playItemTimelapse(ids){itemAnimations.push(ids);},
       playChairTimelapse(ids){itemAnimations.push(['chairs',...ids]);},
       transitionCamera(mode){cameraTransitions.push(mode);cameras.push(mode);},
       destroy(){destroyed++;}
     };
   });
 },{context});
 await renderer.link(()=>{});await renderer.evaluate();
 const data=new vm.SourceTextModule(fs.readFileSync(path.join(root,'js/data/marketing-reception.js'),'utf8'),{context});
 await data.link(()=>{});await data.evaluate();
 const tour=new vm.SourceTextModule(fs.readFileSync(path.join(root,'marketing-tour.js'),'utf8'),{
   context,importModuleDynamically:async()=>{imports++;return renderer;}
 });
 await tour.link(()=>data);await tour.evaluate();
 return {
   dom,w,d:w.document,
   stages:data.namespace.marketingWeddingBuildStages(),
   finalScene:data.namespace.marketingReception(),
   intersect:()=>{if(intersect)intersect([{isIntersecting:true}]);},
   metrics:()=>({imports,created,destroyed,rebuilds,cameras,scenes,timelapses,itemAnimations,cameraTransitions})
 };
}

(async()=>{
 const f=await fixture();
 assert.equal(f.d.querySelector('[data-view="3d"]').getAttribute('aria-pressed'),'true');
 assert.equal(f.d.querySelector('.tour-poster').hidden,false);
 assert.equal(f.d.querySelector('.plan-img').hidden,true);
 assert.equal(f.metrics().imports,0,'no heavy renderer during initial page load');
 f.intersect();await settle();
 assert.equal(f.metrics().imports,0,'reduced-motion homepage keeps fast static first frame');
 assert.match(f.d.querySelector('.tour-note').textContent,/Complete wedding reception preview/);

 f.d.querySelector('[data-view="3d"]').click();await settle();
 assert.equal(f.metrics().created,1,'explicit 3D selection starts renderer');
 assert.equal(f.metrics().cameras[0],'reception','reduced-motion opens finished reception');
 const scene=f.metrics().rebuilds[0];
 const guest=scene.objects.filter(o=>o.id.startsWith('wedding-table-'));
 assert.equal(guest.length,8);
 assert.equal(guest.reduce((n,o)=>n+o.seatCount,0),64);
 assert.equal(scene.objects.find(o=>o.id==='wedding-sweetheart').seatCount,2);
 for(const id of ['wedding-dj','wedding-buffet-a','wedding-buffet-b','wedding-bar','wedding-cocktail-a','wedding-cocktail-b']){
   assert.ok(scene.objects.some(o=>o.id===id),id+' exists in final wedding');
 }
 assert.equal(scene.objects.filter(o=>o.kind==='dance').length,16);
 assert.equal(scene.lightingId,'lighting-bistro');
 assert.equal(f.metrics().timelapses,0,'reduced-motion never animates build');
 assert.equal(f.d.querySelector('.tour-poster').hidden,true);
 assert.equal(f.d.querySelector('.tour-actions').hidden,false);

 f.d.querySelector('[data-view="2d"]').click();
 assert.equal(f.d.querySelector('.plan-img').hidden,false);
 assert.equal(f.d.querySelector('.tour-actions').hidden,true);
 f.d.querySelector('[data-view="3d"]').click();
 assert.equal(f.metrics().created,1,'reuse renderer when changing views');
 f.d.querySelector('[data-camera="outside"]').click();
 assert.ok(f.metrics().cameras.includes('outside'));
 f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide'));
 assert.equal(f.metrics().destroyed,1);
 f.dom.window.close();

 const autoplay=await fixture({reduced:false});
 assert.equal(autoplay.metrics().imports,0,'normal homepage still avoids renderer before viewport/idle');
 assert.deepEqual(autoplay.stages.map(x=>x.key),['space','tent','tables','chairs','sweetheart','dance','style','lighting','reception','evening']);
 const tableStage=autoplay.stages.find(x=>x.key==='tables').scene.objects.filter(o=>o.id.startsWith('wedding-table-'));
 const chairStage=autoplay.stages.find(x=>x.key==='chairs').scene.objects.filter(o=>o.id.startsWith('wedding-table-'));
 assert.ok(tableStage.every(o=>o.hideChairs===true&&o.seatCount===8),'table stage keeps chair count but hides chair meshes');
 assert.ok(chairStage.every(o=>o.hideChairs===false&&o.seatCount===8),'chair stage reveals the 64 chairs');
 assert.equal(autoplay.stages.at(-1).scene.lightingId,'lighting-bistro');
 autoplay.intersect();await settle(100);
 assert.equal(autoplay.metrics().created,1,'homepage auto-loads renderer after hero enters view');
 assert.ok(autoplay.d.querySelector('.wedding-build-hud'),'cinematic build HUD is created');
 assert.match(autoplay.d.querySelector('.wedding-build-kicker').textContent,/build the wedding/i);
 assert.equal(autoplay.metrics().rebuilds[0].objects.length,0,'cinematic begins from an empty event layout');
 autoplay.w.dispatchEvent(new autoplay.w.PageTransitionEvent('pagehide'));
 assert.equal(autoplay.metrics().destroyed,1);
 autoplay.dom.window.close();

 const fallback=await fixture({fail:true});
 fallback.d.querySelector('[data-view="3d"]').click();await settle();
 assert.equal(fallback.d.querySelector('.tour-poster').hidden,false,'3D artwork remains when WebGL is unavailable');
 assert.equal(fallback.d.querySelector('[data-view="3d"]').getAttribute('aria-pressed'),'true');
 assert.match(fallback.d.querySelector('.tour-status').textContent,/Interactive 3D is unavailable/);
 fallback.d.querySelector('[data-view="2d"]').click();
 assert.equal(fallback.d.querySelector('.plan-img').hidden,false);
 fallback.dom.window.close();

 const early=await fixture();
 early.d.querySelector('[data-view="2d"]').click();early.intersect();await settle();
 assert.equal(early.metrics().imports,0,'honor a visitor choosing 2D without background 3D work');
 early.d.querySelector('[data-view="3d"]').click();await settle();
 assert.equal(early.metrics().created,1);
 early.dom.window.close();

 const demo=await fixture({page:'demo/index.html'});
 assert.equal(demo.metrics().imports,0,'demo waits until its preview approaches viewport');
 demo.intersect();await settle();
 assert.equal(demo.metrics().created,1,'dedicated demo still auto-loads interactive 3D');
 demo.dom.window.close();

 console.log('PASS 3D marketing tour: full wedding scene, homepage cinematic autoplay, reduced-motion finished-scene fallback, demo auto-load, camera controls, 2D switching, WebGL fallback, and history cleanup. Renderer stub; not GPU visual QA.');
})().catch(e=>{console.error(e);process.exitCode=1;});
