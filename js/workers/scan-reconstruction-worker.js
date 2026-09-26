import { reconstructScanJob } from '../core/scan-reconstruction-job.js';
self.onmessage=({data})=>{
  const {id,input}=data;
  try{self.postMessage({id,result:reconstructScanJob(input)});}
  catch(error){self.postMessage({id,error:{name:error.name||'Error',message:error.message||'Scan reconstruction failed.'}});}
};
