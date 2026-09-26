import { normalizePhotoComposition } from '../core/photo-composition.js';
import { createPhotoCompositionEditor } from './photo-composition-editor.js';
export { syncLightingControls } from './photo-lighting-controls.js';
import {
  normalizePhotoCalibration, defaultPhotoCalibration, worldToPhoto, photoToWorld,
  objectPhotoPolygon, objectPhotoCenter, normalizePhotoGeometry, geometryPhotoPolygon,
  geometryTypeHeight, rentalPhotoPlacement, photoImageRect, photoGroundHorizon, photoCalibrationValidity
} from '../core/photo-geometry.js';

let container=null,root=null,stage=null,img=null,svg=null,toolbar=null,currentData=null,callbacks={};
let maskEditor=null;
let resizeObserver=null,tool='move',drag=null,draftGeom=null,selectedGeomId=null,referenceInputsDirty=false;
const NS='http://www.w3.org/2000/svg';

function el(tag,cls){const n=document.createElement(tag);if(cls)n.className=cls;return n;}
function svgEl(tag,attrs={}){const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;}
function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function pct(p){return {x:p.x*1000,y:p.y*1000};}
function photoSpace(){return currentData?.photoSite||currentData?.tent;}
function calibration(){return normalizePhotoCalibration(currentData?.photoCalibration,photoSpace());}
function geometry(){return normalizePhotoGeometry(currentData?.photoGeometry,photoSpace());}
function tentPlacement(){
  const site=photoSpace(),tent=currentData?.tent;if(!site||!tent)return {x:0,y:0,rotationDeg:0};
  const p=currentData?.photoTentPlacement&&typeof currentData.photoTentPlacement==='object'?currentData.photoTentPlacement:{};
  return {
    x:Number.isFinite(Number(p.x))?Number(p.x):Math.max(0,(site.widthFt-tent.widthFt)/2),
    y:Number.isFinite(Number(p.y))?Number(p.y):Math.max(0,(site.lengthFt-tent.lengthFt)/2),
    rotationDeg:Number(p.rotationDeg)||0
  };
}
function itemForPhoto(item){
  return rentalPhotoPlacement(item,currentData.tent,photoSpace(),tentPlacement());
}
function pointFromEvent(e){
  if(!stage)return null;const r=stage.getBoundingClientRect();
  return {x:clamp((e.clientX-r.left)/Math.max(1,r.width),0,1),y:clamp((e.clientY-r.top)/Math.max(1,r.height),0,1)};
}
function pointsAttr(points){return points.map(p=>{const q=pct(p);return q.x.toFixed(1)+','+q.y.toFixed(1);}).join(' ');}
function itemLabel(item){
  if(item.kind==='inflatable')return 'Inflatable';
  if(item.kind==='chair')return 'Chair';
  if(item.kind==='dance')return 'Dance';
  if(item.kind==='tent')return item.name||'Tent';
  if(item.kind==='table')return item.shape==='round'?'Round table':'Table';
  return item.name||item.kind||'Rental';
}
function geomLabel(type){return ({house:'House / building',fence:'Fence / wall',tree:'Tree / tall object',obstacle:'Obstacle','no-place':'No-place zone'})[type]||'Obstacle';}
function fitStage(){
  if(!root||!stage||!img)return;
  const viewport=root.querySelector('.photo-workspace-viewport');if(!viewport)return;
  const w=Math.max(1,(viewport.clientWidth||800)-20),h=Math.max(1,(viewport.clientHeight||600)-20);
  const iw=img.naturalWidth||Number(currentData?.backgroundPhoto?.widthPx)||4;
  const ih=img.naturalHeight||Number(currentData?.backgroundPhoto?.heightPx)||3;
  const rect=photoImageRect(w,h,iw,ih,currentData.backgroundPhoto);
  stage.style.position='absolute';stage.style.left=(rect.x+10)+'px';stage.style.top=(rect.y+10)+'px';
  stage.style.width=rect.width+'px';stage.style.height=rect.height+'px';
}
function updateHint(){
  const out=root?.querySelector('[data-photo-hint]');if(!out)return;
  if(tool==='calibrate')out.textContent='Mark the four corners of a real rectangle on level ground, then enter its measured width and depth. A photo cannot determine scale by itself.';
  else if(tool==='mask')out.textContent='Foreground outlines preserve real photo details in front of rentals. They apply only to this fixed Photo View.';
  else if(tool==='geometry')out.textContent='Drag across the photo to mark a house, fence, tree, obstacle, or no-place zone.';
  else out.textContent='Drag the tent or any rental anywhere on the real venue photo. Select one to rotate it.';
}
export function setTool(next){
  tool=next||'move';maskEditor?.setActive(tool==='mask');
  const panel=root?.querySelector('[data-photo-calibration-panel]');if(panel)panel.hidden=tool!=='calibrate';root?.querySelectorAll('[data-photo-tool]').forEach(b=>b.classList.toggle('active',b.dataset.photoTool===tool));updateHint();renderOverlay();
}
function renderToolbar(){
  toolbar.innerHTML=
    '<div class="photo-workspace-title"><strong>Adjust photo</strong><span data-photo-scale-status>Scale not set</span></div>'+
    '<div class="photo-workspace-tools">'+
      '<button type="button" class="btn-chip active" data-photo-tool="move">Move rentals</button>'+
      '<button type="button" class="btn-chip" data-photo-tool="calibrate">Set scale</button>'+
      '<button type="button" class="btn-chip" data-photo-done>Preview</button>'+
      '<button type="button" class="btn-chip" data-photo-tool="mask">Foreground</button>'+
      '<details class="photo-mark-tools"><summary>Obstacles</summary><div class="photo-workspace-tools">'+
        '<select class="photo-geometry-type" data-photo-geometry-type aria-label="Obstacle type">'+
        '<option value="house">House / building</option><option value="fence">Fence / wall</option><option value="tree">Tree / tall object</option><option value="obstacle">Obstacle</option><option value="no-place">No-place zone</option></select>'+
        '<button type="button" class="btn-chip" data-photo-tool="geometry">Trace obstacle</button>'+
        '<button type="button" class="btn-chip" data-photo-remove-geometry disabled>Remove selected</button></div></details>'+
    '</div>'+
    '<div class="photo-calibration-panel" data-photo-calibration-panel hidden>'+
      '<div class="photo-reference-fields"><label>Rectangle width (ft)<input data-photo-reference-width type="number" min="1" max="500" step="0.5" inputmode="decimal"></label>'+
      '<label>Rectangle depth (ft)<input data-photo-reference-depth type="number" min="1" max="500" step="0.5" inputmode="decimal"></label>'+
      '<button type="button" class="btn-chip" data-photo-confirm-scale>Apply measurements</button></div>'+
      '<details class="photo-perspective-tools"><summary>Perspective &amp; horizon</summary><div class="photo-perspective-fields"><label>Eye-level horizon<input data-photo-horizon type="range" min="15" max="70" step="1"></label>'+
      '<label>Lens perspective<input data-photo-lens type="range" min="35" max="85" step="1"></label>'+
      '<button type="button" class="btn-chip" data-photo-auto>Reset estimates</button></div>'+
      '<p>Place the horizon at camera eye level, not along a roof or fence. Lens and height remain estimates. Verify clearance on site.</p></details>'+
    '</div>'+
    '<div class="photo-mask-panel" data-photo-mask-panel hidden></div>'+
    '<div class="photo-workspace-hint" data-photo-hint></div>';
  maskEditor=createPhotoCompositionEditor({panel:toolbar.querySelector('[data-photo-mask-panel]'),svg,getValue:()=>currentData.photoComposition,onChange:next=>{currentData={...currentData,photoComposition:next};callbacks.onCompositionChange?.(next);},onRender:renderOverlay});
  toolbar.addEventListener('click',e=>{
    const toolBtn=e.target.closest('[data-photo-tool]');if(toolBtn){setTool(toolBtn.dataset.photoTool);return;}
    if(e.target.closest('[data-photo-done]')){callbacks.onDone?.();return;}
    if(e.target.closest('[data-photo-auto]')){referenceInputsDirty=false;applyCalibration(defaultPhotoCalibration(photoSpace(),currentData.backgroundPhoto));return;}
    if(e.target.closest('[data-photo-confirm-scale]')){
      const width=Number(root.querySelector('[data-photo-reference-width]').value),depth=Number(root.querySelector('[data-photo-reference-depth]').value);
      if(!(width>=1&&width<=500&&depth>=1&&depth<=500))return;
      const cal=calibration(),r=cal.reference||{x:0,y:0,widthFt:photoSpace().widthFt,lengthFt:photoSpace().lengthFt};
      referenceInputsDirty=false;applyCalibration({...cal,version:2,reference:{...r,widthFt:width,lengthFt:depth},scaleConfirmed:true,calibratedAt:new Date().toISOString()});return;
    }
    if(e.target.closest('[data-photo-remove-geometry]')&&selectedGeomId){callbacks.onGeometryRemove?.(selectedGeomId);selectedGeomId=null;renderOverlay();}
  });
  toolbar.addEventListener('input',e=>{
    if(e.target.matches('[data-photo-reference-width],[data-photo-reference-depth]')){referenceInputsDirty=true;return;}
    const cal=calibration();
    if(e.target.matches('[data-photo-lens]')){applyCalibration({...cal,fovDeg:Number(e.target.value)});return;}
    if(e.target.matches('[data-photo-horizon]')){
      const horizon=Number(e.target.value)/100,old=photoGroundHorizon(photoSpace(),cal)??cal.horizonY,delta=horizon-old;
      const next={...cal,horizonY:horizon};for(const key of ['frontLeft','frontRight','backLeft','backRight'])next[key]={x:cal[key].x,y:clamp(cal[key].y+delta,.01,.99)};
      applyCalibration(next);
    }
  });
  syncCalibrationControls();updateHint();
}
function applyCalibration(next){
  currentData={...currentData,photoCalibration:normalizePhotoCalibration(next,photoSpace())};callbacks.onCalibration?.(currentData.photoCalibration);syncCalibrationControls();renderOverlay();
}
function syncCalibrationControls(){
  if(!root)return;const cal=calibration(),r=cal.reference||{widthFt:photoSpace().widthFt,lengthFt:photoSpace().lengthFt};
  for(const [selector,value] of [['[data-photo-reference-width]',r.widthFt],['[data-photo-reference-depth]',r.lengthFt],['[data-photo-lens]',cal.fovDeg],['[data-photo-horizon]',Math.round((photoGroundHorizon(photoSpace(),cal)??cal.horizonY)*100)]]){
    const input=root.querySelector(selector);if(input&&document.activeElement!==input&&!(referenceInputsDirty&&selector.startsWith('[data-photo-reference-')))input.value=String(value);
  }
  const validity=photoCalibrationValidity(cal),status=root.querySelector('[data-photo-scale-status]');if(status)status.textContent=!validity.valid?validity.reason:cal.scaleConfirmed?'Measurements entered · vertical perspective estimated':'Scale not set · starting estimate';
}
function renderGround(){
  const cal=calibration(),pts=[cal.frontLeft,cal.frontRight,cal.backRight,cal.backLeft];
  const g=svgEl('g',{'class':'photo-ground-calibration'});
  g.appendChild(svgEl('polygon',{points:pointsAttr(pts),'class':'photo-ground-polygon'}));
  if(tool==='calibrate'){
    const names=['frontLeft','frontRight','backRight','backLeft'];
    pts.forEach((p,i)=>{const q=pct(p);g.appendChild(svgEl('circle',{cx:q.x,cy:q.y,r:13,'class':'photo-calibration-handle','data-cal-handle':names[i]}));});
    const hY=(photoGroundHorizon(photoSpace(),cal)??cal.horizonY)*1000;g.appendChild(svgEl('line',{x1:0,y1:hY,x2:1000,y2:hY,'class':'photo-horizon-line'}));
  }
  svg.appendChild(g);
}
function renderGeometry(){
  for(const g of geometry()){
    const pts=geometryPhotoPolygon(g,photoSpace(),calibration());
    const group=svgEl('g',{'data-geom-id':g.id,'class':'photo-geometry '+g.type+(selectedGeomId===g.id?' selected':'')});
    group.appendChild(svgEl('polygon',{points:pointsAttr(pts),'class':'photo-geometry-shape'}));
    const center=worldToPhoto(g.x+g.widthFt/2,g.y+g.depthFt/2,photoSpace(),calibration()),q=pct(center);
    const label=svgEl('text',{x:q.x,y:q.y,'class':'photo-geometry-label'});label.textContent=geomLabel(g.type);group.appendChild(label);
    group.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();selectedGeomId=g.id;root.querySelector('[data-photo-remove-geometry]').disabled=false;renderOverlay();});
    svg.appendChild(group);
  }
}
function renderObjects(){
  if(tool==='calibrate')return;
  const objects=[];
  if(currentData?.tent&&!currentData.tent.isSite){
    const tp=tentPlacement();objects.push({id:'__photo_tent__',kind:'tent',widthFt:currentData.tent.widthFt,depthFt:currentData.tent.lengthFt,x:tp.x,y:tp.y,rotationDeg:tp.rotationDeg,name:currentData.tent.name||'Tent'});
  }
  for(const source of (currentData?.objects||[]))objects.push(itemForPhoto(source));
  for(const item of objects){
    const pts=objectPhotoPolygon(item,photoSpace(),calibration()),center=objectPhotoCenter(item,photoSpace(),calibration()),q=pct(center);
    const selected=currentData.selectedPhotoId===item.id||currentData.selectedId===item.id;
    const group=svgEl('g',{'data-photo-item':item.id,'class':'photo-rental '+(selected?'selected':'')+' '+(item.kind||'item')});
    if(tool==='calibrate')group.style.pointerEvents='none';
    group.appendChild(svgEl('polygon',{points:pointsAttr(pts),'class':'photo-rental-shape'}));
    const label=svgEl('text',{x:q.x,y:q.y,'class':'photo-rental-label'});label.textContent=itemLabel(item);group.appendChild(label);
    if(selected){
      const handleY=Math.max(20,q.y-52);
      group.appendChild(svgEl('line',{x1:q.x,y1:q.y,x2:q.x,y2:handleY,'class':'photo-rotate-line'}));
      group.appendChild(svgEl('circle',{cx:q.x,cy:handleY,r:15,'data-photo-rotate':item.id,'class':'photo-rotate-handle'}));
    }
    group.addEventListener('pointerdown',e=>{
      const rotate=e.target.closest?.('[data-photo-rotate]');e.preventDefault();e.stopPropagation();
      callbacks.onPhotoSelect?.(item.id);if(item.id!=='__photo_tent__')callbacks.onSelect?.(item.id);
      const p=pointFromEvent(e);if(!p)return;
      drag={kind:rotate?'rotate':'item',id:item.id,start:p,startWorld:photoToWorld(p.x,p.y,photoSpace(),calibration(),{clampToGround:false}),item:{...item},pointerId:e.pointerId,live:{...item}};
      try{stage.setPointerCapture(e.pointerId);}catch(_){}
    });
    svg.appendChild(group);
  }
}
function renderDraftGeometry(){
  if(!draftGeom)return;
  const p1=pct(draftGeom.start),p2=pct(draftGeom.end),x=Math.min(p1.x,p2.x),y=Math.min(p1.y,p2.y),w=Math.abs(p2.x-p1.x),h=Math.abs(p2.y-p1.y);
  svg.appendChild(svgEl('rect',{x,y,width:w,height:h,'class':'photo-geometry-draft'}));
}
function renderOverlay(){
  if(!svg||!currentData)return;
  svg.replaceChildren();if(tool==='mask')maskEditor?.render();else{renderGround();renderGeometry();renderObjects();renderDraftGeometry();}
  const remove=root?.querySelector('[data-photo-remove-geometry]');if(remove)remove.disabled=!selectedGeomId;
}
function dragCalibration(name,p){
  const cal=calibration(),next={...cal,[name]:{x:p.x,y:p.y},autoEstimated:false,calibratedAt:new Date().toISOString()};
  const validity=photoCalibrationValidity(next);
  if(!validity.valid){const status=root.querySelector('[data-photo-scale-status]');if(status)status.textContent=validity.reason;return;}
  next.horizonY=photoGroundHorizon(photoSpace(),next)??cal.horizonY;
  applyCalibration(next);
}
function pointerDown(e){
  if(tool==='mask'){maskEditor?.pointerDown(e,pointFromEvent(e));return;}
  const handle=e.target.closest?.('[data-cal-handle]');
  if(handle&&tool==='calibrate'){
    e.preventDefault();e.stopPropagation();drag={kind:'calibration',name:handle.dataset.calHandle,pointerId:e.pointerId,original:calibration()};
    try{stage.setPointerCapture(e.pointerId);}catch(_){}return;
  }
  if(tool==='geometry'){
    const p=pointFromEvent(e);if(!p)return;e.preventDefault();draftGeom={start:p,end:p};drag={kind:'geometry',pointerId:e.pointerId};
    try{stage.setPointerCapture(e.pointerId);}catch(_){};renderOverlay();return;
  }
  if(tool==='move'&&!e.target.closest?.('[data-photo-item]')){selectedGeomId=null;callbacks.onPhotoSelect?.(null);renderOverlay();}
}
function applyLivePhotoPlacement(item){
  if(item.id==='__photo_tent__')currentData={...currentData,photoTentPlacement:{x:item.x,y:item.y,rotationDeg:item.rotationDeg||0},selectedPhotoId:item.id};
  else currentData={...currentData,objects:(currentData.objects||[]).map(o=>o.id===item.id?{...o,photoPlacement:{x:item.x,y:item.y,rotationDeg:item.rotationDeg||0}}:o),selectedPhotoId:item.id};
  renderOverlay();
}
function pointerMove(e){
  if(tool==='mask'){maskEditor?.pointerMove(e,pointFromEvent(e));return;}
  if(!drag)return;
  const p=pointFromEvent(e);if(!p)return;
  if(drag.kind==='calibration'){dragCalibration(drag.name,p);return;}
  if(drag.kind==='geometry'){draftGeom.end=p;renderOverlay();return;}
  const site=photoSpace();let item={...drag.live};
  if(drag.kind==='item'){
    const world=photoToWorld(p.x,p.y,site,calibration(),{clampToGround:false});if(!world||!drag.startWorld)return;
    item.x=clamp(drag.item.x+world.x-drag.startWorld.x,0,Math.max(0,site.widthFt-item.widthFt));
    item.y=clamp(drag.item.y+world.y-drag.startWorld.y,0,Math.max(0,site.lengthFt-item.depthFt));
  }else if(drag.kind==='rotate'){
    const world=photoToWorld(p.x,p.y,site,calibration(),{clampToGround:false});if(!world||!drag.startWorld)return;
    const cx=item.x+item.widthFt/2,cy=item.y+item.depthFt/2,angle=Math.atan2(world.y-cy,world.x-cx)-Math.atan2(drag.startWorld.y-cy,drag.startWorld.x-cx);
    item.rotationDeg=Math.round((drag.item.rotationDeg+angle*180/Math.PI)/5)*5;
  }
  drag.live=item;applyLivePhotoPlacement(item);
}
function pointerUp(e){
  if(tool==='mask'){maskEditor?.pointerUp(e);return;}
  if(!drag)return;
  const finished=drag;drag=null;
  if(e.type==='pointercancel'){
    if(finished.item)applyLivePhotoPlacement(finished.item);
    if(finished.kind==='calibration'){currentData={...currentData,photoCalibration:finished.original};callbacks.onCalibration?.(finished.original);}
    draftGeom=null;renderOverlay();return;
  }
  if(finished.kind==='item'||finished.kind==='rotate'){
    const live=finished.live;
    if(live)callbacks.onPhotoPlacement?.(finished.id,{x:live.x,y:live.y,rotationDeg:live.rotationDeg||0});
  }else if(finished.kind==='geometry'&&draftGeom){
    const a=photoToWorld(draftGeom.start.x,draftGeom.start.y,photoSpace(),calibration(),{clampToGround:true});
    const b=photoToWorld(draftGeom.end.x,draftGeom.end.y,photoSpace(),calibration(),{clampToGround:true});
    if(a&&b&&Math.hypot(a.x-b.x,a.y-b.y)>.5){
      const select=root.querySelector('[data-photo-geometry-type]'),type=select?.value||'obstacle';
      const geom={id:'photo-geo-'+Date.now().toString(36),type,x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),widthFt:Math.max(.5,Math.abs(a.x-b.x)),depthFt:Math.max(.5,Math.abs(a.y-b.y)),heightFt:geometryTypeHeight(type),rotationDeg:0};
      callbacks.onGeometryAdd?.(geom);selectedGeomId=geom.id;
    }
    draftGeom=null;setTool('move');
  }
  try{stage.releasePointerCapture(e.pointerId);}catch(_){}
  renderOverlay();
}
function renderImage(){
  if(!currentData?.backgroundPhoto?.url)return;
  if(img.src!==currentData.backgroundPhoto.url)img.src=currentData.backgroundPhoto.url;
  const p=currentData.backgroundPhoto;img.style.objectPosition=(Number(p.focusX)||50)+'% '+(Number(p.focusY)||50)+'%';
}
export function mount(containerEl,data,cbs){
  container=containerEl;callbacks=cbs||{};referenceInputsDirty=false;
  currentData={...data,photoComposition:normalizePhotoComposition(data.photoComposition),objects:(data.objects||[]).map(o=>({...o})),photoCalibration:normalizePhotoCalibration(data.photoCalibration,data.photoSite||data.tent,data.backgroundPhoto),photoGeometry:normalizePhotoGeometry(data.photoGeometry,data.photoSite||data.tent)};
  root=el('div','photo-workspace');toolbar=el('div','photo-workspace-toolbar');
  const viewport=el('div','photo-workspace-viewport');stage=el('div','photo-workspace-stage');
  img=el('img','photo-workspace-image');img.alt='Uploaded venue photo';img.crossOrigin='anonymous';img.decoding='async';
  svg=svgEl('svg',{viewBox:'0 0 1000 1000',preserveAspectRatio:'none','class':'photo-workspace-overlay','aria-label':'Photo placement workspace'});
  stage.append(img,svg);viewport.appendChild(stage);root.append(toolbar,viewport);container.replaceChildren(root);
  renderToolbar();renderImage();
  img.addEventListener('load',()=>{fitStage();if(!data.photoCalibration){const cal=defaultPhotoCalibration(photoSpace(),currentData.backgroundPhoto);currentData={...currentData,photoCalibration:cal};callbacks.onCalibration?.(cal);}renderOverlay();});
  stage.addEventListener('pointerdown',pointerDown);stage.addEventListener('pointermove',pointerMove);stage.addEventListener('pointerup',pointerUp);stage.addEventListener('pointercancel',pointerUp);
  window.addEventListener('pointerup',pointerUp,true);window.addEventListener('pointercancel',pointerUp,true);
  if(window.ResizeObserver){resizeObserver=new ResizeObserver(()=>{fitStage();renderOverlay();});resizeObserver.observe(viewport);}
  fitStage();renderOverlay();
}
export function update(data){
  currentData={...data,photoComposition:normalizePhotoComposition(data.photoComposition),objects:(data.objects||[]).map(o=>({...o})),photoCalibration:normalizePhotoCalibration(data.photoCalibration,data.photoSite||data.tent,data.backgroundPhoto),photoGeometry:normalizePhotoGeometry(data.photoGeometry,data.photoSite||data.tent)};
  maskEditor?.sync();renderImage();fitStage();syncCalibrationControls();renderOverlay();
}
export function unmount(){
  maskEditor?.destroy();maskEditor=null;
  window.removeEventListener('pointerup',pointerUp,true);window.removeEventListener('pointercancel',pointerUp,true);
  resizeObserver?.disconnect();resizeObserver=null;if(container)container.replaceChildren();
  container=root=stage=img=svg=toolbar=null;currentData=null;callbacks={};drag=draftGeom=null;selectedGeomId=null;tool='move';referenceInputsDirty=false;
}
