const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const TARGET_BYTES = 3.4 * 1024 * 1024;
const MAX_SCAN_VIDEO_BYTES = 250 * 1024 * 1024;

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
export function normalizeVenueScan(value,apiBase){
  value=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const frames=(Array.isArray(value.frames)?value.frames:[]).map(frame=>{
    if(!frame||typeof frame!=='object'||!['left','center','right'].includes(frame.role))return null;
    const photo=normalizeVenuePhoto(frame,apiBase);if(!photo)return null;
    return {...photo,role:frame.role};
  }).filter(Boolean);
  const samples=(Array.isArray(value.samples)?value.samples:[]).map((sample,index)=>{
    if(!sample||typeof sample!=='object')return null;
    const photo=normalizeVenuePhoto(sample,apiBase);if(!photo)return null;
    return {...photo,sampleIndex:Number.isFinite(Number(sample.sampleIndex))?Number(sample.sampleIndex):index,offsetFactor:clamp(sample.offsetFactor,-.55,.55,0)};
  }).filter(Boolean).sort((a,b)=>a.offsetFactor-b.offsetFactor);
  const roles=new Set(frames.map(f=>f.role));
  return {
    version:samples.length>=5?2:1,
    accuracy:'unverified',
    status:roles.size===3&&new Set(frames.map(f=>f.url)).size===3?'ready':frames.length?'capturing':'empty',
    baselineFt:clamp(value.baselineFt,2,20,6),
    eyeHeightFt:clamp(value.eyeHeightFt,4,7,5.6),
    fovDeg:clamp(value.fovDeg,40,90,62),
    captureMethod:value.captureMethod==='video'?'video':'manual',
    baselineFactor:clamp(value.baselineFactor,.4,1.05,1),
    frames,
    samples
  };
}
function scanFrame(scan,role){return (scan.frames||[]).find(f=>f.role===role)||null;}
export function venueScanPanel(value){
  const scan=normalizeVenueScan(value,window.RENTSKETCH_API_URL),ready=scan.status==='ready';
  const roles=[['left','1','Left position'],['center','2','Center position'],['right','3','Right position']];
  return '<section class="venue-scan-card'+(ready?' is-ready':'')+'">'+
    '<div class="venue-photo-kicker">SPACE SCAN'+(ready?' · READY':'')+'</div>'+
    '<h4>Preview depth from several viewpoints</h4>'+
    '<p>Move sideways across the setup area while keeping the same yard features centered. RentSketch uses the parallax between viewpoints to estimate depth instead of treating one photo like a wall.</p>'+
    '<label class="venue-scan-video-btn"><input class="venue-photo-input" type="file" accept="video/*" capture="environment" data-role="venue-scan-video"><strong>Record / choose a Space Scan video</strong><span>Best: 6–12 seconds · walk sideways about '+scan.baselineFt+' ft · do not pan in place</span></label>'+
    '<div class="venue-scan-or">or capture three photos manually</div>'+
    '<div class="venue-scan-guide"><span>LEFT</span><span>MOVE SIDEWAYS</span><span>RIGHT</span></div>'+
    '<div class="venue-scan-frame-grid">'+roles.map(([role,num,label])=>{const frame=scanFrame(scan,role);return '<label class="venue-scan-frame'+(frame?' has-photo':'')+'">'+
      (frame?'<img src="'+esc(frame.url)+'" alt="'+esc(label)+' scan frame">':'<span class="venue-scan-step">'+num+'</span>')+
      '<strong>'+label+'</strong><span>'+(frame?'Captured':'Choose photo')+'</span>'+
      '<input class="venue-photo-input" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" capture="environment" data-role="venue-scan-file" data-scan-role="'+role+'">'+
    '</label>';}).join('')+'</div>'+
    '<label class="venue-scan-baseline"><span>Distance from left photo to right photo</span><div><input type="number" min="2" max="20" step=".5" value="'+scan.baselineFt+'" data-role="venue-scan-baseline"><strong>ft</strong></div><small>For best results, move about 6 ft total. Enter a measured distance. Camera settings and movement are still estimated; this does not certify scale or fit.</small></label>'+
    (ready?'<div class="venue-scan-ready"><strong>'+((scan.samples?.length||0)>=5?(scan.samples.length+'-view'):'3-view')+' views captured</strong><span>Open 3D View to check an estimated depth preview. Missing surfaces stay unknown; verify dimensions on site.</span></div>':'<p class="equipment-note">Capture three distinct positions for a depth preview. One photo supports camera matching, not a measured 360° property.</p>')+
    (scan.frames.length?'<button type="button" class="btn-tertiary venue-scan-clear" data-role="venue-scan-clear">Clear Space Scan</button>':'')+
  '</section>';
}

export function venuePhotoPanel(photo,status){
  photo=normalizeVenuePhoto(photo,window.RENTSKETCH_API_URL);
  const input='<input class="venue-photo-input" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" data-role="venue-photo-file">';
  if(!photo){
    return '<section class="venue-photo-card venue-photo-empty">'+
      '<div class="venue-photo-kicker">QUICK PHOTO MATCH</div>'+
      '<h4>Use the real backyard or venue</h4>'+
      '<p>Use one real photo for a camera-matched placement preview. One photo stays in its known viewpoint; use Space Scan below when you want navigable 3D depth.</p>'+
      '<label class="venue-photo-drop">'+input+
        '<span class="venue-photo-camera" aria-hidden="true">▣</span>'+
        '<strong>Choose a venue photo</strong>'+
        '<span>JPG, PNG or WebP · phone photos are resized automatically</span>'+
      '</label>'+
      '<p class="venue-photo-privacy">Saved with this design so you can reopen, print or share the same view later.</p>'+
      '<p class="venue-photo-status" data-role="venue-photo-status" data-kind="'+esc(status?.kind||'')+'" aria-live="polite">'+esc(status?.text||'')+'</p>'+
    '</section>';
  }
  const pos=esc(photo.focusX+'% '+photo.focusY+'%');
  const transform='scale('+photo.zoom+')';
  return '<section class="venue-photo-card is-active">'+
    '<div class="venue-photo-kicker">PHOTO MATCH · ACTIVE</div>'+
    '<div class="venue-photo-preview-wrap"><img class="venue-photo-preview" src="'+esc(photo.url)+'" alt="Uploaded venue background" style="object-position:'+pos+';transform:'+transform+'"></div>'+
    '<div class="venue-photo-copy"><h4>Your real venue is matched to this camera view</h4><p>Fine-tune the crop for Photo Match, or capture Left + Center + Right below to estimate depth from overlapping views.</p></div>'+
    '<div class="venue-photo-actions"><label class="btn-secondary venue-photo-replace">Replace photo'+input+'</label><button type="button" class="btn-secondary" data-role="venue-photo-remove">Remove</button></div>'+
    '<div class="venue-photo-tuning">'+
      '<label><span>Move left / right</span><input type="range" min="0" max="100" step="1" value="'+photo.focusX+'" data-role="venue-photo-focus-x"></label>'+
      '<label><span>Move up / down</span><input type="range" min="0" max="100" step="1" value="'+photo.focusY+'" data-role="venue-photo-focus-y"></label>'+
      '<label><span>Zoom photo</span><input type="range" min="1" max="1.8" step=".02" value="'+photo.zoom+'" data-role="venue-photo-zoom"></label>'+
      '<label><span>Darken behind layout</span><input type="range" min="0" max=".45" step=".01" value="'+photo.shade+'" data-role="venue-photo-shade"></label>'+
    '</div>'+
    '<button type="button" class="venue-photo-reset" data-role="venue-photo-reset">Reset photo framing</button>'+
    '<p class="venue-photo-status" data-role="venue-photo-status" data-kind="'+esc(status?.kind||'')+'" aria-live="polite">'+esc(status?.text||'')+'</p>'+
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
export function venueScanFrameTimes(duration){
  duration=Number(duration);
  if(!Number.isFinite(duration)||duration<=0)return [];
  const pad=Math.min(.35,Math.max(.06,duration*.04));
  const start=pad,end=Math.max(start,duration-pad),span=Math.max(.001,end-start);
  return [start+span*.12,start+span*.50,start+span*.88];
}
export function venueScanBurstTimes(duration,count=7){
  duration=Number(duration);count=Math.max(5,Math.min(9,Math.round(Number(count)||7)));
  if(!Number.isFinite(duration)||duration<=0)return [];
  const pad=Math.min(.35,Math.max(.06,duration*.04)),start=pad,end=Math.max(start,duration-pad),span=Math.max(.001,end-start);
  const left=start+span*.08,right=start+span*.92;
  return Array.from({length:count},(_,i)=>left+(right-left)*(i/(count-1)));
}
function waitForVideoEvent(video,event,timeoutMs=12000){
  return new Promise(function(resolve,reject){
    let timer;
    const done=function(fn,arg){clearTimeout(timer);video.removeEventListener(event,onEvent);video.removeEventListener('error',onError);fn(arg);};
    const onEvent=function(){done(resolve);};
    const onError=function(){done(reject,new Error('That scan video could not be opened.'));};
    video.addEventListener(event,onEvent,{once:true});video.addEventListener('error',onError,{once:true});
    timer=setTimeout(function(){done(reject,new Error('The scan video took too long to load.'));},timeoutMs);
  });
}
async function seekVideoFrame(video,time){
  if(Math.abs((Number(video.currentTime)||0)-time)<.015&&video.readyState>=2)return;
  const waiting=waitForVideoEvent(video,'seeked',12000);
  video.currentTime=time;
  await waiting;
  if(typeof video.requestVideoFrameCallback==='function'){
    await Promise.race([
      new Promise(function(resolve){video.requestVideoFrameCallback(function(){resolve();});}),
      new Promise(function(resolve){setTimeout(resolve,500);})
    ]);
  }else{
    await new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve);});});
  }
}
export async function extractVenueScanVideo(file,{maxEdge=1600,quality=.86}={}){
  if(!file)throw new Error('Choose a scan video first.');
  const type=String(file.type||'').toLowerCase(),name=String(file.name||'').toLowerCase();
  if(!(type.startsWith('video/')||/\.(mp4|mov|m4v|webm|avi)$/i.test(name)))throw new Error('Choose a phone video for Space Scan.');
  if(file.size>MAX_SCAN_VIDEO_BYTES)throw new Error('That scan video is too large. Keep the scan under about 20 seconds and try again.');
  const url=URL.createObjectURL(file),video=document.createElement('video');
  video.preload='auto';video.muted=true;video.playsInline=true;video.src=url;
  try{
    if(video.readyState<1)await waitForVideoEvent(video,'loadedmetadata',15000);
    const duration=Number(video.duration);
    if(!Number.isFinite(duration)||duration<2)throw new Error('Record at least 2 seconds while moving sideways.');
    if(duration>45)throw new Error('Keep Space Scan video under 45 seconds.');
    if(video.readyState<2){try{await waitForVideoEvent(video,'loadeddata',15000);}catch(_){}}
    const vw=video.videoWidth||0,vh=video.videoHeight||0;
    if(!vw||!vh)throw new Error('The scan video has no readable video frames.');
    const scale=Math.min(1,maxEdge/Math.max(vw,vh)),width=Math.max(1,Math.round(vw*scale)),height=Math.max(1,Math.round(vh*scale));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';
    const times=venueScanBurstTimes(duration,7),samples=[],mid=Math.floor(times.length/2);
    for(let i=0;i<times.length;i++){
      await seekVideoFrame(video,times[i]);
      ctx.fillRect(0,0,width,height);ctx.drawImage(video,0,0,width,height);
      const blob=await canvasBlob(canvas,i===mid?quality:Math.max(.74,quality-.07));
      const role=i===0?'left':i===mid?'center':i===times.length-1?'right':null;
      const frameName='space-scan-'+(role||('sample-'+i))+'.jpg';
      const frame=typeof File==='function'?new File([blob],frameName,{type:'image/jpeg',lastModified:Date.now()+i}):blob;
      if(!('name' in frame))Object.defineProperty(frame,'name',{value:frameName});
      const offsetFactor=(i-mid)/(times.length-1);
      samples.push({role,file:frame,time:times[i],width,height,sampleIndex:i,offsetFactor});
    }
    const frames=samples.filter(s=>s.role);
    return {duration,width,height,frames,samples,baselineFactor:clamp((times.at(-1)-times[0])/duration,.4,1.05)};
  }finally{
    try{video.pause();video.removeAttribute('src');video.load();}catch(_){}
    URL.revokeObjectURL(url);
  }
}
function supportedMime(file){
  const raw=String(file?.type||'').trim().toLowerCase();
  if(['image/jpeg','image/jpg','image/pjpeg'].includes(raw))return 'image/jpeg';
  if(['image/png','image/x-png'].includes(raw))return 'image/png';
  if(raw==='image/webp')return 'image/webp';
  const name=String(file?.name||'').trim().toLowerCase();
  if(/\.(jpe?g|jfif)$/.test(name))return 'image/jpeg';
  if(/\.png$/.test(name))return 'image/png';
  if(/\.webp$/.test(name))return 'image/webp';
  return null;
}
export async function prepareVenuePhoto(file){
  if(!file)throw new Error('Choose a photo first.');
  const mimeType=supportedMime(file);
  if(!mimeType)throw new Error('That file is not a supported photo. Choose a JPG, PNG or WebP image.');
  if(file.size>MAX_SOURCE_BYTES)throw new Error('That photo is too large. Choose one under 25 MB.');
  // Most phone/web photos are already small enough for the API. Upload them
  // directly instead of decoding + repainting them through a browser canvas.
  // Some Windows/Edge file pickers report JPG MIME as blank or image/jpg, so
  // normalize by MIME + filename rather than rejecting before upload.
  if(file.size<=TARGET_BYTES){
    return {blob:file,name:(file.name||'Venue photo').slice(0,120),mimeType};
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
