import * as THREE from 'three';

/*
 * Browser-local photo world reconstruction.
 *
 * This module deliberately does not call an AI service or any external image API.
 * It turns the one uploaded venue photo into a stable, deterministic 3D surround:
 *   - a photo-derived ground material that can receive shadows,
 *   - a cylindrical horizon/sky continuation,
 *   - multiple cutout image layers at different radii for real parallax,
 *   - preserved world coordinates so the rental geometry never changes shape.
 *
 * A single photo cannot reveal the real unseen side/rear of a property. The goal here
 * is therefore spatially-consistent continuation, not a claim that unseen geometry is
 * factual. The visible/front sector remains the calibrated original photo stage.
 */

function clamp(value,min,max,fallback=min){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
}
function mix(a,b,t){return a+(b-a)*t;}
function mix3(a,b,t){return [mix(a[0],b[0],t),mix(a[1],b[1],t),mix(a[2],b[2],t)];}
function css(rgb,a=1){return 'rgba('+Math.round(rgb[0])+','+Math.round(rgb[1])+','+Math.round(rgb[2])+','+a+')';}
function luminance(rgb){return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function colorDistance(a,b){const dr=a[0]-b[0],dg=a[1]-b[1],db=a[2]-b[2];return Math.sqrt(dr*dr+dg*dg+db*db);}
function stableSeed(style){
  return Math.max(1,Math.floor(style.sky[0]*3+style.sky[1]*5+style.ground[1]*7+style.structure[2]*11))>>>0;
}
function rng(seed){
  return ()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;
}
function photoCanvas(image,w=160,h=120){
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const x=c.getContext('2d',{willReadFrequently:true});
  x.drawImage(image,0,0,w,h);
  let data=null;
  try{data=x.getImageData?.(0,0,w,h)?.data||null;}catch(_){data=null;}
  return {canvas:c,ctx:x,data,w,h};
}
function averageRegion(sample,x0,y0,x1,y1){
  const {data,w,h}=sample;
  if(!data||!data.length)return [128,128,128];
  const ax=Math.max(0,Math.floor(x0*w)),bx=Math.min(w,Math.ceil(x1*w));
  const ay=Math.max(0,Math.floor(y0*h)),by=Math.min(h,Math.ceil(y1*h));
  let r=0,g=0,b=0,n=0;
  for(let y=ay;y<by;y+=2)for(let x=ax;x<bx;x+=2){
    const i=(y*w+x)*4,a=data[i+3]/255;if(a<.1)continue;
    r+=data[i]*a;g+=data[i+1]*a;b+=data[i+2]*a;n+=a;
  }
  return n?[r/n,g/n,b/n]:[128,128,128];
}
export function analyzePhotoWorld(image,calibration){
  const fallback={
    sky:[143,190,219],skyNear:[202,221,231],ground:[77,105,61],groundNear:[104,126,83],
    structure:[113,116,111],left:[83,95,77],right:[83,95,77],green:true,horizon:.34,seed:417
  };
  if(!image)return fallback;
  try{
    const s=photoCanvas(image);
    const horizon=clamp(calibration?.horizonY,.12,.72,.34);
    const sky=averageRegion(s,.08,.01,.92,Math.max(.10,horizon*.48));
    const skyNear=averageRegion(s,.05,Math.max(.06,horizon*.42),.95,Math.max(.16,horizon*.96));
    const groundNear=averageRegion(s,.08,Math.min(.62,horizon+.12),.92,.78);
    const ground=averageRegion(s,.08,.76,.92,.99);
    const structure=averageRegion(s,.16,Math.max(.18,horizon*.78),.84,Math.min(.72,horizon+.34));
    const left=averageRegion(s,0,.18,.18,.82),right=averageRegion(s,.82,.18,1,.82);
    const green=ground[1]>ground[0]*1.035&&ground[1]>ground[2]*1.06;
    const out={sky,skyNear,ground,groundNear,structure,left,right,green,horizon};
    out.seed=stableSeed(out);return out;
  }catch(_){return fallback;}
}

function canvasTexture(canvas,{repeat=false}={}){
  const tex=new THREE.CanvasTexture(canvas);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.minFilter=THREE.LinearMipmapLinearFilter;
  tex.magFilter=THREE.LinearFilter;
  tex.anisotropy=4;
  if(repeat){tex.wrapS=tex.wrapT=THREE.RepeatWrapping;}
  tex.needsUpdate=true;
  return tex;
}

function mirroredGroundCanvas(image,style,size=512){
  const c=document.createElement('canvas');c.width=c.height=size;
  const x=c.getContext('2d'),iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;
  const cropH=Math.max(8,Math.round(ih*.26)),sy=Math.max(0,ih-cropH);
  const half=size/2;
  x.fillStyle=css(style.ground);x.fillRect(0,0,size,size);
  const draw=(dx,dy,flipX,flipY)=>{
    x.save();x.translate(dx+(flipX?half:0),dy+(flipY?half:0));x.scale(flipX?-1:1,flipY?-1:1);
    x.filter='saturate(.9) contrast(.94) blur(.35px)';
    x.drawImage(image,0,sy,iw,cropH,0,0,half,half);x.restore();
  };
  draw(0,0,false,false);draw(half,0,true,false);draw(0,half,false,true);draw(half,half,true,true);
  // Break obvious photographic tiling while retaining the customer's color/texture.
  const rand=rng(style.seed);
  x.globalCompositeOperation='soft-light';
  for(let i=0;i<900;i++){
    const a=.015+rand()*.025,g=rand()>.5?style.ground:style.groundNear;
    x.fillStyle=css(g,a);const r=1+rand()*5;x.fillRect(rand()*size,rand()*size,r,r);
  }
  x.globalCompositeOperation='source-over';
  return c;
}

function panoramaCanvas(image,style,{mobile=false}={}){
  const w=mobile?1024:2048,h=mobile?512:768,c=document.createElement('canvas');c.width=w;c.height=h;
  const x=c.getContext('2d'),horizon=Math.round(h*.48);
  const sky=x.createLinearGradient(0,0,0,horizon+1);
  sky.addColorStop(0,css(mix3(style.sky,[255,255,255],.08)));sky.addColorStop(1,css(style.skyNear));
  x.fillStyle=sky;x.fillRect(0,0,w,horizon+2);
  const ground=x.createLinearGradient(0,horizon,0,h);
  ground.addColorStop(0,css(style.groundNear));ground.addColorStop(1,css(mix3(style.ground,[20,24,18],.12)));
  x.fillStyle=ground;x.fillRect(0,horizon,w,h-horizon);

  const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;
  // Reserve the middle ~34% for the known front direction. The actual calibrated
  // photo stage is drawn in world space in front of this shell; this copy merely
  // makes the seam disappear while the camera crosses from known to inferred view.
  const frontW=Math.round(w*.34),frontX=Math.round((w-frontW)/2);
  x.save();x.globalAlpha=.94;x.filter='saturate(.96) contrast(.97)';
  x.drawImage(image,0,0,iw,ih,frontX,0,frontW,h);x.restore();

  // Continue left/right by repeatedly reflecting real edge context. Reflection,
  // overlap and a horizontal blur keep the continuation deterministic and avoid a
  // hard wallpaper seam. It is intentionally approximate outside the photographed FOV.
  const strip=Math.max(12,Math.round(iw*.17)),segments=7,segW=Math.ceil((w-frontW)/2/segments)+2;
  function fillSide(side){
    for(let i=0;i<segments;i++){
      const sx=side==='left'?0:Math.max(0,iw-strip);
      const dx=side==='left'?frontX-(i+1)*segW:frontX+frontW+i*segW;
      x.save();x.globalAlpha=Math.max(.18,.68-i*.067);
      x.translate(dx+(i%2?segW:0),0);x.scale(i%2?-1:1,1);
      x.filter='blur('+(1.2+i*.28)+'px) saturate(.82) contrast(.93)';
      x.drawImage(image,sx,0,strip,ih,0,0,segW,h);x.restore();
    }
  }
  fillSide('left');fillSide('right');

  // Rear half uses a blended, mirrored horizon band rather than inventing specific
  // doors/windows/structures that are not knowable from one image.
  const rearW=Math.round(w*.26),rearX=Math.round((w-rearW)/2+w*.5);
  x.save();x.globalAlpha=.24;x.filter='blur(7px) saturate(.7)';
  x.translate(rearX+rearW,0);x.scale(-1,1);
  x.drawImage(image,0,0,iw,ih,0,0,rearW,h);x.restore();

  // Soft global veil integrates the known photo and inferred continuation.
  const veil=x.createLinearGradient(0,0,w,0);
  veil.addColorStop(0,css(style.left,.08));veil.addColorStop(.5,'rgba(255,255,255,0)');veil.addColorStop(1,css(style.right,.08));
  x.fillStyle=veil;x.fillRect(0,0,w,h);
  return c;
}

function cutoutCanvas(image,style,side,index,{mobile=false}={}){
  const w=mobile?160:224,h=mobile?256:336,c=document.createElement('canvas');c.width=w;c.height=h;
  const x=c.getContext('2d',{willReadFrequently:true});
  const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;
  const cropW=Math.max(10,Math.round(iw*(.18+(index%3)*.035)));
  let sx=side==='left'?0:side==='right'?Math.max(0,iw-cropW):Math.max(0,Math.round(iw*.5-cropW/2));
  if(index%2){sx=Math.max(0,Math.min(iw-cropW,sx+(side==='left'?1:-1)*Math.round(iw*.035)));}
  const sy=Math.max(0,Math.round(ih*Math.max(.08,style.horizon*.42))),cropH=Math.max(8,ih-sy);
  x.save();if(index%2){x.translate(w,0);x.scale(-1,1);}x.filter='saturate(.9) contrast(.97)';
  x.drawImage(image,sx,sy,cropW,cropH,0,0,w,h);x.restore();
  let img=null;
  try{img=x.getImageData?.(0,0,w,h)||null;}catch(_){img=null;}
  if(!img?.data)return c;
  const d=img.data,sky=style.skyNear;
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
    const i=(yy*w+xx)*4,rgb=[d[i],d[i+1],d[i+2]],dist=colorDistance(rgb,sky);
    const yn=yy/(h-1),edge=Math.min(1,Math.min(xx,w-1-xx)/(w*.13));
    let a=1;
    // Remove most sky so these cards behave like separate mid-ground objects.
    if(yn<.58)a=clamp((dist-18)/58,0,1,0);
    // Ground belongs to the floor mesh; fade it from the parallax cards.
    if(yn>.78)a*=clamp((1-yn)/.22,0,1,0);
    a*=Math.pow(edge,.7);
    d[i+3]=Math.round(d[i+3]*a);
  }
  x.putImageData(img,0,0);
  return c;
}

function addPanorama(group,image,style,radius,height,mobile,materials){
  const canvas=panoramaCanvas(image,style,{mobile}),map=canvasTexture(canvas);
  const geo=new THREE.CylinderGeometry(radius,radius,height,64,1,true);
  const mat=new THREE.MeshBasicMaterial({map,side:THREE.BackSide,depthWrite:false,toneMapped:true});
  const shell=new THREE.Mesh(geo,mat);shell.name='Photo world panoramic shell';shell.position.y=height/2-1;
  // Three's cylinder UV seam is at +X; rotate so the photographed front is centered
  // opposite the starting camera, matching the calibrated stage orientation.
  shell.rotation.y=Math.PI/2;
  shell.renderOrder=-20;group.add(shell);materials.push({material:mat,base:1,night:.56});
  return shell;
}

function addGround(group,image,style,size,materials){
  const map=canvasTexture(mirroredGroundCanvas(image,style),{repeat:true});
  map.repeat.set(Math.max(3,size/28),Math.max(3,size/28));
  const mat=new THREE.MeshStandardMaterial({map,roughness:.96,metalness:0,color:0xffffff});
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(size,size,1,1),mat);
  ground.name='Photo world derived ground';ground.rotation.x=-Math.PI/2;ground.position.y=-.105;
  ground.receiveShadow=true;ground.castShadow=false;ground.renderOrder=-10;group.add(ground);
  materials.push({material:mat,base:1,night:.48});
  return ground;
}

function addParallaxCards(group,image,style,radius,height,mobile,materials){
  const rand=rng(style.seed),cards=[];
  // No cards in the known front +/- 62 degrees. The calibrated front photo owns it.
  const angles=[-150,-128,-106,-84,-72,72,86,104,124,146,168,192,214,236];
  angles.forEach((deg,index)=>{
    const side=deg<0?'left':deg>150?'rear':'right';
    const a=THREE.MathUtils.degToRad(deg),ring=radius*(.48+rand()*.30);
    const canvas=cutoutCanvas(image,style,side,index,{mobile}),map=canvasTexture(canvas);
    const mat=new THREE.MeshBasicMaterial({map,transparent:true,alphaTest:.035,depthWrite:true,side:THREE.DoubleSide});
    const cardH=Math.max(12,height*(.36+rand()*.22)),cardW=cardH*(.58+rand()*.30);
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(cardW,cardH),mat);
    mesh.name='Photo world parallax layer';
    mesh.position.set(Math.sin(a)*ring,cardH*.43-1,Math.cos(a)*ring);
    mesh.lookAt(0,cardH*.40,0);
    mesh.renderOrder=-5+index*.001;
    group.add(mesh);cards.push(mesh);materials.push({material:mat,base:1,night:.52});
  });
  return cards;
}

function addDepthMarkers(group,photoGeometry,site,style,materials){
  const w=Math.max(1,Number(site?.widthFt)||50),l=Math.max(1,Number(site?.lengthFt)||60);
  for(const g of Array.isArray(photoGeometry)?photoGeometry:[]){
    if(!g||g.type==='no-place')continue;
    const width=Math.max(.2,Number(g.widthFt)||1),depth=Math.max(.2,Number(g.depthFt)||1),height=Math.max(.2,Number(g.heightFt)||2);
    const x=Number(g.x||0)+width/2-w/2,z=Number(g.y||0)+depth/2-l/2;
    if(g.type==='tree'){
      const trunkMat=new THREE.MeshStandardMaterial({color:new THREE.Color(css(mix3(style.structure,[88,67,45],.55))),roughness:1});
      const leafMat=new THREE.MeshStandardMaterial({color:new THREE.Color(css(mix3(style.ground,[53,91,46],.40))),roughness:1});
      const trunk=new THREE.Mesh(new THREE.CylinderGeometry(Math.max(.16,width*.05),Math.max(.22,width*.08),Math.max(3,height*.42),8),trunkMat);
      trunk.position.set(x,Math.max(3,height*.42)/2,z);trunk.castShadow=trunk.receiveShadow=true;trunk.name='Photo world traced tree';
      const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(Math.max(1.3,Math.max(width,depth)*.60),1),leafMat);
      crown.position.set(x,Math.max(3,height*.42)+height*.18,z);crown.scale.y=Math.max(1,Math.min(2.2,height/Math.max(7,width*1.8)));crown.castShadow=crown.receiveShadow=true;
      group.add(trunk,crown);materials.push({material:trunkMat,base:1,night:.50},{material:leafMat,base:1,night:.45});continue;
    }
    const baseColor=g.type==='house'?style.structure:g.type==='fence'?mix3(style.structure,[130,111,86],.35):mix3(style.structure,style.ground,.38);
    const mat=new THREE.MeshStandardMaterial({color:new THREE.Color(css(baseColor)),roughness:.92,metalness:0,transparent:true,opacity:g.type==='obstacle'?.42:.58});
    let bw=width,bd=depth;if(g.type==='fence'){if(width>=depth)bd=Math.min(depth,.24);else bw=Math.min(width,.24);}
    const box=new THREE.Mesh(new THREE.BoxGeometry(bw,height,bd),mat);
    box.position.set(x,height/2,z);box.rotation.y=-(Number(g.rotationDeg||0)||0)*Math.PI/180;
    box.castShadow=box.receiveShadow=true;box.name='Photo world traced '+g.type;group.add(box);
    materials.push({material:mat,base:1,night:.45});
  }
}

export function createPhotoWorld360({image,site,calibration,photoGeometry=[],surfaceType='grass',mobile=false}={}){
  const group=new THREE.Group();group.name='Local Smart 360 synthesis';
  if(!image||!site){
    group.userData={mode:'spatial-reconstruction',noExternalApi:true,ready:false,setNight(){}};
    return group;
  }
  const style=analyzePhotoWorld(image,calibration),w=Math.max(30,Number(site.widthFt)||50),l=Math.max(30,Number(site.lengthFt)||60);
  const radius=Math.max(58,Math.max(w,l)*1.30),height=Math.max(34,Math.min(86,radius*.72)),materials=[];
  addGround(group,image,style,radius*2.45,materials);
  addPanorama(group,image,style,radius,height,mobile,materials);
  const cards=addParallaxCards(group,image,style,radius,height,mobile,materials);
  addDepthMarkers(group,photoGeometry,site,style,materials);
  group.userData={
    mode:'spatial-reconstruction',
    noExternalApi:true,
    ready:true,
    source:'single-uploaded-photo',
    continuation:'approximate-unseen-directions',
    layers:{ground:true,panorama:true,parallax:cards.length,tracedGeometry:Array.isArray(photoGeometry)?photoGeometry.length:0},
    style,surfaceType,
    setNight(value){
      const night=!!value;
      for(const ref of materials){
        const mat=ref.material;if(!mat)continue;
        if('color' in mat&&mat.color){
          const k=night?ref.night:ref.base;
          mat.color.setRGB(k,k,k);
        }
      }
    }
  };
  return group;
}
