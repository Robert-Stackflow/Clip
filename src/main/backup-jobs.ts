import {Worker} from 'node:worker_threads';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {unlink} from 'node:fs/promises';
const cancellations=new Set<()=>void>();
export function cancelBackupJobs(){for(const cancel of cancellations)cancel();}
export function exportInWorker(source:string,file:string,password?:string,workerFile=join(__dirname,'backup-worker.cjs'),timeoutMs=180000,databaseKey?:Uint8Array):Promise<void>{
 const temp=join(dirname(file),`.clipper-backup-${randomUUID()}.tmp`);
 return new Promise<void>((resolve,reject)=>{
  const worker=new Worker(workerFile,{workerData:{source,file,password,temp,databaseKey},resourceLimits:{maxOldGenerationSizeMb:2048}});let response:{ok:boolean;error?:string}|undefined,finished=false;
  let cancelled=false;const cancel=()=>{cancelled=true;void worker.terminate();};cancellations.add(cancel);
  const timer=setTimeout(cancel,timeoutMs);
  const finish=(error?:Error)=>{if(finished)return;finished=true;cancellations.delete(cancel);clearTimeout(timer);void unlink(temp).catch(()=>{}).then(()=>error?reject(error):resolve());};
  worker.on('message',message=>{response=message;});worker.on('error',error=>finish(error));
  worker.on('exit',code=>finish(cancelled?new Error('备份已取消或处理超时，请稍后重试'):code===0&&response?.ok?undefined:new Error(response?.error||'备份处理未完成，请稍后重试')));
 });
}
