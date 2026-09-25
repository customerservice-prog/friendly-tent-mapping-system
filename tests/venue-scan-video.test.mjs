import test from 'node:test';
import assert from 'node:assert/strict';
import { venueScanFrameTimes, normalizeVenueScan } from '../js/ui/venue-photo.js';

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
