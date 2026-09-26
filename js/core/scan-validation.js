// A held-out check can corroborate ONE measured segment. It cannot certify a
// whole property, establish camera pose, or turn guessed surfaces into evidence.
// This module never feeds the entered distance back into reconstruction/scale.
const finite=value=>value!==null&&value!==''&&Number.isFinite(Number(value));
const point=value=>value&&finite(value.u)&&finite(value.v)&&Number(value.u)>=0&&Number(value.u)<=1&&Number(value.v)>=0&&Number(value.v)<=1?{u:Number(value.u),v:Number(value.v)}:null;
export function normalizeScanCheck(value){
  const v=value&&typeof value==='object'?value:{};
  return {version:1,a:point(v.a),b:point(v.b),distanceFt:finite(v.distanceFt)&&Number(v.distanceFt)>0&&Number(v.distanceFt)<=500?Number(v.distanceFt):null,sourceFrameId:typeof v.sourceFrameId==='string'?v.sourceFrameId.slice(0,1600):null};
}
export const SCAN_MEASUREMENT_POLICY=Object.freeze({scope:'held-out-segment-only',siteDimensionsVerified:false,mayClaimMetricAccuracy:false});

export function scanInputFingerprint(value){
  // A reproducibility key, not a security signature. No persisted verdict is
  // trusted: every verdict is recomputed from the current job's numeric output.
  const text=JSON.stringify(value);let hash=2166136261;
  for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return 'scan-v2-'+(hash>>>0).toString(16);
}
export function scanFrameFingerprint(frames){
  // Include decoded working pixels: a reused URL/ID is not proof that the
  // current image still contains the cached geometry's original evidence.
  return (frames||[]).map(frame=>{
    let hash=2166136261;for(const value of frame.data||[])hash=Math.imul(hash^value,16777619);
    return frame.width+'x'+frame.height+':'+(hash>>>0).toString(16);
  }).join('|');
}
function barycentric(p,a,b,c){
  const den=(b.v-c.v)*(a.u-c.u)+(c.u-b.u)*(a.v-c.v);if(Math.abs(den)<1e-10)return null;
  const wa=((b.v-c.v)*(p.u-c.u)+(c.u-b.u)*(p.v-c.v))/den;
  const wb=((c.v-a.v)*(p.u-c.u)+(a.u-c.u)*(p.v-c.v))/den,wc=1-wa-wb;
  return [wa,wb,wc].every(w=>w>=-1e-6&&w<=1+1e-6)?[wa,wb,wc]:null;
}
export function sampleObservedScanPoint(result,uv){
  const p=point(uv),r=result;if(!p||!r?.measurementPositions||!r?.observed||!r?.bilateral||!r?.indices||!r?.uvs)return null;
  const positions=r.measurementPositions;
  for(let i=0;i<r.indices.length;i+=3){
    const ids=[r.indices[i],r.indices[i+1],r.indices[i+2]];
    const weights=barycentric(p,...ids.map(j=>({u:r.uvs[j*2],v:1-r.uvs[j*2+1]})));
    if(!weights)continue;
    // Never nearest-neighbour snap over an unknown patch or use hole-filled data.
    if(ids.some(j=>!r.observed[j]||!r.bilateral[j]||r.supportViews?.[j]<2||!(r.confidence?.[j]>=.18)||!(r.disparities?.[j]>=4)))continue;
    const depths=ids.map(j=>positions[j*3+2]);
    if(depths.some(d=>!Number.isFinite(d)||d<=0)||Math.max(...depths)-Math.min(...depths)>Math.max(.75,Math.min(...depths)*.08))continue;
    // Screen-space barycentric weights require inverse-depth correction.
    // Linear XYZ interpolation biases a click on a sloped surface.
    const perspective=weights.map((weight,i)=>weight/depths[i]),sum=perspective.reduce((a,b)=>a+b,0);
    const xyz=[0,1,2].map(axis=>ids.reduce((value,j,k)=>value+positions[j*3+axis]*perspective[k]/sum,0));
    if(!xyz.every(Number.isFinite))continue;
    return {xyz,triangle:ids,confidence:Math.min(...ids.map(j=>r.confidence[j])),supportViews:Math.min(...ids.map(j=>r.supportViews[j])),minDisparityPx:Math.min(...ids.map(j=>r.disparities[j]))};
  }
  return null;
}
export function scanPoseEvidence(path){
  const pairs=(path?.pairs||[]).map(p=>p.motion||p).filter(p=>Number.isFinite(p.poseFitError));
  const worstFit=pairs.length?Math.max(...pairs.map(p=>p.poseFitError)):null;
  const minTracks=pairs.length?Math.min(...pairs.map(p=>p.trackCount||0)):0;
  const scaleChange=pairs.length?Math.max(...pairs.map(p=>Math.abs(1-(p.similarityScale??1)))):null;
  const eligible=!!path?.usable&&pairs.length>=2&&(path.consistency??0)>=.80&&(path.meanQuality??0)>=.30&&minTracks>=8&&worstFit<=2.4&&scaleChange<=.06;
  return {eligible,method:path?.method||'unresolved',trackedPairs:pairs.length,minTracks,worstFitPx:worstFit,maxScaleChange:scaleChange,quality:path?.meanQuality??null,consistency:path?.consistency??null,unresolvedAxes:['translationY','translationZ','yaw','pitch']};
}
export function evaluateScanValidation(result,{check,captureQuality,trackedPath,sourceFrameId,inputFingerprint}={}){
  const c=normalizeScanCheck(check),total=result?.valid?.length||0;
  const observed=result?.observed?Array.from(result.observed).reduce((n,v)=>n+(v?1:0),0):0;
  const bilateral=result?.bilateral?Array.from(result.bilateral).reduce((n,v)=>n+(v?1:0),0):0;
  const pose=scanPoseEvidence(trackedPath);
  const report={version:1,status:'insufficient',label:'Independent check needed',scope:'held-out-segment-only',metric:false,measuredFt:c.distanceFt,predictedFt:null,residualFt:null,relativeError:null,toleranceFt:null,reasons:[],inputFingerprint:inputFingerprint||null,checkFingerprint:scanInputFingerprint(c),evidence:{coverageScope:'sampled-depth-grid',observedSamples:observed,totalSamples:total,observedCoverage:total?observed/total:0,bilateralCoverage:total?bilateral/total:0,captureScore:captureQuality?.score??null,pose},measurementPolicy:{...SCAN_MEASUREMENT_POLICY}};
  function stop(label,reason,status='insufficient'){report.status=status;report.label=label;report.reasons.push(reason);return report;}
  if(!result)return stop('Depth evidence unavailable','Open the scan preview to reconstruct the captured images.');
  if(captureQuality?.usable!==true)return stop('Recapture needed','Capture checks did not pass. Retake a slow sideways scan with sharp, overlapping views.');
  if(!pose.eligible)return stop('Camera motion needs a better capture','Keep the same scene centered, keep the phone level and move sideways. The tracked path is too weak or inconsistent for this check.');
  if(total<45||observed/total<.20||bilateral/total<.15)return stop('Not enough supported geometry','Only observed depth agreed by both sides may support this check. Add textured, overlapping views.');
  if(!c.a||!c.b||!c.distanceFt)return stop('Independent check needed','Mark two visible physical points in the center image and enter their independently measured distance. Do not use the camera travel distance.');
  if(!sourceFrameId||c.sourceFrameId!==sourceFrameId)return stop('Check belongs to a different capture','Mark the two endpoints again on the current center image.');
  const pixelSpan=Math.hypot((c.a.u-c.b.u)*(result.width-1),(c.a.v-c.b.v)*(result.height-1));
  if(c.distanceFt<3||pixelSpan<12)return stop('Use a longer check distance','Use a measured segment at least 3 ft long with clearly separated image endpoints.');
  const a=sampleObservedScanPoint(result,c.a),b=sampleObservedScanPoint(result,c.b);
  if(!a||!b)return stop('Endpoints need stronger depth evidence','One or both points cross missing, interpolated, low-confidence or inconsistent depth. Choose clear textured surfaces or recapture.');
  const predicted=Math.hypot(...a.xyz.map((v,i)=>v-b.xyz[i])),residual=predicted-c.distanceFt,tolerance=Math.max(.25,c.distanceFt*.05);
  Object.assign(report,{predictedFt:predicted,residualFt:residual,relativeError:Math.abs(residual)/c.distanceFt,toleranceFt:tolerance});
  report.evidence.endpoints={a,b};
  if(Math.abs(residual)>tolerance)return stop('Independent check failed','The reconstructed distance differs from the separate physical measurement by more than 5% (minimum 0.25 ft). Review baseline and endpoints, or recapture.','failed');
  return stop('Independent check within tolerance','Only this segment passed. Camera pose and other surfaces remain estimated; verify installation dimensions on site.','valid');
}
