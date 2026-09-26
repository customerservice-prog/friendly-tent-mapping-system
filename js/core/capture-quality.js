// Capture checks reject unusable inputs; they do not establish metric accuracy.
function gray(frame){
 const out=new Float32Array((frame?.width||0)*(frame?.height||0));
 for(let i=0,j=0;i<(frame?.data?.length||0);i+=4,j++)out[j]=.2126*frame.data[i]+.7152*frame.data[i+1]+.0722*frame.data[i+2];
 return out;
}
function mean(values){let total=0;for(const v of values)total+=v;return total/Math.max(1,values.length);}
export function estimateFrameTranslation(reference,target,{maxXFraction=.18,maxYFraction=.10}={}){
 const w=Number(reference?.width)||0,h=Number(reference?.height)||0;
 if(!w||!h||target?.width!==w||target?.height!==h||!reference?.data||!target?.data)return null;
 const a=gray(reference),b=gray(target),ma=mean(a),mb=mean(b);
 const maxDx=Math.max(2,Math.min(Math.floor(w*.24),Math.round(w*maxXFraction)));
 const maxDy=Math.max(2,Math.min(Math.floor(h*.16),Math.round(h*maxYFraction)));
 const stride=w*h>18000?4:w*h>7000?3:2;
 let best={dx:0,dy:0,score:Infinity,samples:0};
 // A coarse global registration estimates camera bob/tilt. Horizontal motion is
 // searched but intentionally not applied to stereo because horizontal disparity
 // is the depth signal. Only the vertical component is used for rectification.
 for(let dy=-maxDy;dy<=maxDy;dy++){
  for(let dx=-maxDx;dx<=maxDx;dx+=2){
   let error=0,n=0;
   const x0=maxDx+2,x1=w-maxDx-2,y0=maxDy+2,y1=h-maxDy-2;
   for(let y=y0;y<y1;y+=stride)for(let x=x0;x<x1;x+=stride){
    const av=a[y*w+x]-ma,bv=b[(y+dy)*w+(x+dx)]-mb;
    error+=Math.min(90,Math.abs(av-bv));n++;
   }
   if(!n)continue;
   const score=error/n;
   if(score<best.score)best={dx,dy,score,samples:n};
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
   if(alignment.score>62)issues.push(`Views ${i} and ${i+1} do not overlap clearly enough. Keep the same yard features in view while moving sideways.`);
   const verticalLimit=Math.max(5,frames[i].height*.10);
   if(Math.abs(alignment.dy)>verticalLimit)issues.push(`Views ${i} and ${i+1} move too far up or down. Keep the phone level while moving sideways.`);
  }
 }
 return {usable:issues.length===0,issues,accuracy:'unverified',scaleSource:'user-entered baseline',cameraPoses:'registered-vertical-assumed-horizontal',alignments};
}
