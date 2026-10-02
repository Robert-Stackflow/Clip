import {Worker} from 'node:worker_threads';
import {join} from 'node:path';
import {interfaceLanguage,t} from '../shared/i18n';
import {SyncError} from '../shared/sync-errors';
import type {SyncRecord} from '../shared/sync';
import type {Detail,Payload} from '../shared/types';
import type {SyncHistorySource} from './sync-item-reader';
export type SyncMutation=Pick<Detail,'id'|'localOnly'>;
export interface ReceivedSyncItem {changed:boolean;mutations:{previous?:SyncMutation;next?:SyncMutation}[]}
/** Original strings stay in a short-lived isolate; commits use the application's write queue. */
export class SyncReceiver {
 private jobs=new Set<{cancel():void;stopped:Promise<void>}>();
 constructor(private workerFile=join(__dirname,'sync-receive-worker.cjs'),private timeout=30000){}
 stats(){return {workers:this.jobs.size};}
 async stop(){const jobs=[...this.jobs];for(const job of jobs)job.cancel();await Promise.all(jobs.map(job=>job.stopped));}
 run(source:SyncHistorySource,bytes:Uint8Array,version:number,valid:()=>boolean,enqueue:<T>(fn:()=>T|Promise<T>)=>Promise<T>,thumbnail:(payload:Payload,valid:()=>boolean)=>string|undefined|Promise<string|undefined>,expected?:SyncRecord,deleted?:(record:SyncRecord)=>boolean):Promise<ReceivedSyncItem>{
  const live=()=>{try{return valid();}catch{return false;}};
  if(!live()||this.jobs.size>=2){source.key?.fill(0);bytes.fill(0);return Promise.reject(new SyncError(!live()?'SYNC_STOPPED':'SYNC_ITEM_BUSY'));}
  return new Promise((resolve,reject)=>{
   if(bytes.byteOffset!==0||bytes.byteLength!==bytes.buffer.byteLength){const owned=Uint8Array.from(bytes);bytes.fill(0);bytes=owned;}
   const flag=new Int32Array(new SharedArrayBuffer(4)),key=source.key?Uint8Array.from(source.key):undefined;let worker:Worker;
   try{worker=new Worker(this.workerFile,{workerData:{source:source.source,key,bytes,version,expected,flag:flag.buffer,language:interfaceLanguage()},transferList:[bytes.buffer as ArrayBuffer],resourceLimits:{maxOldGenerationSizeMb:192}});}catch(error){if(bytes.byteLength)bytes.fill(0);reject(error);return;}finally{key?.fill(0);source.key?.fill(0);}
   let done=false,prepared=false,committed=false,release!:()=>void,commitResolve:((value:ReceivedSyncItem)=>void)|undefined,commitReject:((error:Error)=>void)|undefined;
   const stopped=new Promise<void>(r=>release=r),job={cancel:()=>cancel(new SyncError('SYNC_STOPPED')),stopped};this.jobs.add(job);
   const finish=(error?:Error,result?:ReceivedSyncItem)=>{if(done)return;done=true;clearTimeout(timer);clearInterval(monitor);void worker.terminate().then(retire,retire);function retire(){release();error?reject(error):result?resolve(result):reject(new SyncError('SYNC_STOPPED'));}void stopped.then(()=>this.jobs.delete(job));};
   // 2 is the commit decision. Cancellation wins before it, or waits for the atomic commit after it.
   const cancel=(error:Error)=>{if(done)return;const previous=Atomics.compareExchange(flag,0,0,1);if(previous>=2)return;commitReject?.(error);finish(error);};
   const timer=setTimeout(()=>cancel(new Error(t('记录超时，请重试'))),this.timeout);timer.unref();const monitor=setInterval(()=>{if(!live())cancel(new SyncError('SYNC_STOPPED'));},10);monitor.unref();
   worker.on('message',message=>{
    if(done)return;
    if(message?.prepared){if(prepared){cancel(new SyncError('SYNC_RECORD_INVALID'));return;}prepared=true;
     void (async()=>{const thumb=message.png?await thumbnail({png:message.png},()=>!done&&Atomics.load(flag,0)===0&&live()):undefined;message.png=undefined;
      return enqueue(async()=>{if(done||Atomics.load(flag,0)!==0||!live())throw new SyncError('SYNC_STOPPED');
      // Keep deletion snapshots on the owning connection, preserving queue/shelf and Undo.
      if(message.record.deleted){if(!deleted)throw new SyncError('SYNC_RECORD_INVALID');return {changed:deleted(message.record),mutations:[]};}
      return new Promise<ReceivedSyncItem>((r,j)=>{commitResolve=r;commitReject=j;worker.postMessage({commit:true,thumbnail:thumb});});
     });})().then(result=>finish(undefined,result),error=>{commitReject=undefined;cancel(error);});return;
    }
    const error=message?.code?new SyncError(message.code):new Error(message?.error||t('记录未完成，请重试'));
    if(message?.ok){committed=!!commitResolve&&Atomics.load(flag,0)===3;commitResolve?.({changed:message.changed,mutations:message.mutations});}else{commitReject?.(error);finish(error);}
   });
   const failed=(error:Error)=>{commitReject?.(error);finish(error);};worker.once('error',failed);
   // A confirmed COMMIT and its result survive normal exit while the write queue settles.
   worker.once('exit',code=>{if(code!==0||!committed)failed(new SyncError('SYNC_STOPPED'));});
  });
 }
}
