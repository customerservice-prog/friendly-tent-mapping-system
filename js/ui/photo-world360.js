import * as THREE from 'three';

/*
 * Browser-local venue reconstruction for 360 World.
 *
 * Important rule: never wrap/repeat the customer's whole photo around a cylinder.
 * That creates the smeared/duplicated-house effect visible in earlier builds.
 *
 * Instead:
 *   1) the calibrated original photo stage remains the trusted known view,
 *   2) the ground outside that view is procedural but color-matched,
 *   3) unseen directions use real 3D fence / vegetation / structure masses,
 *   4) only a narrow blurred strip from each real photo edge is used to soften
 *      the transition out of the known view,
 *   5) traced property geometry stays solid and world-space.
 *
 * One photo cannot reveal factual unseen property details, so the unseen world is
 * deliberately approximate. It should feel spatial and stable, not pretend to be
 * a literal scan of geometry that was never photographed.
 */

function clamp(value,min,max,fallback=min){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
}
function mix(a,b,t){return a+(b-a)*t;}
function mix3(a,b,t){return [mix(a[0],b[0],t),mix(a[1],b[1],t),mix(a[2],b[2],t)];}
function css(rgb,a=1){return 'rgba('+Math.round(rgb[0])+','+Math.round(rgb[1])+','+Math.round(rgb[2])+','+a+')';}
function color(rgb){return new THREE.Color(clamp(rgb[0],0,255,128)/255,clamp(rgb[1],0,255,128)/255,clamp(rgb[2],0,255,128)/255);}
function stableSeed(style){return Math.max(1,Math.floor(style.sky[0]*3+style.sky[1]*5+style.ground[1]*7+style.structure[2]*11))>>>0;}
function rng(seed){return ()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;}

function photoCanvas(image,w=160,h=120){
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(image,0,0,w,h);
  let data=null;try{data=x.getImageData?.(0,0,w,h)?.data||null;}catch(_){data=null;}
  return {data,w,h};
}
function averageRegion(sample,x0,y0,x1,y1){
  const {data,w,h}=sample;if(!data?.length)return [128,128,128];
  const ax=Math.max(0,Math.floor(x0*w)),bx=Math.min(w,Math.ceil(x1*w)),ay=Math.max(0,Math.floor(y0*h)),by=Math.min(h,Math.ceil(y1*h));
  let r=0,g=0,b=0,n=0;
  for(let y=ay;y<by;y+=2)for(let x=ax;x<bx;x+=2){
    const i=(y*w+x)*4,a=data[i+3]/255;if(a<.1)continue;
    r+=data[i]*a;g+=data[i+1]*a;b+=data[i+2]*a;n+=a;
  }
  return n?[r/n,g/n,b/n]:[128,128,128];
}

export function analyzePhotoWorld(image,calibration){
  const fallback={sky:[143,190,219],skyNear:[202,221,231],ground:[77,105,61],groundNear:[104,126,83],structure:[113,116,111],left:[83,95,77],right:[83,95,77],green:true,horizon:.34,seed:417};
  if(!image)return fallback;
  try{
    const s=photoCanvas(image),horizon=clamp(calibration?.horizonY,.12,.72,.34);
    const sky=averageRegion(s,.08,.01,.92,Math.max(.10,horizon*.48));
    const skyNear=averageRegion(s,.05,Math.max(.06,horizon*.42),.95,Math.max(.16,horizon*.96));
    const groundNear=averageRegion(s,.08,Math.min(.62,horizon+.12),.92,.78);
    const ground=averageRegion(s,.08,.76,.92,.99);
    const structure=averageRegion(s,.16,Math.max(.18,horizon*.78),.84,Math.min(.72,horizon+.34));
    const left=averageRegion(s,0,.18,.18,.82),right=averageRegion(s,.82,.18,1,.82);
    const green=ground[1]>ground[0]*1.035&&ground[1]>ground[2]*1.06;
    const out={sky,skyNear,ground,groundNear,structure,left,right,green,horizon};out.seed=stableSeed(out);return out;
  }catch(_){return fallback;}
}

function canvasTexture(canvas,{repeat=false}={}){
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
  tex.minFilter=THREE.LinearMipmapLinearFilter;tex.magFilter=THREE.LinearFilter;tex.anisotropy=4;
  if(repeat){tex.wrapS=tex.wrapT=THREE.RepeatWrapping;}tex.needsUpdate=true;return tex;
}

function proceduralGroundCanvas(style,surfaceType,size=512){
  const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d'),rand=rng(style.seed+31);
  const hard=/concrete|asphalt|pav|drive|deck/i.test(String(surfaceType||''));
  if(hard){
    const base=mix3(style.ground,style.structure,.70);x.fillStyle=css(base);x.fillRect(0,0,size,size);
    for(let i=0;i<9000;i++){
      const g=rand()>.5?mix3(base,[236,236,230],.20):mix3(base,[40,42,39],.18);
      x.fillStyle=css(g,.22+rand()*.18);const r=.4+rand()*1.8;x.fillRect(rand()*size,rand()*size,r,r);
    }
    x.strokeStyle=css(mix3(base,[42,44,41],.38),.42);x.lineWidth=1.5;
    for(let p=0;p<=size;p+=128){x.beginPath();x.moveTo(p,0);x.lineTo(p,size);x.stroke();x.beginPath();x.moveTo(0,p);x.lineTo(size,p);x.stroke();}
  }else{
    x.fillStyle=css(style.ground);x.fillRect(0,0,size,size);
    const dark=mix3(style.ground,[24,50,20],.42),light=mix3(style.groundNear,[210,224,164],.22);
    for(let i=0;i<15000;i++){
      const px=rand()*size,py=rand()*size,len=1.5+rand()*4.5;
      x.strokeStyle=css(rand()>.48?dark:light,.16+rand()*.22);x.lineWidth=.35+rand()*.75;
      x.beginPath();x.moveTo(px,py);x.lineTo(px+(rand()-.5)*2.4,py-len);x.stroke();
    }
    for(let i=0;i<180;i++){
      x.fillStyle=css(rand()>.55?dark:light,.035+rand()*.04);
      x.beginPath();x.arc(rand()*size,rand()*size,6+rand()*20,0,Math.PI*2);x.fill();
    }
  }
  return c;
}

function horizonCanvas(style,{mobile=false}={}){
  const w=mobile?1024:2048,h=mobile?384:640,c=document.createElement('canvas');c.width=w;c.height=h;
  const x=c.getContext('2d'),rand=rng(style.seed+87),hy=Math.round(h*.56);
  const sky=x.createLinearGradient(0,0,0,hy);sky.addColorStop(0,css(mix3(style.sky,[255,255,255],.10)));sky.addColorStop(1,css(style.skyNear));
  x.fillStyle=sky;x.fillRect(0,0,w,hy+2);
  const farGround=mix3(style.groundNear,style.structure,.22);x.fillStyle=css(farGround);x.fillRect(0,hy,w,h-hy);
  // A continuous low-detail horizon gives the user something spatial to move
  // against without duplicating recognizable objects from the real photograph.
  for(let i=0;i<34;i++){
    const px=i*(w/33)+(rand()-.5)*34,r=18+rand()*38,py=hy+5-r*.66;
    const foliage=mix3(style.green?style.ground:style.structure,style.skyNear,.10+rand()*.18);
    x.fillStyle=css(foliage,.82);x.beginPath();x.arc(px,py,r,0,Math.PI*2);x.fill();
    if(style.green){x.fillStyle=css(mix3(style.structure,[84,65,45],.55),.65);x.fillRect(px-2.5,py+r*.45,5,Math.max(8,r*.9));}
  }
  const haze=x.createLinearGradient(0,hy-30,0,hy+80);haze.addColorStop(0,'rgba(255,255,255,0)');haze.addColorStop(1,'rgba(255,255,255,.16)');
  x.fillStyle=haze;x.fillRect(0,hy-30,w,110);
  return c;
}

function edgeTransitionCanvas(image,side,{mobile=false}={}){
  const w=mobile?256:384,h=mobile?360:520,c=document.createElement('canvas');c.width=w;c.height=h;
  const x=c.getContext('2d'),iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height,strip=Math.max(10,Math.round(iw*.11));
  const sx=side==='left'?0:Math.max(0,iw-strip);
  x.save();if(side==='left'){x.translate(w,0);x.scale(-1,1);}
  x.filter='blur(5px) saturate(.82) contrast(.94)';x.globalAlpha=.52;x.drawImage(image,sx,0,strip,ih,0,0,w,h);x.restore();
  const fade=x.createLinearGradient(side==='left'?w:0,0,side==='left'?0:w,0);
  fade.addColorStop(0,'rgba(255,255,255,.88)');fade.addColorStop(.45,'rgba(255,255,255,.36)');fade.addColorStop(1,'rgba(255,255,255,0)');
  x.globalCompositeOperation='destination-in';x.fillStyle=fade;x.fillRect(0,0,w,h);x.globalCompositeOperation='source-over';
  return c;
}

function trackedMaterial(materials,mat,night=.48){
  materials.push({material:mat,dayColor:mat.color?.clone?.()||null,dayOpacity:mat.opacity,night});return mat;
}

function addGround(group,style,surfaceType,size,materials){
  const map=canvasTexture(proceduralGroundCanvas(style,surfaceType),{repeat:true});map.repeat.set(Math.max(4,size/18),Math.max(4,size/18));
  const mat=trackedMaterial(materials,new THREE.MeshStandardMaterial({map,roughness:.97,metalness:0,color:0xffffff}),.44);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(size,size),mat);ground.name='Photo world solid ground';ground.rotation.x=-Math.PI/2;ground.position.y=-.11;ground.receiveShadow=true;ground.renderOrder=-12;group.add(ground);return ground;
}

function addHorizon(group,style,radius,height,mobile,materials){
  const map=canvasTexture(horizonCanvas(style,{mobile}));
  const mat=trackedMaterial(materials,new THREE.MeshBasicMaterial({map,side:THREE.BackSide,depthWrite:false,color:0xffffff}),.55);
  const shell=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,72,1,true),mat);
  shell.name='Photo world horizon shell';shell.position.y=height/2-1;shell.rotation.y=Math.PI/2;shell.renderOrder=-20;group.add(shell);return shell;
}

function addEdgeTransitions(group,image,site,height,materials,mobile){
  const w=Math.max(30,Number(site.widthFt)||50),l=Math.max(30,Number(site.lengthFt)||60),cards=[];
  for(const side of ['left','right']){
    const map=canvasTexture(edgeTransitionCanvas(image,side,{mobile}));
    const mat=trackedMaterial(materials,new THREE.MeshBasicMaterial({map,transparent:true,opacity:.52,depthWrite:false,side:THREE.DoubleSide,color:0xffffff}),.58);
    const card=new THREE.Mesh(new THREE.PlaneGeometry(Math.max(12,w*.32),height*.62),mat);
    card.name='Photo world edge transition '+side;
    card.position.set(side==='left'?-w*.56:w*.56,height*.31,l*.46);
    card.rotation.y=side==='left'?Math.PI*.28:-Math.PI*.28;card.renderOrder=-3;group.add(card);cards.push(card);
  }
  return cards;
}

function addFenceSegment(group,a,b,style,materials){
  const wood=trackedMaterial(materials,new THREE.MeshStandardMaterial({color:color(mix3(style.structure,[124,105,79],.32)),roughness:.96}),.48);
  const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),angle=Math.atan2(dx,dz),cx=(a.x+b.x)/2,cz=(a.z+b.z)/2;
  const railGeo=new THREE.BoxGeometry(.15,.16,len),postGeo=new THREE.BoxGeometry(.28,5.2,.28);
  for(const y of [1.25,3.8]){const rail=new THREE.Mesh(railGeo,wood);rail.position.set(cx,y,cz);rail.rotation.y=angle;rail.castShadow=rail.receiveShadow=true;rail.name='Photo world solid fence rail';group.add(rail);}
  const count=Math.max(2,Math.floor(len/6));
  for(let i=0;i<=count;i++){
    const f=i/count,post=new THREE.Mesh(postGeo,wood);post.position.set(mix(a.x,b.x,f),2.6,mix(a.z,b.z,f));post.castShadow=post.receiveShadow=true;post.name='Photo world solid fence post';group.add(post);
  }
}

function addBoundaryContext(group,style,site,materials){
  const w=Math.max(30,Number(site.widthFt)||50),l=Math.max(30,Number(site.lengthFt)||60),rand=rng(style.seed+191),solid=[];
  // Keep the camera-facing/front edge open. Side + rear boundaries give the world
  // real parallax and depth without putting a fake photo wall around the viewer.
  addFenceSegment(group,{x:-w*.58,z:-l*.48},{x:-w*.58,z:l*.56},style,materials);
  addFenceSegment(group,{x:w*.58,z:-l*.48},{x:w*.58,z:l*.56},style,materials);
  addFenceSegment(group,{x:-w*.58,z:l*.56},{x:w*.58,z:l*.56},style,materials);
  const trunkMat=trackedMaterial(materials,new THREE.MeshStandardMaterial({color:color(mix3(style.structure,[83,63,43],.55)),roughness:1}),.42);
  const leafMat=trackedMaterial(materials,new THREE.MeshStandardMaterial({color:color(mix3(style.ground,[48,83,43],.32)),roughness:1}),.42);
  const positions=[];
  // Keep the center of the photographed rear direction visually open so the
  // real venue photo can remain readable when 360 World first opens.
  for(let i=0;i<12;i++){
    const side=i%2===0?-1:1;
    const x=side*w*(.53+rand()*.07);
    const z=mix(-l*.30,l*.44,(Math.floor(i/2)+.5)/6);
    positions.push({x,z,h:11+rand()*10,r:2.0+rand()*2.5});
  }
  for(let i=0;i<4;i++){
    const side=i<2?-1:1;
    const x=side*w*(.42+rand()*.11);
    const z=l*(.50+rand()*.07);
    positions.push({x,z,h:12+rand()*10,r:2.2+rand()*2.6});
  }
  for(const p of positions){
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.22,.34,p.h*.44,8),trunkMat);trunk.position.set(p.x,p.h*.22,p.z);trunk.castShadow=trunk.receiveShadow=true;trunk.name='Photo world solid tree trunk';
    const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(p.r,1),leafMat);crown.position.set(p.x,p.h*.63,p.z);crown.scale.y=1.18+rand()*.45;crown.castShadow=crown.receiveShadow=true;crown.name='Photo world boundary vegetation';
    group.add(trunk,crown);solid.push(trunk,crown);
  }
  return solid;
}

function addFallbackRearStructure(group,style,site,materials,photoGeometry){
  if(!style.green||(photoGeometry||[]).some(g=>g?.type==='house'))return null;
  const w=Math.max(30,Number(site.widthFt)||50),l=Math.max(30,Number(site.lengthFt)||60),houseW=Math.max(24,w*.62),houseD=12,wallH=9.5;
  const wall=trackedMaterial(materials,new THREE.MeshStandardMaterial({color:color(mix3(style.structure,[222,220,207],.22)),roughness:.92}),.48);
  const roof=trackedMaterial(materials,new THREE.MeshStandardMaterial({color:color(mix3(style.structure,[55,61,60],.52)),roughness:.95}),.40);
  const home=new THREE.Group();home.name='Photo world approximate rear structure';home.position.set(0,0,l*.67);
  const body=new THREE.Mesh(new THREE.BoxGeometry(houseW,wallH,houseD),wall);body.position.y=wallH/2;body.castShadow=body.receiveShadow=true;home.add(body);
  const roofW=houseW+1.2,roofDepth=Math.hypot(houseD/2+1,3.2),pitch=Math.atan2(3.2,houseD/2+1);
  for(const sign of [-1,1]){
    const panel=new THREE.Mesh(new THREE.BoxGeometry(roofW,.24,roofDepth),roof);panel.position.set(0,wallH+1.55,sign*(houseD*.25));panel.rotation.x=sign*pitch;panel.castShadow=true;home.add(panel);
  }
  group.add(home);return home;
}

function addDepthMarkers(group,photoGeometry,site,style,materials){
  const w=Math.max(1,Number(site?.widthFt)||50),l=Math.max(1,Number(site?.lengthFt)||60),solid=[];
  for(const g of Array.isArray(photoGeometry)?photoGeometry:[]){
    if(!g||g.type==='no-place')continue;
    const width=Math.max(.2,Number(g.widthFt)||1),depth=Math.max(.2,Number(g.depthFt)||1),height=Math.max(.2,Number(g.heightFt)||2);
    const x=Number(g.x||0)+width/2-w/2,z=Number(g.y||0)+depth/2-l/2;
    if(g.type==='tree'){
      const trunkMat=trackedMaterial(materials,new THREE.MeshStandardMaterial({color:color(mix3(style.structure,[88,67,45],.58)),roughness:1}),.44);
      const leafMat=trackedMaterial(materials,new THREE.MeshStandardMaterial({color:color(mix3(style.ground,[53,91,46],.38)),roughness:1}),.42);
      const trunk=new THREE.Mesh(new THREE.CylinderGeometry(Math.max(.18,width*.08),Math.max(.28,width*.12),Math.max(3,height*.46),10),trunkMat);trunk.position.set(x,Math.max(3,height*.46)/2,z);trunk.castShadow=trunk.receiveShadow=true;trunk.name='Photo world traced tree trunk';
      const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(Math.max(1.5,Math.max(width,depth)*.68),1),leafMat);crown.position.set(x,Math.max(3,height*.46)+height*.2,z);crown.scale.y=Math.max(1,Math.min(2.1,height/Math.max(7,width*2)));crown.castShadow=crown.receiveShadow=true;crown.name='Photo world traced tree';group.add(trunk,crown);solid.push(trunk,crown);continue;
    }
    if(g.type==='house'){
      const wall=trackedMaterial(materials,new THREE.MeshStandardMaterial({color:color(mix3(style.structure,[218,216,202],.18)),roughness:.92}),.48);
      const box=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),wall);box.position.set(x,height/2,z);box.rotation.y=-(Number(g.rotationDeg||0)||0)*Math.PI/180;box.castShadow=box.receiveShadow=true;box.name='Photo world traced house';group.add(box);solid.push(box);continue;
    }
    const baseColor=g.type==='fence'?mix3(style.structure,[130,111,86],.42):mix3(style.structure,style.ground,.34);
    const mat=trackedMaterial(materials,new THREE.MeshStandardMaterial({color:color(baseColor),roughness:.94,metalness:0,transparent:g.type==='obstacle',opacity:g.type==='obstacle'?.78:1}),.46);
    let bw=width,bd=depth;if(g.type==='fence'){if(width>=depth)bd=Math.min(depth,.35);else bw=Math.min(width,.35);}
    const box=new THREE.Mesh(new THREE.BoxGeometry(bw,height,bd),mat);box.position.set(x,height/2,z);box.rotation.y=-(Number(g.rotationDeg||0)||0)*Math.PI/180;box.castShadow=box.receiveShadow=true;box.name='Photo world traced '+g.type;group.add(box);solid.push(box);
  }
  return solid;
}

export function createPhotoWorld360({image,site,calibration,photoGeometry=[],surfaceType='grass',mobile=false}={}){
  const group=new THREE.Group();group.name='Local Smart 360 synthesis';
  if(!image||!site){group.userData={mode:'illustrative-photo-context',noExternalApi:true,ready:false,setNight(){}};return group;}
  const style=analyzePhotoWorld(image,calibration),w=Math.max(30,Number(site.widthFt)||50),l=Math.max(30,Number(site.lengthFt)||60);
  const radius=Math.max(62,Math.max(w,l)*1.20),height=Math.max(36,Math.min(76,radius*.60)),materials=[];
  addGround(group,style,surfaceType,radius*2.15,materials);
  addHorizon(group,style,radius,height,mobile,materials);
  const transitions=addEdgeTransitions(group,image,site,height,materials,mobile);
  const context=[]; // Unseen physical boundaries cannot be recovered from one image.
  const fallbackStructure=null;
  const traced=addDepthMarkers(group,photoGeometry,site,style,materials);
  group.userData={
    mode:'illustrative-photo-context',
    noExternalApi:true,
    ready:true,
    source:'single-uploaded-photo',
    antiSmear:true,
    accuracy:'unverified',continuation:'neutral-illustrative-surroundings',
    layers:{ground:true,horizon:true,panorama:false,transitions:transitions.length,solidContext:context.length+(fallbackStructure?1:0),tracedGeometry:traced.length},
    style,surfaceType,
    setNight(value){
      const night=!!value;
      for(const ref of materials){
        const mat=ref.material;if(!mat)continue;
        if(ref.dayColor&&mat.color){
          if(night)mat.color.copy(ref.dayColor).multiplyScalar(ref.night);
          else mat.color.copy(ref.dayColor);
        }
        if(mat.transparent&&Number.isFinite(ref.dayOpacity))mat.opacity=night?Math.max(.12,ref.dayOpacity*.72):ref.dayOpacity;
      }
    }
  };
  return group;
}
