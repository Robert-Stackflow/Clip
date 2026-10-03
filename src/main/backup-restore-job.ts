import {Worker} from 'node:worker_threads';
import {join} from 'node:path';
import {interfaceLanguage,t} from '../shared/i18n';
import type {Category} from '../shared/types';
import type {SyncMutation} from './sync-receiver';
export interface BackupRestoreResult {count:number;categories:Category[];mutations:{previous?:SyncMutation;next?:SyncMutation}[]}
export interface BackupRestoreOptions {
 source:string;workerFile?:string;imageHost?:string;timeoutMs?:number;
 valid():boolean;key():Uint8Array|undefined;
 enqueue<T>(operation:()=>T|Promise<T>):Promise<T>;
 committed(result:BackupRestoreResult):void;
}
/** Transfer inspected bytes once; only the final transaction occupies the write queue. */
export function restoreBackupJob(snapshot:Uint8Array,options:BackupRestoreOptions,previous?:Promise<unknown>){
 const flags=new Int32Array(new SharedArrayBuffer(8));let worker:Worker|undefined,finished=false,prepared=false;
 const cancelled=()=>new Error(t('备份已取消或处理超时，请稍后重试'));
 const live=()=>{try{return options.valid();}catch{return false;}};
 const retire=()=>{if(worker&&Atomics.load(flags,0)===1&&Atomics.load(flags,1)===0)void worker.terminate();};
 // 2 is the irrevocable commit decision. Lock/quit waits for that transaction to finish.
 const cancel=()=>{if(finished)return;if(Atomics.compareExchange(flags,0,0,1)<2)retire();};
 const check=()=>{if(finished||Atomics.load(flags,0)!==0||!live())throw cancelled();};
 const promise=(async()=>{
  await previous?.catch(()=>{});check();
  let readyResolve!:()=>void,readyReject!:(e:Error)=>void,exitResolve!:(r:BackupRestoreResult)=>void,exitReject!:(e:Error)=>void;
  const ready=new Promise<void>((r,j)=>{readyResolve=r;readyReject=j;}),exited=new Promise<BackupRestoreResult>((r,j)=>{exitResolve=r;exitReject=j;});
  void ready.catch(()=>{});void exited.catch(()=>{});
  if(snapshot.byteOffset!==0||snapshot.byteLength!==snapshot.buffer.byteLength){const owned=Uint8Array.from(snapshot);snapshot.fill(0);snapshot=owned;}
  worker=new Worker(options.workerFile||join(__dirname,'backup-restore-worker.cjs'),{workerData:{source:options.source,snapshot,flags:flags.buffer,imageHost:options.imageHost||join(__dirname,'../native/ImageHost.exe'),language:interfaceLanguage()},transferList:[snapshot.buffer as ArrayBuffer],resourceLimits:{maxOldGenerationSizeMb:2048}});
  let response:{ok?:boolean;count?:number;categories?:Category[];mutations?:BackupRestoreResult['mutations'];error?:string}|undefined,workerError:Error|undefined;
  worker.on('message',message=>{if(message?.prepared){if(prepared){cancel();return;}prepared=true;readyResolve();}else response=message;});
  worker.on('error',error=>workerError=error);
  worker.on('exit',code=>{
   if(code===0&&response?.ok&&Atomics.load(flags,0)===3&&Number.isInteger(response.count)&&Array.isArray(response.categories)&&Array.isArray(response.mutations))exitResolve(response as BackupRestoreResult);
   else {const error=Atomics.load(flags,0)===1?cancelled():workerError||new Error(response?.error||t('备份处理未完成，请稍后重试'));readyReject(error);exitReject(error);}
  });
  const timer=setTimeout(cancel,options.timeoutMs??600000);timer.unref();
  const monitor=setInterval(()=>{if(!live())cancel();retire();},10);monitor.unref();
  try{
   await ready;check();
   const queued=options.enqueue(async()=>{
    check();const key=options.key();try{worker!.postMessage({commit:true,key});}finally{key?.fill(0);}
    const result=await exited;options.committed(result);return result;
   });
   // A cancelled preparation can retire while its now-inert queue entry awaits other writes.
   void queued.catch(()=>{});return await Promise.race([queued,exited.then(()=>queued)]);
  }catch(error){cancel();await exited.catch(()=>{});throw error;}
  finally{clearTimeout(timer);clearInterval(monitor);}
 })().finally(()=>{finished=true;if(snapshot.byteLength)snapshot.fill(0);});
 return {promise,cancel,stats:()=>({workers:Number(!!worker&&!finished),decoding:Atomics.load(flags,1)===1,phase:Atomics.load(flags,0)===3?'committed':Atomics.load(flags,0)===2?'committing':Atomics.load(flags,1)===2?'restoring':prepared?'prepared':'preparing'})};
}
