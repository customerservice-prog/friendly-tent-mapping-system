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
    '<div class="photo-mask-select-field"><label>Foreground outline<select data-mask-select aria-label="Foreground outline"></select></label></div><details class="photo-mask-properties"><summary>Outline options</summary><div class="photo-mask-fields"><label>Name<input data-mask-label maxlength="80" placeholder="Tree, bush, fence…"></label>'+
    '<label class="photo-mask-feather">Soft edge <output data-mask-feather-value></output><input data-mask-feather type="range" min="0" max="12" step="0.5"></label><label class="photo-mask-visible"><input data-mask-enabled type="checkbox"> Show in Photo View</label></div>'+
    '<div class="photo-mask-actions"><button type="button" class="btn-chip" data-mask-remove>Remove outline</button><button type="button" class="btn-chip" data-mask-remove-point>Remove point</button></div></details><p class="photo-mask-status" data-mask-status role="status" aria-live="polite"></p>';
  function commit(next){onChange(normalizePhotoComposition(next));sync();onRender();}
  function editSelected(patch){const next=value();next.foregroundMasks=next.foregroundMasks.map(mask=>mask.id===selectedId?{...mask,...patch}:mask);commit(next);}
  function start(){if(value().foregroundMasks.length>=24){message='This photo can hold up to 24 foreground outlines.';sync();return;}draft=[];selectedId=null;selectedVertex=-1;message='Tap around the foreground edge, then Finish outline. Use more points around curved edges.';sync();onRender();}
  function finish(){
    const validity=foregroundMaskValidity(draft);if(!validity.valid){message=validity.reason;sync();return;}
    const next=value();selectedId='foreground-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36));
    next.foregroundMasks.push({id:selectedId,label:'Foreground '+(next.foregroundMasks.length+1),points:draft.map(p=>({...p})),featherPx:1.5,enabled:true});draft=null;message='Drag outline points to refine the edge. Small edge handles add points.';commit(next);
  }
  function cancel(){draft=null;drag=null;message='Outline canceled.';sync();onRender();}
  function removePoint(){const mask=selected();if(!mask||selectedVertex<0||mask.points.length<=3)return;const points=mask.points.filter((_,i)=>i!==selectedVertex),validity=foregroundMaskValidity(points);if(!validity.valid){message=validity.reason;sync();return;}selectedVertex=-1;editSelected({points});}
  panel.addEventListener('click',e=>{
    if(e.target.closest('[data-mask-new]'))start();
    else if(e.target.closest('[data-mask-finish]'))finish();
    else if(e.target.closest('[data-mask-cancel]'))cancel();
    else if(e.target.closest('[data-mask-remove]')){const next=value();next.foregroundMasks=next.foregroundMasks.filter(mask=>mask.id!==selectedId);selectedId=null;selectedVertex=-1;message='Foreground outline removed.';commit(next);}
    else if(e.target.closest('[data-mask-remove-point]'))removePoint();
  });
  panel.addEventListener('change',e=>{
    if(e.target.matches('[data-mask-select]')){selectedId=e.target.value||null;selectedVertex=-1;draft=null;message='Drag outline points to refine the edge. Small edge handles add points.';sync();onRender();}
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
    panel.querySelector('[data-mask-remove-point]').disabled=!mask||selectedVertex<0||mask.points.length<=3;
    panel.querySelector('[data-mask-status]').textContent=message||(draft?'Tap to add outline points, then Finish outline.':'Choose New outline to trace foreground photo details.');
  }
  function render(){
    if(!active)return;
    for(const original of value().foregroundMasks){
      const mask=drag?.id===original.id?{...original,points:drag.points}:original;
      const group=node('g',{'class':'photo-mask-outline'+(selectedId===mask.id?' selected':'')+(mask.enabled?'':' disabled'),'data-mask-id':mask.id});
      group.append(node('polygon',{points:pointsAttr(mask.points),'class':'photo-mask-shape'}));
      if(selectedId===mask.id)mask.points.forEach((p,index)=>{
        const q=mask.points[(index+1)%mask.points.length];
        if(mask.points.length<128){const midpoint=node('circle',{cx:(p.x+q.x)*500,cy:(p.y+q.y)*500,r:7,'class':'photo-mask-midpoint','data-mask-edge':index});group.append(midpoint);}
        group.append(node('circle',{cx:p.x*1000,cy:p.y*1000,r:11,'class':'photo-mask-handle'+(selectedVertex===index?' selected':''),'data-mask-vertex':index}));
      });
      svg.append(group);
    }
    if(draft){
      const group=node('g',{'class':'photo-mask-draft'});group.append(node(draft.length>2?'polygon':'polyline',{points:pointsAttr(draft)}));
      draft.forEach((p,index)=>group.append(node('circle',{cx:p.x*1000,cy:p.y*1000,r:index===0?12:7,'data-mask-draft-point':index})));svg.append(group);
    }
  }
  function pointerDown(e,p){
    if(!active||!p)return false;e.preventDefault();e.stopPropagation();
    if(draft){
      if(e.target.closest?.('[data-mask-draft-point="0"]')&&draft.length>=3){finish();return true;}
      if(draft.length>=128){message='Finish this outline, or undo its last point with Backspace.';sync();return true;}
      draft.push(p);message=draft.length+' points · Finish outline when the edge is complete.';sync();onRender();return true;
    }
    const group=e.target.closest?.('[data-mask-id]');if(!group){selectedId=null;selectedVertex=-1;sync();onRender();return true;}
    selectedId=group.dataset.maskId;const mask=selected();
    const vertex=e.target.closest?.('[data-mask-vertex]'),edge=e.target.closest?.('[data-mask-edge]');
    if(vertex||edge){
      const points=mask.points.map(point=>({...point}));selectedVertex=vertex?Number(vertex.dataset.maskVertex):Number(edge.dataset.maskEdge)+1;
      if(edge)points.splice(selectedVertex,0,p);
      drag={id:selectedId,index:selectedVertex,points,pointerId:e.pointerId};
      try{e.currentTarget.setPointerCapture(e.pointerId);}catch(_){}
    }else selectedVertex=-1;
    message='Drag outline points to refine the edge. Small handles add points.';sync();onRender();return true;
  }
  function pointerMove(e,p){if(!drag||drag.pointerId!==e.pointerId||!p)return false;drag.points[drag.index]=p;onRender();return true;}
  function pointerUp(e){
    if(!drag||drag.pointerId!==e.pointerId)return false;const finished=drag;drag=null;
    if(e.type!=='pointercancel'){const validity=foregroundMaskValidity(finished.points);if(validity.valid)editSelected({points:finished.points});else message=validity.reason+' Previous outline restored.';}
    sync();onRender();return true;
  }
  function keydown(e){
    if(!active||e.target.closest?.('input,select,textarea,button'))return;
    if(e.key==='Escape'){e.preventDefault();cancel();}
    if(e.key==='Enter'&&draft){e.preventDefault();finish();}
    if((e.key==='Backspace'||e.key==='Delete')&&draft){e.preventDefault();draft.pop();sync();onRender();}
  }
  window.addEventListener('keydown',keydown);
  return {render,pointerDown,pointerMove,pointerUp,sync,setActive(next){active=next;panel.hidden=!active;if(active&&value().foregroundMasks.length===0&&draft===null)start();else if(active&&!selectedId)selectedId=value().foregroundMasks[0]?.id||null;if(!active){draft=null;drag=null;}sync();},destroy(){window.removeEventListener('keydown',keydown);drag=draft=null;}};
}
