import test from 'node:test';
import assert from 'node:assert/strict';
import { venueScanFrameTimes, venueScanBurstTimes, normalizeVenueScan } from '../js/ui/venue-photo.js';
import { spaceScanQualityProfile } from '../js/core/stereo-reconstruction.js';

test('Space Scan video samples three interior viewpoints instead of first/last frames',()=>{
  const times=venueScanFrameTimes(10);
  assert.equal(times.length,3);
  assert.ok(times[0]>0&&times[2]<10);
  assert.ok(times[0]<times[1]&&times[1]<times[2]);
  assert.ok(times[1]>4&&times[1]<6,'center capture stays near the temporal midpoint');
  assert.ok(times[2]-times[0]>5,'left/right samples retain useful baseline across the video');
  const factor=(times[2]-times[0])/10;
  assert.ok(factor>.65&&factor<.95,'video reconstruction records the sampled share of the walked baseline');
});

test('video scan metadata preserves its sampled-baseline correction',()=>{
  const scan=normalizeVenueScan({captureMethod:'video',baselineFactor:.76,baselineFt:6,frames:[]},'https://api.test');
  assert.equal(scan.captureMethod,'video');
  assert.equal(scan.baselineFactor,.76);
  assert.equal(scan.baselineFt,6);
});

test('invalid video durations do not invent scan frames',()=>{
  assert.deepEqual(venueScanFrameTimes(0),[]);
  assert.deepEqual(venueScanFrameTimes(NaN),[]);
});


test('Space Scan video burst samples seven ordered viewpoints across the walk',()=>{
  const times=venueScanBurstTimes(10,7);
  assert.equal(times.length,7);
  assert.ok(times[0]>0&&times.at(-1)<10);
  for(let i=1;i<times.length;i++)assert.ok(times[i]>times[i-1]);
  assert.ok(times[3]>4&&times[3]<6,'burst center stays close to the temporal midpoint');
  assert.ok(times.at(-1)-times[0]>7,'burst uses most of the useful sideways motion');
});

test('normalized scans preserve seven support samples for multi-view fusion',()=>{
  const sample=(i,offsetFactor)=>({id:'s'+i,url:'https://api.test/s'+i+'.jpg',name:'s'+i,offsetFactor,sampleIndex:i});
  const samples=[-.5,-.333,-.166,0,.166,.333,.5].map((v,i)=>sample(i,v));
  const frames=[
    {...samples[0],role:'left'},
    {...samples[3],role:'center'},
    {...samples[6],role:'right'}
  ];
  const scan=normalizeVenueScan({frames,samples,captureMethod:'video',baselineFt:6,baselineFactor:.84},'https://api.test');
  assert.equal(scan.version,2);
  assert.equal(scan.samples.length,7);
  assert.equal(scan.frames.length,3);
  assert.equal(scan.status,'ready');
  assert.equal(scan.samples[3].offsetFactor,0);
});


test('Space Scan detail adapts upward on stronger desktop hardware while protecting mobile',()=>{
  const mobile=spaceScanQualityProfile({mobile:true,deviceMemory:8,hardwareConcurrency:8});
  const balanced=spaceScanQualityProfile({mobile:false,deviceMemory:4,hardwareConcurrency:4});
  const high=spaceScanQualityProfile({mobile:false,deviceMemory:8,hardwareConcurrency:8});
  const ultra=spaceScanQualityProfile({mobile:false,deviceMemory:16,hardwareConcurrency:12});
  assert.equal(mobile.tier,'mobile');
  assert.equal(balanced.tier,'balanced');
  assert.equal(high.tier,'high');
  assert.equal(ultra.tier,'ultra');
  assert.ok(high.width>balanced.width);
  assert.ok(ultra.width>=high.width);
  assert.ok(mobile.width<high.width);
  assert.ok(ultra.voxelFt<balanced.voxelFt,'higher quality keeps denser fused spatial samples');
});
