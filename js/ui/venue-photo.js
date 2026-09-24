const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const TARGET_BYTES = 3.4 * 1024 * 1024;

function clamp(n,min,max,fallback){
  n=Number(n);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
}
function esc(value){
  return String(value==null?'':value).replace(/[&<>"']/g,function(ch){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch];});
}
export function normalizeVenuePhoto(value,apiBase){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  let url=typeof value.url==='string'?value.url.trim():'';
  if(!url&&typeof value.path==='string'&&apiBase)url=String(apiBase).replace(/\/$/,'')+value.path;
  if(!/^https?:\/\//i.test(url))return null;
  return {
    id:typeof value.id==='string'?value.id.slice(0,80):null,
    url:url.slice(0,1600),
    name:typeof value.name==='string'?value.name.slice(0,120):'Venue photo',
    focusX:clamp(value.focusX,0,100,50),
    focusY:clamp(value.focusY,0,100,50),
    zoom:clamp(value.zoom,1,1.8,1),
    shade:clamp(value.shade,0,.45,.08),
    widthPx:clamp(value.widthPx,1,10000,null),
    heightPx:clamp(value.heightPx,1,10000,null)
  };
}
export function venuePhotoPanel(photo){
  photo=normalizeVenuePhoto(photo,window.RENTSKETCH_API_URL);
  const input='<input class="venue-photo-input" type="file" accept="image/jpeg,image/png,image/webp" data-role="venue-photo-file">';
  if(!photo){
    return '<section class="venue-photo-card venue-photo-empty">'+
      '<div class="venue-photo-kicker">PHOTO MATCH</div>'+
      '<h4>Use the real backyard or venue</h4>'+
      '<p>Upload a photo and RentSketch will replace the generated house/scenery behind your 3D layout with the real space.</p>'+
      '<label class="venue-photo-drop">'+input+
        '<span class="venue-photo-camera" aria-hidden="true">▣</span>'+
        '<strong>Choose a venue photo</strong>'+
        '<span>JPG, PNG or WebP · phone photos are resized automatically</span>'+
      '</label>'+
      '<p class="venue-photo-privacy">Saved with this design so you can reopen, print or share the same view later.</p>'+
    '</section>';
  }
  const pos=esc(photo.focusX+'% '+photo.focusY+'%');
  const transform='scale('+photo.zoom+')';
  return '<section class="venue-photo-card is-active">'+
    '<div class="venue-photo-kicker">PHOTO MATCH · ACTIVE</div>'+
    '<div class="venue-photo-preview-wrap"><img class="venue-photo-preview" src="'+esc(photo.url)+'" alt="Uploaded venue background" style="object-position:'+pos+';transform:'+transform+'"></div>'+
    '<div class="venue-photo-copy"><h4>Your real venue is the 3D background</h4><p>Fine-tune the crop so the tent sits naturally in the picture.</p></div>'+
    '<div class="venue-photo-actions"><label class="btn-secondary venue-photo-replace">Replace photo'+input+'</label><button type="button" class="btn-secondary" data-role="venue-photo-remove">Remove</button></div>'+
    '<div class="venue-photo-tuning">'+
      '<label><span>Move left / right</span><input type="range" min="0" max="100" step="1" value="'+photo.focusX+'" data-role="venue-photo-focus-x"></label>'+
      '<label><span>Move up / down</span><input type="range" min="0" max="100" step="1" value="'+photo.focusY+'" data-role="venue-photo-focus-y"></label>'+
      '<label><span>Zoom photo</span><input type="range" min="1" max="1.8" step=".02" value="'+photo.zoom+'" data-role="venue-photo-zoom"></label>'+
      '<label><span>Darken behind layout</span><input type="range" min="0" max=".45" step=".01" value="'+photo.shade+'" data-role="venue-photo-shade"></label>'+
    '</div>'+
    '<button type="button" class="venue-photo-reset" data-role="venue-photo-reset">Reset photo framing</button>'+
  '</section>';
}

async function decodePhoto(file){
  if(window.createImageBitmap){
    try{
      const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
      return {width:bitmap.width,height:bitmap.height,draw:function(ctx,w,h){ctx.drawImage(bitmap,0,0,w,h);},close:function(){bitmap.close?.();}};
    }catch(_){}
  }
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();
    img.decoding='async';
    await new Promise(function(resolve,reject){img.onload=resolve;img.onerror=function(){reject(new Error('That photo could not be opened.'));};img.src=url;});
    return {width:img.naturalWidth,height:img.naturalHeight,draw:function(ctx,w,h){ctx.drawImage(img,0,0,w,h);},close:function(){}};
  }finally{
    setTimeout(function(){URL.revokeObjectURL(url);},0);
  }
}
function canvasBlob(canvas,quality){
  return new Promise(function(resolve,reject){
    canvas.toBlob(function(blob){blob?resolve(blob):reject(new Error('That photo could not be prepared.'));},'image/jpeg',quality);
  });
}
export async function prepareVenuePhoto(file){
  if(!file)throw new Error('Choose a photo first.');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPG, PNG or WebP photo.');
  if(file.size>MAX_SOURCE_BYTES)throw new Error('That photo is too large. Choose one under 25 MB.');
  // Most phone/web photos are already small enough for the API. Upload them
  // directly instead of decoding + repainting them through a browser canvas.
  // This avoids browser-specific image decoding/canvas failures and preserves
  // the original JPEG/PNG/WebP bytes.
  if(file.size<=TARGET_BYTES){
    return {blob:file,name:(file.name||'Venue photo').slice(0,120),mimeType:file.type};
  }
  const decoded=await decodePhoto(file);
  try{
    if(!decoded.width||!decoded.height)throw new Error('That photo has invalid dimensions.');
    let longest=Math.max(decoded.width,decoded.height);
    let edge=Math.min(2200,longest),quality=.86,blob=null,canvas=null,width=0,height=0;
    for(let attempt=0;attempt<4;attempt++){
      const scale=Math.min(1,edge/longest);
      width=Math.max(1,Math.round(decoded.width*scale));height=Math.max(1,Math.round(decoded.height*scale));
      canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d',{alpha:false});
      ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);decoded.draw(ctx,width,height);
      blob=await canvasBlob(canvas,quality);
      if(blob.size<=TARGET_BYTES)break;
      edge=Math.max(1200,Math.round(edge*.82));quality=Math.max(.68,quality-.07);
    }
    if(!blob||blob.size>4*1024*1024)throw new Error('That photo is still too large after resizing. Try a smaller image.');
    return {blob,width,height,name:(file.name||'Venue photo').slice(0,120),mimeType:'image/jpeg'};
  }finally{decoded.close?.();}
}
function adminToken(){
  try{return localStorage.getItem('rentsketch_dashboard_token')||'';}catch(_){return '';}
}
export function venuePhotoRoutes(context){
  const api=String(context?.api||'').replace(/\/$/,'');
  const slug=String(context?.slug||'generic');
  const designId=encodeURIComponent(String(context?.designId||''));
  if(!api||!designId)return null;
  if(slug==='generic'){
    return {
      upload:api+'/api/consumer/designs/'+designId+'/background-photo',
      remove:function(photoId){return api+'/api/consumer/designs/'+designId+'/background-photo/'+encodeURIComponent(String(photoId||''));}
    };
  }
  const tenantBase=api+'/api/tenants/'+encodeURIComponent(slug)+'/designs/'+designId+'/background-photo';
  return {upload:tenantBase,remove:function(photoId){return tenantBase+'/'+encodeURIComponent(String(photoId||''));}};
}
export async function uploadVenuePhoto(file,context){
  const prepared=await prepareVenuePhoto(file);
  const api=String(context.api||'').replace(/\/$/,'');
  if(!api||!context.slug||!context.designId)throw new Error('Save the layout before adding a venue photo.');
  const routes=venuePhotoRoutes(context);if(!routes)throw new Error('Photo upload route is unavailable.');
  const headers={'Content-Type':prepared.mimeType||'image/jpeg'};
  if(context.sessionId)headers['X-RentSketch-Session']=context.sessionId;
  const token=adminToken();if(token)headers.Authorization='Bearer '+token;
  const controller=new AbortController(),timer=setTimeout(function(){controller.abort();},30000);
  try{
    const r=await fetch(routes.upload,{method:'POST',headers,body:prepared.blob,signal:controller.signal});
    let data={};try{data=await r.json();}catch(_){}
    if(!r.ok)throw new Error(data.error||('Venue photo upload failed ('+r.status+')'));
    return normalizeVenuePhoto({
      id:data.id,url:api+data.path,name:prepared.name,widthPx:prepared.width,heightPx:prepared.height,
      focusX:50,focusY:50,zoom:1,shade:.08
    },api);
  }catch(err){
    if(err?.name==='AbortError')throw new Error('The photo upload timed out. Try again.');
    throw err;
  }finally{clearTimeout(timer);}
}
export async function deleteVenuePhoto(photo,context){
  photo=normalizeVenuePhoto(photo,context.api);if(!photo?.id||!context.designId)return;
  const headers={};if(context.sessionId)headers['X-RentSketch-Session']=context.sessionId;
  const token=adminToken();if(token)headers.Authorization='Bearer '+token;
  const routes=venuePhotoRoutes(context);if(!routes)return;
  try{await fetch(routes.remove(photo.id),{method:'DELETE',headers});}catch(_){}
}
