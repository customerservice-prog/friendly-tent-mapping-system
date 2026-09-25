import * as THREE from 'three';
import { reconstructStereoGrid, stereoReconstructionSummary } from '../core/stereo-reconstruction.js';

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
export function hasMetricSpaceScan(scan){
  const f=normalizedFrames(scan);
  return !!(f.left&&f.center&&f.right&&Number(scan?.baselineFt)>0);
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
  const frames=normalizedFrames(scan);
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const [leftImage,centerImage,rightImage]=await Promise.all([
    loadImage(frames.left.url),loadImage(frames.center.url),loadImage(frames.right.url)
  ]);
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');

  const aspect=(centerImage.naturalHeight||centerImage.height)/Math.max(1,centerImage.naturalWidth||centerImage.width);
  const width=mobile?128:176,height=Math.max(84,Math.min(144,Math.round(width*aspect)));
  const left=imageData(leftImage,width,height),center=imageData(centerImage,width,height),right=imageData(rightImage,width,height);
  const baselineFt=Math.max(1,Math.min(30,Number(scan.baselineFt)||6));
  const result=reconstructStereoGrid({
    left,center,right,baselineFt,
    fovDeg:Number(scan.fovDeg)||62,
    horizonY:Number(calibration?.horizonY)||.34,
    eyeHeightFt:Number(scan.eyeHeightFt)||5.6,
    step:mobile?5:4,
    maxDisparity:mobile?20:26,
    patchRadius:2,
    verticalSearch:2,
    maxDepthFt:Math.max(70,Math.min(180,(Number(site.lengthFt)||60)*1.8)),
  });
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  if(result.metrics.validCount<45||result.metrics.triangleCount<30){
    group.userData={mode:'metric-stereo-scan',ready:false,error:'not-enough-overlap',metrics:stereoReconstructionSummary(result),setNight(){}};
    return group;
  }

  // Use the real lower-image palette only as a neutral support surface for
  // holes outside the reconstructed mesh. No invented trees/houses are added.
  const siteWidth=Math.max(20,Number(site.widthFt)||50),siteLength=Math.max(20,Number(site.lengthFt)||60);
  const groundColor=averageLowerColor(center),groundDay=groundColor.clone();
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

  // Use a sparse surfel layer to keep thin depth features (tree branches,
  // fence posts) visible even when the conservative mesh refuses triangles
  // across a depth discontinuity.
  const pts=[],cols=[];
  for(let i=0;i<result.valid.length;i++){
    if(!result.valid[i]||result.confidence[i]<.20)continue;
    pts.push(result.positions[i*3],result.positions[i*3+1],result.positions[i*3+2]);
    cols.push(result.colors[i*3],result.colors[i*3+1],result.colors[i*3+2]);
  }
  if(pts.length){
    const pg=new THREE.BufferGeometry();
    pg.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
    pg.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));
    const pm=new THREE.PointsMaterial({size:mobile?.32:.24,sizeAttenuation:true,vertexColors:true,transparent:true,opacity:.72,depthWrite:true});
    const points=new THREE.Points(pg,pm);points.name='Metric venue reconstruction surfels';points.position.copy(mesh.position);points.renderOrder=-1;group.add(points);
  }

  geometry.computeBoundingBox();
  const worldBounds=geometry.boundingBox?{
    min:{x:geometry.boundingBox.min.x,y:geometry.boundingBox.min.y,z:geometry.boundingBox.min.z-siteLength/2-8},
    max:{x:geometry.boundingBox.max.x,y:geometry.boundingBox.max.y,z:geometry.boundingBox.max.z-siteLength/2-8}
  }:null;
  const summary=stereoReconstructionSummary(result);
  group.userData={
    mode:'metric-stereo-scan',
    ready:true,
    metric:true,
    baselineFt,
    captureConeDeg:118,
    knownBounds:worldBounds,
    metrics:summary,
    sourceFrames:[frames.left.id,frames.center.id,frames.right.id].filter(Boolean),
    cameraOrigin:{x:0,y:Number(scan.eyeHeightFt)||5.6,z:-siteLength/2-8},
    setNight(value){
      material.color.setScalar(value?.48:1);
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
