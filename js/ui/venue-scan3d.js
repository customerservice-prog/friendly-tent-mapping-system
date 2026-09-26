import { scanCaptureGuidance } from '../core/capture-quality.js';
import { evaluateScanValidation, scanInputFingerprint, scanFrameFingerprint, SCAN_MEASUREMENT_POLICY } from '../core/scan-validation.js';
import { cachedScanReconstruction } from './scan-job-client.js';
import * as THREE from 'three';
import { stereoReconstructionSummary, stereoObstacleRects } from '../core/stereo-reconstruction.js';

function loadImage(url){
  return new Promise((resolve,reject)=>{
    const image=new Image();image.crossOrigin='anonymous';image.decoding='async';
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(new Error('A Space Scan frame could not be loaded.'));
    image.src=url;
  });
}
function imageData(image,width,height){
  const c=document.createElement('canvas');c.width=width;c.height=height;
  const x=c.getContext('2d',{willReadFrequently:true,alpha:false});
  x.drawImage(image,0,0,width,height);
  return x.getImageData(0,0,width,height);
}
function textureFromImage(image){
  const tex=new THREE.Texture(image);tex.needsUpdate=true;tex.colorSpace=THREE.SRGBColorSpace;
  tex.minFilter=THREE.LinearMipmapLinearFilter;tex.magFilter=THREE.LinearFilter;tex.anisotropy=4;
  return tex;
}
function scanFeatherMask(size=128){
  const c=document.createElement('canvas');c.width=c.height=size;
  const x=c.getContext('2d'),img=x.createImageData(size,size);
  const smooth=t=>t*t*(3-2*t);
  for(let y=0;y<size;y++)for(let xx=0;xx<size;xx++){
    const u=xx/(size-1),v=y/(size-1),edge=Math.min(u,1-u,v,1-v);
    const a=smooth(Math.max(0,Math.min(1,(edge-.018)/.085))),i=(y*size+xx)*4,val=Math.round(a*255);
    img.data[i]=img.data[i+1]=img.data[i+2]=255;img.data[i+3]=val;
  }
  x.putImageData(img,0,0);
  const tex=new THREE.CanvasTexture(c);tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;tex.needsUpdate=true;return tex;
}
function averageImageRgb(image){
  try{
    const w=image?.naturalWidth||image?.width||0,h=image?.naturalHeight||image?.height||0;if(!w||!h)return [1,1,1];
    const c=document.createElement('canvas');c.width=48;c.height=36;
    const x=c.getContext('2d',{willReadFrequently:true,alpha:false});x.drawImage(image,0,0,c.width,c.height);
    const d=x.getImageData(0,0,c.width,c.height).data;let r=0,g=0,b=0,n=0;
    for(let yy=5;yy<c.height-4;yy+=2)for(let xx=5;xx<c.width-4;xx+=2){const i=(yy*c.width+xx)*4;r+=d[i];g+=d[i+1];b+=d[i+2];n++;}
    return n?[r/n/255,g/n/255,b/n/255]:[1,1,1];
  }catch(_){return [1,1,1];}
}
function exposureMatchColor(referenceRgb,targetRgb){
  const safe=(a,b)=>Math.max(.82,Math.min(1.18,(a+.04)/(b+.04)));
  return new THREE.Color(safe(referenceRgb[0],targetRgb[0]),safe(referenceRgb[1],targetRgb[1]),safe(referenceRgb[2],targetRgb[2]));
}
function averageLowerColor(imageDataValue){
  const {data,width,height}=imageDataValue||{};
  if(!data||!width||!height)return new THREE.Color(0x6f805e);
  const y0=Math.max(0,Math.floor(height*.77)),y1=Math.min(height,Math.ceil(height*.98));
  let r=0,g=0,b=0,n=0;
  for(let y=y0;y<y1;y+=2)for(let x=0;x<width;x+=2){
    const i=(y*width+x)*4,a=data[i+3]/255;if(a<.2)continue;
    r+=data[i]*a;g+=data[i+1]*a;b+=data[i+2]*a;n+=a;
  }
  return n?new THREE.Color(r/n/255,g/n/255,b/n/255):new THREE.Color(0x6f805e);
}
function normalizedFrames(scan){
  const frames=Array.isArray(scan?.frames)?scan.frames:[];
  const out={};
  for(const frame of frames){
    if(frame&&['left','center','right'].includes(frame.role)&&/^https?:\/\//i.test(frame.url||''))out[frame.role]=frame;
  }
  return out;
}
function normalizedSamples(scan){
  return (Array.isArray(scan?.samples)?scan.samples:[]).filter(sample=>sample&&/^https?:\/\//i.test(sample.url||'')&&Number.isFinite(Number(sample.offsetFactor))).map(sample=>({...sample,offsetFactor:Number(sample.offsetFactor)})).sort((a,b)=>a.offsetFactor-b.offsetFactor);
}
export function hasMetricSpaceScan(scan){
  const f=normalizedFrames(scan),samples=normalizedSamples(scan);
  const urls=samples.length>=5?samples.map(s=>s.url):[f.left?.url,f.center?.url,f.right?.url].filter(Boolean);
  return !!((samples.length>=5||(f.left&&f.center&&f.right))&&new Set(urls).size===urls.length&&Number(scan?.baselineFt)>0);
}
export async function createVenueScanWorld({
  scan,
  site,
  calibration,
  mobile=false,
  signal,
}={}){
  const group=new THREE.Group();group.name='Estimated depth preview';
  group.userData={mode:'estimated-stereo-preview',ready:false,setNight(){}};
  if(!hasMetricSpaceScan(scan)||!site)return group;
  const frames=normalizedFrames(scan),samples=normalizedSamples(scan);
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const requestedBaselineFt=Math.max(1,Math.min(30,Number(scan.baselineFt)||6)),baselineFactor=Math.max(.4,Math.min(1.05,Number(scan.baselineFactor)||1)),baselineFt=requestedBaselineFt*baselineFactor;
  const sourceSamples=samples.length>=5?samples:[frames.left,frames.center,frames.right];
  const images=await Promise.all(sourceSamples.map(sample=>loadImage(sample.url)));
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  let centerIndex=samples.length>=5?samples.reduce((best,s,i)=>Math.abs(s.offsetFactor)<Math.abs(samples[best].offsetFactor)?i:best,0):1;
  const centerImage=images[centerIndex],aspect=(centerImage.naturalHeight||centerImage.height)/Math.max(1,centerImage.naturalWidth||centerImage.width);
  if(aspect<.25||aspect>4||images.some(image=>Math.abs(((image.naturalHeight||image.height)/(image.naturalWidth||image.width))/aspect-1)>.03)){
    group.userData={ready:false,error:'capture-aspect',quality:{usable:false,issues:['Use the same camera orientation and zoom for every scan frame.']},setNight(){}};return group;
  }
  // Preserve image aspect: stretching a portrait capture into a landscape grid
  // corrupts vertical geometry and any independent distance check.
  const edge=mobile?128:176,width=Math.round(edge/Math.max(1,aspect)),height=Math.round(width*aspect);
  const working=images.map(image=>imageData(image,width,height)),centerData=working[centerIndex];
  const jobInput={frames:working,offsetFactors:samples.map(s=>s.offsetFactor),centerIndex,baselineFt,fovDeg:Number(scan.fovDeg)||62,horizonY:Number(calibration?.horizonY)||.34,eyeHeightFt:Number(scan.eyeHeightFt)||5.6,maxDepthFt:Math.max(70,Math.min(180,(Number(site.lengthFt)||60)*1.8)),mobile};
  const inputFingerprint=scanInputFingerprint({sources:sourceSamples.map(s=>[s.id,s.url,s.offsetFactor]),pixels:scanFrameFingerprint(working),...jobInput,frames:undefined});
  const job=await cachedScanReconstruction(inputFingerprint,jobInput,{signal});
  const {result,fusion,captureQuality,trackedPath,reconstructionMode}=job;
  const sourceFrameId=sourceSamples[centerIndex].id||sourceSamples[centerIndex].url;
  const validation=evaluateScanValidation(result,{check:scan.validationCheck,captureQuality,trackedPath,sourceFrameId,inputFingerprint});
  const captureGuidance=scanCaptureGuidance({quality:captureQuality,path:trackedPath,validation});
  if(!result){group.userData={mode:'estimated-stereo-preview',ready:false,error:job.error||'capture-quality',quality:captureQuality,validation,captureGuidance,measurementPolicy:{...SCAN_MEASUREMENT_POLICY},setNight(){}};return group;}
  const multiImages=samples.length>=5?images:null,multiCenterIndex=centerIndex;
  const multiSamples=samples.length>=5?samples.map((sample,i)=>({...sample,offsetFactor:job.offsetFactors[i],rollDeg:Number(trackedPath?.framePoses?.[i]?.rollDeg)||0})):null;
  const sourceFrameIds=sourceSamples.map(s=>s.id).filter(Boolean);
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  if(result.metrics.validCount<45||result.metrics.triangleCount<30){
    group.userData={mode:'estimated-stereo-preview',ready:false,error:'not-enough-overlap',metrics:stereoReconstructionSummary(result),quality:captureQuality,validation,captureGuidance,measurementPolicy:{...SCAN_MEASUREMENT_POLICY},setNight(){}};
    return group;
  }

  // Use the real lower-image palette only as a neutral support surface for
  // holes outside the reconstructed mesh. No invented trees/houses are added.
  const siteWidth=Math.max(20,Number(site.widthFt)||50),siteLength=Math.max(20,Number(site.lengthFt)||60);
  const groundColor=averageLowerColor(centerData),groundDay=groundColor.clone();
  // Customer presentation: keep a restrained floor only under the defined venue.
  // The old oversized opaque plane made the reconstruction look like a synthetic
  // video-game slab and amplified every hole at the scan boundary.
  const groundMaterial=new THREE.MeshStandardMaterial({color:groundColor,roughness:1,metalness:0,transparent:true,opacity:.16,depthWrite:false});
  const supportGround=new THREE.Mesh(new THREE.PlaneGeometry(siteWidth*1.08,siteLength*1.08),groundMaterial);
  supportGround.name='Scan shadow support';supportGround.rotation.x=-Math.PI/2;supportGround.position.set(0,-.12,0);supportGround.receiveShadow=true;supportGround.renderOrder=-12;
  group.add(supportGround);

  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(result.positions.slice(),3));
  geometry.setAttribute('uv',new THREE.BufferAttribute(result.uvs,2));
  geometry.setIndex(new THREE.BufferAttribute(result.indices,1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const map=textureFromImage(centerImage),centerFeather=scanFeatherMask(),centerRgb=averageImageRgb(centerImage);
  // Reconstructed photo evidence should read like the real photograph, not a
  // freshly lit 3D sculpture. Using an unlit material prevents small triangle
  // normals from turning depth noise into visible bright/dark wrinkles.
  const material=new THREE.MeshBasicMaterial({
    map,alphaMap:centerFeather,side:THREE.DoubleSide,
    transparent:true,alphaTest:.025,depthWrite:true,color:0xffffff,
    polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1,toneMapped:false,fog:false
  });
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Metric venue reconstruction mesh';
  mesh.castShadow=false;mesh.receiveShadow=false;
  // The reconstruction is solved in the center camera's coordinate system.
  // Register it to RentSketch's feet-based world with the camera just outside
  // the near edge of the calibrated photo site, facing +Z.
  mesh.position.set(0,0,-siteLength/2-8);
  mesh.renderOrder=-2;
  group.add(mesh);

  // Use the nearest captured reference mesh as the textured surface. This keeps
  // the house/grass/fence appearance tied to the real camera view closest to
  // the user's current position instead of stretching the center photo across
  // every side angle.
  const referenceMeshes=[];
  mesh.userData.referenceOffsetFt=0;mesh.userData.referenceIndex=multiCenterIndex>=0?multiCenterIndex:0;referenceMeshes.push(mesh);
  if(fusion?.referenceResults?.length&&multiImages&&multiSamples){
    for(const ref of fusion.referenceResults){
      if(ref.referenceIndex===multiCenterIndex||ref.accepted===false)continue;
      const image=multiImages[ref.referenceIndex],sample=multiSamples[ref.referenceIndex],rr=ref.result;
      if(!image||!sample||!rr?.indices?.length)continue;
      const rg=new THREE.BufferGeometry();
      // The worker result is cached across held-out-check edits. Render-time
      // roll correction must not rotate those shared vertices a second time.
      rg.setAttribute('position',new THREE.BufferAttribute(rr.positions.slice(),3));
      rg.setAttribute('uv',new THREE.BufferAttribute(rr.uvs,2));
      rg.setIndex(new THREE.BufferAttribute(rr.indices,1));rg.computeVertexNormals();rg.computeBoundingSphere();
      const rt=textureFromImage(image),edgeFade=scanFeatherMask(),balancedColor=exposureMatchColor(centerRgb,averageImageRgb(image));
      const rm=new THREE.MeshBasicMaterial({map:rt,alphaMap:edgeFade,side:THREE.DoubleSide,transparent:true,alphaTest:.025,depthWrite:true,color:balancedColor,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1,toneMapped:false});
      const refMesh=new THREE.Mesh(rg,rm);refMesh.name='Metric venue reference mesh '+ref.referenceIndex;
      refMesh.castShadow=false;refMesh.receiveShadow=false;
      const rollRad=Number(ref.rollRad)||0;
      if(Math.abs(rollRad)>.0005){
        rg.translate(0,-(Number(scan.eyeHeightFt)||5.6),0);
        rg.rotateZ(rollRad);
        rg.translate(0,(Number(scan.eyeHeightFt)||5.6),0);
      }
      refMesh.position.set(ref.offsetFt,0,-siteLength/2-8);refMesh.renderOrder=-2;
      refMesh.userData.referenceOffsetFt=ref.offsetFt;refMesh.userData.referenceIndex=ref.referenceIndex;refMesh.userData.referenceRollRad=rollRad;
      refMesh.visible=false;group.add(refMesh);referenceMeshes.push(refMesh);
    }
  }

  // A center-reference mesh gives continuous surfaces. For video scans,
  // additional reference viewpoints are voxel-fused into a shared surfel cloud
  // so surfaces that were hidden from the center frame can still appear when
  // the viewer moves laterally.
  const pointSource=fusion?.surfelCount?fusion:null;
  const pts=[],cols=[],strongPts=[],strongCols=[];
  if(pointSource){
    for(let i=0;i<pointSource.valid.length;i++){
      if(!pointSource.valid[i]||pointSource.confidence[i]<.11)continue;
      const target=pointSource.supportReferences?.[i]>=2?strongPts:pts;
      const targetColor=pointSource.supportReferences?.[i]>=2?strongCols:cols;
      target.push(pointSource.positions[i*3],pointSource.positions[i*3+1],pointSource.positions[i*3+2]);
      targetColor.push(pointSource.colors[i*3],pointSource.colors[i*3+1],pointSource.colors[i*3+2]);
    }
  }else{
    for(let i=0;i<result.valid.length;i++){
      if(!result.valid[i]||result.confidence[i]<.20)continue;
      pts.push(result.positions[i*3],result.positions[i*3+1],result.positions[i*3+2]);
      cols.push(result.colors[i*3],result.colors[i*3+1],result.colors[i*3+2]);
    }
  }
  function addSurfelCloud(name,positions,colors,size,opacity,order){
    if(!positions.length)return null;
    const pg=new THREE.BufferGeometry();
    pg.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    pg.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    const pm=new THREE.PointsMaterial({size,sizeAttenuation:true,vertexColors:true,transparent:true,opacity,depthWrite:true});
    const points=new THREE.Points(pg,pm);points.name=name;points.position.copy(mesh.position);points.renderOrder=order;group.add(points);return points;
  }
  // The surfel cloud is useful for reconstruction diagnostics but looks noisy
  // and unfinished to customers. Keep it available only for explicit developer
  // debugging; production presentation uses the textured surface meshes.
  const showDebugSurfels=globalThis.RENTSKETCH_SCAN_DEBUG===true;
  if(showDebugSurfels){
    addSurfelCloud('Metric venue reconstruction surfels',pts,cols,mobile?.22:.16,.20,-1);
    addSurfelCloud('Metric venue reconstruction strong surfels',strongPts,strongCols,mobile?.28:.21,.36,-.5);
  }

  geometry.computeBoundingBox();
  const worldBounds=geometry.boundingBox?{
    min:{x:geometry.boundingBox.min.x,y:geometry.boundingBox.min.y,z:geometry.boundingBox.min.z-siteLength/2-8},
    max:{x:geometry.boundingBox.max.x,y:geometry.boundingBox.max.y,z:geometry.boundingBox.max.z-siteLength/2-8}
  }:null;
  const summary=stereoReconstructionSummary(result);
  const obstacleSource=fusion?.surfelCount?fusion:result;
  const obstacles=stereoObstacleRects(obstacleSource,{
    siteWidthFt:siteWidth,
    siteLengthFt:siteLength,
    cameraOffsetZ:-siteLength/2-8,
    cellFt:mobile?2.5:2,
    minHeightFt:1.4,
    minConfidence:fusion?.surfelCount ? .12 : .16
  });
  group.userData={
    mode:'estimated-stereo-preview',
    ready:true,
    metric:false,
    accuracy:'unverified',
    validation,
    captureGuidance,
    measurementPolicy:{...SCAN_MEASUREMENT_POLICY},
    execution:job.execution,
    inputFingerprint,
    provenance:{geometry:'estimated stereo depth',scale:'user-entered baseline',sampledBaseline:scan.captureMethod==='video'?'time-fraction estimate of total travel':'entered left-to-right distance',cameraPoses:trackedPath?.usable?'feature-tracked lateral path + roll':'assumed',poseAxes:trackedPath?.poseAxes||null,unseenAreas:'not reconstructed'},
    baselineFt,
    requestedBaselineFt,
    baselineFactor,
    captureMethod:scan.captureMethod||'manual',
    captureConeDeg:118,
    knownBounds:worldBounds,
    obstacles,
    quality:captureQuality,
    metrics:{...summary,captureQualityScore:captureQuality?.score??null,captureQualityRating:captureQuality?.rating||null,trackedCameraPath:!!trackedPath?.usable,trackedMotionQuality:trackedPath?.meanQuality??null,trackedMotionConsistency:trackedPath?.consistency??null,trackedFeatureCount:trackedPath?.totalTracks??0,trackedPoseFrames:trackedPath?.framePoses?.filter(p=>Math.abs(Number(p.rollDeg)||0)>.05).length||0,maxTrackedRollDeg:trackedPath?.framePoses?.length?Math.max(...trackedPath.framePoses.map(p=>Math.abs(Number(p.rollDeg)||0))):0,poseCorrectedReferences:fusion?.metrics?.poseCorrectedReferences||0,maxReferenceRollDeg:fusion?.metrics?.maxReferenceRollDeg||0,acceptedReferences:fusion?.metrics?.acceptedReferences??(fusion?.metrics?.referenceCount||1),rejectedReferences:fusion?.metrics?.rejectedReferences||0,averageReferenceScore:fusion?.metrics?.averageReferenceScore??null,autoObstacleCount:obstacles.length,referenceCount:fusion?.metrics?.referenceCount||1,fusedSurfels:fusion?.surfelCount||0,multiReferenceAgreementPct:fusion?Math.round((fusion.metrics.multiReferenceAgreement||0)*100):null,fusedConfidencePct:fusion?Math.round((fusion.metrics.averageConfidence||0)*100):null},
    sourceFrames:sourceFrameIds,
    reconstructionMode,
    photoFaithfulMaterial:true,
    referenceViewCount:referenceMeshes.length,
    cameraOrigin:{x:0,y:Number(scan.eyeHeightFt)||5.6,z:-siteLength/2-8},
    presentationMode:'overview',
    setPresentationMode(mode){
      group.userData.presentationMode=mode==='walk'?'walk':'overview';
      if(group.userData.presentationMode==='overview'){
        const anchor=referenceMeshes[0];
        for(const candidate of referenceMeshes)candidate.visible=candidate===anchor;
        group.userData.activeReferenceIndex=anchor.userData.referenceIndex;
        group.userData.activeReferenceOffsetFt=anchor.userData.referenceOffsetFt;
      }
    },
    updateView(camera){
      if(referenceMeshes.length<2||!camera)return;
      if(group.userData.presentationMode!=='walk'){
        const anchor=referenceMeshes[0];
        for(const candidate of referenceMeshes)candidate.visible=candidate===anchor;
        group.userData.activeReferenceIndex=anchor.userData.referenceIndex;
        group.userData.activeReferenceOffsetFt=anchor.userData.referenceOffsetFt;
        return;
      }
      const cameraX=Number(camera.position?.x)||0,cameraZ=Number(camera.position?.z)||0;
      let best=referenceMeshes[0],bestDistance=Infinity;
      for(const candidate of referenceMeshes){
        const dx=cameraX-(Number(candidate.userData.referenceOffsetFt)||0);
        const dz=cameraZ-(-siteLength/2-8);
        const distance=dx*dx+dz*dz*.10;
        if(distance<bestDistance){bestDistance=distance;best=candidate;}
      }
      const current=referenceMeshes.find(candidate=>candidate.visible)||referenceMeshes[0];
      const currentDx=cameraX-(Number(current.userData.referenceOffsetFt)||0);
      const currentDz=cameraZ-(-siteLength/2-8);
      const currentDistance=currentDx*currentDx+currentDz*currentDz*.10;
      const chosen=best!==current&&bestDistance<currentDistance*.68?best:current;
      for(const candidate of referenceMeshes)candidate.visible=candidate===chosen;
      group.userData.activeReferenceIndex=chosen.userData.referenceIndex;
      group.userData.activeReferenceOffsetFt=chosen.userData.referenceOffsetFt;
    },
    setNight(value){
      for(const refMesh of referenceMeshes)refMesh.material?.color?.setScalar(value?.48:1);
      groundMaterial.color.copy(groundDay).multiplyScalar(value?.62:1);
      groundMaterial.opacity=value?.10:.16;
      for(const child of group.children){
        if(child.isPoints&&child.material)child.material.opacity=value?.12:.20;
      }
    }
  };
  return group;
}

export function disposeVenueScanWorld(group){
  if(!group)return;
  const geometries=new Set(),materials=new Set(),textures=new Set();
  group.traverse(o=>{
    if(o.geometry)geometries.add(o.geometry);
    const mats=(Array.isArray(o.material)?o.material:[o.material]).filter(Boolean);
    mats.forEach(m=>{materials.add(m);if(m.map)textures.add(m.map);if(m.alphaMap)textures.add(m.alphaMap);});
  });
  group.clear();geometries.forEach(g=>g.dispose?.());materials.forEach(m=>m.dispose?.());textures.forEach(t=>t.dispose?.());
}
