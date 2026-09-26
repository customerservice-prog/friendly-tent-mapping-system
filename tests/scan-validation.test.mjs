import test from 'node:test';
import assert from 'node:assert/strict';
import { reconstructScanJob } from '../js/core/scan-reconstruction-job.js';
import { reconstructStereoGrid } from '../js/core/stereo-reconstruction.js';
import { evaluateScanValidation, sampleObservedScanPoint, normalizeScanCheck, scanFrameFingerprint } from '../js/core/scan-validation.js';
import { assessCaptureFrames, scanCaptureGuidance } from '../js/core/capture-quality.js';
import { normalizeVenueScan } from '../js/ui/venue-photo.js';
import { scanValidationPanel } from '../js/ui/scan-validation-panel.js';
import { knownScan } from './scan-fixture.mjs';

const fixture=knownScan(),job=reconstructScanJob(fixture.input);
const options={check:fixture.check,captureQuality:job.captureQuality,trackedPath:job.trackedPath,sourceFrameId:'center-fixture',inputFingerprint:'test-geometry'};
test('known physical segment validates against reconstructed raw evidence, without fitting to it',()=>{
  const before=Array.from(job.result.measurementPositions),report=evaluateScanValidation(job.result,options);
  assert.equal(report.status,'valid',JSON.stringify(report));
  assert.ok(Math.abs(report.predictedFt-fixture.check.distanceFt)<.05);
  assert.equal(report.metric,false);assert.equal(report.measurementPolicy.siteDimensionsVerified,false);
  assert.equal(report.scope,'held-out-segment-only');
  assert.deepEqual(Array.from(job.result.measurementPositions),before,'validation cannot alter geometry');
});
test('an independent bad physical measurement fails and never rescales the solver',()=>{
  const report=evaluateScanValidation(job.result,{...options,check:{...fixture.check,distanceFt:fixture.check.distanceFt*1.25}});
  assert.equal(report.status,'failed');assert.ok(report.relativeError>.19);
  assert.ok(Math.abs(report.predictedFt-fixture.check.distanceFt)<.05);
});
test('interpolated, absent and one-sided triangles cannot support a check',()=>{
  assert.equal(sampleObservedScanPoint({...job.result,observed:new Uint8Array(job.result.observed.length)},fixture.check.a),null);
  assert.equal(sampleObservedScanPoint({...job.result,bilateral:new Uint8Array(job.result.bilateral.length)},fixture.check.a),null);
  assert.equal(sampleObservedScanPoint(job.result,{u:.01,v:.01}),null,'unknown regions are not snapped to nearby geometry');
  const report=evaluateScanValidation({...job.result,observed:new Uint8Array(job.result.observed.length)},options);
  assert.equal(report.status,'insufficient');
});
test('clicked points use perspective-correct intersection on a sloped observed surface',()=>{
  const result={measurementPositions:new Float32Array([0,0,10,10.5,0,10.5,0,10,10]),uvs:new Float32Array([0,1,1,1,0,0]),indices:new Uint32Array([0,1,2]),observed:new Uint8Array([1,1,1]),bilateral:new Uint8Array([1,1,1]),supportViews:new Uint8Array([2,2,2]),confidence:new Float32Array([.9,.9,.9]),disparities:new Float32Array([8,8,8])};
  const point=sampleObservedScanPoint(result,{u:.25,v:.25}),depth=1/(.5/10+.25/10.5+.25/10);
  assert.ok(Math.abs(point.xyz[2]-depth)<1e-8);assert.ok(Math.abs(point.xyz[0]-depth*.25)<1e-8);
});
test('weak camera pose prevents a passing status even when the distance happens to match',()=>{
  const report=evaluateScanValidation(job.result,{...options,trackedPath:{...job.trackedPath,meanQuality:.12}});
  assert.equal(report.status,'insufficient');assert.match(report.label,/Camera motion/);
  const zoom=evaluateScanValidation(job.result,{...options,trackedPath:{...job.trackedPath,pairs:job.trackedPath.pairs.map(p=>({...p,similarityScale:1.25}))}});
  assert.equal(zoom.status,'insufficient');
});
test('changed capture invalidates marked endpoints; changed calibration recomputes the residual',()=>{
  assert.equal(evaluateScanValidation(job.result,{...options,sourceFrameId:'new-center'}).status,'insufficient');
  const recalibrated=reconstructScanJob({...fixture.input,baselineFt:9});
  const report=evaluateScanValidation(recalibrated.result,{...options,captureQuality:recalibrated.captureQuality,trackedPath:recalibrated.trackedPath,inputFingerprint:'new-baseline'});
  assert.equal(report.status,'failed');assert.ok(report.relativeError>.45);assert.equal(report.inputFingerprint,'new-baseline');
});
test('cache evidence identifies changed decoded image pixels even if their URL is reused',()=>{
  const changed=knownScan().frames,key=scanFrameFingerprint(changed);changed[1].data[20]^=128;
  assert.notEqual(scanFrameFingerprint(changed),key);
});
test('distance checks and arbitrary saved validation flags cannot manufacture a verdict',()=>{
  assert.deepEqual(normalizeScanCheck({status:'valid',metric:true}),normalizeScanCheck(null));
  const frames=['left','center','right'].map(role=>({id:role,url:'https://api.test/'+role,role}));
  const scan=normalizeVenueScan({frames,accuracy:'validated',metric:true,validation:{status:'valid'},validationCheck:{...fixture.check,sourceFrameId:'old'}},'https://api.test');
  assert.equal(scan.accuracy,'unverified');assert.equal(scan.validation,undefined);assert.equal(scan.validationCheck.a,null);
});
test('varying-depth reconstruction retains finite far-field parallax instead of deleting it as yaw',()=>{
  const scene=knownScan({variedDepth:true}),[left,center,right]=scene.frames;
  const result=reconstructStereoGrid({left,center,right,baselineFt:6,fovDeg:60,maxDisparity:16,step:4,minConfidence:.06});
  const observedNear=[],observedFar=[];
  for(let i=0;i<result.observed.length;i++)if(result.observed[i]&&result.bilateral[i]){
    const y=(1-result.uvs[i*2+1])*result.height,d=result.measurementPositions[i*3+2];
    if(y>50&&y<70)observedNear.push(d);if(y>10&&y<30)observedFar.push(d);
  }
  const median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
  assert.ok(observedNear.length>10&&observedFar.length>10);
  assert.ok(Math.abs(median(observedNear)-result.focalPx*3/8)<.1);
  assert.ok(Math.abs(median(observedFar)-result.focalPx*3/4)<.1);
  assert.equal(result.metrics.cameraRegistration.left.horizontalCorrected,false);
});
test('depth outside the allowed range remains absent instead of clamped onto a fake plane',()=>{
  const [left,center,right]=fixture.frames;
  const result=reconstructStereoGrid({left,center,right,baselineFt:6,fovDeg:60,maxDepthFt:10,maxDisparity:16});
  assert.equal(result.metrics.observedCount,0);assert.equal(result.indices.length,0);
});
test('capture quality recognizes shifted shared texture, rejects duplicates, and supplies next actions',()=>{
  const quality=assessCaptureFrames(fixture.frames);assert.equal(quality.usable,true);
  assert.equal(quality.metrics.overlapMethod,'translation-compensated-correlation');
  const duplicate=assessCaptureFrames([fixture.frames[1],fixture.frames[1],fixture.frames[1]]);
  assert.equal(duplicate.usable,false);assert.equal(scanCaptureGuidance({quality:duplicate}).action,'retake');
  assert.equal(scanCaptureGuidance({validation:{status:'failed',reasons:['Mismatch']}}).action,'review-check');
  assert.equal(scanCaptureGuidance({validation:{status:'valid'}}).action,'verify-site');
});
test('panel exposes marked endpoints, keyboard adjustment and observed evidence without a venue certification',()=>{
  const report=evaluateScanValidation(job.result,options),scan={frames:[{id:'center-fixture',role:'center',url:'https://api.test/center'}],validationCheck:fixture.check};
  const html=scanValidationPanel(scan,{validation:report});
  assert.match(html,/data-role="scan-check-image"/);assert.match(html,/data-role="scan-check-coordinate"/);
  assert.match(html,/Scan predicts/);assert.match(html,/Observed coverage/);assert.match(html,/not a surveyed venue/);
  const stale=scanValidationPanel({...scan,validationCheck:{...fixture.check,distanceFt:10}},{validation:report});
  assert.doesNotMatch(stale,/Independent check within tolerance/,'old status cannot survive a changed measurement');
});
