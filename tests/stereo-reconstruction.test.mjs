import test from 'node:test';
import assert from 'node:assert/strict';
import { reconstructStereoGrid, stereoReconstructionSummary } from '../js/core/stereo-reconstruction.js';

function image(width,height,fn){
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const [r,g,b]=fn(x,y),i=(y*width+x)*4;
    data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=255;
  }
  return {width,height,data};
}
function shiftedTriplet(width=96,height=64,disparity=5){
  const center=image(width,height,(x,y)=>{
    const v=(x*37+y*53+x*y*7+(x%7)*29+(y%5)*17)%256;
    return [v,(v*3+41)%256,(v*5+73)%256];
  });
  const blank=()=>new Uint8ClampedArray(width*height*4);
  const left={width,height,data:blank()},right={width,height,data:blank()};
  for(let i=3;i<left.data.length;i+=4){left.data[i]=255;right.data[i]=255;}
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const src=(y*width+x)*4;
    const lx=x+disparity,rx=x-disparity;
    if(lx<width){const dst=(y*width+lx)*4;for(let c=0;c<3;c++)left.data[dst+c]=center.data[src+c];}
    if(rx>=0){const dst=(y*width+rx)*4;for(let c=0;c<3;c++)right.data[dst+c]=center.data[src+c];}
  }
  return {left,center,right};
}

test('three lateral captures reconstruct metric depth from disparity',()=>{
  const triplet=shiftedTriplet();
  const result=reconstructStereoGrid({...triplet,baselineFt:6,fovDeg:60,horizonY:.35,step:4,maxDisparity:12,minConfidence:.06});
  assert.ok(result.metrics.validCount>80,'enough real image samples become depth points');
  assert.ok(result.metrics.triangleCount>40,'depth samples form actual connected 3D surfaces');
  const expected=result.focalPx*3/5;
  assert.ok(Math.abs(result.metrics.medianDepthFt-expected)<expected*.22,'median depth should follow stereo geometry');
  assert.equal(result.baselineFt,6);
  assert.ok(result.positions.some(v=>Math.abs(v)>1),'reconstruction produces non-flat XYZ coordinates');
  const summary=stereoReconstructionSummary(result);
  assert.ok(summary.coveragePct>10);
  assert.ok(summary.triangles>0);
});

test('a textureless capture is not pretended to be a 3D scan',()=>{
  const flat=image(96,64,()=>[120,120,120]);
  const result=reconstructStereoGrid({left:flat,center:flat,right:flat,baselineFt:6,step:4,maxDisparity:12});
  assert.equal(result.metrics.validCount,0);
  assert.equal(result.metrics.quality,'weak');
  assert.equal(result.indices.length,0);
});
