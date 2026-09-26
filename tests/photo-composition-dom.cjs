const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),repo=path.resolve(__dirname,'..');
(async()=>{
 const dom=new JSDOM('<!doctype html><div id="editor"></div><div id="scene"></div>',{pretendToBeVisual:true,url:'https://local.test/'}),w=dom.window;
 w.ResizeObserver=class{observe(){}disconnect(){}};
 const context=vm.createContext({console,window:w,document:w.document,ResizeObserver:w.ResizeObserver,crypto:require('node:crypto').webcrypto}),cache=new Map();
 function moduleFor(file){if(cache.has(file))return cache.get(file);const mod=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});cache.set(file,mod);return mod;}
 const mod=moduleFor(path.join(repo,'js/ui/photo-view.js'));await mod.link((specifier,ref)=>moduleFor(path.resolve(path.dirname(ref.identifier),specifier)));await mod.evaluate();
 const photo=mod.namespace,initial={tent:{id:'frame-20x20',widthFt:20,lengthFt:20},photoSite:{widthFt:50,lengthFt:60},backgroundPhoto:{url:'https://local.test/photo.jpg',widthPx:1600,heightPx:1000},objects:[]};
 let data=initial,changes=[],history=[];
 photo.mount(w.document.getElementById('editor'),data,{onCompositionChange:next=>{history.push(data.photoComposition);data={...data,photoComposition:next};changes.push(next);}});
 const $=selector=>w.document.querySelector(selector),stage=$('.photo-workspace-stage');stage.getBoundingClientRect=()=>({left:10,top:20,width:800,height:500});
 function pointer(target,type,x,y){const event=new w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:10+x*800,clientY:20+y*500});Object.defineProperty(event,'pointerId',{value:1});target.dispatchEvent(event);}
 photo.setTool('mask');assert.equal($('[data-photo-mask-panel]').hidden,false);assert.equal($('[data-photo-calibration-panel]').hidden,true);
 for(const p of [[.2,.3],[.65,.3],[.65,.7],[.2,.7]])pointer($('.photo-workspace-overlay'),'pointerdown',...p);
 assert.equal(changes.length,0,'unfinished trace does not enter saved state');$('[data-mask-finish]').click();assert.equal(changes.length,1);assert.equal(changes[0].foregroundMasks[0].points.length,4);
 assert.equal($('.photo-ground-calibration'),null,'scale guides do not interfere with tracing');
 const firstId=changes[0].foregroundMasks[0].id;
 pointer($('[data-mask-vertex="0"]'),'pointerdown',.2,.3);pointer(stage,'pointermove',.25,.35);assert.equal(changes.length,1,'dragging edits once on release');pointer(stage,'pointerup',.25,.35);
 assert.equal(changes.length,2);assert.equal(changes.at(-1).foregroundMasks[0].points[0].x,.25);
 pointer($('[data-mask-vertex="0"]'),'pointerdown',.25,.35);pointer(stage,'pointermove',.3,.4);pointer(stage,'pointercancel',.3,.4);assert.equal(changes.length,2,'canceled drag preserves committed shape');
 pointer($('[data-mask-edge="0"]'),'pointerdown',.45,.325);pointer(stage,'pointerup',.45,.325);assert.equal(changes.at(-1).foregroundMasks[0].points.length,5,'edge handle inserts an editable point');
 $('[data-mask-remove-point]').click();assert.equal(changes.at(-1).foregroundMasks[0].points.length,4);
 const name=$('[data-mask-label]');name.value='Front <b>hedge</b>';name.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal($('[data-mask-select]').selectedOptions[0].textContent,'Front <b>hedge</b>');assert.equal($('[data-mask-select] b'),null,'label is rendered as plain text');
 $('[data-mask-new]').click();pointer($('.photo-workspace-overlay'),'pointerdown',.1,.1);$('[data-mask-cancel]').click();assert.equal(data.photoComposition.foregroundMasks.length,1);
 $('[data-mask-select]').value=firstId;$('[data-mask-select]').dispatchEvent(new w.Event('change',{bubbles:true}));const beforeRemove=data.photoComposition;
 $('[data-mask-remove]').click();assert.equal(data.photoComposition.foregroundMasks.length,0);photo.update({...data,photoComposition:beforeRemove});assert.equal($('[data-mask-id]').dataset.maskId,firstId,'coordinator undo/update restores foreground overlay');
 photo.setTool('calibrate');assert.equal($('[data-photo-mask-panel]').hidden,true);assert.equal($('[data-mask-id]'),null,'masks are not treated as geometric scale guides');
 let previews=[],commits=[];photo.syncLightingControls($('#scene'),{...data,photoComposition:beforeRemove},{onPreview:v=>previews.push(v),onChange:v=>commits.push(v)});
 const input=$('[data-photo-light="azimuthDeg"]');input.value='90';input.dispatchEvent(new w.Event('input',{bubbles:true}));input.value='120';input.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(previews.length,2);assert.equal(commits.length,0);input.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(commits.length,1);assert.equal(commits[0].lighting.azimuthDeg,120);assert.equal(commits[0].foregroundMasks[0].id,firstId,'lighting preserves foreground masks');
 photo.syncLightingControls($('#scene'),{...data,photoLayoutModel:true},{});assert.equal($('.photo-lighting-controls').hidden,true,'image-only lighting is not offered for dimensioned model');
 photo.unmount();assert.equal($('#editor').children.length,0);console.log('PASS foreground editor: trace, edit, cancel, insert/remove point, rename, remove/restore; lighting previews and commits once.');
})().catch(error=>{console.error(error);process.exitCode=1;});
