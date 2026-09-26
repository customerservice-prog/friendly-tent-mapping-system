import {normalizePhotoComposition,foregroundMaskValidity} from '../core/photo-composition.js';
const NS='http://www.w3.org/2000/svg';
function node(tag,attrs={}){const n=document.createElementNS(NS,tag);for(const [key,value] of Object.entries(attrs))n.setAttribute(key,String(value));return n;}
const pointsAttr=points=>points.map(p=>`${p.x*1000},${p.y*1000}`).join(' ');

// Coordinates always belong to the original image, never the current viewport.
export function createPhotoCompositionEditor({panel,svg,getValue,onChange,onRender}){
  let active=false,selectedId=null,selectedVertex=-1,draft=null,drag=null,message='';
  const value=()=>normalizePhotoComposition(getValue());
  const selected=()=>value().foregroundMasks.find(mask=>mask.id===selectedId);
  panel.innerHTML='<p>Trace a real tree, bush, fence, or other foreground detail that belongs <strong>in front of rentals</strong>. This copies photo pixels; it does not create 3D geometry.</p>'+
    '<div class="photo-mask-actions"><button type="button" class="btn-chip" data-mask-new>New outline</button><button type="button" class="btn-chip" data-mask-finish>Finish outline</button><button type="button" class="btn-chip" data-mask-cancel>Cancel</button></div>'+
    '<div class="photo-mask-select-field"><label>Foreground outline<select data-mask-select aria-label="Foreground outline"></select></label></div>'+
    '<div class="photo-mask-point-controls" data-mask-point-controls hidden><label>Refine point<select data-mask-point-select aria-label="Outline point"></select></label><button type="button" class="btn-chip" data-mask-add-point>Add after point</button><span>Drag the selected point, or focus its dot and use arrow keys. Shift moves ten pixels.</span></div><details class="photo-mask-properties"><summary>Outline options</summary><div class="photo-mask-fields"><label>Name<input data-mask-label maxlength="80" placeholder="Tree, bush, fence…"></label>'+
    '<label class="photo-mask-feather">Soft edge <output data-mask-feather-value></output><input data-mask-feather type="range" min="0" max="12" step="0.5"></label><label class="photo-mask-visible"><input data-mask-enabled type="checkbox"> Show in Photo View</label></div>'+
    '<div class="photo-mask-actions"><button type="button" class="btn-chip" data-mask-remove>Remove outline</button><button type="button" class="btn-chip" data-mask-remove-point>Remove point</button></div></details><p class="photo-mask-status" data-mask-status role="status" aria-live="polite"></p>';
  function commit(next){onChange(normalizePhotoComposition(next));sync();onRender();}
  function editSelected(patch){const next=value();next.foregroundMasks=next.foregroundMasks.map(mask=>mask.id===selectedId?{...mask,...patch}:mask);commit(next);}
  function start(){if(value().foregroundMasks.length>=24){message='This photo can hold up to 24 foreground outlines.';sync();return;}draft=[];selectedId=null;selectedVertex=-1;message='Tap around the foreground edge, then Finish outline. Use more points around curved edges.';sync();onRender();}
  function finish(){
    const validity=foregroundMaskValidity(draft);if(!validity.valid){message=validity.reason;sync();return;}
    const next=value();selectedId='foreground-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36));
    next.foregroundMasks.push({id:selectedId,label:'Foreground '+(next.foregroundMasks.length+1),points:draft.map(p=>({...p})),featherPx:1.5,enabled:true});draft=null;message='Drag a point, or choose one in Refine point.';commit(next);
  }
  function cancel(){draft=null;drag=null;message='Outline canceled.';sync();onRender();}
  function removePoint(){const mask=selected();if(!mask||selectedVertex<0||mask.points.length<=3)return;const points=mask.points.filter((_,i)=>i!==selectedVertex),validity=foregroundMaskValidity(points);if(!validity.valid){message=validity.reason;sync();return;}selectedVertex=-1;editSelected({points});}
  panel.addEventListener('click',e=>{
    if(e.target.closest('[data-mask-new]'))start();
    else if(e.target.closest('[data-mask-finish]'))finish();
    else if(e.target.closest('[data-mask-cancel]'))cancel();
    else if(e.target.closest('[data-mask-remove]')){const next=value();next.foregroundMasks=next.foregroundMasks.filter(mask=>mask.id!==selectedId);selectedId=null;selectedVertex=-1;message='Foreground outline removed.';commit(next);}
    else if(e.target.closest('[data-mask-remove-point]'))removePoint();
    else if(e.target.closest('[data-mask-add-point]')){
      const mask=selected();if(!mask||selectedVertex<0||mask.points.length>=128)return;
      const points=mask.points.map(point=>({...point})),a=points[selectedVertex],b=points[(selectedVertex+1)%points.length],index=selectedVertex+1;points.splice(index,0,{x:(a.x+b.x)/2,y:(a.y+b.y)/2});
      const validity=foregroundMaskValidity(points);if(!validity.valid){message='Move these points farther apart before adding another point.';sync();return;}
      selectedVertex=index;message='Point added. Drag its dot or use arrow keys to refine the edge.';editSelected({points});
    }
  });
  panel.addEventListener('change',e=>{
    if(e.target.matches('[data-mask-select]')){selectedId=e.target.value||null;selectedVertex=-1;draft=null;message='Drag a point, or choose one in Refine point.';sync();onRender();}
    else if(e.target.matches('[data-mask-point-select]')){selectedVertex=Number(e.target.value);sync();onRender();}
    else if(e.target.matches('[data-mask-label]'))editSelected({label:e.target.value});
    else if(e.target.matches('[data-mask-feather]'))editSelected({featherPx:Number(e.target.value)});
    else if(e.target.matches('[data-mask-enabled]'))editSelected({enabled:e.target.checked});
  });
  panel.addEventListener('input',e=>{if(e.target.matches('[data-mask-feather]'))panel.querySelector('[data-mask-feather-value]').textContent=e.target.value+' px';});
  function sync(){
    const composition=value();if(selectedId&&!composition.foregroundMasks.some(mask=>mask.id===selectedId)){selectedId=null;selectedVertex=-1;}
    const mask=selected(),select=panel.querySelector('[data-mask-select]');select.replaceChildren();
    const blank=document.createElement('option');blank.value='';blank.textContent=composition.foregroundMasks.length?'Select an outline':'No outlines yet';select.append(blank);
    for(const item of composition.foregroundMasks){const option=document.createElement('option');option.value=item.id;option.textContent=item.label+(item.enabled?'':' (hidden)');select.append(option);}select.value=selectedId||'';
    panel.querySelector('[data-mask-finish]').disabled=draft===null;panel.querySelector('[data-mask-cancel]').disabled=draft===null;
    for(const attr of ['label','feather','enabled','remove'])panel.querySelector('[data-mask-'+attr+']').disabled=!mask;
    const label=panel.querySelector('[data-mask-label]');if(document.activeElement!==label)label.value=mask?.label||'';
    const feather=panel.querySelector('[data-mask-feather]');if(document.activeElement!==feather)feather.value=mask?.featherPx??1.5;
    panel.querySelector('[data-mask-feather-value]').textContent=(mask?.featherPx??1.5)+' px';panel.querySelector('[data-mask-enabled]').checked=mask?.enabled!==false;
    if(mask&&(selectedVertex<0||selectedVertex>=mask.points.length))selectedVertex=0;
    panel.querySelector('[data-mask-point-controls]').hidden=!mask;
    const pointSelect=panel.querySelector('[data-mask-point-select]');pointSelect.replaceChildren();
    for(let i=0;i<(mask?.points.length||0);i++){const option=document.createElement('option');option.value=String(i);option.textContent='Point '+(i+1)+' of '+mask.points.length;pointSelect.append(option);}pointSelect.value=String(selectedVertex);
    panel.querySelector('[data-mask-add-point]').disabled=!mask||mask.points.length>=128;
    panel.querySelector('[data-mask-remove-point]').disabled=!mask||selectedVertex<0||mask.points.length<=3;
    panel.querySelector('[data-mask-status]').textContent=message||(draft?'Tap to add outline points, then Finish outline.':mask?'Drag a point, or choose one in Refine point.':'Choose New outline to trace foreground photo details.');
  }
  function screenSize(){const rect=svg.getBoundingClientRect(),fallback=svg.parentElement?.getBoundingClientRect();return {width:Math.max(1,rect.width||fallback?.width||800),height:Math.max(1,rect.height||fallback?.height||600)};}
  function control(p,attrs,cls,radius=6,size=screenSize()){
    const group=node('g',{transform:`translate(${p.x*1000} ${p.y*1000}) scale(${1000/size.width} ${1000/size.height})`,'class':'photo-mask-point'});
    group.append(node('circle',{cx:0,cy:0,r:22,'class':'photo-mask-target',...attrs}));
    group.append(node('circle',{cx:0,cy:0,r:radius,'class':cls,'pointer-events':'none'}));return group;
  }
  function edgeIsReachable(points,index,size){
    const a=points[index],b=points[(index+1)%points.length],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    // Dense curves use the point selector and Add after point, so edge targets
    // cannot cover their neighbouring vertex targets on a small phone.
    return points.every(point=>Math.hypot((point.x-mid.x)*size.width,(point.y-mid.y)*size.height)>=44);
  }
  function nearestPoint(p,mask){
    if(!mask)return null;const size=screenSize();let result=null,distance=22;
    mask.points.forEach((point,index)=>{const next=Math.hypot((point.x-p.x)*size.width,(point.y-p.y)*size.height);if(next<distance){distance=next;result={index,edge:false,point};}});
    if(result)return result;
    if(mask.points.length<128)mask.points.forEach((a,index)=>{if(!edgeIsReachable(mask.points,index,size))return;const b=mask.points[(index+1)%mask.points.length],point={x:(a.x+b.x)/2,y:(a.y+b.y)/2},next=Math.hypot((point.x-p.x)*size.width,(point.y-p.y)*size.height);if(next<distance){distance=next;result={index,edge:true,point};}});
    return result;
  }
  function render(){
    if(!active)return;const size=screenSize();
    for(const original of value().foregroundMasks){
      const mask=drag?.id===original.id?{...original,points:drag.points}:original;
      const group=node('g',{'class':'photo-mask-outline'+(selectedId===mask.id?' selected':'')+(mask.enabled?'':' disabled'),'data-mask-id':mask.id});
      group.append(node('polygon',{points:pointsAttr(mask.points),'class':'photo-mask-shape'}));
      if(selectedId===mask.id)mask.points.forEach((p,index)=>{
        const q=mask.points[(index+1)%mask.points.length];
        if(mask.points.length<128&&edgeIsReachable(mask.points,index,size))group.append(control({x:(p.x+q.x)/2,y:(p.y+q.y)/2},{'data-mask-edge':index,tabindex:selectedVertex===index?0:-1,role:'button','aria-label':'Add point after point '+(index+1)},'photo-mask-midpoint',4,size));
        group.append(control(p,{'data-mask-vertex':index,tabindex:selectedVertex===index?0:-1,role:'button','aria-label':'Outline point '+(index+1)+'. Drag or use arrow keys to adjust; Shift moves ten pixels.','aria-pressed':selectedVertex===index},'photo-mask-handle'+(selectedVertex===index?' selected':''),6,size));
      });
      svg.append(group);
    }
    if(draft){
      const group=node('g',{'class':'photo-mask-draft'});group.append(node(draft.length>2?'polygon':'polyline',{points:pointsAttr(draft)}));
      draft.forEach((p,index)=>{const dot=control(p,{'data-mask-draft-point':index},'photo-mask-draft-dot',index===0?6:4,size);dot.style.pointerEvents='none';group.append(dot);});svg.append(group);
    }
  }
  function pointerDown(e,p){
    if(!active||!p)return false;e.preventDefault();e.stopPropagation();
    if(draft){
      if(draft.length>=128){message='Finish this outline, or undo its last point with Backspace.';sync();return true;}
      draft.push(p);message=draft.length+' points · Finish outline when the edge is complete.';sync();onRender();return true;
    }
    const nearby=nearestPoint(p,selected()),group=e.target.closest?.('[data-mask-id]');if(!nearby&&!group){selectedId=null;selectedVertex=-1;sync();onRender();return true;}
    if(!nearby)selectedId=group.dataset.maskId;const mask=selected(),target=nearby||nearestPoint(p,mask);
    if(target){
      const points=mask.points.map(point=>({...point}));selectedVertex=target.index+(target.edge?1:0);
      if(target.edge)points.splice(selectedVertex,0,{...target.point});
      drag={id:selectedId,index:selectedVertex,points,pointerId:e.pointerId,offset:{x:target.point.x-p.x,y:target.point.y-p.y}};
      try{e.currentTarget.setPointerCapture(e.pointerId);}catch(_){}
    }else selectedVertex=0;
    message='Drag a point, or choose one in Refine point.';sync();onRender();
    if(target)svg.querySelector('[data-mask-vertex="'+selectedVertex+'"]')?.focus({preventScroll:true});return true;
  }
  function pointerMove(e,p){if(!drag||drag.pointerId!==e.pointerId||!p)return false;drag.points[drag.index]={x:Math.max(0,Math.min(1,p.x+drag.offset.x)),y:Math.max(0,Math.min(1,p.y+drag.offset.y))};onRender();return true;}
  function pointerUp(e){
    if(!drag||drag.pointerId!==e.pointerId)return false;const finished=drag;drag=null;
    if(e.type!=='pointercancel'){const validity=foregroundMaskValidity(finished.points);if(validity.valid)editSelected({points:finished.points});else message=validity.reason+' Previous outline restored.';}
    sync();onRender();return true;
  }
  function keydown(e){
    if(!active||e.target.closest?.('input,select,textarea,button'))return;
    const vertex=e.target.closest?.('[data-mask-vertex]'),edge=e.target.closest?.('[data-mask-edge]');
    if(vertex&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
      e.preventDefault();e.stopPropagation();selectedId=vertex.closest('[data-mask-id]').dataset.maskId;selectedVertex=Number(vertex.dataset.maskVertex);
      const mask=selected(),size=screenSize(),step=e.shiftKey?10:1,points=mask.points.map(p=>({...p})),p=points[selectedVertex];
      p.x=Math.max(0,Math.min(1,p.x+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0)/size.width));p.y=Math.max(0,Math.min(1,p.y+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0)/size.height));
      const validity=foregroundMaskValidity(points);if(validity.valid){message='Point '+(selectedVertex+1)+' adjusted.';editSelected({points});}else{message=validity.reason;sync();}return;
    }
    if(edge&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();selectedId=edge.closest('[data-mask-id]').dataset.maskId;selectedVertex=Number(edge.dataset.maskEdge);panel.querySelector('[data-mask-add-point]').click();svg.querySelector('[data-mask-vertex="'+selectedVertex+'"]')?.focus({preventScroll:true});return;}
    if(e.key==='Escape'){e.preventDefault();cancel();}
    if(e.key==='Enter'&&draft){e.preventDefault();finish();}
    if((e.key==='Backspace'||e.key==='Delete')&&draft){e.preventDefault();draft.pop();sync();onRender();}
  }
  window.addEventListener('keydown',keydown);
  return {render,pointerDown,pointerMove,pointerUp,sync,setActive(next){active=next;panel.hidden=!active;if(active&&value().foregroundMasks.length===0&&draft===null)start();else if(active&&!selectedId)selectedId=value().foregroundMasks[0]?.id||null;if(!active){draft=null;drag=null;}sync();},destroy(){window.removeEventListener('keydown',keydown);drag=draft=null;}};
}
