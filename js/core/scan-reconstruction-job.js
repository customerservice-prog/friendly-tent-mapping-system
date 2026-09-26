import { assessCaptureFrames } from './capture-quality.js';
import { estimateTrackedCameraPath } from './scan-motion.js';
import { reconstructStereoGrid, reconstructMultiViewGrid, fuseMultiReferenceSurfels } from './stereo-reconstruction.js';

// Pure, runnable worker boundary. validationCheck is deliberately absent:
// the separate physical measurement must never fit scale or camera parameters.
export function reconstructScanJob({frames,offsetFactors=[],centerIndex=Math.floor((frames?.length||0)/2),baselineFt=6,fovDeg=62,horizonY=.34,eyeHeightFt=5.6,maxDepthFt=108,mobile=false}={}){
  const captureQuality=assessCaptureFrames(frames);
  if(!captureQuality.usable)return {result:null,fusion:null,captureQuality,trackedPath:null,error:'capture-quality'};
  const trackedPath=estimateTrackedCameraPath(frames,{centerIndex});
  const common={fovDeg,horizonY,eyeHeightFt,maxDepthFt,step:mobile?5:4,patchRadius:2};
  let result,fusion=null,factors=offsetFactors.slice(),reconstructionMode='stereo-3';
  if(frames.length>=5){
    if(trackedPath.usable&&trackedPath.offsetFactors.length===frames.length)factors=trackedPath.offsetFactors;
    if(factors.length!==frames.length)throw new Error('Scan sample offsets must match the captured frames.');
    const captures=frames.map((image,i)=>({image,offsetFt:factors[i]*baselineFt,rollRad:(Number(trackedPath.framePoses?.[i]?.rollDeg)||0)*Math.PI/180}));
    result=reconstructMultiViewGrid({...common,center:frames[centerIndex],views:captures.filter((_,i)=>i!==centerIndex),maxDisparity:mobile?22:30,verticalSearch:3});
    fusion=fuseMultiReferenceSurfels({...common,captures,primaryIndex:centerIndex,primaryResult:result,referenceIndices:[centerIndex-2,centerIndex,centerIndex+2],step:mobile?7:6,maxDisparity:mobile?20:28,verticalSearch:3,minConfidence:.10,voxelFt:mobile?.56:.42});
    reconstructionMode=(trackedPath.usable?'feature-tracked-':'timed-')+'multireference-'+frames.length;
  }else{
    if(frames.length!==3)throw new Error('A scan needs three images or at least five video frames.');
    if(trackedPath.usable){
      factors=trackedPath.offsetFactors;
      result=reconstructMultiViewGrid({...common,center:frames[1],views:[0,2].map(i=>({image:frames[i],offsetFt:factors[i]*baselineFt})),maxDisparity:mobile?20:26,verticalSearch:2});
      reconstructionMode='feature-tracked-stereo-3';
    }else result=reconstructStereoGrid({...common,left:frames[0],center:frames[1],right:frames[2],baselineFt,maxDisparity:mobile?20:26,verticalSearch:2});
  }
  return {result,fusion,captureQuality,trackedPath,offsetFactors:factors,reconstructionMode,error:null};
}
