import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { reconstructScanJob } from '../js/core/scan-reconstruction-job.js';
import { runScanReconstructionJob } from '../js/ui/scan-job-client.js';
import { knownScan } from './scan-fixture.mjs';

// Exercise the shipped browser worker module in an actual separate JS thread.
// Only the browser messaging transport is adapted; the job code is unchanged.
class BrowserWorker {
  constructor(url){
    const bootstrap=`const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:v=>parentPort.postMessage(v)};import(${JSON.stringify(url.href)}).then(()=>parentPort.on('message',data=>self.onmessage({data})));`;
    this.thread=new Worker(bootstrap,{eval:true});
    this.thread.on('message',data=>this.onmessage?.({data}));this.thread.on('error',error=>this.onerror?.(error));
  }
  postMessage(data){this.thread.postMessage(data);}terminate(){return this.thread.terminate();}
}
test('real worker output matches the pure reconstruction job and retains measurement arrays',async()=>{
  const {input}=knownScan(),expected=reconstructScanJob(input),actual=await runScanReconstructionJob(input,{WorkerClass:BrowserWorker});
  assert.equal(actual.execution,'worker');assert.deepEqual(actual.result.measurementPositions,expected.result.measurementPositions);
  assert.deepEqual(actual.result.observed,expected.result.observed);assert.deepEqual(actual.result.bilateral,expected.result.bilateral);
  assert.equal(actual.reconstructionMode,expected.reconstructionMode);assert.ok(input.frames[0].data.length,'input buffers remain usable');
});
test('aborting an obsolete worker rejects instead of returning stale geometry',async()=>{
  const controller=new AbortController(),pending=runScanReconstructionJob(knownScan().input,{signal:controller.signal,WorkerClass:BrowserWorker});
  controller.abort();await assert.rejects(pending,{name:'AbortError'});
});
test('unsupported workers use the tested limited preview fallback',async()=>{
  const {input}=knownScan(),actual=await runScanReconstructionJob(input,{WorkerClass:null});
  assert.equal(actual.execution,'main-thread-limited');assert.deepEqual(actual.result.positions,reconstructScanJob({...input,mobile:true}).result.positions);
  class UnsupportedWorker{constructor(){throw new Error('Module workers unsupported');}}
  assert.equal((await runScanReconstructionJob(input,{WorkerClass:UnsupportedWorker})).execution,'main-thread-limited');
});
test('fallback honours pre-solve cancellation',async()=>{
  const controller=new AbortController(),pending=runScanReconstructionJob(knownScan().input,{signal:controller.signal,WorkerClass:null});controller.abort();
  await assert.rejects(pending,{name:'AbortError'});
});
