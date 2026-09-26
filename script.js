import { EQUIPMENT, equipmentById, equipmentItem } from './js/data/equipment.js';
import { inventoryBrowser, equipmentInspector, equipmentPhoto } from './js/ui/inventory-browser.js';
import { contextualProducts, compatibleContextTables, applyTableProduct, lightingCompatibility, exactSidewallSegments } from './js/core/contextual-products.js';
import { contextualPicker } from './js/ui/contextual-picker.js';
import {mountReviewPricing,currentReviewPricing,reviewDeliveryZip,restoreReviewDeliveryZip} from './js/ui/review-pricing.js';
import './js/ui/designer-help.js';
import { sitePanel } from './js/ui/site-controls.js';
import { normalizeVenuePhoto, normalizeVenueScan, extractVenueScanVideo, uploadVenuePhoto, deleteVenuePhoto } from './js/ui/venue-photo.js';
import { defaultPhotoCalibration, normalizePhotoCalibration, photoCalibrationValidity, normalizePhotoGeometry, rentalPhotoPlacement } from './js/core/photo-geometry.js';
import { evaluatePropertyScene, summarizePropertyFit } from './js/core/property-planning.js';
import { normalizePhotoComposition } from './js/core/photo-composition.js';
import { normalizeScanCheck } from './js/core/scan-validation.js';
import { runPhotoPlanChecks } from './js/core/photo-plan.js';
import { TABLETOP } from './js/data/tabletop.js';
// Friendly Event Designer - v2 client-side logic
// Customer-facing designer: contextual drawers, visual cards, a 2D-first
// canvas, a contextual inspector, actionable Event Check feedback, and a
// persistent status bar. Pricing reflects Friendly Party Rental's published
// per-day pricing (see FRIENDLY-EVENT-DESIGNER.md, section 7).

import { INFLATABLES, inflatableItem, byId as inflatableById } from './js/data/inflatables.js';
import { inflatableCards, inflatableInspector, inflatablePhoto } from './js/ui/inflatable-controls.js';
import { ACCESSORIES, accessoryById, accessoryItem } from './js/data/accessories.js';
import { accessoryInspector, accessoryIcon } from './js/ui/accessory-controls.js';
import { partyLayout } from './js/core/party-scene.js';
import { sceneSetting } from './js/ui/scene-setting.js';
import { tablePositions, dancePositions } from './js/core/suggested-layout.js';
import { setupPanel, railIcons } from './js/ui/event-setup.js';
import { summarizeEvent } from './js/core/eventSummary.js';
import { escapeHtml, tableCard, tableInspector, chairsDrawer, renderEquipmentContent, equipmentPreview, orderEquipment, chairVisual } from './js/ui/equipment-controls.js';
import { createLayoutStore } from './js/core/layoutStore.js';
import { runAllChecks, mergeDanceFloorZone } from './js/core/collision.js';
import { LINENS, optionsForTable } from './js/data/linens.js';
import { LIGHTING_OPTIONS, tentLightingPriceFor, lightingForTent } from './js/data/lighting.js';
import { DANCE_SECTION, DANCE_FLOOR_SIZES, sectionsForSize, priceForSize } from './js/data/danceFloor.js';
import { PACKAGES } from './js/data/packages.js';
import * as plan2dMod from './js/ui/plan2d.js';
import * as photoViewMod from './js/ui/photo-view.js';
import { byId as chairVisualById } from './js/data/chairs.js';
import { FRIENDLY_TENANT, TENTS, TABLES, CHAIRS } from './js/data/tenant.js';
import { computeCenterPoles, computeSidewallSegments, installationClearanceFt, resolveAnchoringMethod } from './js/data/tentStructure.js';

// Preview is view-only even when an editing control is reached indirectly.
function canEditEvent(){if(window.RENTSKETCH_SHARED_READONLY===true)return false;var slug=new URLSearchParams(location.search).get('tenant')||'generic';return !['friendly','generic'].includes(slug)||window.RentSketchEventPass?.canEdit()===true;}
function requireEventEditing(){if(canEditEvent())return true;window.RentSketchEventPass?.requestAccess();return false;}
function bareRental(layout){return !(layout.zones?.length||layout.aisles?.length)&&(!layout.objects.length||(layout.tentId==null&&layout.objects.length===1&&layout.objects[0].kind==='inflatable'));}
function allowLayoutMutation(action,next,current){
  if(canEditEvent()||restoringScene)return true;
  return !window.RentSketchEventPass?.hasPaidEvent()&&['reset','setTent'].includes(action)&&bareRental(current)&&bareRental(next);
}
var restoringScene=false;
var NL = String.fromCharCode(10);
TENTS.forEach(function (t) { t.centerPoles=computeCenterPoles(t.type,t.widthFt,t.lengthFt);t.installationClearanceFt=installationClearanceFt(t.type); });
var state={siteLayout:false,siteWidthFt:50,siteLengthFt:60,primaryInflatableId:null,eventType:'wedding',guestCount:50,spaceType:'backyard',surfaceType:'notSure',needDance:false,danceFloorSizeId:'18x18',customDanceFloorFt:null,matchedPackageId:null,tentId:'pole-20x40',chairId:'plastic-white',lightingId:'lighting-none',lightingProductId:null,sidewalls:[],backgroundPhoto:null,venueScan:null,photoCalibration:null,photoComposition:null,photoGeometry:[],photoTentPlacement:null,selectedPhotoId:null,venuePhotoStatus:{text:'',kind:''},selectedId:null,viewMode:'plan',activeDrawer:null,lastTableConfig:null,eventCheckOpen:false,estimateOpen:false,inspectorCollapsed:true};
var inventoryQuery="",inventoryCategory="all",pendingContext=null;
window.addEventListener('rentsketch:catalogReady',function(event){window.RENTSKETCH_PRODUCTS=Array.isArray(event.detail?.products)?event.detail.products:[];if(window.FriendlyBridge)refreshAll();});
var nextItemNum=1,tryTheseDismissed=false;function newItemId(){var id;do{id='item-'+(nextItemNum++);}while(store&&store.getState().objects.some(function(o){return o.id===id;}));return id;}var store=createLayoutStore({tentId:state.tentId,objects:[],zones:[],aisles:[]},{canMutate:allowLayoutMutation,captureContext:photoHistoryContext,restoreContext:restorePhotoHistoryContext}),tableDraft=null;function byId(arr,id){return arr.find(function(a){return a.id===id;});}function $(id){return document.getElementById(id);}function showStep(id){document.querySelectorAll('.step').forEach(function(el){el.classList.remove('active');});$(id).classList.add('active');}function money(n){return'$'+n.toFixed(2);}function moneyOrAsk(n){return(n===null||n===undefined)?'Ask for pricing':money(n);}function danceFloorSizeFt(){if(state.danceFloorSizeId==='custom')return state.customDanceFloorFt||18;var sz=byId(DANCE_FLOOR_SIZES,state.danceFloorSizeId);return sz?sz.ft:18;}function recommendDanceFloorFt(){var g=state.guestCount;if(g<=30)return 12;if(g<=60)return 15;if(g<=100)return 18;if(g<=150)return 21;return 24;}function validateLighting(){if(!byId(LIGHTING_OPTIONS,state.lightingId)){state.lightingId='lighting-none';state.lightingProductId=null;}if(state.lightingProductId){var product=currentContextProducts().find(p=>p.kind==='lighting'&&p.productId===state.lightingProductId);if(product&&!lightingCompatibility(product,layoutSpace())){state.lightingId='lighting-none';state.lightingProductId=null;showLayoutNotice('The previous lighting does not fit this tent. Choose lighting for the new size.');}}}

function layoutSpace(){
  var tent=byId(TENTS,state.tentId);if(tent)return state.siteLayout?Object.assign({},tent,{planningArea:{widthFt:Math.max(state.siteWidthFt,tent.widthFt),lengthFt:Math.max(state.siteLengthFt,tent.lengthFt)}}):tent;
  var placed=store?.getState().objects.filter(o=>o.kind==='inflatable')||[];var primary=inflatableById(placed.find(o=>o.inflatableId===state.primaryInflatableId)?.inflatableId||placed[0]?.inflatableId);
  return {id:'outdoor-space',isSite:true,type:'outdoor',name:primary?.name||'Outdoor Event Space',widthFt:state.siteWidthFt||50,lengthFt:state.siteLengthFt||60,centerPoles:[],installationClearanceFt:0};
}
function openInflatablePreview(product){if(!canEditEvent()&&(!bareRental(store.getState())||window.RentSketchEventPass?.hasPaidEvent()))return false;
  state.tentId=null;state.primaryInflatableId=product.id;state.guestCount=0;state.eventType='birthday';state.surfaceType='notSure';state.lightingId='lighting-none';
  var initialSpan=Math.max(40,Math.ceil(Math.max(product.widthFt,product.depthFt)+16));state.siteWidthFt=initialSpan;state.siteLengthFt=initialSpan;
  var object=inflatableItem(product,newItemId(),(state.siteWidthFt-product.widthFt)/2,(state.siteLengthFt-product.depthFt)/2);
  store.reset({tentId:null,objects:[object],zones:[],aisles:[]});enterDesigner();
}
function beginInflatablePlacement(product){if(!requireEventEditing())return false;
  if(!product)return;
  var tent=layoutSpace();if(!tent.isSite){state.siteLayout=true;state.siteWidthFt=Math.max(state.siteWidthFt,tent.widthFt+product.widthFt+12);state.siteLengthFt=Math.max(state.siteLengthFt,tent.lengthFt,product.depthFt+12);}
  var space=layoutSpace().planningArea||layoutSpace();if(product.widthFt>space.widthFt||product.depthFt>space.lengthFt){showLayoutNotice('Increase your outdoor planning area in Suggest before adding this inflatable.');return;}
  var object=inflatableItem(product,newItemId(),tent.isSite?(space.widthFt-product.widthFt)/2:tent.widthFt+10,(space.lengthFt-product.depthFt)/2);
  startPlacement([object],product.name,'');$('placementBar').querySelector('.placement-preview').innerHTML=inflatablePhoto(product);
}
function beginAccessoryPlacement(product){if(!requireEventEditing())return false;if(!product)return;var space=layoutSpace().planningArea||layoutSpace();if(product.widthFt>space.widthFt||product.depthFt>space.lengthFt){showLayoutNotice(product.name+' needs more planning space. Increase the outdoor area or choose a larger tent/site.');return;}var object=accessoryItem(product,newItemId(),Math.max(0,(space.widthFt-product.widthFt)/2),Math.max(0,(space.lengthFt-product.depthFt)/2));startPlacement([object],product.name,'');$('placementBar').querySelector('.placement-preview').innerHTML='<span class="accessory-placement-preview">'+accessoryIcon(product.accessoryType)+'</span>';}
function pickDefaultRoundTable(){var exact=byId(TABLES,'round-5ft');if(exact)return exact;var round=TABLES.filter(function(t){return t.shape==='round'&&t.seatsDefault>0;});if(round.length)return round[0];var any=TABLES.filter(function(t){return t.seatsDefault>0;});return any.length?any[0]:(TABLES.length?TABLES[0]:null);}function useRecommendedLayout(){if(!requireEventEditing())return false;
  var tent=layoutSpace(),tableDef=pickDefaultRoundTable(),objects=store.getState().objects.filter(o=>['inflatable','equipment','accessory'].includes(o.kind));
  if(!tent)return;
  if(CHAIRS.length&&!byId(CHAIRS,state.chairId))state.chairId=CHAIRS[0].id;
  if(state.needDance) dancePositions(tent,danceFloorSizeFt(),3,objects).forEach(function(pos){objects.push({id:newItemId(),kind:'dance',widthFt:DANCE_SECTION.ft,depthFt:DANCE_SECTION.ft,x:pos.x,y:pos.y});});
  var seats=tableDef?.seatsDefault||0,needed=seats?Math.ceil(state.guestCount/seats):0;
  var positions=tableDef?tablePositions(tent,tableDef,chairVisualById(state.chairId)||{},objects):[];
  positions.slice(0,needed).forEach(function(pos){objects.push({id:newItemId(),kind:'table',tableId:tableDef.id,shape:tableDef.shape,widthFt:tableDef.diameterFt||tableDef.widthFt,depthFt:tableDef.diameterFt||tableDef.depthFt,x:pos.x,y:pos.y,seatCount:seats,chairId:state.chairId,linenId:null});});
  state.selectedId=null;state.lastTableConfig=tableDef?{tableId:tableDef.id,chairId:state.chairId,seatCount:seats,linenId:null}:null;
  closeDrawer();store.replaceObjects(objects);
  if(!$('step-designer').classList.contains('active'))enterDesigner();
  var placed=Math.min(positions.length,needed)*seats;
  showLayoutNotice(placed<state.guestCount?'This arrangement seats '+placed+' of your '+state.guestCount+' guests. Your '+tent.name+' is unchanged. Adjust the layout or ask your rental company about more space.':'Your suggested layout is ready: '+placed+' seats. Select any table to make it yours.');
}
function showLayoutNotice(message,durationMs){var note=$('layoutNotice');if(!note){note=document.createElement('div');note.id='layoutNotice';note.className='layout-notice';note.setAttribute('role','status');document.querySelector('.canvas-viewport').appendChild(note);}note.replaceChildren();var text=document.createElement('span');text.textContent=message;note.appendChild(text);var close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Dismiss layout notice');close.onclick=function(){note.remove();};note.appendChild(close);if(durationMs){var textAtDisplay=note.textContent;setTimeout(function(){if(note.isConnected&&note.textContent===textAtDisplay)note.remove();},durationMs);}}
function customizeFromScratch(){if(!canEditEvent()&&(!bareRental(store.getState())||window.RentSketchEventPass?.hasPaidEvent()))return false;store.reset({tentId:state.tentId,objects:[],zones:[],aisles:[]});state.selectedId=null;state.lastTableConfig=null;if(CHAIRS.length&&!byId(CHAIRS,state.chairId))state.chairId=CHAIRS[0].id;enterDesigner();}function enterDesigner(){if(state.tentId&&!TENTS.length){alert('This rental catalog is not ready. Please reload.');return;}document.body.classList.add('designer-active');document.body.classList.remove('guided-active');state.viewMode='plan';state.selectedId=null;state.activeDrawer=null;state.eventCheckOpen=false;state.estimateOpen=false;validateLighting();showStep('step-designer');closeDrawer();mountPlan();setViewMode('plan');refreshAll();if(!window.RENTSKETCH_TENT_PREVIEW){try{setTimeout(function(){window.parent.postMessage({type:'rentsketch.ready'},'*');},16);}catch(e){}}}
// Contact details and scene preferences travel with the existing saved event.
function customerDetails(){
  return {name:$('customerName')?.value||'',email:$('customerEmail')?.value||'',date:$('customerDate')?.value||''};
}
function restoreCustomerDetails(value,checkoutEmail){
  var details=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  [['name','customerName',200],['email','customerEmail',254],['date','customerDate',10]].forEach(function([key,id,max]){
    var field=$(id);if(!field)return;
    var text=typeof details[key]==='string'?details[key]:'';
    if(key==='email'&&!text&&typeof checkoutEmail==='string')text=checkoutEmail;
    field.value=text.slice(0,max);
  });
}
function getScene(){
  var layout=store.getState();
  return Object.assign({},state,{tentId:layout.tentId,objects:layout.objects,zones:layout.zones,aisles:layout.aisles,customer:customerDetails(),deliveryZip:reviewDeliveryZip(),sceneOptions:Object.assign({},sceneOptions)});
}
function loadScene(scene,options){
  if(!canEditEvent()&&!window.RENTSKETCH_PASS_RESTORING)return false;
  if(scene?.orderStart&&Array.isArray(scene.orderStart.items)){
    scene=Object.assign({},scene);
    var booked=scene.orderStart.items;
    var match=function(product){return booked.some(function(item){return item.slug&&product.externalId==='fpr:'+item.slug;});};
    var bookedTent=TENTS.find(match),bookedInflatable=!bookedTent&&INFLATABLES.find(match);
    scene.tentId=bookedTent?bookedTent.id:null;
    if(bookedInflatable){
      var span=Math.max(40,Math.ceil(Math.max(bookedInflatable.widthFt,bookedInflatable.depthFt)+16));
      scene.siteWidthFt=span;scene.siteLengthFt=span;scene.primaryInflatableId=bookedInflatable.id;
      scene.objects=[inflatableItem(bookedInflatable,newItemId(),(span-bookedInflatable.widthFt)/2,(span-bookedInflatable.depthFt)/2)];
    }
  }
  if(!scene||typeof scene!=='object'||!Array.isArray(scene.objects)||(!scene.objects.length&&!Object.prototype.hasOwnProperty.call(scene,'tentId')))return false;
  var previousScanInputs=scanRuntimeInputs();
  if(pendingPlacement)cancelPlacement();
  ['eventName','siteLayout','siteWidthFt','siteLengthFt','primaryInflatableId','eventType','guestCount','spaceType','surfaceType','needDance','danceFloorSizeId','customDanceFloorFt','matchedPackageId','tentId','chairId','lightingId','lightingProductId','sidewalls','backgroundPhoto','venueScan','photoCalibration','photoComposition','photoGeometry','photoTentPlacement','lastTableConfig'].forEach(function(k){if(scene[k]!==undefined&&scene[k]!==null)state[k]=scene[k];});
  ['tentId','lightingProductId','primaryInflatableId','customDanceFloorFt','matchedPackageId','sidewalls','backgroundPhoto','venueScan','photoCalibration','photoComposition','photoGeometry','photoTentPlacement','lastTableConfig'].forEach(function(k){if(Object.prototype.hasOwnProperty.call(scene,k))state[k]=scene[k];});
  state.backgroundPhoto=normalizeVenuePhoto(state.backgroundPhoto,window.RENTSKETCH_API_URL);state.photoComposition=normalizePhotoComposition(scene.photoComposition);
  state.venueScan=normalizeVenueScan(state.venueScan,window.RENTSKETCH_API_URL);
  var restoreTent=byId(TENTS,state.tentId),photoSiteForRestore={id:'photo-site',isSite:true,type:'photo-site',name:'Photo venue',widthFt:Math.max(Number(state.siteWidthFt)||50,(restoreTent?.widthFt||0)+20,50),lengthFt:Math.max(Number(state.siteLengthFt)||60,(restoreTent?.lengthFt||0)+20,60)};
  state.photoCalibration=state.backgroundPhoto?normalizePhotoCalibration(state.photoCalibration,photoSiteForRestore,state.backgroundPhoto):null;
  state.photoGeometry=state.backgroundPhoto?normalizePhotoGeometry(state.photoGeometry,photoSiteForRestore):[];
  if(previousScanInputs!==scanRuntimeInputs())window.RENTSKETCH_SCAN_RECONSTRUCTION=null;
  restoreCustomerDetails(scene.customer,options?.customerEmail);
  restoreReviewDeliveryZip(scene.deliveryZip);
  restoreScenePreferences(scene.sceneOptions);
  restoringScene=true;
  try{store.reset({tentId:state.tentId,objects:scene.objects,zones:Array.isArray(scene.zones)?scene.zones:[],aisles:Array.isArray(scene.aisles)?scene.aisles:[]});}
  finally{restoringScene=false;}
  enterDesigner();
  if(scene.viewMode==='photo'&&state.backgroundPhoto)setViewMode('photo');else if(scene.viewMode==='3d')setViewMode('3d');
  return true;
}
function venuePhotoContext(designId){
  var autosave=window.RentSketchAutosave;
  return {api:window.RENTSKETCH_API_URL,slug:window.RENTSKETCH_TENANT_SLUG||'generic',designId:designId||autosave?.getDesignId?.(),sessionId:autosave?.getSessionId?.()};
}
async function ensureVenuePhotoDesign(){
  var autosave=window.RentSketchAutosave;
  if(!autosave&&window.RentSketchStartAutosave)autosave=window.RentSketchStartAutosave();
  if(!autosave?.flush)throw new Error('Design saving is still starting. Try the photo again.');
  return await autosave.flush();
}
function setVenuePhotoStatus(text,kind){
  state.venuePhotoStatus={text:String(text||''),kind:String(kind||'')};
  var el=$('drawerBody')?.querySelector('[data-role="venue-photo-status"]');
  if(el){el.textContent=state.venuePhotoStatus.text;el.dataset.kind=state.venuePhotoStatus.kind;}
}
async function chooseVenuePhoto(file,input){
  if(!file)return false;
  if(!requireEventEditing()){
    setVenuePhotoStatus('Photo selected, but this event is not currently unlocked for editing.','error');
    return false;
  }
  if(input)input.disabled=true;
  var previous=state.backgroundPhoto,previousScan=currentVenueScan();
  var label=(file.name||'photo').slice(0,120);
  try{
    setVenuePhotoStatus('Selected '+label+' · preparing your venue photo…','working');
    showLayoutNotice('Applying '+label+' to your venue…',5000);
    var designId=await ensureVenuePhotoDesign();
    if(!designId)throw new Error('This layout could not be saved before the photo upload.');
    setVenuePhotoStatus('Uploading '+label+'…','working');
    var photo=await uploadVenuePhoto(file,venuePhotoContext(designId));
    state.backgroundPhoto=photo;state.photoComposition=normalizePhotoComposition(null);state.venueScan=null;window.RENTSKETCH_SCAN_RECONSTRUCTION=null;
    var snapAfterPhoto=buildSnapshot(getConflicts());
    state.photoCalibration=defaultPhotoCalibration(snapAfterPhoto.photoSite,state.backgroundPhoto);state.photoGeometry=[];state.photoTentPlacement=null;state.selectedPhotoId=null;
    state.venuePhotoStatus={text:'Applied · Set a ground measurement and align the corners, then preview your rentals.',kind:'success'};
    renderDrawerBody('site');renderViews(getConflicts());closeDrawer();adjustPhotoScale();
    window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));
    var photoSaved=false;
    try{await window.RentSketchAutosave?.flush?.();photoSaved=true;}catch(saveErr){console.warn('[RentSketch] venue photo uploaded; design save will retry',saveErr);}
    if(photoSaved&&previous?.id&&previous.id!==photo.id)deleteVenuePhoto(previous,venuePhotoContext(designId));
    if(photoSaved)venueScanPhotos(previousScan).filter(f=>f.id!==photo.id&&f.id!==previous?.id).forEach(f=>deleteVenuePhoto(f,venuePhotoContext(designId)));
    showLayoutNotice('Photo ready. Adjust the ground corners and drag rentals into place. Photo scale is estimated; verify dimensions on site.',6500);
    return true;
  }catch(err){
    console.error('[RentSketch] venue photo failed',err);
    var message=err?.message||'That venue photo could not be added.';
    setVenuePhotoStatus('Could not apply photo: '+message,'error');
    showLayoutNotice('Could not apply photo: '+message,8000);
    return false;
  }finally{if(input&&input.isConnected)input.disabled=false;}
}
function currentVenueScan(){
  return normalizeVenueScan(state.venueScan,window.RENTSKETCH_API_URL);
}
function venueScanPhotos(scan){
  scan=scan||currentVenueScan();const unique=new Map();
  [...(scan.frames||[]),...(scan.samples||[])].forEach(function(photo){if(photo?.id)unique.set(photo.id,photo);});
  return Array.from(unique.values());
}
function scanRuntimeInputs(){var snapshot=buildSnapshot([]);return JSON.stringify([snapshot.venueScan,snapshot.photoSite?.widthFt,snapshot.photoSite?.lengthFt,snapshot.photoCalibration]);}
function metricScanReady(){var scan=currentVenueScan(),runtime=window.RENTSKETCH_SCAN_RECONSTRUCTION;if(scan.status!=='ready')return false;return runtime?.ready===true;}
async function chooseVenueScanPhoto(role,file,input){
  if(!file||!['left','center','right'].includes(role))return false;
  if(!requireEventEditing())return false;
  if(input)input.disabled=true;
  const before=currentVenueScan(),previous=before.frames.find(f=>f.role===role)||null;
  try{
    showLayoutNotice('Uploading '+role+' Space Scan photo…',4200);
    const designId=await ensureVenuePhotoDesign();
    if(!designId)throw new Error('This layout could not be saved before the scan photo upload.');
    const photo=await uploadVenuePhoto(file,venuePhotoContext(designId));
    const frames=before.frames.filter(f=>f.role!==role).concat([{...photo,role}]);
    state.venueScan=normalizeVenueScan({...before,frames,validationCheck:null,samples:[],captureMethod:'manual',baselineFactor:1},window.RENTSKETCH_API_URL);window.RENTSKETCH_SCAN_RECONSTRUCTION={ready:false,loading:state.venueScan.status==='ready'};
    if(role==='center'){
      state.backgroundPhoto={...photo};state.photoComposition=normalizePhotoComposition(null);
      // A new center viewpoint changes the Photo Match camera itself. Recreate
      // the Photo View workspace instead of carrying stale pointer/selection
      // state from the previous single-photo image.
      if(photoMounted){photoViewMod.unmount();photoMounted=false;}
      const snap=buildSnapshot(getConflicts());
      state.photoCalibration=defaultPhotoCalibration(snap.photoSite,state.backgroundPhoto);
      state.photoGeometry=[];state.photoTentPlacement=null;state.selectedPhotoId=null;
    }
    renderDrawerBody('site');renderViews(getConflicts());
    if(state.venueScan.status==='ready')setViewMode('3d');
    window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));
    let saved=false;try{await window.RentSketchAutosave?.flush?.();saved=true;}catch(err){console.warn('[RentSketch] Space Scan save will retry',err);}
    if(saved){
      if(previous?.id&&previous.id!==photo.id&&previous.id!==state.backgroundPhoto?.id)deleteVenuePhoto(previous,venuePhotoContext(designId));
      const keep=new Set(state.venueScan.frames.map(f=>f.id).filter(Boolean));
      before.samples.filter(f=>f.id&&!keep.has(f.id)&&f.id!==state.backgroundPhoto?.id).forEach(f=>deleteVenuePhoto(f,venuePhotoContext(designId)));
    }
    if(state.venueScan.status==='ready'){
      showLayoutNotice('Photos captured. Checking overlap and estimating depth…',6500);
    }else{
      const captured=state.venueScan.frames.length;
      showLayoutNotice('Space Scan: '+captured+' of 3 viewpoints captured.',4200);
    }
    return true;
  }catch(err){
    console.error('[RentSketch] Space Scan photo failed',err);
    showLayoutNotice('Could not add Space Scan photo: '+(err?.message||'Upload failed.'),7000);
    return false;
  }finally{if(input&&input.isConnected)input.disabled=false;}
}
function updateVenueScanBaseline(value){
  if(!requireEventEditing())return false;
  const n=Number(value);if(!Number.isFinite(n))return false;
  const scan=currentVenueScan();
  state.venueScan=normalizeVenueScan({...scan,baselineFt:Math.max(2,Math.min(20,n))},window.RENTSKETCH_API_URL);window.RENTSKETCH_SCAN_RECONSTRUCTION={ready:false,loading:state.venueScan.status==='ready'};
  renderViews(getConflicts());window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));return true;
}
async function chooseVenueScanVideo(file,input){
  if(!file)return false;
  if(!requireEventEditing())return false;
  if(input)input.disabled=true;
  const before=currentVenueScan(),designId=await ensureVenuePhotoDesign().catch(()=>null);
  if(!designId){if(input&&input.isConnected)input.disabled=false;showLayoutNotice('This layout could not be saved before the scan video.',6000);return false;}
  try{
    showLayoutNotice('Reading Space Scan video and extracting viewpoints…',5000);
    const extracted=await extractVenueScanVideo(file);
    const uploadedSamples=[];
    for(let i=0;i<extracted.samples.length;i++){
      const sample=extracted.samples[i];
      showLayoutNotice('Uploading Space Scan viewpoint '+(i+1)+' of '+extracted.samples.length+'…',3500);
      const photo=await uploadVenuePhoto(sample.file,venuePhotoContext(designId));
      uploadedSamples.push({...photo,role:sample.role||undefined,sampleIndex:sample.sampleIndex,offsetFactor:sample.offsetFactor});
    }
    const center=uploadedSamples.find(f=>f.role==='center')||uploadedSamples[Math.floor(uploadedSamples.length/2)];
    if(!center)throw new Error('The center scan frame could not be created.');
    const primaryFrames=uploadedSamples.filter(f=>['left','center','right'].includes(f.role));
    state.venueScan=normalizeVenueScan({...before,frames:primaryFrames,validationCheck:null,samples:uploadedSamples,captureMethod:'video',baselineFactor:extracted.baselineFactor},window.RENTSKETCH_API_URL);window.RENTSKETCH_SCAN_RECONSTRUCTION={ready:false,loading:true};
    state.backgroundPhoto={...center};state.photoComposition=normalizePhotoComposition(null);
    if(photoMounted){photoViewMod.unmount();photoMounted=false;}
    const snap=buildSnapshot(getConflicts());
    state.photoCalibration=defaultPhotoCalibration(snap.photoSite,state.backgroundPhoto);
    state.photoGeometry=[];state.photoTentPlacement=null;state.selectedPhotoId=null;
    renderDrawerBody('site');renderViews(getConflicts());setViewMode('3d');
    window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));
    let saved=false;try{await window.RentSketchAutosave?.flush?.();saved=true;}catch(err){console.warn('[RentSketch] Space Scan video save will retry',err);}
    if(saved){
      const keep=new Set(uploadedSamples.map(f=>f.id));
      venueScanPhotos(before).filter(f=>f.id&&!keep.has(f.id)).forEach(f=>deleteVenuePhoto(f,venuePhotoContext(designId)));
    }
    showLayoutNotice('Video captured. Checking image quality and estimating depth…',6500);
    return true;
  }catch(err){
    console.error('[RentSketch] Space Scan video failed',err);
    showLayoutNotice('Could not build Space Scan from that video: '+(err?.message||'Try again while moving sideways more slowly.'),8000);
    return false;
  }finally{if(input&&input.isConnected)input.disabled=false;}
}
async function clearVenueScan(){
  if(!requireEventEditing())return false;
  const scan=currentVenueScan(),designId=window.RentSketchAutosave?.getDesignId?.();
  const deletable=venueScanPhotos(scan).filter(f=>f.id&&f.id!==state.backgroundPhoto?.id);
  state.venueScan=null;window.RENTSKETCH_SCAN_RECONSTRUCTION=null;renderDrawerBody('site');renderViews(getConflicts());
  window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));
  let saved=false;try{await window.RentSketchAutosave?.flush?.();saved=true;}catch(_){}
  if(saved&&designId)deletable.forEach(photo=>deleteVenuePhoto(photo,venuePhotoContext(designId)));
  showLayoutNotice(state.backgroundPhoto?'Space Scan cleared. Your center photo is still available as Photo Match.':'Space Scan cleared.',4200);
  return true;
}
async function removeVenuePhoto(){
  if(!requireEventEditing()||!state.backgroundPhoto)return false;
  var old=state.backgroundPhoto,oldScan=currentVenueScan(),designId=window.RentSketchAutosave?.getDesignId?.();
  state.backgroundPhoto=null;state.photoComposition=normalizePhotoComposition(null);state.venueScan=null;window.RENTSKETCH_SCAN_RECONSTRUCTION=null;state.photoCalibration=null;state.photoGeometry=[];state.photoTentPlacement=null;state.selectedPhotoId=null;if(state.viewMode==='photo')state.viewMode='plan';renderDrawerBody('site');renderViews(getConflicts());setViewMode(state.viewMode);
  window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));
  var removalSaved=false;try{await window.RentSketchAutosave?.flush?.();removalSaved=true;}catch(_){}
  if(removalSaved&&designId){
    const unique=new Map([[old.id,old],...venueScanPhotos(oldScan).map(f=>[f.id,f])]);
    unique.forEach(photo=>deleteVenuePhoto(photo,venuePhotoContext(designId)));
  }
  showLayoutNotice('Venue photo and Space Scan removed. RentSketch is showing the generated setting again.',4200);
  return true;
}
function resetVenuePhotoFraming(){
  if(!state.backgroundPhoto)return;
  state.backgroundPhoto=Object.assign({},state.backgroundPhoto,{focusX:50,focusY:50,zoom:1,shade:.08});
  renderDrawerBody('site');renderViews(getConflicts());window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));
}
function updateVenuePhotoControl(role,value){
  if(!state.backgroundPhoto)return;
  var key=role==='venue-photo-focus-x'?'focusX':role==='venue-photo-focus-y'?'focusY':role==='venue-photo-zoom'?'zoom':role==='venue-photo-shade'?'shade':null;
  if(!key)return;
  var limits={focusX:[0,100],focusY:[0,100],zoom:[1,1.8],shade:[0,.45]},n=Number(value),range=limits[key];
  if(!Number.isFinite(n))return;
  state.backgroundPhoto=Object.assign({},state.backgroundPhoto,{[key]:Math.max(range[0],Math.min(range[1],n))});
  var preview=$('drawerBody')?.querySelector('.venue-photo-preview'),p=state.backgroundPhoto;
  if(preview){preview.style.objectPosition=p.focusX+'% '+p.focusY+'%';preview.style.transform='scale('+p.zoom+')';}
  renderViews(getConflicts());window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));
}
function normalizedSidewalls(tent){
  if(!tent||tent.isSite)return [];
  const valid=new Map(computeSidewallSegments(tent.widthFt,tent.lengthFt).map(function(s){return [s.id,s];}));
  return (Array.isArray(state.sidewalls)?state.sidewalls:[]).map(function(s){
    const base=valid.get(s.id);if(!base||!['solid','window'].includes(s.type))return null;
    return Object.assign({},base,{type:s.type,enabled:true,...(s.productId?{productId:s.productId,panelId:s.panelId||s.id,panelWidthFt:s.panelWidthFt||10}:{})});
  }).filter(Boolean);
}
function setSidewallSide(side,type){
  if(!requireEventEditing())return false;
  const tent=layoutSpace();if(!tent||tent.isSite)return false;
  const other=normalizedSidewalls(tent).filter(function(s){return s.side!==side;});
  if(type&&type!=='none')computeSidewallSegments(tent.widthFt,tent.lengthFt).filter(function(s){return s.side===side;}).forEach(function(s){other.push(Object.assign({},s,{type:type,enabled:true}));});
  state.sidewalls=other;refreshAll();window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));
}
function setAllSidewalls(type){
  if(!requireEventEditing())return false;
  const tent=layoutSpace();if(!tent||tent.isSite)return false;
  state.sidewalls=type&&type!=='none'?computeSidewallSegments(tent.widthFt,tent.lengthFt).map(function(s){return Object.assign({},s,{type:type,enabled:true});}):[];
  refreshAll();window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));
}
function sidewallSideType(side){
  const walls=normalizedSidewalls(layoutSpace()).filter(function(s){return s.side===side;});
  if(!walls.length)return 'none';
  return walls.every(function(s){return s.type==='window';})?'window':'solid';
}
function selectTent(tentId){if(!requireEventEditing())return false;if(pendingPlacement)cancelPlacement();if(state.tentId!==tentId)state.sidewalls=[];state.tentId=tentId;store.setTent(tentId);validateLighting();refreshAll();}function nextGridPosition(index,tent,cellFt,danceZone){var cols=Math.max(1,Math.floor((tent.widthFt-.5)/cellFt));return{x:2+(index%cols)*cellFt,y:2+Math.floor(index/cols)*cellFt};}function centerGridRows(){}function computeBalancedGridPositions(tent,count,cellFt,danceZone){var out=[];for(var i=0;i<count;i++)out.push(nextGridPosition(i,tent,cellFt,danceZone));return out;}function tableCellSize(tableDef,chairId){var base=tableDef.shape==='round'?tableDef.diameterFt:Math.max(tableDef.widthFt,tableDef.depthFt),chair=chairVisualById(chairId)||{},chairSpan=Math.max(chair.seatWidthFt||1.5,chair.seatDepthFt||1.5);return base+2*(chairSpan+.35)+.5;}function makeTableItem(tableId,chairId,seatCount,linenId,explicitPos){if(byId(CHAIRS,chairId)?.isThrone)chairId=CHAIRS.find(c=>!c.isThrone)?.id;var tent=layoutSpace(),t=byId(TABLES,tableId),n=store.getState().objects.filter(function(i){return i.kind==='table';}).length,pos=explicitPos||tablePositions(tent,t,chairVisualById(chairId)||{},store.getState().objects)[0]||nextGridPosition(n,tent,tableCellSize(t,chairId)),item={id:newItemId(),kind:'table',tableId:tableId,shape:t.shape,widthFt:t.shape==='round'?t.diameterFt:t.widthFt,depthFt:t.shape==='round'?t.diameterFt:t.depthFt,x:Math.max(0,Math.min(tent.widthFt-(t.diameterFt||t.widthFt),pos.x)),y:Math.max(0,Math.min(tent.lengthFt-(t.diameterFt||t.depthFt),pos.y)),seatCount:seatCount,chairId:chairId,linenId:linenId||null};return item;}
function addTableCustom(tableId,chairId,seatCount,linenId,explicitPos){if(!requireEventEditing())return false;var item=makeTableItem(tableId,chairId,seatCount,linenId,explicitPos);store.addObject(item);return item.id;}function addTable(tableId,chairId,linenId){var t=byId(TABLES,tableId);addTableCustom(tableId,chairId,t.seatsDefault,linenId);}function ensureTableDraft(){if(!tableDraft&&TABLES.length){var t=TABLES[0];tableDraft={tableId:t.id,chairId:state.chairId,seatCount:t.seatsDefault,linenId:null};}return tableDraft;}function addTableFromDraft(){var t=byId(TABLES,tableDraft.tableId),seats=t.seatsDefault>0?tableDraft.seatCount:0,id=addTableCustom(t.id,tableDraft.chairId,seats,tableDraft.linenId);state.lastTableConfig={tableId:t.id,chairId:tableDraft.chairId,seatCount:seats,linenId:tableDraft.linenId};return id;}function addTableFromConfig(cfg,n){if(!cfg)return;for(var i=0;i<n;i++)addTableCustom(cfg.tableId,cfg.chairId,cfg.seatCount,cfg.linenId);}function layoutDanceFloorPositions(tent,total){var per=Math.ceil(Math.sqrt(total)),out=[];for(var i=0;i<total;i++)out.push({x:2+(i%per)*DANCE_SECTION.ft,y:Math.max(2,tent.lengthFt-2-per*DANCE_SECTION.ft)+Math.floor(i/per)*DANCE_SECTION.ft});return out;}function removeAllDanceFloors(){store.getState().objects.filter(function(i){return i.kind==='dance';}).forEach(function(i){store.removeObject(i.id);});}function setDanceFloorCount(total){if(!requireEventEditing())return false;var tent=layoutSpace();removeAllDanceFloors();layoutDanceFloorPositions(tent,total).forEach(function(pos){store.addObject({id:newItemId(),kind:'dance',widthFt:DANCE_SECTION.ft,depthFt:DANCE_SECTION.ft,x:pos.x,y:pos.y});});}function setDanceFloorToSize(ft){if(!requireEventEditing())return false;var tent=layoutSpace(),positions=dancePositions(tent,ft);if(!positions.length){showLayoutNotice('This dance floor does not fit around the poles in your current tent. Choose a smaller size.');return;}var objects=store.getState().objects.filter(function(o){return o.kind!=='dance';});positions.forEach(function(pos){objects.push({id:newItemId(),kind:'dance',widthFt:DANCE_SECTION.ft,depthFt:DANCE_SECTION.ft,x:pos.x,y:pos.y});});store.replaceObjects(objects);}
function forCollision(objects){return objects.map(function(o){return Object.assign({},o,{kind:o.kind==='table'?'tableGroup':o.kind==='dance'?'danceFloor':o.kind});});}function getConflicts(){if(state.backgroundPhoto)return runPhotoPlanChecks(buildSnapshot([]),state.guestCount,state.surfaceType);return runAllChecks({objects:forCollision(store.getState().objects),aisles:[]},layoutSpace(),state.guestCount,state.surfaceType);}function conflictSeverityByItemId(conflicts){var map={};(conflicts||[]).forEach(function(c){(c.objectIds||[]).forEach(function(id){map[id]=c.severity;});});return map;}
var view3dMod=null,view3dPendingSnapshot=null,planMounted=false,photoMounted=false,view3dMountInProgress=false;var pendingPlacement=null,photoEditing=false;
var sceneOptions={night:false,weather:'clear',guests:false,styling:true,motion:!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches};
function buildSnapshot(conflicts){
  var tent=layoutSpace(),photoSite={id:'photo-site',isSite:true,type:'photo-site',name:'Photo venue',widthFt:Math.max(Number(state.siteWidthFt)||50,tent.widthFt+20,50),lengthFt:Math.max(Number(state.siteLengthFt)||60,tent.lengthFt+20,60)};
  var scanRuntime=window.RENTSKETCH_SCAN_RECONSTRUCTION,scanGeometry=scanRuntime?.ready&&Array.isArray(scanRuntime.obstacles)?scanRuntime.obstacles.map(function(o){return Object.assign({},o);}):[];
  return {tent:tent,photoSite:photoSite,sidewalls:normalizedSidewalls(tent),backgroundPhoto:normalizeVenuePhoto(state.backgroundPhoto,window.RENTSKETCH_API_URL),venueScan:normalizeVenueScan(state.venueScan,window.RENTSKETCH_API_URL),scanGeometry:scanGeometry,scanMetrics:scanRuntime?.ready?scanRuntime.metrics||null:null,scanValidation:scanRuntime?.ready?scanRuntime.validation||null:null,scanMeasurementPolicy:scanRuntime?.ready?scanRuntime.measurementPolicy||null:null,photoCalibration:state.backgroundPhoto?normalizePhotoCalibration(state.photoCalibration,photoSite,state.backgroundPhoto):null,photoComposition:normalizePhotoComposition(state.photoComposition),photoGeometry:state.backgroundPhoto?normalizePhotoGeometry(state.photoGeometry,photoSite):[],photoTentPlacement:state.photoTentPlacement,selectedPhotoId:state.selectedPhotoId,surfaceType:state.surfaceType,anchoringMethod:tent.isSite?null:resolveAnchoringMethod(tent.type,state.surfaceType),objects:store.getState().objects,placement:pendingPlacement,lightingOn:!!(state.lightingId&&state.lightingId!=='lighting-none'),lightingId:state.lightingId,selectedId:state.selectedId,severityMap:conflictSeverityByItemId(conflicts||[])};
}
function hasCapturedScan(){var reconstruction=window.RENTSKETCH_SCAN_RECONSTRUCTION;return currentVenueScan().status==='ready'&&!(reconstruction&&!reconstruction.ready&&!reconstruction.loading);}
function renderedPhotoActive(){return !!state.backgroundPhoto&&((state.viewMode==='photo'&&!photoEditing)||(state.viewMode==='3d'&&hasCapturedScan()));}
function rendererSnapshot(snapshot){
  if(state.viewMode==='3d'&&state.backgroundPhoto&&!hasCapturedScan())return Object.assign({},snapshot,{photoLayoutModel:true});
  return snapshot;
}
function syncViewModeUi(){
  var photo=!!state.backgroundPhoto,preview=photo&&state.viewMode==='photo'&&!photoEditing;
  document.body.classList.toggle('photo-preview-mode',preview);
  document.body.classList.toggle('photo-edit-mode',photo&&state.viewMode==='photo'&&photoEditing);
  document.body.classList.toggle('photo-model-mode',photo&&state.viewMode==='3d'&&!hasCapturedScan());
  [['plan','viewModePlan'],['photo','viewModePhoto'],['3d','viewMode3d']].forEach(function(pair){var button=$(pair[1]);if(!button)return;button.classList.toggle('active',state.viewMode===pair[0]);button.setAttribute('aria-selected',String(state.viewMode===pair[0]));});
  if($('viewModePhoto'))$('viewModePhoto').hidden=!photo;
  if($('btnUndo'))$('btnUndo').title=photoEditing?'Undo rentals, tent moves and obstacles · calibration uses Reset estimates':'Undo layout edit';
  var controls=document.querySelector('.canvas-view-controls');
  if(controls&&!$('photoScaleStatus')){var status=document.createElement('span');status.id='photoScaleStatus';status.className='photo-scale-status';status.setAttribute('role','status');controls.appendChild(status);}
  var measured=state.photoCalibration?.scaleConfirmed===true,confirmed=measured&&state.photoCalibration?.autoEstimated===false&&photoCalibrationValidity(state.photoCalibration).valid;
  if($('photoScaleStatus')){$('photoScaleStatus').hidden=!preview;$('photoScaleStatus').dataset.confirmed=String(confirmed);$('photoScaleStatus').textContent=confirmed?'Scale set · photo estimate':measured?'Measurements entered · align corners':'Scale not set · visual preview';$('photoScaleStatus').title='A single photo stays in its original viewpoint. Verify all real site dimensions before booking.';}
  if($('view3dAdjustPhoto')){$('view3dAdjustPhoto').hidden=!preview;$('view3dAdjustPhoto').textContent=measured?'Edit scale':'Set scale';}
  if($('view3dFit'))$('view3dFit').textContent=preview?'Fit photo':'Reset View';
  if($('photoZoomControls'))$('photoZoomControls').hidden=!preview;
  if(preview&&$('photoPreviewZoom')){if(document.activeElement!==$('photoPreviewZoom'))$('photoPreviewZoom').value=Math.round((state.backgroundPhoto.zoom||1)*100);$('photoZoomValue').textContent=(state.backgroundPhoto.zoom||1).toFixed(1)+'×';}
  if($('canvasHint')&&photo&&state.viewMode==='3d'&&!hasCapturedScan())$('canvasHint').textContent='3D layout model · photo in Photo View';
}
function adjustPhotoScale(){setViewMode('photo-edit');setTimeout(function(){if(mountPhoto())photoViewMod.setTool?.('calibrate');},0);}
function currentPropertyPlan(){return evaluatePropertyScene(buildSnapshot(getConflicts()));}
function propertyFitDetails(plan){
  var rows=[];
  if(plan?.tent?.reasons?.length)plan.tent.reasons.forEach(function(r){rows.push(r.message);});
  var blocked=plan?.rentals?.filter(function(r){return r.result.status==='blocked';})||[];
  var close=plan?.rentals?.filter(function(r){return r.result.status==='close';})||[];
  if(blocked.length)rows.push(blocked.length+' rental'+(blocked.length===1?'':'s')+' overlap the reconstructed property or usable area.');
  if(close.length)rows.push(close.length+' rental'+(close.length===1?'':'s')+' have tight preferred clearance.');
  if(!rows.length&&plan?.active)rows.push('Rental footprints fit this estimated model. Confirm site measurements and installation clearances with staff.');
  return rows.slice(0,5);
}
function renderPropertyFit(plan){
  var button=$('propertyFitBadge'),panel=$('propertyFitPanel');
  if(!button||!panel)return;
  var show=renderedPhotoActive();
  button.hidden=!show;
  if(!show){panel.hidden=true;return;}
  var summary=summarizePropertyFit(plan),kind=summary.kind||'neutral';
  button.dataset.kind=kind;
  button.textContent=state.viewMode==='photo'?'Site check':summary.label;
  button.title=summary.detail||'';
  button.setAttribute('aria-expanded',String(!panel.hidden));
  var rows=propertyFitDetails(plan);
  panel.dataset.kind=kind;
  panel.innerHTML='<strong>'+summary.label+'</strong><p>'+summary.detail+'</p>'+(rows.length?'<ul>'+rows.map(function(row){return '<li>'+row+'</li>';}).join('')+'</ul>':'')+'<small>Planning check only. Final placement and anchoring must be confirmed on site.</small>';
}
function handleSelect(id){state.selectedId=id;if(state.backgroundPhoto)state.selectedPhotoId=id||null;closeDrawer();refreshAll();}function photoWorldItem(item){var snap=buildSnapshot([]);return rentalPhotoPlacement(item,snap.tent,snap.photoSite,state.photoTentPlacement);}function handleMove(id,x,y){if(!requireEventEditing())return false;
  if(state.backgroundPhoto){var source=store.getState().objects.find(o=>o.id===id);return handlePhotoPlacement(id,{x:x,y:y,rotationDeg:source?photoWorldItem(source).rotationDeg||0:state.photoTentPlacement?.rotationDeg||0});}
  var objects=store.getState().objects,item=objects.find(o=>o.id===id);
  if(item?.kind==='dance'){
    var floor=objects.filter(o=>o.kind==='dance'),tent=layoutSpace();
    var dx=Math.max(-Math.min(...floor.map(o=>o.x)),Math.min(tent.widthFt-Math.max(...floor.map(o=>o.x+o.widthFt)),x-item.x));
    var dy=Math.max(-Math.min(...floor.map(o=>o.y)),Math.min(tent.lengthFt-Math.max(...floor.map(o=>o.y+o.depthFt)),y-item.y));
    store.replaceObjects(objects.map(o=>o.kind==='dance'?{...o,x:o.x+dx,y:o.y+dy}:o));
  }else store.updateObject(id,{x:x,y:y});
}
function handlePhotoSelect(id){
  state.selectedPhotoId=id||null;
  state.selectedId=id&&id!=='__photo_tent__'?id:null;
  renderViews(getConflicts());
}
function photoHistoryContext(){return {photoTentPlacement:state.photoTentPlacement||null,photoGeometry:state.photoGeometry||[],photoComposition:normalizePhotoComposition(state.photoComposition),lightingId:state.lightingId,lightingProductId:state.lightingProductId||null,sidewalls:state.sidewalls||[]};}
function restorePhotoHistoryContext(context){state.photoTentPlacement=context.photoTentPlacement;state.photoGeometry=context.photoGeometry;state.photoComposition=normalizePhotoComposition(context.photoComposition);if('lightingId' in context){state.lightingId=context.lightingId;state.lightingProductId=context.lightingProductId;state.sidewalls=context.sidewalls;}}
function handlePhotoPlacement(id,placement){
  if(!requireEventEditing()||!placement)return false;
  if(id==='__photo_tent__')store.commitContext({...photoHistoryContext(),photoTentPlacement:{x:Number(placement.x)||0,y:Number(placement.y)||0,rotationDeg:Number(placement.rotationDeg)||0}});
  else{
    var item=store.getState().objects.find(o=>o.id===id);if(!item)return false;
    if(item.kind==='dance'){var objects=store.getState().objects,floor=objects.filter(o=>o.kind==='dance').map(photoWorldItem),anchor=floor.find(o=>o.id===id),site=buildSnapshot([]).photoSite;var dx=Math.max(-Math.min(...floor.map(o=>o.x)),Math.min(site.widthFt-Math.max(...floor.map(o=>o.x+o.widthFt)),Number(placement.x)-anchor.x)),dy=Math.max(-Math.min(...floor.map(o=>o.y)),Math.min(site.lengthFt-Math.max(...floor.map(o=>o.y+o.depthFt)),Number(placement.y)-anchor.y));store.replaceObjects(objects.map(function(o){if(o.kind!=='dance')return o;var world=floor.find(f=>f.id===o.id);return {...o,photoPlacement:{x:world.x+dx,y:world.y+dy,rotationDeg:world.rotationDeg||0}};}));}else store.updateObject(id,{photoPlacement:{x:Number(placement.x)||0,y:Number(placement.y)||0,rotationDeg:Number(placement.rotationDeg)||0}});
  }
  state.selectedPhotoId=id;window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));renderViews(getConflicts());return true;
}
function updatePhotoComposition(next){if(!requireEventEditing())return false;return store.commitContext({...photoHistoryContext(),photoComposition:normalizePhotoComposition(next)});}
function updatePhotoCalibration(cal){
  if(!requireEventEditing())return false;
  var snap=buildSnapshot([]);state.photoCalibration=normalizePhotoCalibration(cal,snap.photoSite,state.backgroundPhoto);window.RENTSKETCH_SCAN_RECONSTRUCTION=null;
  window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));renderViews(getConflicts());
}
function addPhotoGeometry(geom){
  if(!requireEventEditing())return false;
  var snap=buildSnapshot([]);store.commitContext({...photoHistoryContext(),photoGeometry:normalizePhotoGeometry([...(state.photoGeometry||[]),geom],snap.photoSite)});
  window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));renderViews(getConflicts());
}
function removePhotoGeometry(id){
  if(!requireEventEditing())return false;
  store.commitContext({...photoHistoryContext(),photoGeometry:(state.photoGeometry||[]).filter(g=>g.id!==id)});
  window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));renderViews(getConflicts());
}
function mountPhoto(){
  if(!state.backgroundPhoto)return false;
  var host=$('photoView');if(!host)return false;
  var snap=buildSnapshot(getConflicts());
  if(!photoMounted){
    photoViewMod.mount(host,snap,{onSelect:handleSelect,onPhotoSelect:handlePhotoSelect,onPhotoPlacement:handlePhotoPlacement,onCalibration:updatePhotoCalibration,onCompositionChange:updatePhotoComposition,onGeometryAdd:addPhotoGeometry,onGeometryRemove:removePhotoGeometry,onDone:function(){setViewMode('photo');}});
    photoMounted=true;
  }else photoViewMod.update(snap);
  return true;
}
function mountPlan(){if(planMounted)return;planMounted=true;plan2dMod.mount($('plan2d'),buildSnapshot(getConflicts()),{onSelect:handleSelect,onMove:handleMove,onPlacementMove:movePlacement,onPlace:confirmPlacement});}
function mount3D(){
  if(view3dMod||view3dMountInProgress)return;
  var canvas=$('canvas');if(!canvas){console.warn('3D mount: canvas element not found');return;}
  var attempt=0;
  function checkCanvasReady(){
    attempt++;
    if(attempt>600){console.warn('3D mount: canvas never became ready');window.__rentsketchLast3dError='canvas-not-ready w='+canvas.offsetWidth+' h='+canvas.offsetHeight+' displayed='+(canvas.offsetParent!==null);return;}
    var stepDes=$('step-designer'),displayed=canvas.offsetParent!==null,hasWidth=canvas.offsetWidth>=100,hasHeight=canvas.offsetHeight>=100;
    if(!stepDes||!displayed||!hasWidth||!hasHeight){setTimeout(checkCanvasReady,16);return;}
    view3dMountInProgress=true;
    import('./js/ui/view3d.js?v=20260926-photo-camera-1').then(function(mod){
      var snap=view3dPendingSnapshot||rendererSnapshot(buildSnapshot(getConflicts())),inst=mod.init(canvas,{onSelect:handleSelect,onMove:handleMove,onPhotoMove:handlePhotoPlacement,onPhotoSelect:handlePhotoSelect,onPlacementMove:movePlacement,onPlace:confirmPlacement,onWalkMode:function(value){setPhoto3dModeUi(value?'walk':'360');},onMeasureMode:function(value){setMeasureUi(value);},onMeasurement:function(value){setMeasurementResult(value);},onScanReconstruction:function(info){
        window.RENTSKETCH_SCAN_RECONSTRUCTION=info||null;renderViews(getConflicts());if(state.activeDrawer==='site')renderDrawerBody('site');
        if(info?.ready){
          if(state.viewMode==='3d'&&view3dMod?.orbit360?.())setPhoto3dModeUi('360');
          var m=info.metrics||{},views=m.viewCount||info.sourceFrames?.length||3,agreement=m.multiReferenceAgreementPct??m.multiViewAgreementPct;
          showLayoutNotice('Estimated depth preview from '+views+' real views · '+(m.coveragePct||0)+'% depth coverage'+(agreement!=null?' · '+agreement+'% cross-view agreement':'')+' · '+(m.triangles||0)+' connected surface triangles.',6500);
        }else if(info?.loading){
          setPhoto3dModeUi('matched');
        }else if(info){
          if(state.viewMode==='3d')setViewMode('photo');setPhoto3dModeUi('matched');showLayoutNotice(info.quality?.issues?.join(' ')||'Space Scan needs more overlap or texture. Retake while moving sideways and keeping the same yard features visible.',7500);
        }
      }});
      inst.rebuild(snap);inst.setScene(sceneOptions);view3dMod=inst;
      if(state.viewMode==='3d'&&snap.backgroundPhoto&&snap.venueScan?.status==='ready'&&inst.orbit360?.()){
        setPhoto3dModeUi('360');
      }else if(snap.backgroundPhoto&&!snap.photoLayoutModel&&inst.matchPhoto){
        inst.matchPhoto();setPhoto3dModeUi('matched');
      }else{
        if(inst.fitCamera)inst.fitCamera();
        if(inst.inside&&!snap.photoLayoutModel&&!layoutSpace().isSite&&store.getState().objects.length)inst.inside();
      }
      view3dPendingSnapshot=null;view3dMountInProgress=false;window.FriendlyBridge.fitTentPreview=inst.fitTentPreview;
    }).catch(function(e){console.error('3D mount failed:',e);view3dMod=null;view3dMountInProgress=false;});
  }
  setTimeout(checkCanvasReady,16);
}
function setMeasureUi(active){
  var btn=$('view3dMeasure');
  if(btn){btn.classList.toggle('active',!!active);btn.setAttribute('aria-pressed',String(!!active));btn.textContent=active?'Measuring…':'Measure';}
  if(active){
    if($('view3dWalk')){$('view3dWalk').classList.remove('active');$('view3dWalk').setAttribute('aria-pressed','false');$('view3dWalk').textContent='Walk';}
    if($('canvasHint'))$('canvasHint').textContent='Measurement Mode · click Point A, then Point B on the ground · Esc exits';
  }else if(state.viewMode==='3d'){
    setPhoto3dModeUi(state.backgroundPhoto&&metricScanReady()?'360':'matched');
  }
}
function setMeasurementResult(result){
  var clear=$('view3dMeasureClear'),btn=$('view3dMeasure');
  if(clear){clear.hidden=!result;clear.textContent=result?'Clear · '+result.formatted:'Clear Measure';}
  if(result&&btn){var scan=hasCapturedScan()&&state.viewMode==='3d',validation=window.RENTSKETCH_SCAN_RECONSTRUCTION?.validation,status=validation?.status;var label=scan?(status==='failed'?'Scale check failed · model distance ':status==='valid'?'Model distance ':'Unverified model distance '):'Model distance ';btn.textContent=(scan&&status==='failed'?'Check failed · ':scan&&status!=='valid'?'Unverified · ':'')+result.formatted;btn.title=label+result.formatted+(scan&&status==='valid'?' · only A→B independently checked.':'.')+' Verify actual site measurements. Click to exit measurement mode.';}
  else if(btn&&!btn.classList.contains('active')){btn.textContent='Measure';btn.title='Measure between two points on the 3D ground';}
}
function setPhoto3dModeUi(mode){
  var matched=$('view3dMatchPhoto'),orbit=$('view3dOrbit360'),walk=$('view3dWalk'),isOrbit=mode==='360',isWalk=mode==='walk',isMatched=mode==='matched',scanReady=metricScanReady();
  if(matched&&!$('view3dAdjustPhoto')){var adjust=document.createElement('button');adjust.id='view3dAdjustPhoto';adjust.type='button';adjust.className='btn-chip';adjust.textContent='Set scale';adjust.addEventListener('click',adjustPhotoScale);matched.after(adjust);}
  if($('view3dAdjustPhoto'))$('view3dAdjustPhoto').hidden=!(state.viewMode==='3d'&&state.backgroundPhoto);
  if(matched){matched.classList.toggle('active',isMatched);matched.setAttribute('aria-pressed',String(isMatched));matched.textContent='Photo preview';}
  if(orbit){orbit.classList.toggle('active',isOrbit);orbit.setAttribute('aria-pressed',String(isOrbit));orbit.textContent=scanReady?'3D Scan':'3D Scan';orbit.title=scanReady?'Orbit the estimated depth preview within the captured views; dimensions unverified':'Capture a Space Scan first';}
  if(walk){walk.classList.toggle('active',isWalk);walk.setAttribute('aria-pressed',String(isWalk));walk.textContent=isWalk?'Exit Walk':'Walk Scan';}
  if($('canvasHint')&&renderedPhotoActive()){
    var runtime=window.RENTSKETCH_SCAN_RECONSTRUCTION;
    var views=runtime?.metrics?.viewCount||runtime?.sourceFrames?.length||3,agreement=runtime?.metrics?.multiReferenceAgreementPct??runtime?.metrics?.multiViewAgreementPct;var scanCheck=runtime?.validation?.status==='failed'?'scale check failed':runtime?.validation?.status==='valid'?'only A→B independently checked':'scale unverified';
    $('canvasHint').textContent=isWalk?'Walk Scan · estimated scene · '+scanCheck+' · WASD / arrow keys to move · drag to look · Esc exits':isOrbit&&scanReady?('3D Scan · estimated depth · '+scanCheck+' · '+views+' real views'+(agreement!=null?' · '+agreement+'% spatial agreement':'')+' · orbit limited to captured geometry'):runtime?.loading?'Estimating depth from captured views…':scanReady?'Photo View · '+scanCheck+' · choose 3D Scan for estimated depth':'Drag rentals to place · Photo scale is estimated · Use Space Scan for depth';
  }
  syncViewModeUi();
}
function renderViews(conflicts){
  var s=buildSnapshot(conflicts),rendered=rendererSnapshot(s),photo3d=renderedPhotoActive(),scan3d=photo3d&&state.viewMode==='3d'&&metricScanReady(),propertyPlan=evaluatePropertyScene(s);
  renderPropertyFit(propertyPlan);
  if($('sceneSettingLabel'))$('sceneSettingLabel').textContent=scan3d?'Estimated Space Scan':photo3d?'Your venue photo':s.backgroundPhoto?'Layout model':(sceneSetting(s.tent,s.surfaceType)==='backyard'?'Backyard setting':'Paved driveway setting');
  if($('view3dMatchPhoto'))$('view3dMatchPhoto').hidden=!photo3d;
  if($('view3dInside'))$('view3dInside').hidden=state.viewMode!=='3d'||photo3d;
  if($('view3dOrbit360'))$('view3dOrbit360').hidden=!scan3d;
  if($('view3dWalk'))$('view3dWalk').hidden=!scan3d;
  if($('view3dMeasure'))$('view3dMeasure').hidden=state.viewMode!=='3d'||(photo3d&&!scan3d);
  if(planMounted)plan2dMod.update(s);
  if(photoMounted&&s.backgroundPhoto)photoViewMod.update(s);
  if(view3dMod)view3dMod.update(rendered);else if(state.viewMode==='3d'||(state.viewMode==='photo'&&!photoEditing))view3dPendingSnapshot=rendered;
  photoViewMod.syncLightingControls?.($('sceneControls')?.querySelector('.scene-panel'),rendered,{onChange:updatePhotoComposition,onPreview:function(next){view3dMod?.previewPhotoComposition?.(next);}});
  syncViewModeUi();
}
function setViewMode(mode){
  var edit=mode==='photo-edit';if(edit)mode='photo';
  if(mode==='photo'&&!state.backgroundPhoto){openDrawer('site');showLayoutNotice('Upload a venue photo first, then Photo View will unlock.',4500);return false;}
  if((mode!=='3d'||edit)&&view3dMod?.isMeasuring?.()){view3dMod.setMeasureMode(false);setMeasureUi(false);}
  if(mode!=='3d'&&view3dMod?.isWalking?.())view3dMod.exitWalk();
  if(pendingPlacement&&(state.viewMode!==mode||photoEditing!==edit))cancelPlacement();
  photoEditing=edit;state.viewMode=mode;
  var rendering=mode==='3d'||(mode==='photo'&&!edit),photoPreview=mode==='photo'&&!edit;
  if($('sceneControls'))$('sceneControls').hidden=!rendering;
  if($('sceneSettingLabel'))$('sceneSettingLabel').hidden=!rendering;
  if($('canvasHint'))$('canvasHint').textContent=mode==='3d'?'Drag to orbit · Pinch or scroll to zoom':mode==='photo'?'Match a known ground measurement to set photo scale':'Select an item · Drag to move';
  if($('view3dFit'))$('view3dFit').hidden=!rendering;
  if($('view3dMeasureClear'))$('view3dMeasureClear').hidden=mode!=='3d'||!view3dMod?.getMeasurement?.();
  var planEl=$('plan2d'),photoEl=$('photoView'),canvasEl=$('canvas');
  if(planEl)planEl.style.display=mode==='plan'?'flex':'none';
  if(photoEl)photoEl.style.display=edit?'block':'none';
  if(canvasEl)canvasEl.style.display=rendering?'block':'none';
  if($('view3dDayNight'))$('view3dDayNight').style.display=rendering?'':'none';
  if($('view3dTimelapseBuild'))$('view3dTimelapseBuild').style.display=mode==='3d'?'':'none';
  if($('view3dTimelapseBreak'))$('view3dTimelapseBreak').style.display=mode==='3d'?'':'none';
  renderViews(getConflicts());
  if(edit)setTimeout(function(){mountPhoto();},0);
  if(rendering){var useScan=mode==='3d'&&!!state.backgroundPhoto&&hasCapturedScan();setPhoto3dModeUi(useScan?'360':'matched');setTimeout(function(){mount3D();if(!view3dMod)return;if(useScan&&view3dMod.orbit360){view3dMod.orbit360();setPhoto3dModeUi('360');}else if(photoPreview&&view3dMod.matchPhoto){view3dMod.matchPhoto();setPhoto3dModeUi('matched');}else view3dMod.fitCamera?.();},16);}
  syncViewModeUi();window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));return true;
}

function closeDrawer(){pendingContext=null;state.activeDrawer=null;document.body.classList.remove('drawer-open');document.querySelectorAll('.rail-btn').forEach(function(b){b.classList.remove('active');b.setAttribute('aria-expanded','false');});if($('drawerBackdrop'))$('drawerBackdrop').hidden=true;if($('drawer'))$('drawer').hidden=true;renderEmptyState();}function openDrawer(kind){if(kind==='rentals')kind='inventory';if(!requireEventEditing())return false;if(pendingPlacement)cancelPlacement();if(state.activeDrawer===kind){closeDrawer();return;}state.selectedId=null;renderInspector([]);state.activeDrawer=kind;document.body.classList.add('drawer-open');document.querySelectorAll('.rail-btn').forEach(function(b){b.classList.toggle('active',b.dataset.drawer===kind);b.setAttribute('aria-expanded',String(b.dataset.drawer===kind));});$('drawerBackdrop').hidden=false;$('drawer').hidden=false;$('drawerTitle').textContent=({inventory:'All rentals',site:'Event Setting',inflatables:'Bounce Houses & Waterslides',tables:'Tables & Chairs',tent:'Choose Your Tent',chairs:'Chair Styles',dance:'Dance Floor',lighting:'Lighting',setup:'Suggest a Layout'})[kind]||kind;renderDrawerBody(kind);$('drawerBody').scrollTop=0;renderEmptyState();}function bindVenuePhotoInputs(root){
  if(!root)return;
  root.querySelectorAll('[data-role="venue-photo-file"]').forEach(function(fileInput){
    if(fileInput.dataset.venuePhotoDirectBound==='1')return;
    fileInput.dataset.venuePhotoDirectBound='1';
    var handle=function(){handleVenuePhotoFileInput(fileInput);};
    fileInput.addEventListener('input',handle);
    fileInput.addEventListener('change',handle);
    fileInput.addEventListener('click',function(){
      fileInput.value='';
      delete fileInput.dataset.venuePhotoHandled;
    });
  });
  root.querySelectorAll('[data-role="venue-scan-file"]').forEach(function(fileInput){
    if(fileInput.dataset.venueScanDirectBound==='1')return;
    fileInput.dataset.venueScanDirectBound='1';
    var handle=function(){handleVenueScanFileInput(fileInput);};
    fileInput.addEventListener('input',handle);
    fileInput.addEventListener('change',handle);
    fileInput.addEventListener('click',function(){
      fileInput.value='';
      delete fileInput.dataset.venueScanHandled;
    });
  });
  root.querySelectorAll('[data-role="venue-scan-video"]').forEach(function(fileInput){
    if(fileInput.dataset.venueScanVideoBound==='1')return;
    fileInput.dataset.venueScanVideoBound='1';
    var handle=function(){handleVenueScanVideoInput(fileInput);};
    fileInput.addEventListener('input',handle);
    fileInput.addEventListener('change',handle);
    fileInput.addEventListener('click',function(){
      fileInput.value='';
      delete fileInput.dataset.venueScanVideoHandled;
    });
  });
}
function renderDrawerBody(kind){var body=$('drawerBody');if(kind==='inventory'){var catalog=contextCatalog(),selected=pendingContext&&currentContextProducts().find(p=>p.id===pendingContext.id&&p.kind===pendingContext.kind);if(pendingContext&&!selected)pendingContext=null;renderEquipmentContent(body,selected?contextualPicker(selected,catalog,store.getState().objects,layoutSpace()):inventoryBrowser(catalog,store.getState().objects,{query:inventoryQuery,category:inventoryCategory}));}else if(kind==='site'){renderEquipmentContent(body,sitePanel(state,layoutSpace()));bindVenuePhotoInputs(body);}else if(kind==='setup')body.innerHTML=setupPanel(state,layoutSpace(),store.getState().objects.length>0);else if(kind==='inflatables')body.innerHTML=inflatableCards(INFLATABLES,store.getState().objects);else if(kind==='tables')body.innerHTML=buildTablesDrawerHtml();else if(kind==='tent')body.innerHTML=buildTentDrawerHtml();else if(kind==='chairs')renderEquipmentContent(body,buildChairsDrawerHtml());else if(kind==='dance')body.innerHTML=buildDanceDrawerHtml();else if(kind==='lighting')body.innerHTML=buildLightingDrawerHtml();else body.innerHTML='<p>Choose '+kind+' options for your event.</p>';}function buildTentDrawerHtml(){
  var html='<button type="button" class="btn-secondary" data-role="outdoor-layout">Plan Outdoors Without a Tent</button><div class="drawer-section-title">Choose Your Tent</div><div class="item-card-grid">';
  TENTS.forEach(function(t){var sel=t.id===state.tentId,price=t.pricePerDay==null?'Ask for pricing':money(t.pricePerDay)+'/day';html+='<button class="item-card'+(sel?' selected':'')+'" data-role="tent-card" data-id="'+t.id+'">'+(sel?'<span class="item-card-check">&#10003;</span>':'')+'<span class="item-card-name">'+t.name+'</span><span class="item-card-desc">'+t.widthFt+' x '+t.lengthFt+' ft</span><span class="item-card-price">'+price+'</span></button>';});
  html+='</div>';
  var tent=layoutSpace();
  if(tent&&!tent.isSite){
    html+='<div class="drawer-section-title">Sidewalls</div><p class="equipment-note">Add solid or window sidewalls. Each side is built in 10 ft sections so the saved layout matches the tent perimeter.</p>';
    html+='<div class="sidewall-presets"><button type="button" class="btn-secondary" data-role="sidewall-all" data-type="none">Open tent</button><button type="button" class="btn-secondary" data-role="sidewall-all" data-type="solid">Solid all around</button><button type="button" class="btn-secondary" data-role="sidewall-all" data-type="window">Window all around</button></div>';
    html+='<div class="sidewall-side-grid">';
    [['front','Front'],['back','Back'],['left','Left'],['right','Right']].forEach(function(pair){var side=pair[0],label=pair[1],value=sidewallSideType(side);html+='<label class="sidewall-side-control"><span>'+label+' side</span><select data-role="sidewall-side" data-side="'+side+'"><option value="none"'+(value==='none'?' selected':'')+'>Open</option><option value="solid"'+(value==='solid'?' selected':'')+'>Solid sidewall</option><option value="window"'+(value==='window'?' selected':'')+'>Window sidewall</option></select></label>';});
    html+='</div>';
  }
  return html;
}function buildChairsDrawerHtml(){return chairsDrawer(CHAIRS,state.chairId,store.getState().objects);}function buildDanceDrawerHtml(){var html='<p class="equipment-note">Parquet sections with a finished outer edge. Choose a size that fits your layout.</p><div class="item-card-grid">',noneSel=!state.needDance;html+='<button class="item-card'+(noneSel?' selected':'')+'" data-role="dance-remove">'+(noneSel?'<span class="item-card-check">&#10003;</span>':'')+'<span class="item-card-name">No Dance Floor</span></button>';[{id:'6x6',ft:6},{id:'9x9',ft:9}].concat(DANCE_FLOOR_SIZES).filter(function(sz){return dancePositions(layoutSpace(),sz.ft).length;}).forEach(function(sz){var sel=state.needDance&&state.danceFloorSizeId===sz.id,price=priceForSize(sz.ft),priceLabel=price==null?'Ask for pricing':money(price)+'/day';html+='<button class="item-card'+(sel?' selected':'')+'" data-role="dance-size-card" data-id="'+sz.id+'" data-ft="'+sz.ft+'">'+(sel?'<span class="item-card-check">&#10003;</span>':'')+equipmentPreview('dance-floor')+'<span class="item-card-name">'+sz.ft+' x '+sz.ft+' ft</span><span class="item-card-price">'+priceLabel+'</span></button>';});html+='</div>';return html;}function buildLightingDrawerHtml(){var tent=layoutSpace(),html='<div class="drawer-section-title">Lighting</div><div class="item-card-grid">';LIGHTING_OPTIONS.map(l=>lightingForTent(l.id,tent)).filter(l=>l.available!==false&&(!layoutSpace().isSite||l.id==='lighting-none'||l.visual?.startsWith('uplight'))).forEach(function(l){var sel=l.id===state.lightingId,price=l.dynamic?tentLightingPriceFor(tent):l.pricePerDay,priceLabel=l.id==='lighting-none'?'Included':(price==null?'Ask for pricing':money(price)+'/day');html+='<button class="item-card'+(sel?' selected':'')+'" data-role="lighting-card" data-id="'+l.id+'">'+(sel?'<span class="item-card-check">&#10003;</span>':'')+(l.photoUrl?'<img class="equipment-model" alt="" loading="lazy" src="'+escapeHtml(l.photoUrl)+'">':equipmentPreview(l.visual==='chandelier'?'lighting-chandelier':l.visual&&l.visual.startsWith('uplight')?'lighting-uplight-single':l.visual==='none'?'':'lighting-bistro'))+'<span class="item-card-name">'+l.name+'</span><span class="item-card-price">'+priceLabel+'</span></button>';});html+='</div>';return html;}function buildTablesDrawerHtml(){if(byId(CHAIRS,state.chairId)?.isThrone)state.chairId=CHAIRS.find(c=>!c.isThrone)?.id;ensureTableDraft();if(!tableDraft)return '<p>No tables configured.</p>';var objects=store.getState().objects;return '<p class="equipment-note">Choose a table, then tap where you want it. Select it on the plan to customize chairs and linens.</p><div class="item-card-grid">'+orderEquipment(TABLES).map(function(t){return tableCard(t,byId(CHAIRS,state.chairId),objects.filter(function(o){return o.kind==='table'&&o.tableId===t.id;}).length);}).join('')+'</div>';}
function eventSummary(){return summarizeEvent(getScene(),{equipment:EQUIPMENT,accessories:ACCESSORIES,tabletop:TABLETOP,inflatables:INFLATABLES,tents:TENTS,tables:TABLES,chairs:CHAIRS,linens:LINENS,lighting:LIGHTING_OPTIONS,danceSection:DANCE_SECTION,tentLightingPrice:tentLightingPriceFor,lightingForTent:lightingForTent,contextual:currentContextProducts()});}
function computeLineItems(){return eventSummary().lines;}
function renderInspector(conflicts){
  var p=$('inspectorPanel'),objects=store.getState().objects,item=objects.find(function(i){return i.id===state.selectedId;});
  p.hidden=!item;
  if(!item){p.innerHTML='';delete p.dataset.itemId;return;}
  if(p.dataset.itemId!==item.id)p.scrollTop=0;
  p.dataset.itemId=item.id;
  if(item.kind==='table'){
    var t=byId(TABLES,item.tableId),matching=objects.filter(function(o){return o.kind==='table'&&o.tableId===item.tableId;}).length;
    renderEquipmentContent(p,tableInspector(item,t,CHAIRS,optionsForTable(item.tableId).filter(function(l){return l.id!=='linen-napkins'&&l.id!=='linen-runner-9ft';}),matching));
  }else if(item.kind==='accessory'){renderEquipmentContent(p,accessoryInspector(item,accessoryById(item.accessoryId)||{...item,pricePerDay:null}));}else if(item.kind==='equipment'){renderEquipmentContent(p,equipmentInspector(item,equipmentById(item.equipmentId)));}else if(item.kind==='chair'){var chair=byId(CHAIRS,item.chairId);renderEquipmentContent(p,'<button class="btn-tertiary inspector-close" data-role="inspector-close">Close</button><h3>'+escapeHtml(chair?.name||'Accent chair')+'</h3>'+chairVisual(chair||{})+'<p>One accent chair · '+moneyOrAsk(chair?.pricePerDay)+'/day</p><p>Drag to move this chair.</p><div class="inspector-actions">'+['rotate','duplicate','delete'].map(action=>'<button type="button" class="btn-secondary" data-role="insp-'+action+'" data-id="'+escapeHtml(item.id)+'">'+action[0].toUpperCase()+action.slice(1)+'</button>').join('')+'</div>');}else if(item.kind==='inflatable'){var product=inflatableById(item.inflatableId);if(product)renderEquipmentContent(p,inflatableInspector(item,product));
  }else{
    renderEquipmentContent(p,'<button class="btn-tertiary inspector-close" data-role="inspector-close">Close</button><h3>Dance Floor</h3><p>'+objects.filter(function(o){return o.kind==='dance';}).length+' sections</p><button class="btn-danger" data-role="insp-delete-dance">Remove Dance Floor</button>');
  }
}
function chooseEventChairs(chairId){
  if(!byId(CHAIRS,chairId)||byId(CHAIRS,chairId).isThrone)return;
  state.chairId=chairId;
  var objects=store.getState().objects,changed=objects.some(function(o){return o.kind==='table'&&o.seatCount>0&&o.chairId!==chairId;});
  if(changed)store.replaceObjects(objects.map(function(o){return o.kind==='table'&&o.seatCount>0?Object.assign({},o,{chairId:chairId}):o;}));
}
function matchTableStyle(id){
  var objects=store.getState().objects,source=objects.find(function(o){return o.id===id&&o.kind==='table';});
  if(!source)return;
  var style={chairId:source.chairId,linenId:source.linenId||null,linenProductId:source.linenProductId||null,linenColor:source.linenId?(source.linenColor||'White'):null};
  var changed=false,count=0;
  var next=objects.map(function(o){
    if(o.kind!=='table'||o.tableId!==source.tableId)return o;
    count++;
    if(o.chairId===style.chairId&&(o.linenId||null)===style.linenId&&(!style.linenId||(o.linenColor||'White')===style.linenColor))return o;
    changed=true;return Object.assign({},o,style);
  });
  if(changed)store.replaceObjects(next);
  showLayoutNotice('Chairs and linens match across '+count+' tables.');
}

function renderStatusBar(){var summary=eventSummary(),checks=getConflicts().filter(function(c){return c.severity!=='info';});$('statusBar').innerHTML='<div class="status-pill-group"><span class="status-item">'+(store.getState().objects.some(o=>o.kind==='inflatable')?store.getState().objects.filter(o=>o.kind==='inflatable').length+' inflatable'+(store.getState().objects.filter(o=>o.kind==='inflatable').length===1?'':'s')+' · ':'')+summary.seats+' seats · '+summary.tableCount+' tables</span></div><div class="status-estimate">'+(summary.total==null?'Confirm pricing':money(summary.total)+'/day')+'</div>';}
function renderEmptyState(){var o=$('emptyStateOverlay');if(store.getState().objects.length||state.activeDrawer||pendingPlacement){o.hidden=true;return;}o.hidden=false;o.innerHTML='<button class="btn-primary" data-role="empty-party">Try a Party Setup</button><button class="btn-secondary" data-role="empty-choose-own">+ Add My Own Items</button><button class="btn-tertiary" data-role="empty-suggest">Suggest for My Guest Count</button>';}function refreshAll(){state.tentId=store.getState().tentId;document.body.classList.toggle('outdoor-design',!state.tentId);var inflatableButton=document.querySelector('[data-drawer="inflatables"]');if(inflatableButton)inflatableButton.hidden=!INFLATABLES.length;var tent=layoutSpace();if(tent&&!window.RENTSKETCH_TENT_PREVIEW){$('toolbarEventTitle').textContent=tent.name;$('toolbarEventMeta').textContent=(tent.isSite?'Outdoor planning area · ':tent.widthFt+' × '+tent.lengthFt+' ft · ')+((window.ACTIVE_TENANT||{}).name||'RentSketch');}state.needDance=store.getState().objects.some(function(o){return o.kind==='dance';});var c=getConflicts();renderInspector(c);renderViews(c);renderStatusBar(c);renderEmptyState();if(state.activeDrawer)renderDrawerBody(state.activeDrawer);if($('btnUndo'))$('btnUndo').disabled=!store.canUndo();if($('btnRedo'))$('btnRedo').disabled=!store.canRedo();}async function goToReview(){if(!requireEventEditing())return false;cancelPlacement();if(photoEditing)setViewMode('photo');var visualMode=state.viewMode==='photo'||state.viewMode==='3d';if(visualMode){mount3D();for(var frame=0;frame<40&&!view3dMod;frame++)await new Promise(function(resolve){setTimeout(resolve,50);});await new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve);});});}var layoutImage=visualMode?view3dMod?.captureImage?.()||null:null;var visualCaption=state.viewMode==='photo'?'Photo preview · camera and scale are estimates. Confirm dimensions on site.':hasCapturedScan()?'Space Scan preview · reconstructed dimensions are estimates. Confirm on site.':'Dimensioned event layout model';closeDrawer();showStep('step-review');document.body.classList.remove('designer-active');var summary=eventSummary();$('reviewSummary').innerHTML=(layoutImage&&/^data:image\//.test(layoutImage)?'<figure class="review-layout-visual"><img src="'+layoutImage+'" alt="Saved event layout preview"><figcaption>'+escapeHtml(visualCaption)+'</figcaption></figure>':'')+'<div class="review-section"><h3>'+escapeHtml(layoutSpace().name)+'</h3><p>'+summary.seats+' planned seats · '+summary.tableCount+' tables</p></div><div class="review-equipment-wrap"><table class="review-equipment"><thead><tr><th>Equipment</th><th>Quantity</th><th>Rental amount</th></tr></thead><tbody>'+summary.lines.map(function(line){return '<tr><td>'+escapeHtml(line.label)+'</td><td>'+line.qty+'<small>'+(line.unitPrice==null?'Confirm unit price':money(line.unitPrice)+' each')+'</small></td><td>'+(line.amount==null?'Confirm pricing':money(line.amount))+'</td></tr>';}).join('')+'</tbody></table></div><div class="review-estimate"><strong>'+(summary.total==null?'Confirm pricing':('Rental estimate: '+money(summary.total)+'/day'))+'</strong><p>'+(summary.total==null?'Some selections need pricing confirmed. Known items: '+money(summary.knownSubtotal)+'/day. ':'')+((window.ACTIVE_TENANT||{}).slug==='generic'?'Open the designer from your rental company’s website for its inventory and rental pricing.':'Availability and final setup are confirmed by '+escapeHtml((window.ACTIVE_TENANT||{}).name||'your rental company')+'.')+'</p></div>';var warnings=getConflicts().filter(function(c){return c.severity!=='info';});if(warnings.length)$('reviewSummary').innerHTML+='<div class="review-layout-checks"><h3>Placement to review</h3><ul>'+Array.from(new Set(warnings.map(function(c){return c.message;}))).map(function(message){return '<li>'+escapeHtml(message)+'</li>';}).join('')+'</ul><p>Return to the designer to adjust these items.</p></div>';if((window.ACTIVE_TENANT||{}).slug!=='generic'){var costs=document.createElement('div');costs.id='reviewPricing';$('reviewSummary').appendChild(costs);mountReviewPricing(costs);}}



function openTableComposer(tableId){if(!requireEventEditing())return false;
 var t=byId(TABLES,tableId);if(!t)return;
 var draft=makeTableItem(tableId,byId(CHAIRS,state.chairId)?.id||CHAIRS[0]?.id,t.seatsDefault,null,{x:0,y:0});draft.id='table-studio-draft';draft.tabletop=[];
 var draftStore=createLayoutStore({tentId:null,objects:[draft],zones:[],aisles:[]});
 import('./js/ui/tableStudio.js').then(function(m){m.openTableStudio(draft.id,draftStore,{tables:TABLES,chairs:CHAIRS,linens:LINENS,tabletop:TABLETOP,onCommit:function(styled){
  var space=layoutSpace();styled.id=newItemId();styled.x=Math.max(0,(space.widthFt-styled.widthFt)/2);styled.y=Math.max(0,(space.lengthFt-styled.depthFt)/2);startPlacement([styled],t.name,'');
 }});}).catch(function(error){console.error('Table studio could not open:',error);showLayoutNotice('Table studio could not open. Add a table and use its edit controls.');});
}

function handleEquipmentClick(e){if(!requireEventEditing())return false;var el=e.target.closest('[data-role]');if(!el)return;var role=el.dataset.role;if(role==='equipment-operation'){var operationItem=store.getState().objects.find(o=>o.id===el.dataset.id),operationProduct=operationItem&&(equipmentById(operationItem.equipmentId)||accessoryById(operationItem.accessoryId));if(operationProduct?.operation?.supported&&['running','off'].includes(el.dataset.state))store.updateObject(operationItem.id,{operationState:el.dataset.state});}else if(role==='inspector-close'){state.selectedId=null;refreshAll();}else if(role==='insp-delete'){store.removeObject(el.dataset.id);state.selectedId=null;}else if(role==='insp-match-tables'){matchTableStyle(el.dataset.id);}else if(role==='insp-linen-swatch'){store.updateObject(el.dataset.id,{linenColor:el.dataset.color});}else if(role==='insp-seats'||role==='insp-rotate'||role==='insp-duplicate'){var item=store.getState().objects.find(function(o){return o.id===el.dataset.id;}),tent=layoutSpace().planningArea||layoutSpace();if(!item)return;if(role==='insp-seats'){var max=Math.max(0,...byId(TABLES,item.tableId).seatsOptions);store.updateObject(item.id,{seatCount:Math.max(0,Math.min(max,item.seatCount+Number(el.dataset.delta)))});}else if(state.backgroundPhoto){var world=photoWorldItem(item),site=buildSnapshot([]).photoSite;if(role==='insp-rotate'){store.updateObject(item.id,{photoPlacement:{x:world.x,y:world.y,rotationDeg:((world.rotationDeg||0)+90)%360}});}else{var duplicate={...item,id:newItemId(),photoPlacement:{x:Math.max(0,Math.min(site.widthFt-item.widthFt,world.x+2)),y:Math.max(0,Math.min(site.lengthFt-item.depthFt,world.y+2)),rotationDeg:world.rotationDeg||0}};store.addObject(duplicate);state.selectedId=duplicate.id;refreshAll();}}else if(role==='insp-rotate'){var w=item.depthFt,d=item.widthFt;store.updateObject(item.id,{widthFt:w,depthFt:d,x:Math.max(0,Math.min(tent.widthFt-w,item.x+(item.widthFt-w)/2)),y:Math.max(0,Math.min(tent.lengthFt-d,item.y+(item.depthFt-d)/2)),rotationDeg:((item.rotationDeg||0)+90)%360});}else{store.duplicateObject(item.id,1,{x:Math.min(2,tent.widthFt-item.widthFt-item.x),y:Math.min(2,tent.lengthFt-item.depthFt-item.y)});state.selectedId=store.getState().objects.at(-1).id;refreshAll();}}else if(role==='insp-delete-dance'){state.needDance=false;state.selectedId=null;removeAllDanceFloors();}else if(role==='insp-design-table'){import('./js/ui/tableStudio.js').then(function(m){m.openTableStudio(el.dataset.id,store,{onClick:handleEquipmentClick,onChange:handleEquipmentChange,tables:TABLES,chairs:CHAIRS,linens:LINENS,tabletop:TABLETOP});}).catch(function(error){console.error('Table details could not open:',error);showLayoutNotice('Table details could not open. You can still edit this table below.');});}}
function handleEquipmentChange(e){if(!requireEventEditing())return false;var el=e.target,role=el.dataset.role,id=el.dataset.id;if(role==='insp-chair'&&!byId(CHAIRS,el.value)?.isThrone)store.updateObject(id,{chairId:el.value});if(role==='insp-linen'){var linen=byId(LINENS,el.value),item=store.getState().objects.find(function(o){return o.id===id;}),colors=linen&&linen.colors||['White'];store.updateObject(id,{linenId:el.value||null,linenProductId:linen?.productId||null,linenColor:el.value?(colors.includes(item.linenColor)?item.linenColor:colors[0]):null});}if(role==='insp-linen-color')store.updateObject(id,{linenColor:el.value});}
document.querySelectorAll('.rail-btn').forEach(function(btn){btn.addEventListener('click',function(){openDrawer(btn.dataset.drawer);});});if($('drawerClose'))$('drawerClose').addEventListener('click',closeDrawer);if($('drawerBackdrop'))$('drawerBackdrop').addEventListener('click',closeDrawer);if($('drawerBody'))$('drawerBody').addEventListener('click',function(e){var el=e.target.closest('[data-role]');if(!el)return;if(el.dataset.role==='scan-check-image'||el.dataset.role==='scan-check-reset'){editScanCheck(el,e);return;}if(el.dataset.role==='inventory-context'){beginContextSelection(el.dataset.contextKind,el.dataset.id);return;}if(el.dataset.role?.startsWith('context-')){handleContextAction(el);return;}if(el.dataset.role==='inventory-category'){inventoryCategory=el.dataset.category;renderDrawerBody('inventory');return;}if(el.dataset.role==='inventory-open'){openDrawer(el.dataset.drawer);return;}if(el.dataset.role==='accessory-card'){beginAccessoryPlacement(accessoryById(el.dataset.id));return;}if(el.dataset.role==='equipment-card'){beginEquipmentPlacement(equipmentById(el.dataset.id));return;}if(el.dataset.role==='venue-photo-remove'){removeVenuePhoto();return;}if(el.dataset.role==='venue-photo-reset'){resetVenuePhotoFraming();return;}if(el.dataset.role==='venue-scan-clear'){clearVenueScan();return;}if(el.dataset.role==='sidewall-all'){setAllSidewalls(el.dataset.type);return;}if(el.dataset.role==='site-surface'){if(layoutSpace().type==='pole'&&['concrete','asphalt'].includes(el.dataset.surface))return;state.surfaceType=el.dataset.surface;refreshAll();window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));return;}if(el.dataset.role==='site-frame'){openDrawer('tent');return;}if(el.dataset.role==='accent-chair'){beginAccentPlacement(el.dataset.id);return;}if(el.dataset.role==='outdoor-layout'){var previous=layoutSpace();state.siteWidthFt=Math.max(state.siteWidthFt,previous.widthFt);state.siteLengthFt=Math.max(state.siteLengthFt,previous.lengthFt);state.tentId=null;state.lightingId='lighting-none';store.setTent(null);closeDrawer();return;}if(el.dataset.role==='setup-manual'){closeDrawer();openDrawer('tables');return;}if(el.dataset.role==='table-style'){openTableComposer(el.dataset.id);return;}if(el.dataset.role==='table-card'){var t=byId(TABLES,el.dataset.id);if(!t)return;ensureTableDraft();tableDraft.tableId=t.id;tableDraft.chairId=state.chairId;tableDraft.linenId=null;tableDraft.seatCount=t.seatsDefault;beginTablePlacement(t);}else if(el.dataset.role==='add-table'){tableDraft.activeItemId=addTableFromDraft();state.selectedId=tableDraft.activeItemId;}else if(el.dataset.role==='inflatable-card'){beginInflatablePlacement(inflatableById(el.dataset.id));}else if(el.dataset.role==='tent-card'){selectTent(el.dataset.id);}else if(el.dataset.role==='chair-card'){chooseEventChairs(el.dataset.id);}else if(el.dataset.role==='dance-size-card'){beginDancePlacement(parseFloat(el.dataset.ft),el.dataset.id);}else if(el.dataset.role==='dance-remove'){state.needDance=false;removeAllDanceFloors();}else if(el.dataset.role==='lighting-card'){state.lightingId=el.dataset.id;state.lightingProductId=lightingForTent(el.dataset.id,layoutSpace())?.productId||null;validateLighting();if(state.lightingId!=='lighting-none'){setSceneNight(true);closeDrawer();setViewMode('3d');showLayoutNotice('Night preview is on so you can see your lights. Switch back to day in Scene.',6000);}window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));}refreshAll();});function handleVenuePhotoFileInput(fileInput){
  if(!fileInput)return false;
  var file=fileInput.files&&fileInput.files[0];if(!file)return false;
  var stamp=[file.name||'',file.size||0,file.lastModified||0].join(':');
  if(fileInput.dataset.venuePhotoHandled===stamp)return true;
  fileInput.dataset.venuePhotoHandled=stamp;
  chooseVenuePhoto(file,fileInput);
  return true;
}
function handleVenueScanFileInput(fileInput){
  if(!fileInput)return false;
  var file=fileInput.files&&fileInput.files[0],role=fileInput.dataset.scanRole;if(!file||!role)return false;
  var stamp=[role,file.name||'',file.size||0,file.lastModified||0].join(':');
  if(fileInput.dataset.venueScanHandled===stamp)return true;
  fileInput.dataset.venueScanHandled=stamp;
  chooseVenueScanPhoto(role,file,fileInput);
  return true;
}
function handleVenueScanVideoInput(fileInput){
  if(!fileInput)return false;
  var file=fileInput.files&&fileInput.files[0];if(!file)return false;
  var stamp=[file.name||'',file.size||0,file.lastModified||0].join(':');
  if(fileInput.dataset.venueScanVideoHandled===stamp)return true;
  fileInput.dataset.venueScanVideoHandled=stamp;
  chooseVenueScanVideo(file,fileInput);
  return true;
}
$('drawerBody')?.addEventListener('click',function(e){
  var fileInput=e.target.closest('[data-role="venue-photo-file"]');
  if(fileInput){fileInput.value='';delete fileInput.dataset.venuePhotoHandled;return;}
  var scanInput=e.target.closest('[data-role="venue-scan-file"]');
  if(scanInput){scanInput.value='';delete scanInput.dataset.venueScanHandled;return;}
  var scanVideo=e.target.closest('[data-role="venue-scan-video"]');
  if(scanVideo){scanVideo.value='';delete scanVideo.dataset.venueScanVideoHandled;}
});
$('drawerBody')?.addEventListener('change',function(e){
  var fileInput=e.target.closest('[data-role="venue-photo-file"]');
  if(fileInput){handleVenuePhotoFileInput(fileInput);return;}
  var scanInput=e.target.closest('[data-role="venue-scan-file"]');
  if(scanInput){handleVenueScanFileInput(scanInput);return;}
  var scanVideo=e.target.closest('[data-role="venue-scan-video"]');
  if(scanVideo){handleVenueScanVideoInput(scanVideo);return;}
  var check=e.target.closest('[data-role="scan-check-distance"],[data-role="scan-check-coordinate"]');if(check){editScanCheck(check,e);return;}
  var baseline=e.target.closest('[data-role="venue-scan-baseline"]');
  if(baseline){updateVenueScanBaseline(baseline.value);return;}
  var el=e.target.closest('[data-role="sidewall-side"]');if(el){setSidewallSide(el.dataset.side,el.value);}
});
$('drawerBody')?.addEventListener('input',function(e){
  var fileInput=e.target.closest('[data-role="venue-photo-file"]');
  if(fileInput){handleVenuePhotoFileInput(fileInput);return;}
  var scanInput=e.target.closest('[data-role="venue-scan-file"]');
  if(scanInput){handleVenueScanFileInput(scanInput);return;}
  var scanVideo=e.target.closest('[data-role="venue-scan-video"]');
  if(scanVideo){handleVenueScanVideoInput(scanVideo);return;}
  var baseline=e.target.closest('[data-role="venue-scan-baseline"]');
  if(baseline){updateVenueScanBaseline(baseline.value);return;}
  var el=e.target.closest('[data-role^="venue-photo-"]');if(!el)return;
  updateVenuePhotoControl(el.dataset.role,el.value);
});if($('inspectorPanel')){$('inspectorPanel').addEventListener('click',handleEquipmentClick);$('inspectorPanel').addEventListener('change',handleEquipmentChange);}if($('emptyStateOverlay'))$('emptyStateOverlay').addEventListener('click',function(e){var el=e.target.closest('[data-role]');if(el&&el.dataset.role==='empty-party')buildPartyScene();if(el&&el.dataset.role==='empty-choose-own')openDrawer('inventory');if(el&&el.dataset.role==='empty-suggest')openDrawer('setup');});if($('viewModePlan'))$('viewModePlan').addEventListener('click',function(){setViewMode('plan');});if($('viewModePhoto'))$('viewModePhoto').addEventListener('click',function(){setViewMode('photo');});if($('viewMode3d'))$('viewMode3d').addEventListener('click',function(){setViewMode('3d');});if($('view3dInside'))$('view3dInside').addEventListener('click',function(){view3dMod?.inside();});if($('view3dFit'))$('view3dFit').addEventListener('click',function(){if(state.backgroundPhoto&&state.viewMode==='photo'){state.backgroundPhoto={...state.backgroundPhoto,zoom:1};renderViews(getConflicts());window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));}if(view3dMod){view3dMod.fitCamera();setPhoto3dModeUi('matched');}});if($('view3dMatchPhoto'))$('view3dMatchPhoto').addEventListener('click',function(){setViewMode('photo');});if($('view3dOrbit360'))$('view3dOrbit360').addEventListener('click',function(){if(view3dMod?.orbit360()){setPhoto3dModeUi('360');}});if($('view3dWalk'))$('view3dWalk').addEventListener('click',function(){if(!view3dMod)return;if(view3dMod.isMeasuring?.())view3dMod.setMeasureMode(false);var walking=view3dMod.toggleWalk?.();setPhoto3dModeUi(walking?'walk':'360');});if($('view3dMeasure'))$('view3dMeasure').addEventListener('click',function(){if(!view3dMod)return;if(view3dMod.isWalking?.())view3dMod.exitWalk();var measuring=view3dMod.toggleMeasure?.();setMeasureUi(measuring);});if($('view3dMeasureClear'))$('view3dMeasureClear').addEventListener('click',function(){view3dMod?.clearMeasurement?.();setMeasurementResult(null);});if($('view3dDayNight'))$('view3dDayNight').addEventListener('click',function(){setSceneNight(!sceneOptions.night);});
['sceneRain','sceneGuests','sceneStyling','sceneMotion'].forEach(function(id){var input=$(id);if(!input)return;input.checked=id==='sceneGuests'?sceneOptions.guests:id==='sceneStyling'?sceneOptions.styling:id==='sceneMotion'?sceneOptions.motion:false;input.addEventListener('change',function(){sceneOptions.weather=$('sceneRain').checked?'rain':'clear';sceneOptions.guests=$('sceneGuests').checked;sceneOptions.styling=$('sceneStyling').checked;sceneOptions.motion=$('sceneMotion').checked;view3dMod?.setScene(sceneOptions);window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));});});
if($('propertyFitBadge'))$('propertyFitBadge').addEventListener('click',function(){
  var panel=$('propertyFitPanel');if(!panel)return;panel.hidden=!panel.hidden;this.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)renderPropertyFit(currentPropertyPlan());
});
if($('view3dTimelapseBuild'))$('view3dTimelapseBuild').addEventListener('click',function(){if(view3dMod)view3dMod.playTimelapse('build');});if($('view3dTimelapseBreak'))$('view3dTimelapseBreak').addEventListener('click',function(){if(view3dMod)view3dMod.playTimelapse('breakdown');});if($('btnUndo'))$('btnUndo').addEventListener('click',function(){if(pendingPlacement)cancelPlacement();else store.undo();});if($('btnRedo'))$('btnRedo').addEventListener('click',function(){if(pendingPlacement)cancelPlacement();else store.redo();});store.subscribe(function(){refreshAll();window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));});if($('btnBackToRecommend'))$('btnBackToRecommend').addEventListener('click',function(){openDrawer('setup');});if($('btnToReview'))$('btnToReview').addEventListener('click',goToReview);if($('btnBackToDesigner'))$('btnBackToDesigner').addEventListener('click',function(){document.body.classList.add('designer-active');showStep('step-designer');});window.FriendlyBridge={EQUIPMENT:EQUIPMENT,INFLATABLES:INFLATABLES,ACCESSORIES:ACCESSORIES,openInflatablePreview:openInflatablePreview,buildPartyScene:buildPartyScene,openDrawer:openDrawer,state:state,TENTS:TENTS,TABLES:TABLES,CHAIRS:CHAIRS,PACKAGES:PACKAGES,byId:byId,showStep:showStep,enterDesigner:enterDesigner,getScene:getScene,loadScene:loadScene,useRecommendedLayout:useRecommendedLayout,customizeFromScratch:customizeFromScratch,refreshAll:refreshAll,setViewMode:setViewMode,goToReview:goToReview,computeLineItems:computeLineItems,currentReviewPricing:currentReviewPricing,getPropertyPlan:currentPropertyPlan,getChecks:getConflicts,closeDrawer:closeDrawer,getSpaceScan:function(){return currentVenueScan();},getScanReconstruction:function(){return window.RENTSKETCH_SCAN_RECONSTRUCTION||null;},getMeasurement:function(){return view3dMod?.getMeasurement?.()||null;},startMeasurement:function(){if(!view3dMod)return false;var active=view3dMod.setMeasureMode(true);setMeasureUi(active);return active;},clearMeasurement:function(){view3dMod?.clearMeasurement?.();setMeasurementResult(null);return true;}};

$('drawerBody').addEventListener('submit',function(e){if(e.target.id!=='quickSetupForm')return;e.preventDefault();var form=e.target;if(!form.reportValidity())return;state.guestCount=Math.max(1,Math.min(1000,Number(form.elements.guests.value)||1));var ft=Number(form.elements.dance.value);state.needDance=ft>0;state.danceFloorSizeId='custom';state.customDanceFloorFt=ft||null;useRecommendedLayout();});
document.addEventListener('keydown',function(e){if(e.key==='Escape'){if(view3dMod?.isMeasuring?.()){view3dMod.setMeasureMode(false);setMeasureUi(false);return;}if(view3dMod?.isWalking?.()){view3dMod.exitWalk();setPhoto3dModeUi('360');return;}if(pendingPlacement){cancelPlacement();return;}if($('sceneControls'))$('sceneControls').open=false;if(state.activeDrawer)closeDrawer();else if(state.selectedId){state.selectedId=null;refreshAll();}}});
document.querySelectorAll('.rail-btn').forEach(function(button){var icon=railIcons[button.dataset.drawer];if(icon)button.insertAdjacentHTML('afterbegin','<span class="rail-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+icon+'</svg></span>');button.setAttribute('aria-controls','drawer');button.setAttribute('aria-expanded','false');});

// Pending placement stays outside the authoritative store until confirmation.
function startPlacement(objects,label,previewId,extra){if(!requireEventEditing())return false;
  var photoMode=!!state.backgroundPhoto;
  if(photoMode){var snap=buildSnapshot([]);objects=objects.map(function(o){return rentalPhotoPlacement(o,snap.tent,snap.photoSite,state.photoTentPlacement);});if(photoEditing)setViewMode('photo');}
  var x=Math.min(...objects.map(o=>o.x)),y=Math.min(...objects.map(o=>o.y));
  pendingPlacement={objects:objects,label:label,x:x,y:y,widthFt:Math.max(...objects.map(o=>o.x+o.widthFt))-x,depthFt:Math.max(...objects.map(o=>o.y+o.depthFt))-y,photoMode:photoMode,...extra};
  state.selectedId=null;closeDrawer();$('sceneControls').open=false;
  var bar=$('placementBar');bar.hidden=false;bar.querySelector('.placement-preview').innerHTML=equipmentPreview(previewId);
  $('placementName').textContent=label;$('placementRotate').hidden=!['table','inflatable','chair','equipment','accessory'].includes(objects[0].kind);
  document.body.classList.add('placing-equipment');refreshAll();$('placementConfirm').focus({preventScroll:true});
}
function beginTablePlacement(t){
  var item=makeTableItem(t.id,tableDraft.chairId,t.seatsDefault>0?tableDraft.seatCount:0,tableDraft.linenId);
  startPlacement([item],t.name,t.id);
}
function beginDancePlacement(ft,id){
  var positions=dancePositions(layoutSpace(),ft,3,store.getState().objects.filter(o=>o.kind==='inflatable'));if(!positions.length)return;
  startPlacement(positions.map(pos=>({id:newItemId(),kind:'dance',widthFt:3,depthFt:3,x:pos.x,y:pos.y})),ft+' × '+ft+' ft Dance Floor','dance-floor',{danceSizeId:id});
}
function movePlacement(centerX,centerY){if(!requireEventEditing())return false;
  if(!pendingPlacement)return;var p=pendingPlacement,t=p.photoMode?buildSnapshot([]).photoSite:layoutSpace().planningArea||layoutSpace();
  var x=Math.max(0,Math.min(t.widthFt-p.widthFt,centerX-p.widthFt/2)),y=Math.max(0,Math.min(t.lengthFt-p.depthFt,centerY-p.depthFt/2));
  var dx=x-p.x,dy=y-p.y;p.objects=p.objects.map(o=>({...o,x:o.x+dx,y:o.y+dy}));p.x=x;p.y=y;
  renderViews(getConflicts());
}
function clearPlacement(){pendingPlacement=null;$('placementBar').hidden=true;document.body.classList.remove('placing-equipment');}
function cancelPlacement(){if(!pendingPlacement)return;clearPlacement();refreshAll();}
function confirmPlacement(){if(!requireEventEditing())return false;
  if(!pendingPlacement)return;var p=pendingPlacement;clearPlacement();state.selectedId=p.objects[0].id;
  if(p.photoMode){var t=layoutSpace();p.objects=p.objects.map(function(o){return {...o,photoPlacement:{x:o.x,y:o.y,rotationDeg:o.rotationDeg||0},x:Math.max(0,Math.min(t.widthFt-o.widthFt,o.x)),y:Math.max(0,Math.min(t.lengthFt-o.depthFt,o.y))};});}
  if(p.danceSizeId){state.danceFloorSizeId=p.danceSizeId;store.replaceObjects(store.getState().objects.filter(o=>o.kind!=='dance').concat(p.objects));}
  else{var item=p.objects[0];if(item.kind==='table'){tableDraft.activeItemId=item.id;state.lastTableConfig={tableId:item.tableId,chairId:item.chairId,seatCount:item.seatCount,linenId:item.linenId};}store.addObject(item);}
  refreshAll();
}
$('placementConfirm')?.addEventListener('click',confirmPlacement);
$('placementCancel')?.addEventListener('click',cancelPlacement);
$('placementRotate')?.addEventListener('click',function(){
  if(!pendingPlacement)return;var p=pendingPlacement,item=p.objects[0],cx=p.x+p.widthFt/2,cy=p.y+p.depthFt/2;
  if(item.shape==='round')item.rotationDeg=((item.rotationDeg||0)+45)%360;
  else{if(['inflatable','chair','equipment','accessory'].includes(item.kind))item.rotationDeg=((item.rotationDeg||0)+90)%360;var w=item.widthFt;item.widthFt=item.depthFt;item.depthFt=w;p.widthFt=item.widthFt;p.depthFt=item.depthFt;}
  movePlacement(cx,cy);
});
$('placementBar')?.addEventListener('keydown',function(e){
  if(!pendingPlacement||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
  e.preventDefault();var p=pendingPlacement,dx=e.key==='ArrowLeft'?-.5:e.key==='ArrowRight'?.5:0,dy=e.key==='ArrowUp'?-.5:e.key==='ArrowDown'?.5:0;
  movePlacement(p.x+p.widthFt/2+dx,p.y+p.depthFt/2+dy);
});

function buildPartyScene(){if(!requireEventEditing())return false;
  if(store.getState().objects.some(o=>!['inflatable','equipment','accessory'].includes(o.kind))){showLayoutNotice('Your layout is already started. Use Suggest to replace it, or keep adding items.');return false;}
  var tent=layoutSpace(),generic=(window.ACTIVE_TENANT||{}).slug==='generic';
  if(tent.isSite){state.guestCount=16;state.needDance=false;useRecommendedLayout();return true;}
  var objects=partyLayout(tent,{tables:TABLES,chairs:CHAIRS.filter(c=>!c.isThrone),linens:LINENS.filter(l=>l.productId||generic),danceAvailable:!!DANCE_SECTION.productId||generic});
  if(!objects.length){showLayoutNotice('Choose tables and chairs from this rental company to start your party.');return false;}
  objects=objects.map(o=>({...o,id:newItemId()}));state.selectedId=null;state.guestCount=objects.reduce((n,o)=>n+(o.seatCount||0),0);state.danceFloorSizeId='6x6';
  var seated=objects.find(o=>o.seatCount);if(seated)state.chairId=seated.chairId;
  sceneOptions.guests=true;sceneOptions.styling=true;$('sceneGuests').checked=true;$('sceneStyling').checked=true;view3dMod?.setScene(sceneOptions);
  closeDrawer();store.replaceObjects(objects);view3dMod?.inside();
  showLayoutNotice('Party setup added. Tables, chairs and linens are editable rentals. People, flowers and place settings are preview details.',6500);
  return true;
}

$('drawerBody').addEventListener('change',function(e){
 if(!['siteWidth','siteLength'].includes(e.target.id)||!layoutSpace().isSite)return;
 var key=e.target.id==='siteWidth'?'siteWidthFt':'siteLengthFt',axis=e.target.id==='siteWidth'?'x':'y',dim=axis==='x'?'widthFt':'depthFt';
 var minimum=Math.max(20,...store.getState().objects.map(o=>Math.ceil(o[axis]+o[dim]+1)));
 state[key]=Math.max(minimum,Math.min(200,Number(e.target.value)||minimum));refreshAll();window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));
});

function applyScenePreferences(){
  var button=$('view3dDayNight');
  if(button){button.textContent=sceneOptions.night?'Switch to day':'Switch to night';button.setAttribute('aria-pressed',String(sceneOptions.night));}
  [['sceneRain',sceneOptions.weather==='rain'],['sceneGuests',sceneOptions.guests],['sceneStyling',sceneOptions.styling],['sceneMotion',sceneOptions.motion]].forEach(function([id,checked]){if($(id))$(id).checked=checked;});
  view3dMod?.setScene(sceneOptions);
}
function restoreScenePreferences(value){
  var saved=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  var reducedMotion=!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  sceneOptions={
    night:typeof saved.night==='boolean'?saved.night:!!(state.lightingId&&state.lightingId!=='lighting-none'),
    weather:saved.weather==='rain'?'rain':'clear',
    guests:typeof saved.guests==='boolean'?saved.guests:false,
    styling:typeof saved.styling==='boolean'?saved.styling:true,
    motion:!reducedMotion&&(typeof saved.motion==='boolean'?saved.motion:true)
  };
  applyScenePreferences();
}
function setSceneNight(value){sceneOptions.night=!!value;applyScenePreferences();window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));}
$('sceneSettingLabel')?.addEventListener('click',()=>openDrawer('site'));
function beginAccentPlacement(chairId){if(!requireEventEditing())return false;const chair=byId(CHAIRS,chairId);if(!chair?.isThrone)return;const space=layoutSpace(),w=chair.seatWidthFt,d=chair.seatDepthFt;startPlacement([{id:newItemId(),kind:'chair',chairId,widthFt:w,depthFt:d,x:(space.widthFt-w)/2,y:(space.lengthFt-d)/2,rotationDeg:0}],chair.name,chair.id);$('placementBar').querySelector('.placement-preview').innerHTML=chairVisual(chair);}

['customerName','customerEmail','customerDate'].forEach(function(id){$(id)?.addEventListener('input',function(){window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));});});



function editScanCheck(control,event){
  if(!requireEventEditing())return false;
  var scan=currentVenueScan(),frame=scan.frames.find(f=>f.role==='center');if(!frame)return false;
  var sourceId=frame.id||frame.url,check=normalizeScanCheck(scan.validationCheck),role=control.dataset.role;if(check.sourceFrameId!==sourceId)check=normalizeScanCheck(null);check.sourceFrameId=sourceId;
  if(role==='scan-check-reset')check={...normalizeScanCheck(null),sourceFrameId:sourceId};
  else if(role==='scan-check-distance')check.distanceFt=Number(control.value)||null;
  else if(role==='scan-check-coordinate'){var point=control.dataset.point,axis=control.dataset.axis;if(!['a','b'].includes(point)||!['u','v'].includes(axis))return false;check[point]={...(check[point]||{u:.5,v:.5}),[axis]:Math.max(0,Math.min(1,Number(control.value)/100))};}
  else if(role==='scan-check-image'){if(event.detail===0){$('drawerBody').querySelector('[data-role="scan-check-coordinate"]')?.focus();return false;}var rect=control.getBoundingClientRect(),point={u:Math.max(0,Math.min(1,(event.clientX-rect.left)/Math.max(1,rect.width))),v:Math.max(0,Math.min(1,(event.clientY-rect.top)/Math.max(1,rect.height)))};if(!check.a||check.b){check.a=point;check.b=null;}else check.b=point;}
  state.venueScan=normalizeVenueScan({...scan,validationCheck:normalizeScanCheck(check)},window.RENTSKETCH_API_URL);window.RENTSKETCH_SCAN_RECONSTRUCTION=null;renderViews(getConflicts());renderDrawerBody('site');window.dispatchEvent(new CustomEvent('rentsketch:requestSave'));return true;
}

function contextCatalog(){return {tents:TENTS,tables:TABLES,chairs:CHAIRS,linens:LINENS,lighting:LIGHTING_OPTIONS,tabletop:TABLETOP,inflatables:INFLATABLES,equipment:EQUIPMENT,accessories:ACCESSORIES,products:window.RENTSKETCH_PRODUCTS||[],showPrices:(window.ACTIVE_TENANT||{}).slug!=='generic'&&(window.ACTIVE_TENANT||{}).showPrices!==false};}
function currentContextProducts(){return contextualProducts(contextCatalog());}
function beginContextSelection(kind,id){if(!requireEventEditing())return false;var product=currentContextProducts().find(p=>p.kind===kind&&p.id===id);if(!product)return false;pendingContext={kind:kind,id:id};renderDrawerBody('inventory');$('drawerBody').scrollTop=0;return true;}
function handleContextAction(button){
  if(!requireEventEditing())return false;
  if(button.dataset.role==='context-cancel'){pendingContext=null;renderDrawerBody('inventory');return;}
  var product=pendingContext&&currentContextProducts().find(p=>p.kind===pendingContext.kind&&p.id===pendingContext.id);if(!product){pendingContext=null;renderDrawerBody('inventory');return false;}
  var role=button.dataset.role;
  if(role==='context-apply-table'){
    var item=store.getState().objects.find(o=>o.id===button.dataset.id),patch=item&&applyTableProduct(item,product);if(!patch)return false;
    closeDrawer();store.updateObject(item.id,patch);handleSelect(item.id);showLayoutNotice(product.name+' applied to your table.');return true;
  }
  if(role==='context-new-table'){
    var table=byId(TABLES,button.dataset.id);if(!table)return false;ensureTableDraft();var item=makeTableItem(table.id,state.chairId,table.seatsDefault,null),patch=applyTableProduct(item,product);if(!patch)return false;
    tableDraft.tableId=table.id;tableDraft.chairId=item.chairId;tableDraft.seatCount=item.seatCount;startPlacement([{...item,...patch}],table.name+' + '+product.name,table.id);return true;
  }
  if(role==='context-select-tent'){
    var tent=byId(TENTS,button.dataset.id);if(!lightingCompatibility(product,tent))return false;selectTent(tent.id);renderDrawerBody('inventory');return true;
  }
  if(role==='context-apply-lighting'&&lightingCompatibility(product,layoutSpace())){
    closeDrawer();store.commitContext({...photoHistoryContext(),lightingId:product.sourceId,lightingProductId:product.productId});setSceneNight(true);refreshAll();showLayoutNotice(product.name+' applied. Night preview is on.');return true;
  }
  if(role==='context-apply-sidewall'){
    var tent=layoutSpace(),walls=exactSidewallSegments(product,tent,button.dataset.side,computeSidewallSegments(tent.widthFt,tent.lengthFt));if(!walls)return false;
    var next=normalizedSidewalls(tent).filter(w=>w.side!==button.dataset.side).concat(walls);closeDrawer();store.commitContext({...photoHistoryContext(),sidewalls:next});showLayoutNotice(product.name+' applied to the '+button.dataset.side+' side.');return true;
  }
  return false;
}

function beginEquipmentPlacement(product){
  if(!product||!requireEventEditing())return false;
  var space=layoutSpace().planningArea||layoutSpace();
  if(product.widthFt>space.widthFt||product.depthFt>space.lengthFt){showLayoutNotice('This item is larger than the current planning area. Choose a larger area before placing it.');return false;}
  var item=equipmentItem(product,newItemId(),Math.max(0,(space.widthFt-product.widthFt)/2),Math.max(0,(space.lengthFt-product.depthFt)/2));
  startPlacement([item],product.name,'');$('placementBar').querySelector('.placement-preview').innerHTML=equipmentPhoto(product);
}
$('drawerBody').addEventListener('input',function(e){
  if(e.target.dataset.role!=='inventory-query')return;
  inventoryQuery=e.target.value;var position=e.target.selectionStart;
  renderDrawerBody('inventory');var input=$('drawerBody').querySelector('[data-role="inventory-query"]');input?.focus();input?.setSelectionRange(position,position);
});

$('btnProjects')?.addEventListener('click',function(){window.RentSketchProjects?.open();});
$('photoPreviewZoom')?.addEventListener('input',function(){if(requireEventEditing())updateVenuePhotoControl('venue-photo-zoom',Number(this.value)/100);});
