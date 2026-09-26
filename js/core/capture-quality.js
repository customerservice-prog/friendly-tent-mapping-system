// Capture checks reject unusable inputs; they do not establish metric accuracy.
export function assessCaptureFrames(frames){
 const issues=[];
 if(!Array.isArray(frames)||frames.length<3)return {usable:false,issues:['Capture at least three overlapping viewpoints.'],accuracy:'unverified'};
 const gray=frame=>{const out=[];for(let i=0;i<frame.data.length;i+=4)out.push(.2126*frame.data[i]+.7152*frame.data[i+1]+.0722*frame.data[i+2]);return out;};
 const images=frames.map(gray);
 images.forEach((a,index)=>{const mean=a.reduce((x,y)=>x+y,0)/Math.max(1,a.length),variance=a.reduce((s,v)=>s+(v-mean)**2,0)/Math.max(1,a.length);if(mean<12||mean>246)issues.push(`View ${index+1} is too dark or overexposed.`);if(variance<16)issues.push(`View ${index+1} has too little visible texture.`);});
 for(let i=1;i<images.length;i++){const a=images[i-1],b=images[i];if(a.length!==b.length)continue;const difference=a.reduce((s,v,j)=>s+Math.abs(v-b[j]),0)/Math.max(1,a.length);if(difference<.5)issues.push(`Views ${i} and ${i+1} appear identical. Move sideways to capture a new viewpoint.`);}
 return {usable:issues.length===0,issues,accuracy:'unverified',scaleSource:'user-entered baseline',cameraPoses:'assumed'};
}
