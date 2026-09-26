import test from 'node:test';
import assert from 'node:assert/strict';
import { reconstructStereoGrid, reconstructMultiViewGrid, fuseMultiReferenceSurfels, stereoReconstructionSummary, stereoObstacleRects } from '../js/core/stereo-reconstruction.js';

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


test('elevated metric depth clusters become conservative property obstacles',()=>{
  const positions=new Float32Array([
    -1.5,4,20, -1.2,4.5,20.2,
      .4,5,20,   .7,5.5,20.2,
      .8,4.2,20.4, -1.1,3.8,20.4
  ]);
  const valid=new Uint8Array([1,1,1,1,1,1]);
  const confidence=new Float32Array([.8,.82,.84,.81,.79,.83]);
  const rects=stereoObstacleRects({positions,valid,confidence},{siteWidthFt:20,siteLengthFt:20,cameraOffsetZ:-18,cellFt:2});
  assert.ok(rects.length>=1);
  assert.equal(rects[0].source,'metric-depth');
  assert.ok(rects[0].heightFt>=4);
  assert.ok(rects[0].widthFt>0&&rects[0].depthFt>0);
});

test('ground-height depth samples are not turned into blocking geometry',()=>{
  const positions=new Float32Array([-1,.2,20,-.8,.3,20.1,1,.1,20,1.2,.2,20.1]);
  const valid=new Uint8Array([1,1,1,1]),confidence=new Float32Array([.9,.9,.9,.9]);
  const rects=stereoObstacleRects({positions,valid,confidence},{siteWidthFt:20,siteLengthFt:20,cameraOffsetZ:-18,cellFt:2});
  assert.deepEqual(rects,[]);
});


function shiftedMultiView(width=112,height=72){
  const center=image(width,height,(x,y)=>{
    const v=(x*31+y*47+x*y*5+(x%11)*23+(y%7)*19)%256;
    return [v,(v*5+17)%256,(v*7+61)%256];
  });
  const offsets=[-3,-2,-1,1,2,3],views=offsets.map(offsetFt=>{
    const disparity=Math.max(1,Math.round(Math.abs(offsetFt)*2));
    const data=new Uint8ClampedArray(width*height*4);
    for(let i=3;i<data.length;i+=4)data[i]=255;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const src=(y*width+x)*4,targetX=x+(offsetFt<0?disparity:-disparity);
      if(targetX<0||targetX>=width)continue;
      const dst=(y*width+targetX)*4;for(let ch=0;ch<3;ch++)data[dst+ch]=center.data[src+ch];
    }
    return {image:{width,height,data},offsetFt};
  });
  return {center,views};
}

test('seven-view fusion increases support and keeps metric depth consistent',()=>{
  const scene=shiftedMultiView();
  const result=reconstructMultiViewGrid({...scene,fovDeg:60,horizonY:.35,step:4,maxDisparity:12,minConfidence:.05});
  assert.equal(result.metrics.viewCount,7);
  assert.ok(result.metrics.validCount>100,'multi-view scan reconstructs a useful depth field');
  assert.ok(result.metrics.triangleCount>60,'multi-view depth creates connected surfaces');
  assert.ok(result.metrics.averageViewsPerPoint>1.4,'most retained points are supported by multiple captured views');
  assert.ok(result.metrics.multiViewAgreement>.35,'a meaningful share of depth points have cross-view agreement');
  const summary=stereoReconstructionSummary(result);
  assert.equal(summary.viewCount,7);
  assert.ok(summary.averageViewsPerPoint>1);
  assert.ok(summary.multiViewAgreementPct>0);
});


test('multi-reference fusion combines spatial support from several reference cameras',()=>{
  const scene=shiftedMultiView();
  const captures=[
    {image:scene.views[0].image,offsetFt:-3},
    {image:scene.views[1].image,offsetFt:-2},
    {image:scene.views[2].image,offsetFt:-1},
    {image:scene.center,offsetFt:0},
    {image:scene.views[3].image,offsetFt:1},
    {image:scene.views[4].image,offsetFt:2},
    {image:scene.views[5].image,offsetFt:3}
  ];
  const primary=reconstructMultiViewGrid({
    center:scene.center,
    views:captures.filter(c=>c.offsetFt!==0),
    fovDeg:60,horizonY:.35,step:4,maxDisparity:12,minConfidence:.05
  });
  const fused=fuseMultiReferenceSurfels({
    captures,
    primaryIndex:3,
    primaryResult:primary,
    referenceIndices:[1,3,5],
    fovDeg:60,horizonY:.35,step:5,maxDisparity:12,minConfidence:.05,voxelFt:.35
  });
  assert.equal(fused.metrics.referenceCount,3);
  assert.equal(fused.referenceResults.length,3,'fusion preserves each interior reference depth map for view-dependent texturing');
  assert.ok(fused.referenceResults.every(ref=>ref.result?.indices?.length>0),'each preserved reference contains connected geometry');
  assert.ok(fused.surfelCount>120,'multiple reference depth maps contribute a dense fused cloud');
  assert.ok(Array.from(fused.supportReferences).some(v=>v>=2),'some spatial surfels are confirmed by more than one reference camera');
  assert.ok(fused.metrics.multiReferenceAgreement>0,'fusion reports cross-reference spatial agreement');
  assert.ok(fused.metrics.averageConfidence>0);
});

test('camera vertical drift is registered before stereo disparity is solved',()=>{
  const width=96,height=64,disparity=5;
  const center=image(width,height,(x,y)=>{
    const v=(x*37+y*53+x*y*7+(x%7)*29+(y%5)*17)%256;
    return [v,(v*3+41)%256,(v*5+73)%256];
  });
  function shifted(dx,dy){
    const data=new Uint8ClampedArray(width*height*4);
    for(let i=3;i<data.length;i+=4)data[i]=255;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const tx=x+dx,ty=y+dy;if(tx<0||ty<0||tx>=width||ty>=height)continue;
      const src=(y*width+x)*4,dst=(ty*width+tx)*4;
      for(let c=0;c<3;c++)data[dst+c]=center.data[src+c];
    }
    return {width,height,data};
  }
  const result=reconstructStereoGrid({
    left:shifted(disparity,3),center,right:shifted(-disparity,-2),
    baselineFt:6,fovDeg:60,horizonY:.35,step:4,maxDisparity:12,verticalSearch:1,minConfidence:.05
  });
  assert.ok(result.metrics.validCount>60,'registered scan keeps enough depth points');
  const expected=result.focalPx*3/disparity;
  assert.ok(Math.abs(result.metrics.medianDepthFt-expected)<expected*.30,'camera drift must not become false depth');
  assert.ok(Math.abs(result.metrics.cameraRegistration.left.y)>=2);
  assert.ok(Math.abs(result.metrics.cameraRegistration.right.y)>=1);
});

test('pose-aware fusion rotates reference geometry before voxel agreement',()=>{
  const scene=shiftedMultiView();
  const captures=[
    {image:scene.views[0].image,offsetFt:-3,rollRad:-.035},
    {image:scene.views[1].image,offsetFt:-2,rollRad:-.02},
    {image:scene.views[2].image,offsetFt:-1,rollRad:-.01},
    {image:scene.center,offsetFt:0,rollRad:0},
    {image:scene.views[3].image,offsetFt:1,rollRad:.01},
    {image:scene.views[4].image,offsetFt:2,rollRad:.02},
    {image:scene.views[5].image,offsetFt:3,rollRad:.035}
  ];
  const primary=reconstructMultiViewGrid({
    center:scene.center,views:captures.filter(c=>c.offsetFt!==0),
    fovDeg:60,horizonY:.35,step:4,maxDisparity:12,minConfidence:.05
  });
  const fused=fuseMultiReferenceSurfels({
    captures,primaryIndex:3,primaryResult:primary,referenceIndices:[1,3,5],
    fovDeg:60,horizonY:.35,step:5,maxDisparity:12,minConfidence:.05,voxelFt:.35
  });
  assert.equal(fused.metrics.poseCorrectedReferences,2);
  assert.ok(fused.metrics.maxReferenceRollDeg>=1);
  assert.ok(fused.referenceResults.some(r=>Math.abs(r.rollRad)>.01));
});

test('weak reference reconstruction is rejected instead of ghosting the fused world',()=>{
  const scene=shiftedMultiView();
  const flat=image(scene.center.width,scene.center.height,()=>[128,128,128]);
  const captures=[
    {image:scene.views[0].image,offsetFt:-3},
    {image:flat,offsetFt:-2},
    {image:scene.views[2].image,offsetFt:-1},
    {image:scene.center,offsetFt:0},
    {image:scene.views[3].image,offsetFt:1},
    {image:scene.views[4].image,offsetFt:2},
    {image:scene.views[5].image,offsetFt:3}
  ];
  const primary=reconstructMultiViewGrid({
    center:scene.center,views:captures.filter(c=>c.offsetFt!==0),
    fovDeg:60,horizonY:.35,step:4,maxDisparity:12,minConfidence:.05
  });
  const fused=fuseMultiReferenceSurfels({
    captures,primaryIndex:3,primaryResult:primary,referenceIndices:[1,3,5],
    fovDeg:60,horizonY:.35,step:5,maxDisparity:12,minConfidence:.05,voxelFt:.35
  });
  assert.equal(fused.metrics.referenceCount,3);
  assert.equal(fused.metrics.rejectedReferences,1);
  assert.equal(fused.metrics.acceptedReferences,2);
  const weak=fused.referenceResults.find(r=>r.referenceIndex===1);
  assert.equal(weak.accepted,false);
  assert.ok(weak.referenceScore<.34);
  assert.ok(fused.referenceResults.find(r=>r.referenceIndex===3).accepted);
});
