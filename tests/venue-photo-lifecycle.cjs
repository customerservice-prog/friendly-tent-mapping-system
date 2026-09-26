// Deferred responses exercise the production coordinator, not a reimplementation.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'script.js'),'utf8');
const coordinator=source.slice(source.indexOf('function venuePhotoContext('),source.indexOf('function resetVenuePhotoFraming('));
const restore=source.slice(source.indexOf('function loadScene('),source.indexOf('function venuePhotoContext('));
const tick=()=>new Promise(setImmediate),deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const photo=id=>({id,url:'https://api.test/photo/'+id,widthPx:1200,heightPx:800});
async function harness(){
 const pending=[],removed=[],notices=[],listeners=new Map();
 const identity={design:'design-a',session:'owner-a',staff:'',editable:true};
 const state={backgroundPhoto:photo('original'),venueScan:null,viewMode:'plan',photoComposition:null,tentId:null,siteWidthFt:50,siteLengthFt:60};
 let flush=async()=>identity.design,extract=async()=>({samples:['left','center','right'].map((role,i)=>({role,sampleIndex:i,offsetFactor:(i-1)/2,file:'video-'+role})),baselineFactor:.8});
 const autosave={getDesignId:()=>identity.design,getSessionId:()=>identity.session,flush:()=>flush()};
 const window={RENTSKETCH_API_URL:'https://api.test',RENTSKETCH_TENANT_SLUG:'friendly',RentSketchAutosave:autosave,RentSketchDashboardSession:{identity:()=>identity.staff},addEventListener:(name,fn)=>{listeners.set(name,[...(listeners.get(name)||[]),fn]);},dispatchEvent:event=>{for(const fn of listeners.get(event.type)||[])fn(event);}};
 const context=vm.createContext({console:{warn:()=>{},error:()=>{}},window,CustomEvent:class{constructor(type){this.type=type;}},state,setTimeout,clearTimeout,
   $:()=>null,canEditEvent:()=>identity.editable,requireEventEditing:()=>identity.editable,
   uploadVenuePhoto:(file,ctx)=>{const task={file,context:ctx,...deferred()};pending.push(task);return task.promise;},deleteVenuePhoto:async(p,ctx)=>{removed.push({id:p.id,context:ctx});},extractVenueScanVideo:file=>extract(file),
   normalizePhotoComposition:value=>value||{},defaultPhotoCalibration:()=>({scaleConfirmed:false}),normalizePhotoCalibration:value=>value||{},normalizePhotoGeometry:value=>value||[],
   buildSnapshot:()=>({photoSite:{widthFt:50,lengthFt:60}}),getConflicts:()=>[],renderDrawerBody:()=>{},renderViews:()=>{},closeDrawer:()=>{},adjustPhotoScale:()=>{},setViewMode:mode=>{state.viewMode=mode;},showLayoutNotice:message=>notices.push(message),
   photoMounted:false,photoViewMod:{unmount:()=>{}},pendingPlacement:null,byId:()=>null,TENTS:[],INFLATABLES:[],restoreCustomerDetails:()=>{},restoreReviewDeliveryZip:()=>{},restoreScenePreferences:()=>{},restoringScene:false,
   store:{reset:()=>{}},enterDesigner:()=>{}
 });
 const cache=new Map();function moduleFor(file){if(cache.has(file))return cache.get(file);const mod=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});cache.set(file,mod);return mod;}
 const venue=moduleFor(path.join(root,'js/ui/venue-photo.js'));await venue.link((spec,ref)=>moduleFor(path.resolve(path.dirname(ref.identifier),spec)));await venue.evaluate();
 context.normalizeVenuePhoto=venue.namespace.normalizeVenuePhoto;context.normalizeVenueScan=venue.namespace.normalizeVenueScan;
 vm.runInContext(coordinator+'\n'+restore,context);
 return {context,state,identity,pending,removed,notices,window,autosave,setFlush:fn=>{flush=fn;},setExtract:fn=>{extract=fn;},
   upload:(role,file)=>context.chooseVenueScanPhoto(role,file||role),single:file=>context.chooseVenuePhoto({name:file}),video:()=>context.chooseVenueScanVideo('video'),
   resolve:(index,id)=>pending[index].resolve(photo(id)),roles:()=>Array.from(context.currentVenueScan().frames,frame=>frame.role).sort(),
   event:name=>window.dispatchEvent({type:name})};
}
(async()=>{
 {
  const h=await harness();h.state.venueScan={frames:[{...photo('center'),role:'center'}],baselineFt:6};
  const left=h.upload('left'),right=h.upload('right');await tick();assert.equal(h.pending.length,2);
  h.context.updateVenueScanBaseline(8);h.resolve(1,'right');await right;h.resolve(0,'left');await left;
  assert.deepEqual(h.roles(),['center','left','right'],'overlapping manual uploads retain every completed viewpoint');
  assert.equal(h.state.venueScan.baselineFt,8,'upload completion preserves the latest entered camera travel');
 }
 {
  const h=await harness(),first=h.upload('left','older');await tick();const last=h.upload('left','newer');await tick();h.resolve(1,'newer');await last;h.resolve(0,'older');
  assert.equal(await first,false);assert.equal(h.state.venueScan.frames[0].id,'newer','older same-role response cannot replace the chosen photo');assert.deepEqual(h.removed.map(p=>p.id),['older']);
 }
 {
  const h=await harness(),pending=h.upload('left');await tick();await h.context.clearVenueScan();h.resolve(0,'late-left');
  assert.equal(await pending,false);assert.deepEqual(h.roles(),[]);assert.equal(h.state.backgroundPhoto.id,'original','clearing a scan retains the center photo');assert.ok(h.removed.some(p=>p.id==='late-left'));
 }
 {
  const h=await harness(),pending=h.single('replacement');await tick();await h.context.removeVenuePhoto();h.resolve(0,'late-replacement');
  assert.equal(await pending,false);assert.equal(h.state.backgroundPhoto,null,'removed photos cannot reappear after an upload returns');assert.deepEqual(h.roles(),[]);
 }
 {
  const h=await harness(),older=h.single('old');await tick();const newer=h.single('new');await tick();h.resolve(1,'new');await newer;h.resolve(0,'old');await older;
  assert.equal(h.state.backgroundPhoto.id,'new');assert.ok(!h.removed.some(p=>p.id==='new'));assert.ok(h.removed.some(p=>p.id==='old'));
 }
 {
  const h=await harness(),older=h.upload('left');await tick();const replacement=h.single('new');await tick();h.resolve(1,'new');await replacement;h.resolve(0,'old-left');await older;
  assert.equal(h.state.backgroundPhoto.id,'new');assert.deepEqual(h.roles(),[],'manual results cannot revive a scan replaced by Photo Match');
 }
 {
  const h=await harness(),pending=h.upload('right');await tick();
  assert.equal(h.context.loadScene({tentId:null,objects:[],backgroundPhoto:photo('restored'),venueScan:null}),true);h.resolve(0,'old-right');await pending;
  assert.equal(h.state.backgroundPhoto.id,'restored');assert.deepEqual(h.roles(),[],'even same-project revision restoration cancels old uploads');
 }
 {
  const h=await harness(),pending=h.upload('left');await tick();h.identity.design='design-b';h.resolve(0,'wrong-project');await pending;
  assert.deepEqual(h.roles(),[]);assert.equal(h.removed[0].context.designId,'design-a','discarded uploads are cleaned against their original project');
 }
 {
  const h=await harness();h.identity.staff='staff-a';const pending=h.single('private');await tick();h.identity.staff='staff-b';h.event('rentsketch:dashboardSessionChanged');h.resolve(0,'old-staff');await pending;
  assert.equal(h.state.backgroundPhoto.id,'original');assert.equal(h.removed.length,0,'never clean up using a different signed-in identity');
 }
 {
  const h=await harness(),pending=h.upload('left');await tick();h.identity.editable=false;h.resolve(0,'after-expiry');await pending;
  assert.deepEqual(h.roles(),[],'expired access cannot apply an upload even without an expiry event');
 }
 {
  const h=await harness(),pending=h.upload('left');await tick();h.identity.session='other-owner';h.resolve(0,'old-owner');await pending;
  assert.deepEqual(h.roles(),[]);assert.equal(h.removed.length,0,'owner capability changes cannot adopt or delete the old upload');
 }
 {
  const h=await harness(),extract=deferred();h.setExtract(()=>extract.promise);const pending=h.video();await tick();await h.context.clearVenueScan();extract.resolve({samples:[{role:'center',file:'center'}]});await pending;
  assert.equal(h.pending.length,0,'canceled video extraction never starts network uploads');
 }
 {
  const h=await harness(),pending=h.video();await tick();h.resolve(0,'video-left');await tick();assert.equal(h.pending.length,2);h.pending[1].reject(new Error('Upload unavailable'));assert.equal(await pending,false);
  assert.equal(h.state.backgroundPhoto.id,'original');assert.deepEqual(h.roles(),[]);assert.deepEqual(h.removed.map(p=>p.id),['video-left'],'partial video failure frees uploaded but unused photos');
 }
 {
  const h=await harness(),pending=h.video();await tick();h.resolve(0,'video-left');await tick();h.resolve(1,'video-center');await tick();h.resolve(2,'video-right');assert.equal(await pending,true);
  assert.equal(h.state.backgroundPhoto.id,'video-center');assert.deepEqual(h.roles(),['center','left','right']);assert.ok(!h.removed.some(p=>p.id==='video-center'));
 }
 {
  const h=await harness();let flushes=0;h.setFlush(async()=>{if(++flushes>1)throw new Error('Offline');return h.identity.design;});const pending=h.single('local');await tick();h.resolve(0,'local-photo');await pending;
  assert.equal(h.state.backgroundPhoto.id,'local-photo');assert.equal(h.removed.length,0,'applied photo stays available for local recovery when cloud save fails');
 }
 {
  const h=await harness();delete h.window.RentSketchAutosave;h.window.RentSketchStartAutosave=()=>h.window.RentSketchAutosave=h.autosave;
  const pending=h.upload('left');await tick();h.resolve(0,'first-photo');assert.equal(await pending,true,'starting autosave does not invalidate the first upload');
 }
 console.log('PASS venue photo lifecycle: concurrent roles, replacement order, clear/remove/restore, project and identity boundaries, canceled extraction, partial video cleanup, cloud-save recovery.');
})().catch(error=>{console.error(error);process.exitCode=1;});
