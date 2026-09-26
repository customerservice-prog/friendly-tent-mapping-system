// Capture checks reject unusable inputs; they do not establish metric accuracy.
function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function grayFrame(frame){
  const out=new Float32Array((frame?.data?.length||0)/4);
  const data=frame?.data||[];
  for(let i=0,j=0;i<data.length;i+=4,j++)out[j]=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
  return {pixels:out,width:Number(frame?.width)||0,height:Number(frame?.height)||0};
}
function frameStats(frame){
  const {pixels,width,height}=grayFrame(frame);
  if(!pixels.length||!width||!height)return {mean:0,variance:0,sharpness:0};
  let sum=0;for(const v of pixels)sum+=v;const mean=sum/pixels.length;
  let variance=0;for(const v of pixels)variance+=(v-mean)**2;variance/=pixels.length;
  let lap=0,count=0;
  for(let y=1;y<height-1;y+=2)for(let x=1;x<width-1;x+=2){
    const i=y*width+x,v=4*pixels[i]-pixels[i-1]-pixels[i+1]-pixels[i-width]-pixels[i+width];
    lap+=v*v;count++;
  }
  return {mean,variance,sharpness:count?lap/count:0};
}
function meanDifference(a,b){
  if(!a?.data||!b?.data||a.data.length!==b.data.length)return null;
  let total=0,count=0;
  for(let i=0;i<a.data.length;i+=16){
    const ga=.2126*a.data[i]+.7152*a.data[i+1]+.0722*a.data[i+2];
    const gb=.2126*b.data[i]+.7152*b.data[i+1]+.0722*b.data[i+2];
    total+=Math.abs(ga-gb);count++;
  }
  return count?total/count:null;
}
function registeredOverlap(a,b){
  // Unregistered same-pixel correlation rejects exactly the lateral parallax
  // a scan needs. Search a bounded translation before assessing shared texture.
  const aa=grayFrame(a),bb=grayFrame(b),w=aa.width,h=aa.height;
  if(!w||!h||w!==bb.width||h!==bb.height)return {correlation:0,dx:0,dy:0};
  const maxX=Math.min(28,Math.round(w*.20)),maxY=Math.min(8,Math.round(h*.08));let best={correlation:-1,dx:0,dy:0};
  for(let dy=-maxY;dy<=maxY;dy++)for(let dx=-maxX;dx<=maxX;dx++){
    let sa=0,sb=0,saa=0,sbb=0,sab=0,n=0;
    for(let y=maxY+2;y<h-maxY-2;y+=4)for(let x=maxX+2;x<w-maxX-2;x+=4){
      const va=aa.pixels[y*w+x],vb=bb.pixels[(y+dy)*w+x+dx];sa+=va;sb+=vb;saa+=va*va;sbb+=vb*vb;sab+=va*vb;n++;
    }
    const da=saa-sa*sa/Math.max(1,n),db=sbb-sb*sb/Math.max(1,n),correlation=da>0&&db>0?(sab-sa*sb/n)/Math.sqrt(da*db):-1;
    if(correlation>best.correlation)best={correlation,dx,dy};
  }
  return best;
}
export function assessCaptureFrames(frames){
  const issues=[],warnings=[];
  if(!Array.isArray(frames)||frames.length<3)return {usable:false,issues:['Capture at least three overlapping viewpoints.'],warnings,score:0,accuracy:'unverified'};
  const stats=frames.map(frameStats);
  stats.forEach((s,index)=>{
    if(s.mean<12||s.mean>246)issues.push(`View ${index+1} is too dark or overexposed.`);
    if(s.variance<16)issues.push(`View ${index+1} has too little visible texture.`);
    if(s.sharpness<18)issues.push(`View ${index+1} is too blurry. Move more slowly and keep the phone steady.`);
    else if(s.sharpness<34)warnings.push(`View ${index+1} is a little soft; a steadier scan will improve depth.`);
  });
  const differences=[],correlations=[],registrations=[];
  for(let i=1;i<frames.length;i++){
    const difference=meanDifference(frames[i-1],frames[i]);if(difference!=null)differences.push(difference);
    const registration=registeredOverlap(frames[i-1],frames[i]),correlation=registration.correlation;registrations.push(registration);if(correlation!=null)correlations.push(correlation);
    if(difference!=null&&difference<.7)issues.push(`Views ${i} and ${i+1} appear almost identical. Move sideways to capture a new viewpoint.`);
    if(difference!=null&&difference>46)warnings.push(`Views ${i} and ${i+1} changed a lot. Keep the same area centered while moving sideways.`);
    if(correlation!=null&&correlation<.18)issues.push(`Views ${i} and ${i+1} do not overlap enough. Keep the same yard features visible in every view.`);
  }
  const avgSharp=stats.reduce((s,v)=>s+Math.min(90,v.sharpness),0)/stats.length;
  const avgTexture=stats.reduce((s,v)=>s+Math.min(160,v.variance),0)/stats.length;
  const motion=differences.length?differences.reduce((s,v)=>s+v,0)/differences.length:0;
  const overlap=correlations.length?correlations.reduce((s,v)=>s+clamp(v,-1,1),0)/correlations.length:0;
  let score=Math.round(
    clamp(avgSharp/70,0,1)*30+
    clamp(avgTexture/120,0,1)*20+
    clamp((motion-1)/18,0,1)*20+
    clamp((overlap-.15)/.65,0,1)*30
  );
  if(issues.length)score=Math.min(score,54);
  const usable=issues.length===0&&score>=55;
  if(!issues.length&&score<55)warnings.push('The capture is usable only as a rough preview. A slower, steadier scan with more shared detail will improve it.');
  return {
    usable,issues,warnings,score,
    rating:score>=82?'strong':score>=68?'good':score>=55?'fair':'poor',
    accuracy:'unverified',
    scaleSource:'user-entered baseline',
    cameraPoses:'assumed',
    metrics:{averageSharpness:Math.round(avgSharp),averageTexture:Math.round(avgTexture),averageFrameDifference:Number(motion.toFixed(1)),averageOverlap:Number(overlap.toFixed(2)),overlapMethod:'translation-compensated-correlation',registrations}
  };
}

export function scanCaptureGuidance({quality,path,validation}={}){
  if(quality?.issues?.length)return {action:'retake',title:'Improve the capture',steps:quality.issues.slice(0,3)};
  if(path&&!path.usable)return {action:'retake',title:'Keep one steady sideways path',steps:['Move in one direction with the phone level. Do not pan in place.','Keep the same textured features visible across every frame.','Measure the total camera travel independently from the check segment.']};
  if(validation?.status==='failed')return {action:'review-check',title:'Review the independent distance',steps:validation.reasons};
  if(validation?.status==='valid')return {action:'verify-site',title:'One segment checked',steps:['The checked segment agrees within tolerance. Other surfaces and installation clearances still need on-site verification.']};
  return {action:'add-check',title:'Check a separate physical distance',steps:['Choose two visible points at least 3 ft apart in the center photo.','Measure their direct distance with a tape or laser. Do not reuse the camera travel distance.','Mark those points and compare the scan prediction before relying on scale.']};
}
