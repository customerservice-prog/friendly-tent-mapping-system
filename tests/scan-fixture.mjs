// Deterministic fronto-parallel surfaces with known depth and independent
// camera translation. Distances come from fixture geometry, never solver output.
export function knownScan({width=128,height=80,disparity=8,variedDepth=false,offsets=[-3,0,3]}={}){
  const center={width,height,data:new Uint8ClampedArray(width*height*4)};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const v=(x*37+y*53+x*y*7+(x%7)*29+(y%5)*17)%256,i=(y*width+x)*4;
    center.data.set([v,(v*3+41)%256,(v*5+73)%256,255],i);
  }
  const frames=offsets.map(offset=>{
    const data=new Uint8ClampedArray(width*height*4);
    for(let i=3;i<data.length;i+=4)data[i]=255;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const d=variedDepth&&y<height/2?disparity/2:disparity,tx=x-Math.round(offset*d/3);
      if(tx>=0&&tx<width)data.set(center.data.subarray((y*width+x)*4,(y*width+x)*4+4),(y*width+tx)*4);
    }
    return {width,height,data};
  });
  const a={u:.35,v:.72},b={u:.65,v:.72};
  return {frames,check:{version:1,a,b,distanceFt:3/disparity*(width-1)*(b.u-a.u),sourceFrameId:'center-fixture'},input:{frames,centerIndex:offsets.indexOf(0),offsetFactors:offsets.map(v=>v/6),baselineFt:6,fovDeg:60,horizonY:.35,eyeHeightFt:5.6,maxDepthFt:120,mobile:false}};
}
