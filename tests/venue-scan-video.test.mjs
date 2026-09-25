import test from 'node:test';
import assert from 'node:assert/strict';
import { venueScanFrameTimes } from '../js/ui/venue-photo.js';

test('Space Scan video samples three interior viewpoints instead of first/last frames',()=>{
  const times=venueScanFrameTimes(10);
  assert.equal(times.length,3);
  assert.ok(times[0]>0&&times[2]<10);
  assert.ok(times[0]<times[1]&&times[1]<times[2]);
  assert.ok(times[1]>4&&times[1]<6,'center capture stays near the temporal midpoint');
  assert.ok(times[2]-times[0]>5,'left/right samples retain useful baseline across the video');
});

test('invalid video durations do not invent scan frames',()=>{
  assert.deepEqual(venueScanFrameTimes(0),[]);
  assert.deepEqual(venueScanFrameTimes(NaN),[]);
});
