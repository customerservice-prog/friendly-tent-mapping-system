import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTrackedCameraPath } from '../js/core/scan-motion.js';

function textured(width=128,height=80){
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const v=(x*29+y*43+x*y*3+(x%9)*31+(y%7)*17)%256,i=(y*width+x)*4;
    data[i]=v;data[i+1]=(v*5+37)%256;data[i+2]=(v*7+83)%256;data[i+3]=255;
  }
  return {width,height,data};
}
function shifted(source,dx,dy=0){
  const {width,height}=source,data=new Uint8ClampedArray(width*height*4);
  for(let i=3;i<data.length;i+=4)data[i]=255;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const tx=x+dx,ty=y+dy;if(tx<0||ty<0||tx>=width||ty>=height)continue;
    const src=(y*width+x)*4,dst=(ty*width+tx)*4;
    for(let c=0;c<3;c++)data[dst+c]=source.data[src+c];
  }
  return {width,height,data};
}

test('feature-tracked camera path follows variable walking speed instead of equal timestamps',()=>{
  const base=textured(),positions=[0,2,5,7,10,14,18];
  const frames=positions.map((x,i)=>shifted(base,x,i%2));
  const path=estimateTrackedCameraPath(frames,{centerIndex:3});
  assert.equal(path.usable,true);
  assert.equal(path.offsetFactors.length,7);
  assert.equal(path.offsetFactors[0],-.5);
  assert.equal(path.offsetFactors[3],0);
  assert.equal(path.offsetFactors[6],.5);
  assert.ok(path.offsetFactors[1] < -.25 && path.offsetFactors[1] > -.45);
  assert.ok(path.offsetFactors[4] > .08 && path.offsetFactors[4] < .22);
  assert.ok(path.offsetFactors[5] > path.offsetFactors[4]);
  assert.ok(path.totalTracks>20);
  assert.ok(path.consistency>.7);
});

test('feature tracking rejects a non-monotonic camera path',()=>{
  const base=textured(),positions=[0,3,1,4,2,5,3];
  const frames=positions.map(x=>shifted(base,x,0));
  const path=estimateTrackedCameraPath(frames,{centerIndex:3});
  assert.equal(path.usable,false);
  assert.equal(path.reason,'camera-path-not-monotonic');
});
