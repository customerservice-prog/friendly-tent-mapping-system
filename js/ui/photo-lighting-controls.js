import {normalizePhotoComposition,DEFAULT_PHOTO_LIGHTING} from '../core/photo-composition.js';
const controlsByHost=new WeakMap();
const fields=[
  ['azimuthDeg','Light direction',0,360,1,'°'],['elevationDeg','Sun height',10,85,1,'°'],
  ['intensity','Sun brightness',0,6,.1,''],['ambient','Ambient fill',.1,3,.05,''],
  ['shadowSoftness','Shadow softness',0,6,.25,''],['shadowOpacity','Ground shadow',0,.65,.01,'']
];
export function syncLightingControls(host,snapshot,callbacks={}){
  if(!host)return;let entry=controlsByHost.get(host);
  if(!entry){
    const root=document.createElement('details');root.className='photo-lighting-controls';
    root.innerHTML='<summary>Photo lighting</summary><p>Adjust the rentals to suit the photo. Light direction and shadows are manual estimates, not recovered sunlight.</p><div class="photo-lighting-fields">'+fields.map(([key,label,min,max,step])=>'<label>'+label+'<output data-light-output="'+key+'"></output><input aria-label="'+label+'" data-photo-light="'+key+'" type="range" min="'+min+'" max="'+max+'" step="'+step+'"></label>').join('')+'</div><p class="photo-lighting-direction">0° faces the camera; 90° is right; 180° is behind the scene.</p><button type="button" class="btn-chip" data-photo-light-reset>Reset photo lighting</button>';
    host.insertBefore(root,host.querySelector(':scope > strong')?.nextSibling||host.firstChild);entry={root,value:normalizePhotoComposition(),callbacks,editing:false};controlsByHost.set(host,entry);
    function display(){for(const [key,,,,,unit] of fields){const input=root.querySelector('[data-photo-light="'+key+'"]');input.value=entry.value.lighting[key];root.querySelector('[data-light-output="'+key+'"]').textContent=entry.value.lighting[key]+unit;}}
    entry.display=display;
    root.addEventListener('input',e=>{const key=e.target.dataset.photoLight;if(!key)return;entry.editing=true;entry.value=normalizePhotoComposition({...entry.value,lighting:{...entry.value.lighting,[key]:Number(e.target.value)}});display();entry.callbacks.onPreview?.(entry.value);});
    root.addEventListener('change',e=>{if(!e.target.dataset.photoLight)return;entry.editing=false;entry.callbacks.onChange?.(entry.value);});
    root.addEventListener('pointercancel',()=>{entry.editing=false;entry.value=entry.saved;display();entry.callbacks.onPreview?.(entry.value);});
    root.addEventListener('click',e=>{if(!e.target.closest('[data-photo-light-reset]'))return;entry.editing=false;entry.value=normalizePhotoComposition({...entry.value,lighting:DEFAULT_PHOTO_LIGHTING});display();entry.callbacks.onPreview?.(entry.value);entry.callbacks.onChange?.(entry.value);});
  }
  entry.callbacks=callbacks;entry.root.hidden=!snapshot?.backgroundPhoto?.url||!!snapshot.photoLayoutModel;
  entry.saved=normalizePhotoComposition(snapshot?.photoComposition);
  if(!entry.editing){entry.value=entry.saved;entry.display();}
}
