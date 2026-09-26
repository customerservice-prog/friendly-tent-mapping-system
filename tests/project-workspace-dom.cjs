// Real project/autosave/review UI against an isolated revision-aware API.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),wait=ms=>new Promise(r=>setTimeout(r,ms)),clone=v=>JSON.parse(JSON.stringify(v));
async function until(check){for(let i=0;i<100;i++){if(check())return;await wait(10);}throw Error('UI did not settle');}
function fixture(){
 const dom=new JSDOM('<!doctype html><body><button id="open">Projects</button><button id="btnShare">Share</button></body>',{url:'https://rentsketch.com/designer/?tenant=friendly',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 let scene={tentId:'frame-20x20',objects:[{id:'table',kind:'table',tableId:'six',widthFt:6,depthFt:2.5,x:4,y:8}]},canEdit=true,staff=false,delay=null;
 const records=new Map(),calls=[],versions=[],shares=[],alternatives=[];let next=1;
 w.RENTSKETCH_API_URL='https://fixture.invalid';w.RENTSKETCH_TENANT_SLUG='friendly';w.RENTSKETCH_CATALOG_READY=true;w.confirm=()=>true;w.prompt=()=> 'Local alternative';
 w.RentSketchEventPass={canEdit:()=>canEdit,hasPaidEvent:()=>false,getAccessUrl:()=>{throw Error('Editing credentials must never be shared');}};
 w.FriendlyBridge={state:{},getScene:()=>clone(scene),loadScene:s=>{scene=clone(s);return true;},closeDrawer(){},TENTS:[{id:'frame-20x20',name:'20 × 20 Frame',widthFt:20,lengthFt:20,installationClearanceFt:5,poleLayoutEstimated:true}],TABLES:[{id:'six',name:'6 ft table'}],computeLineItems:()=>[{label:'6 ft table',qty:1},{label:'White chairs',qty:6}],getPropertyPlan:()=>({active:false}),getChecks:()=>[{message:'Confirm the access path width.'}]};
 async function fetcher(url,options={}){
  const body=options.body?JSON.parse(options.body):{},method=options.method||'GET',pathname=new URL(url,'https://fixture.invalid').pathname.replace(/^\/staff-api/,'');calls.push({pathname,method,body});
  if(delay&&method==='PATCH'){const held=delay;delay=null;await held;}
  const reply=(status,data)=>({ok:status<400,status,json:async()=>clone(data)});
  const parts=pathname.split('/designs'),suffix=parts[1]||'',segs=suffix.split('/').filter(Boolean),id=segs[0],record=records.get(id);
  if(method==='POST'&&!id){const item={id:'design-'+next++,tenant:'friendly',revision:1,scene:clone(body.scene),projectName:'',siteNotes:'',updatedAt:new Date().toISOString()};records.set(item.id,item);return reply(201,item);}
  if(!record)return reply(404,{error:'Project not found'});
  if(method==='GET'&&segs.length===1)return reply(200,record);
  if(method==='GET'&&segs[1]==='revisions')return reply(200,{revisions:versions,revision:record.revision});
  if(method==='GET'&&segs[1]==='alternatives')return reply(200,{alternatives:Array.from(records.values())});
  if(method==='GET'&&segs[1]==='shares')return reply(200,{shares,legacySharesEnabled:true});
  if(['PATCH','POST'].includes(method)&&!['share','shares'].includes(segs[1])&&body.expectedRevision!==record.revision)return reply(409,{error:'Changed on another device',currentRevision:record.revision});
  if(method==='PATCH'){Object.assign(record,body,{revision:record.revision+1});return reply(200,record);}
  if(segs[1]==='revisions'&&segs.length===2){const v={id:'version-'+next++,name:body.name,sourceRevision:record.revision,scene:clone(record.scene),createdAt:new Date().toISOString()};versions.push(v);return reply(201,{revision:record.revision,checkpoint:v});}
  if(segs[1]==='revisions'&&segs[3]==='restore'){record.scene=clone(versions.find(v=>v.id===segs[2]).scene);record.revision++;return reply(200,record);}
  if(segs[1]==='alternatives'){const alt={...clone(record),id:'design-'+next++,revision:1,projectName:body.name,scene:clone(body.scene||record.scene)};records.set(alt.id,alt);alternatives.push(alt);return reply(201,alt);}
  if(segs[1]==='share'){const share={id:'share-'+next++,url:'https://rentsketch.com/designer/?tenant=friendly#share=opaque-test',expiresAt:new Date(Date.now()+body.expiresInDays*86400000).toISOString()};shares.push(share);return reply(201,share);}
  if(method==='DELETE'){shares.find(s=>s.id===segs[2]).revokedAt=new Date().toISOString();return reply(200,{ok:true});}
  return reply(200,{ok:true});
 }
 w.fetch=fetcher;w.RentSketchDashboardSession={ready:async()=>null,identity:()=>staff?'staff-fixture':'',request:(p,o)=>fetcher(p,o)};
 for(const file of ['autosave.js','project-panel.js','review-actions.js'])w.eval(fs.readFileSync(path.join(root,'js/ui',file),'utf8'));
 w.RentSketchStartAutosave();
 return{w,records,calls,versions,shares,get scene(){return scene;},set scene(v){scene=v;},set canEdit(v){canEdit=v;},set staff(v){staff=v;},set delay(v){delay=v;},close:()=>dom.window.close()};
}
function submit(w,kind,fields){const form=w.document.querySelector('[data-form="'+kind+'"]');for(const [key,value]of Object.entries(fields))form.elements[key].value=value;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}
(async()=>{
 const f=fixture(),w=f.w,a=w.RentSketchAutosave;await a.flush();assert.equal(a.getRevision(),1);
 await w.RentSketchProjects.open();assert.ok(w.document.querySelector('[role=dialog]'));assert.equal(w.document.querySelector('[data-form=crew]'),null);
 submit(w,'version',{name:'Original arrangement'});await until(()=>f.versions.length===1&&!w.document.querySelector('[data-form=version] button').disabled);
 f.scene={...f.scene,eventName:'Changed arrangement'};await a.flush();assert.equal(a.getRevision(),2);
 w.document.querySelector('[data-action=restore]').click();await until(()=>a.getRevision()===3&&!w.document.querySelector('[data-form=version] button').disabled);assert.equal(f.scene.eventName,undefined);
 submit(w,'details',{projectName:'Graduation option',siteNotes:'Verify gate width <script>alert(1)</script>'});await until(()=>a.getRevision()===4&&!w.document.querySelector('[data-form=details] button').disabled);
 assert.equal(w.document.querySelector('.rs-project-panel script'),null,'site notes are escaped');
 submit(w,'share',{days:'7'});await until(()=>f.shares.length===1&&!w.document.querySelector('[data-form=share] button').disabled);assert.equal(f.calls.find(c=>c.pathname.endsWith('/share')).body.expiresInDays,7);assert.match(w.document.querySelector('[data-share-url]').value,/#share=opaque/);
 w.document.querySelector('[data-action=revoke]').click();await until(()=>f.shares[0].revokedAt&&!w.document.querySelector('[data-form=share] button').disabled);
 const originalId=a.getDesignId();submit(w,'alternative',{name:'Rain plan'});await until(()=>a.getDesignId()!==originalId&&!w.document.querySelector('[data-form=alternative] button').disabled);assert.equal(a.getRevision(),1);
 assert.equal(f.records.get(originalId).projectName,'Graduation option','alternative does not rename source');
 const id=a.getDesignId();f.records.get(id).revision=2;f.records.get(id).scene.eventName='Other device';f.scene={...f.scene,eventName:'My unsaved change'};
 await assert.rejects(a.flush(),/another device/);assert.equal(a.getRevision(),1);assert.equal(a.getState().status,'conflict');assert.equal(JSON.parse(w.localStorage.getItem('rentsketch-autosave:friendly')).scene.eventName,'My unsaved change');
 const writes=f.calls.filter(c=>c.method==='PATCH').length;await assert.rejects(a.flush(),/Resolve/);assert.equal(f.calls.filter(c=>c.method==='PATCH').length,writes,'conflict never silently adopts remote revision');
 w.document.querySelector('[data-action=conflict-copy]').click();await until(()=>a.getDesignId()!==id&&!w.document.querySelector('[data-form=alternative] button').disabled);assert.equal(f.records.get(id).scene.eventName,'Other device');assert.equal(f.scene.eventName,'My unsaved change');
 w.RentSketchProjects.close();
 let release;f.delay=new Promise(resolve=>release=resolve);f.scene={...f.scene,eventName:'First in-flight edit'};const saving=a.flush();await until(()=>a.getState().status==='saving');f.scene={...f.scene,eventName:'Second in-flight edit'};w.dispatchEvent(new w.CustomEvent('rentsketch:requestSave'));release();await saving;
 await until(()=>a.getState().status==='local');await wait(1700);assert.equal(f.records.get(a.getDesignId()).scene.eventName,'Second in-flight edit','changes during a delayed save get a followup save');
 Object.defineProperty(w.navigator,'onLine',{configurable:true,value:false});f.scene={...f.scene,eventName:'Offline edit'};await assert.rejects(a.flush(),/offline/);assert.equal(a.getState().status,'offline');assert.equal(JSON.parse(w.localStorage.getItem('rentsketch-autosave:friendly')).scene.eventName,'Offline edit');
 Object.defineProperty(w.navigator,'onLine',{configurable:true,value:true});await a.flush();assert.equal(a.getState().status,'saved');
 f.staff=true;f.records.get(a.getDesignId()).crewNotes='Private loading instruction';await w.RentSketchProjects.open();assert.ok(w.document.querySelector('[data-form=crew]'));assert.ok(!w.localStorage.getItem('rentsketch-autosave:friendly').includes('Private loading instruction'));
  const printable=w.RentSketchProjects.crewHtml(f.records.get(a.getDesignId()),{});assert.match(printable,/White chairs/);assert.match(printable,/Confirm the access path/);assert.match(printable,/Private loading instruction/);assert.ok(!printable.includes('customerEmail'));
  w.FriendlyBridge.EQUIPMENT=[{id:'foam',name:'Foam cannon',widthFt:3,depthFt:3,heightFt:4,dimensionsConfirmed:true}];
  f.scene={...f.scene,backgroundPhoto:{path:'/api/tenants/friendly/background-photo/test?t=fixture'},objects:[...f.scene.objects,{id:'foam-one',kind:'equipment',equipmentId:'foam',widthFt:3,depthFt:3,x:9,y:12}]};
  await a.flush();const withPhoto=w.RentSketchProjects.crewHtml(f.records.get(a.getDesignId()),{includePhoto:true});assert.match(withPhoto,/Foam cannon/);assert.match(withPhoto,/https:\/\/fixture.invalid\/api\/tenants\/friendly\/background-photo\/test\?t=fixture/);
  let decodeDone,prints=0;w.HTMLImageElement.prototype.decode=()=>new Promise(resolve=>decodeDone=resolve);w.print=()=>{prints++;};
  const printing=w.RentSketchProjects.printCrewSheet({includePhoto:true});await until(()=>!!decodeDone);assert.equal(prints,0,'print waits for the selected photo to decode');decodeDone();await printing;assert.equal(prints,1);w.dispatchEvent(new w.Event('afterprint'));
  w.HTMLImageElement.prototype.decode=()=>Promise.reject(Error('fixture failed image'));await w.RentSketchProjects.printCrewSheet({includePhoto:true});assert.equal(prints,2);assert.match(w.document.querySelector('#rsCrewPrint').textContent,/could not be loaded for printing/);assert.equal(w.document.querySelector('#rsCrewPrint img'),null);w.dispatchEvent(new w.Event('afterprint'));
  assert.ok(!w.RentSketchProjects.crewHtml({...f.records.get(a.getDesignId()),crewNotes:''},{includePhoto:false}).includes('<img'),'venue photo is explicitly optional');
 f.staff=false;assert.ok(!w.RentSketchProjects.crewHtml(f.records.get(a.getDesignId()),{}).includes('Private loading instruction'));
 w.dispatchEvent(new w.CustomEvent('rentsketch:dashboardSessionChanged'));assert.equal(w.document.querySelector('.rs-project-panel'),null);
 f.close();console.log('PASS project forms: checkpoint, restore, alternatives, expiring read-only share/revoke, revision conflict copy, delayed-save continuation, offline recovery and private crew handoff');

 const locked=fixture(),lw=locked.w;locked.canEdit=false;locked.scene={tentId:'frame-20x20',objects:[]};await assert.rejects(lw.RentSketchAutosave.flush(),/read-only/);
 await lw.RentSketchAutosave.prepareCheckoutDraft();assert.equal(lw.RentSketchAutosave.getRevision(),1,'free product preview can checkpoint before checkout');
 lw.RENTSKETCH_SHARED_READONLY=true;const before=locked.calls.length;await lw.RentSketchProjects.open();assert.equal(lw.document.querySelector('[data-form=version]'),null);assert.equal(lw.document.querySelector('[data-action=revoke]'),null);assert.equal(lw.document.querySelector('[data-form=details]'),null);
 await assert.rejects(lw.RentSketchAutosave.prepareCheckoutDraft(),/read-only/);await lw.RentSketchProjects.printCrewSheet();assert.equal(locked.calls.length,before,'shared viewer cannot mutate or print private handoff');
 lw.document.querySelector('[role=dialog]').dispatchEvent(new lw.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(lw.document.querySelector('.rs-project-panel'),null);locked.close();
 console.log('PASS free-preview checkout remains available; shared viewer cannot save, restore, checkpoint, change notes, revoke links or access crew printing');
})().catch(error=>{console.error(error);process.exitCode=1});
