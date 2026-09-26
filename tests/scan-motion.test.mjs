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
  assert.ok(Math.abs(path.offsetFactors[0]+7/18)<.035);
  assert.equal(path.offsetFactors[3],0);
  assert.ok(Math.abs(path.offsetFactors[6]-11/18)<.035);
  assert.ok(Math.abs(path.offsetFactors[6]-path.offsetFactors[0]-1)<.001,'total entered baseline is preserved');
  assert.ok(path.offsetFactors[1] < -.25 && path.offsetFactors[1] > -.45);
  assert.ok(path.offsetFactors[4] > .12 && path.offsetFactors[4] < .22);
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

function transformed(source,{dx=0,dy=0,rollDeg=0}={}){
  const {width,height}=source,data=new Uint8ClampedArray(width*height*4),cx=(width-1)/2,cy=(height-1)/2,r=rollDeg*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
  for(let i=3;i<data.length;i+=4)data[i]=255;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const ux=x-dx-cx,uy=y-dy-cy;
    const sx=Math.round(c*ux+s*uy+cx),sy=Math.round(-s*ux+c*uy+cy);
    if(sx<0||sy<0||sx>=width||sy>=height)continue;
    const src=(sy*width+sx)*4,dst=(y*width+x)*4;
    for(let ch=0;ch<3;ch++)data[dst+ch]=source.data[src+ch];
  }
  return {width,height,data};
}

test('feature tracking estimates camera roll across the scan path',()=>{
  const base=textured(144,96),positions=[0,2,5,7,10,14,18],rolls=[-2.4,-1.6,-.8,0,.7,1.4,2.1];
  const frames=positions.map((x,i)=>transformed(base,{dx:x,rollDeg:rolls[i]}));
  const path=estimateTrackedCameraPath(frames,{centerIndex:3});
  assert.equal(path.usable,true);
  assert.equal(path.framePoses.length,7);
  assert.equal(path.framePoses[3].rollDeg,0);
  assert.ok(path.framePoses.some((p,i)=>i!==3&&Math.abs(p.rollDeg)>.35),'non-center frames retain tracked roll');
  assert.equal(path.poseAxes.roll,'tracked-similarity');
  assert.equal(path.poseAxes.yaw,'unresolved');
});
