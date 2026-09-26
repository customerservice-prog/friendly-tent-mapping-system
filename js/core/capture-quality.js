// Capture checks reject unusable inputs; they do not establish metric accuracy.
function gray(frame){
 const out=new Float32Array((frame?.width||0)*(frame?.height||0));
 for(let i=0,j=0;i<(frame?.data?.length||0);i+=4,j++)out[j]=.2126*frame.data[i]+.7152*frame.data[i+1]+.0722*frame.data[i+2];
 return out;
}
function mean(values){let total=0;for(const v of values)total+=v;return total/Math.max(1,values.length);}
export function estimateFrameTranslation(reference,target,{maxXFraction=.18,maxYFraction=.18}={}){
 const w=Number(reference?.width)||0,h=Number(reference?.height)||0;
 if(!w||!h||target?.width!==w||target?.height!==h||!reference?.data||!target?.data)return null;
 const a=gray(reference),b=gray(target),ma=mean(a),mb=mean(b);
 const maxDx=Math.max(2,Math.min(Math.floor(w*.24),Math.round(w*maxXFraction)));
 const maxDy=Math.max(2,Math.min(Math.floor(h*.16),Math.round(h*maxYFraction)));
 let best={dx:0,dy:0,score:Infinity,samples:0};
 const scoreAt=(dx,dy,stride)=>{
  let error=0,n=0;
  const x0=maxDx+2,x1=w-maxDx-2,y0=maxDy+2,y1=h-maxDy-2;
  for(let y=y0;y<y1;y+=stride)for(let x=x0;x<x1;x+=stride){
   const av=a[y*w+x]-ma,bv=b[(y+dy)*w+(x+dx)]-mb;
   error+=Math.min(90,Math.abs(av-bv));n++;
  }
  return {score:n?error/n:Infinity,samples:n};
 };
 // Coarse search finds the motion basin cheaply, then a local full-pixel pass
 // avoids aliasing odd-pixel phone movement. Horizontal motion is searched but
 // intentionally not applied to stereo because horizontal disparity is depth.
 const coarseStride=w*h>18000?5:w*h>7000?4:3;
 for(let dy=-maxDy;dy<=maxDy;dy+=2)for(let dx=-maxDx;dx<=maxDx;dx+=2){
  const hit=scoreAt(dx,dy,coarseStride);
  if(hit.score<best.score)best={dx,dy,...hit};
 }
 const coarse={...best},fineStride=w*h>18000?4:w*h>7000?3:2;
 for(let dy=Math.max(-maxDy,coarse.dy-3);dy<=Math.min(maxDy,coarse.dy+3);dy++){
  for(let dx=Math.max(-maxDx,coarse.dx-3);dx<=Math.min(maxDx,coarse.dx+3);dx++){
   const hit=scoreAt(dx,dy,fineStride);
   if(hit.score<best.score)best={dx,dy,...hit};
  }
 }
 if(!Number.isFinite(best.score))return null;
 const overlap=Math.max(0,Math.min(1,(1-Math.abs(best.dx)/w)*(1-Math.abs(best.dy)/h)));
 return {...best,overlap};
}
export function assessCaptureFrames(frames){
 const issues=[];
 if(!Array.isArray(frames)||frames.length<3)return {usable:false,issues:['Capture at least three overlapping viewpoints.'],accuracy:'unverified',alignments:[]};
 const images=frames.map(gray);
 images.forEach((a,index)=>{const m=mean(a),variance=a.reduce((s,v)=>s+(v-m)**2,0)/Math.max(1,a.length);if(m<12||m>246)issues.push(`View ${index+1} is too dark or overexposed.`);if(variance<16)issues.push(`View ${index+1} has too little visible texture.`);});
 const alignments=[];
 for(let i=1;i<images.length;i++){
  const a=images[i-1],b=images[i];if(a.length!==b.length)continue;
  const difference=a.reduce((s,v,j)=>s+Math.abs(v-b[j]),0)/Math.max(1,a.length);
  if(difference<.5)issues.push(`Views ${i} and ${i+1} appear identical. Move sideways to capture a new viewpoint.`);
  const alignment=estimateFrameTranslation(frames[i-1],frames[i]);alignments.push(alignment);
  if(alignment){
   // Real lateral parallax can produce a fairly high photometric score even when
   // the same scene is still well registered. Only reject unmistakably bad
   // correspondence here; stereo confidence performs the finer per-point test.
   if(alignment.score>82||alignment.overlap<.55)issues.push(`Views ${i} and ${i+1} do not overlap clearly enough. Keep the same yard features in view while moving sideways.`);
   const verticalLimit=Math.max(5,frames[i].height*.10);
   if(Math.abs(alignment.dy)>verticalLimit)issues.push(`Views ${i} and ${i+1} move too far up or down. Keep the phone level while moving sideways.`);
  }
 }
 return {usable:issues.length===0,issues,accuracy:'unverified',scaleSource:'user-entered baseline',cameraPoses:'registered-vertical-assumed-horizontal',alignments};
}
