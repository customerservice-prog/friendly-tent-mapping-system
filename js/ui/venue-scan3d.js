import * as THREE from 'three';
import { reconstructStereoGrid, reconstructMultiViewGrid, fuseMultiReferenceSurfels, refineReconstructionSurface, spaceScanQualityProfile, stereoReconstructionSummary, stereoObstacleRects } from '../core/stereo-reconstruction.js';

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
function currentDeviceProfile(mobile){
  const n=typeof navigator!=='undefined'?navigator:{};
  return spaceScanQualityProfile({mobile,deviceMemory:n.deviceMemory,hardwareConcurrency:n.hardwareConcurrency});
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
  return !!((samples.length>=5||(f.left&&f.center&&f.right))&&Number(scan?.baselineFt)>0);
}
export async function createVenueScanWorld({
  scan,
  site,
  calibration,
  mobile=false,
  signal,
}={}){
  const group=new THREE.Group();group.name='Metric Space Scan';
  group.userData={mode:'metric-stereo-scan',ready:false,setNight(){}};
  if(!hasMetricSpaceScan(scan)||!site)return group;
  const frames=normalizedFrames(scan),samples=normalizedSamples(scan),quality=currentDeviceProfile(mobile);
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const requestedBaselineFt=Math.max(1,Math.min(30,Number(scan.baselineFt)||6)),baselineFactor=Math.max(.4,Math.min(1.05,Number(scan.baselineFactor)||1)),baselineFt=requestedBaselineFt*baselineFactor;
  let centerImage,centerData,result,fusion=null,multiImages=null,multiSamples=null,multiCenterIndex=-1,reconstructionMode='stereo-3',sourceFrameIds=[];
  if(samples.length>=5){
    const images=await Promise.all(samples.map(sample=>loadImage(sample.url)));multiImages=images;multiSamples=samples;
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    let centerIndex=0,bestCenter=Infinity;
    samples.forEach((sample,index)=>{const d=Math.abs(sample.offsetFactor);if(d<bestCenter){bestCenter=d;centerIndex=index;}});multiCenterIndex=centerIndex;
    centerImage=images[centerIndex];
    const aspect=(centerImage.naturalHeight||centerImage.height)/Math.max(1,centerImage.naturalWidth||centerImage.width);
    const width=quality.width,height=Math.max(96,Math.min(quality.maxHeight,Math.round(width*aspect)));
    const working=images.map(image=>imageData(image,width,height));
    centerData=working[centerIndex];const center=centerData,views=[];
    for(let i=0;i<working.length;i++){
      if(i===centerIndex)continue;
      views.push({image:working[i],offsetFt:samples[i].offsetFactor*baselineFt});
    }
    result=reconstructMultiViewGrid({
      center,views,
      fovDeg:Number(scan.fovDeg)||62,
      horizonY:Number(calibration?.horizonY)||.34,
      eyeHeightFt:Number(scan.eyeHeightFt)||5.6,
      step:quality.primaryStep,
      maxDisparity:quality.maxDisparity,
      patchRadius:quality.tier==='ultra'||quality.tier==='high'?1:2,
      verticalSearch:quality.tier==='mobile'?2:3,
      maxDepthFt:Math.max(70,Math.min(180,(Number(site.lengthFt)||60)*1.8)),
    });
    fusion=fuseMultiReferenceSurfels({
      captures:working.map((image,i)=>({image,offsetFt:samples[i].offsetFactor*baselineFt})),
      primaryIndex:centerIndex,
      primaryResult:result,
      referenceIndices:quality.tier==='ultra'||quality.tier==='high'
        ? [centerIndex-2,centerIndex-1,centerIndex,centerIndex+1,centerIndex+2]
        : [centerIndex-2,centerIndex,centerIndex+2],
      fovDeg:Number(scan.fovDeg)||62,
      horizonY:Number(calibration?.horizonY)||.34,
      eyeHeightFt:Number(scan.eyeHeightFt)||5.6,
      step:quality.fusionStep,
      maxDisparity:quality.fusionDisparity,
      patchRadius:quality.tier==='ultra'||quality.tier==='high'?1:2,
      verticalSearch:quality.tier==='mobile'?2:3,
      minConfidence:.10,
      maxDepthFt:Math.max(70,Math.min(180,(Number(site.lengthFt)||60)*1.8)),
      voxelFt:quality.voxelFt
    });
    reconstructionMode='multireference-'+samples.length;
    sourceFrameIds=samples.map(s=>s.id).filter(Boolean);
  }else{
    const [leftImage,centerLoaded,rightImage]=await Promise.all([
      loadImage(frames.left.url),loadImage(frames.center.url),loadImage(frames.right.url)
    ]);
    centerImage=centerLoaded;
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    const aspect=(centerImage.naturalHeight||centerImage.height)/Math.max(1,centerImage.naturalWidth||centerImage.width);
    const width=quality.width,height=Math.max(96,Math.min(quality.maxHeight,Math.round(width*aspect)));
    const left=imageData(leftImage,width,height),center=imageData(centerImage,width,height),right=imageData(rightImage,width,height);centerData=center;
    result=reconstructStereoGrid({
      left,center,right,baselineFt,
      fovDeg:Number(scan.fovDeg)||62,
      horizonY:Number(calibration?.horizonY)||.34,
      eyeHeightFt:Number(scan.eyeHeightFt)||5.6,
      step:quality.primaryStep,
      maxDisparity:Math.max(22,quality.maxDisparity-2),
      patchRadius:quality.tier==='ultra'||quality.tier==='high'?1:2,
      verticalSearch:2,
      maxDepthFt:Math.max(70,Math.min(180,(Number(site.lengthFt)||60)*1.8)),
    });
    sourceFrameIds=[frames.left.id,frames.center.id,frames.right.id].filter(Boolean);
  }
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  refineReconstructionSurface(result,{passes:quality.refinementPasses,strength:quality.tier==='ultra'?.18:.22,relativeDepthThreshold:.06,absoluteDepthThresholdFt:1.0});
  if(result.metrics.validCount<45||result.metrics.triangleCount<30){
    group.userData={mode:'metric-stereo-scan',ready:false,error:'not-enough-overlap',metrics:stereoReconstructionSummary(result),setNight(){}};
    return group;
  }

  // Use the real lower-image palette only as a neutral support surface for
  // holes outside the reconstructed mesh. No invented trees/houses are added.
  const siteWidth=Math.max(20,Number(site.widthFt)||50),siteLength=Math.max(20,Number(site.lengthFt)||60);
  const groundColor=averageLowerColor(centerData),groundDay=groundColor.clone();
  const groundMaterial=new THREE.MeshStandardMaterial({color:groundColor,roughness:1,metalness:0});
  const supportGround=new THREE.Mesh(new THREE.PlaneGeometry(Math.max(80,siteWidth*1.45),Math.max(100,siteLength*1.5)),groundMaterial);
  supportGround.name='Metric scan support ground';supportGround.rotation.x=-Math.PI/2;supportGround.position.y=-.10;supportGround.receiveShadow=true;supportGround.renderOrder=-10;
  group.add(supportGround);

  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(result.positions,3));
  geometry.setAttribute('uv',new THREE.BufferAttribute(result.uvs,2));
  geometry.setIndex(new THREE.BufferAttribute(result.indices,1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const map=textureFromImage(centerImage);
  const material=new THREE.MeshStandardMaterial({
    map,roughness:.96,metalness:0,side:THREE.DoubleSide,
    transparent:false,color:0xffffff
  });
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Metric venue reconstruction mesh';
  mesh.castShadow=false;mesh.receiveShadow=true;
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
      if(ref.referenceIndex===multiCenterIndex)continue;
      const image=multiImages[ref.referenceIndex],sample=multiSamples[ref.referenceIndex],rr=ref.result;
      if(!image||!sample||!rr?.indices?.length)continue;
      const rg=new THREE.BufferGeometry();
      rg.setAttribute('position',new THREE.BufferAttribute(rr.positions,3));
      rg.setAttribute('uv',new THREE.BufferAttribute(rr.uvs,2));
      rg.setIndex(new THREE.BufferAttribute(rr.indices,1));rg.computeVertexNormals();rg.computeBoundingSphere();
      const rt=textureFromImage(image);
      const rm=new THREE.MeshStandardMaterial({map:rt,roughness:.96,metalness:0,side:THREE.DoubleSide,transparent:false,color:0xffffff});
      const refMesh=new THREE.Mesh(rg,rm);refMesh.name='Metric venue reference mesh '+ref.referenceIndex;
      refMesh.castShadow=false;refMesh.receiveShadow=true;
      refMesh.position.set(ref.offsetFt,0,-siteLength/2-8);refMesh.renderOrder=-2;
      refMesh.userData.referenceOffsetFt=ref.offsetFt;refMesh.userData.referenceIndex=ref.referenceIndex;
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
  const surfelSize=quality.tier==='ultra'?.14:quality.tier==='high'?.16:quality.tier==='balanced'?.22:.30;
  const strongSurfelSize=quality.tier==='ultra'?.20:quality.tier==='high'?.22:quality.tier==='balanced'?.29:.38;
  addSurfelCloud('Metric venue reconstruction surfels',pts,cols,surfelSize,.46,-1);
  addSurfelCloud('Metric venue reconstruction strong surfels',strongPts,strongCols,strongSurfelSize,.82,-.5);

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
    mode:'metric-stereo-scan',
    ready:true,
    metric:true,
    baselineFt,
    requestedBaselineFt,
    baselineFactor,
    captureMethod:scan.captureMethod||'manual',
    captureConeDeg:118,
    knownBounds:worldBounds,
    obstacles,
    metrics:{...summary,qualityTier:quality.tier,workingWidth:quality.width,autoObstacleCount:obstacles.length,referenceCount:fusion?.metrics?.referenceCount||1,fusedSurfels:fusion?.surfelCount||0,multiReferenceAgreementPct:fusion?Math.round((fusion.metrics.multiReferenceAgreement||0)*100):null,fusedConfidencePct:fusion?Math.round((fusion.metrics.averageConfidence||0)*100):null},
    sourceFrames:sourceFrameIds,
    reconstructionMode,
    referenceViewCount:referenceMeshes.length,
    cameraOrigin:{x:0,y:Number(scan.eyeHeightFt)||5.6,z:-siteLength/2-8},
    updateView(camera){
      if(referenceMeshes.length<2||!camera)return;
      let best=referenceMeshes[0],bestDistance=Infinity;
      for(const candidate of referenceMeshes){
        const dx=(Number(camera.position?.x)||0)-(Number(candidate.userData.referenceOffsetFt)||0);
        const dz=(Number(camera.position?.z)||0)-(-siteLength/2-8);
        const distance=dx*dx+dz*dz*.12;
        if(distance<bestDistance){bestDistance=distance;best=candidate;}
      }
      for(const candidate of referenceMeshes)candidate.visible=candidate===best;
      group.userData.activeReferenceIndex=best.userData.referenceIndex;
      group.userData.activeReferenceOffsetFt=best.userData.referenceOffsetFt;
    },
    setNight(value){
      for(const refMesh of referenceMeshes)refMesh.material?.color?.setScalar(value?.48:1);
      groundMaterial.color.copy(groundDay).multiplyScalar(value?.48:1);
      for(const child of group.children){
        if(child.isPoints&&child.material)child.material.opacity=value?.44:.72;
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
