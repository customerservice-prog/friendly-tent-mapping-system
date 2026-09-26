import { reconstructScanJob } from '../core/scan-reconstruction-job.js';

let serial=0,cached=null;
const aborted=()=>new DOMException('Scan reconstruction cancelled.','AbortError');
export function runScanReconstructionJob(input,{signal,WorkerClass=globalThis.Worker,workerUrl=new URL('../workers/scan-reconstruction-worker.js',import.meta.url)}={}){
  if(signal?.aborted)return Promise.reject(aborted());
  // Browsers without module workers retain a smaller, explicitly described
  // preview. Yield once for the loading state; synchronous work cannot abort
  // mid-solve, so check again before returning any obsolete result.
  if(typeof WorkerClass!=='function')return new Promise((resolve,reject)=>{
    setTimeout(()=>{try{if(signal?.aborted)throw aborted();const value=reconstructScanJob({...input,mobile:true});if(signal?.aborted)throw aborted();resolve({...value,execution:'main-thread-limited'});}catch(error){reject(error);}},0);
  });
  return new Promise((resolve,reject)=>{
    const id=++serial;let worker,done=false,fallbackStarted=false;
    const cleanup=()=>{signal?.removeEventListener('abort',cancel);worker?.terminate();};
    const finish=(error,value)=>{if(done)return;done=true;cleanup();error?reject(error):resolve(value);};
    const cancel=()=>finish(aborted());
    const fallback=()=>{
      if(done||fallbackStarted)return;fallbackStarted=true;worker?.terminate();worker=null;
      runScanReconstructionJob(input,{signal,WorkerClass:null}).then(value=>finish(null,value),finish);
    };
    try{
      worker=new WorkerClass(workerUrl,{type:'module',name:'rentsketch-scan'});
      signal?.addEventListener('abort',cancel,{once:true});
      worker.onmessage=({data})=>{if(data.id!==id)return;data.error?finish(Object.assign(new Error(data.error.message),{name:data.error.name})):finish(null,{...data.result,execution:'worker'});};
      worker.onerror=()=>fallback();
      // Keep the source frame buffers intact for texture display and retries.
      worker.postMessage({id,input});
    }catch(error){fallback();}
  });
}
export async function cachedScanReconstruction(key,input,options={}){
  if(options.signal?.aborted)throw aborted();
  if(cached?.key===key)return cached.value;
  const value=await runScanReconstructionJob(input,options);
  if(options.signal?.aborted)throw aborted();
  cached={key,value};return value;
}
