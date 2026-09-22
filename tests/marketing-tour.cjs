// Interaction/state checks without a GPU. The live browser verifies fallback.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),root=path.resolve(__dirname,'..');
const settle=()=>new Promise(r=>setTimeout(r,35));
async function fixture({fail=false,page='index.html'}={}){
 const url='https://rentsketch.com/'+(page==='index.html'?'':page.replace(/index\.html$/,''));
 const dom=new JSDOM(fs.readFileSync(path.join(root,page),'utf8'),{url,pretendToBeVisual:true}),w=dom.window;
 let intersect,imports=0,created=0,destroyed=0,rebuilds=[],cameras=[];
 w.matchMedia=()=>({matches:true});
 class Observer{constructor(fn){intersect=fn;}observe(){}disconnect(){}}
 w.IntersectionObserver=Observer;
 const context=vm.createContext({window:w,document:w.document,console,IntersectionObserver:Observer,requestAnimationFrame:fn=>setTimeout(fn,0)});
 const renderer=new vm.SyntheticModule(['init'],function(){this.setExport('init',()=>{created++;if(fail)throw Error('WebGL disabled');return {rebuild:scene=>rebuilds.push(scene),setScene(){},reception(){cameras.push('reception');},fitCamera(){cameras.push('outside');},night(){},playTimelapse(){throw Error('Reduced-motion users must not get animation');},destroy(){destroyed++;}};});},{context});
 await renderer.link(()=>{});await renderer.evaluate();
 const data=new vm.SourceTextModule(fs.readFileSync(path.join(root,'js/data/marketing-reception.js'),'utf8'),{context});
 const tour=new vm.SourceTextModule(fs.readFileSync(path.join(root,'marketing-tour.js'),'utf8'),{context,importModuleDynamically:async()=>{imports++;return renderer;}});
 await tour.link(()=>data);await tour.evaluate();
 return {dom,w,d:w.document,intersect:()=>{if(intersect)intersect([{isIntersecting:true}]);},metrics:()=>({imports,created,destroyed,rebuilds,cameras})};
}
(async()=>{
 const f=await fixture();
 assert.equal(f.d.querySelector('[data-view="3d"]').getAttribute('aria-pressed'),'true');
 assert.equal(f.d.querySelector('.tour-poster').hidden,false);assert.equal(f.d.querySelector('.plan-img').hidden,true);
 assert.equal(f.metrics().imports,0,'no heavy renderer during initial page load');
 f.intersect();await settle();
 assert.equal(f.metrics().imports,0,'homepage does not auto-load heavy 3D renderer');
 assert.match(f.d.querySelector('.tour-note').textContent,/choose 3D view to explore/);
 f.d.querySelector('[data-view="3d"]').click();await settle();
 assert.equal(f.metrics().created,1,'explicit 3D selection starts renderer');
 assert.equal(f.metrics().cameras[0],'reception','opens furnished reception');
 const scene=f.metrics().rebuilds[0];assert.equal(scene.objects.filter(o=>o.kind==='table').reduce((n,o)=>n+o.seatCount,0),64);assert.equal(scene.objects.filter(o=>o.kind==='dance').length,16);
 assert.equal(f.d.querySelector('.tour-poster').hidden,true);assert.equal(f.d.querySelector('.tour-actions').hidden,false);
 f.d.querySelector('[data-view="2d"]').click();assert.equal(f.d.querySelector('.plan-img').hidden,false);assert.equal(f.d.querySelector('.tour-actions').hidden,true);
 f.d.querySelector('[data-view="3d"]').click();assert.equal(f.metrics().created,1,'reuse renderer when changing views');
 f.d.querySelector('[data-camera="outside"]').click();assert.equal(f.metrics().cameras.at(-1),'outside');
 f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide'));assert.equal(f.metrics().destroyed,1);
 f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));await settle();assert.equal(f.metrics().created,1,'homepage history restore stays lightweight');
 f.d.querySelector('[data-view="3d"]').click();await settle();assert.equal(f.metrics().created,2,'3D can be reopened after history restore');f.dom.window.close();

 const fallback=await fixture({fail:true});fallback.d.querySelector('[data-view="3d"]').click();await settle();
 assert.equal(fallback.d.querySelector('.tour-poster').hidden,false,'3D artwork remains when WebGL is unavailable');
 assert.equal(fallback.d.querySelector('[data-view="3d"]').getAttribute('aria-pressed'),'true','never silently switches first view to 2D');
 assert.match(fallback.d.querySelector('.tour-status').textContent,/Interactive 3D is unavailable/);
 fallback.d.querySelector('[data-view="2d"]').click();assert.equal(fallback.d.querySelector('.plan-img').hidden,false);assert.equal(fallback.d.querySelector('.tour-status').hidden,true);fallback.dom.window.close();

 const early=await fixture();early.d.querySelector('[data-view="2d"]').click();early.intersect();await settle();assert.equal(early.metrics().imports,0,'honor a visitor choosing 2D without background 3D work');early.d.querySelector('[data-view="3d"]').click();await settle();assert.equal(early.metrics().created,1);early.dom.window.close();

 const demo=await fixture({page:'demo/index.html'});
 assert.equal(demo.metrics().imports,0,'demo waits until its preview approaches viewport');
 demo.intersect();await settle();assert.equal(demo.metrics().created,1,'dedicated demo still auto-loads interactive 3D');demo.dom.window.close();

 console.log('PASS 3D marketing tour: lightweight marketing pages, explicit 3D activation, demo auto-load, accurate scene counts, reduced motion, camera controls, 2D switching, WebGL fallback, and history restoration. Renderer stub; not GPU visual QA.');
})().catch(e=>{console.error(e);process.exitCode=1;});
