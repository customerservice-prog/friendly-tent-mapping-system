// Actual Three geometry and production world builder, with deterministic image
// pixels and canvas transport. No external photos or WebGL/network dependency.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {pathToFileURL}=require('node:url'),{JSDOM}=require('jsdom');
(async()=>{
  const root=path.resolve(__dirname,'..'),THREE=await import(pathToFileURL(require.resolve('three').replace('/build/three.cjs','/build/three.module.js')));
  const {knownScan}=await import('./scan-fixture.mjs'),fixture=knownScan({width:176,height:110}),roles=['left','center','right'];
  const dom=new JSDOM('<!doctype html><body></body>'),w=dom.window;
  class CaptureImage{
    set src(url){this.frame=fixture.frames[roles.indexOf(url.split('/').at(-1))];this.width=this.naturalWidth=this.frame.width;this.height=this.naturalHeight=this.frame.height;queueMicrotask(()=>this.onload?.());}
  }
  w.HTMLCanvasElement.prototype.getContext=function(){const canvas=this;return {
    drawImage(image){this.source=image.frame;},
    getImageData(){const data=new Uint8ClampedArray(canvas.width*canvas.height*4),source=this.source;
      for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const sx=Math.min(source.width-1,Math.floor(x/canvas.width*source.width)),sy=Math.min(source.height-1,Math.floor(y/canvas.height*source.height));data.set(source.data.subarray((sy*source.width+sx)*4,(sy*source.width+sx)*4+4),(y*canvas.width+x)*4);}
      return {width:canvas.width,height:canvas.height,data};},
    createImageData(width,height){return {width,height,data:new Uint8ClampedArray(width*height*4)};},putImageData(){}
  };};
  const context=vm.createContext({console,window:w,document:w.document,Image:CaptureImage,URL,DOMException,AbortController,setTimeout,clearTimeout,queueMicrotask}),cache=new Map();
  const three=new vm.SyntheticModule(Object.keys(THREE),function(){for(const key of Object.keys(THREE))this.setExport(key,THREE[key]);},{context});
  function load(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file,initializeImportMeta:meta=>{meta.url=pathToFileURL(file).href;}});cache.set(file,m);return m;}
  const mod=load(path.join(root,'js/ui/venue-scan3d.js'));await mod.link((specifier,ref)=>specifier==='three'?three:load(path.resolve(path.dirname(ref.identifier),specifier)));await mod.evaluate();
  const scan={frames:roles.map(role=>({id:role==='center'?'center-fixture':role,url:'https://fixture.test/'+role,role})),baselineFt:6,fovDeg:60,validationCheck:fixture.check};
  const input={scan,site:{widthFt:50,lengthFt:60},calibration:{horizonY:.35}};
  const first=await mod.namespace.createVenueScanWorld(input);
  assert.equal(first.userData.ready,true);assert.equal(first.userData.validation.status,'valid');assert.equal(first.userData.metric,false);
  assert.equal(first.userData.presentationMode,'overview','upstream presentation contract survives worker integration');
  assert.equal(first.userData.execution,'main-thread-limited');assert.ok(first.getObjectByName('Metric venue reconstruction mesh').geometry.index.count>90);
  const geometry=first.getObjectByName('Metric venue reconstruction mesh').geometry,original=geometry.attributes.position.array[0];geometry.attributes.position.array[0]=original+999;
  const second=await mod.namespace.createVenueScanWorld({...input,scan:{...scan,validationCheck:{...fixture.check,distanceFt:fixture.check.distanceFt*1.25}}});
  assert.equal(second.userData.validation.status,'failed');assert.equal(second.userData.inputFingerprint,first.userData.inputFingerprint,'held-out check does not enter reconstruction input');
  assert.equal(second.getObjectByName('Metric venue reconstruction mesh').geometry.attributes.position.array[0],original,'renderer cannot mutate cached geometry');
  const third=await mod.namespace.createVenueScanWorld({...input,scan:{...scan,baselineFt:9}});
  assert.notEqual(third.userData.inputFingerprint,first.userData.inputFingerprint);assert.equal(third.userData.validation.status,'failed','changed scale forces a new prediction');
  mod.namespace.disposeVenueScanWorld(first);mod.namespace.disposeVenueScanWorld(second);mod.namespace.disposeVenueScanWorld(third);
  console.log('PASS scan world validation: actual Three geometry, held-out verdict, cache isolation, scale invalidation, preserved overview presentation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
