import {Worker} from 'node:worker_threads';
import {join} from 'node:path';
import {interfaceLanguage,t as tr} from '../shared/i18n';

export interface BackupInspection {clips:number;snippets:number;categories:number;scripts:number;exportedAt:string}
export interface PreviewResult {result:BackupInspection;snapshot:Uint8Array}
export interface BackupPreviewOptions {workerFile?:string;imageHost?:string;timeoutMs?:number}
const cancellations=new Set<()=>void>();
export function cancelBackupPreviews(){for(const cancel of cancellations)cancel();}
export function previewBackupJob(file:string,hash:string,password?:string,options:BackupPreviewOptions={},previous?:Promise<unknown>){
 const flags=new Int32Array(new SharedArrayBuffer(8));let worker:Worker|undefined,finished=false,cancelled=false;
 const cancel=()=>{if(finished)return;cancelled=true;Atomics.store(flags,0,1);retire();};
 // A native decoder must retire through its own cancellation path before terminating its owner thread.
 const retire=()=>{if(cancelled&&worker&&Atomics.load(flags,1)===0)void worker.terminate();};
 cancellations.add(cancel);
 const promise=(async()=>{
  await previous?.catch(()=>{});if(cancelled)throw new Error(tr('备份已取消或处理超时，请稍后重试'));
  return new Promise<PreviewResult>((resolve,reject)=>{
   try{worker=new Worker(options.workerFile||join(__dirname,'backup-preview-worker.cjs'),{workerData:{file,hash,password,imageHost:options.imageHost||join(__dirname,'../native/ImageHost.exe'),flags:flags.buffer,language:interfaceLanguage()},resourceLimits:{maxOldGenerationSizeMb:2048}});}catch(error){reject(error);return;}
   let response:{ok:boolean;result?:BackupInspection;snapshot?:Uint8Array;error?:string}|undefined,workerError:Error|undefined;
   const timer=setTimeout(cancel,options.timeoutMs??600000);timer.unref();const monitor=setInterval(retire,10);monitor.unref();
   worker.on('message',message=>{if(message?.snapshot)response?.snapshot?.fill(0);response={...response,...message};});
   worker.on('error',error=>{workerError=error;});
   worker.on('exit',code=>{clearTimeout(timer);clearInterval(monitor);if(cancelled||workerError||code!==0||!response?.ok||!response.result||!response.snapshot){response?.snapshot?.fill(0);reject(cancelled?new Error(tr('备份已取消或处理超时，请稍后重试')):workerError||new Error(response?.error||tr('备份处理未完成，请稍后重试')));}else resolve({result:response.result,snapshot:response.snapshot});});
  });
 })().finally(()=>{finished=true;cancellations.delete(cancel);});
 return {promise,cancel,stats:()=>({workers:Number(!!worker&&!finished),decoding:Atomics.load(flags,1)===1})};
}
