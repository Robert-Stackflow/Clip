import {Worker} from 'node:worker_threads';
import {join} from 'node:path';
import {interfaceLanguage,t} from '../shared/i18n';
import {SyncError} from '../shared/sync-errors';
import type {SyncRecord} from '../shared/sync';
export interface EncodedSyncItem {record:SyncRecord;bytes:Uint8Array}
export interface SyncHistorySource {source:string;key?:Uint8Array}
/** Read-only short-lived tasks; original binary strings never reach the main isolate. */
export class SyncItemReader {
 private jobs=new Set<{cancel():void;stopped:Promise<void>}>();
 constructor(private workerFile=join(__dirname,'sync-item-worker.cjs'),private timeout=10000){}
 stats(){return {workers:this.jobs.size};}
 async stop(){const jobs=[...this.jobs];for(const job of jobs)job.cancel();await Promise.all(jobs.map(job=>job.stopped));}
 run(source:SyncHistorySource,id:string,version:number,valid:()=>boolean):Promise<EncodedSyncItem>{
  const live=()=>{try{return valid();}catch{return false;}};
  const active=live();if(!active||this.jobs.size>=2){source.key?.fill(0);return Promise.reject(new SyncError(!active?'SYNC_STOPPED':'SYNC_ITEM_BUSY'));}
  return new Promise((resolve,reject)=>{
   const key=source.key?Uint8Array.from(source.key):undefined;let worker:Worker;try{worker=new Worker(this.workerFile,{workerData:{source:source.source,key,id,version,language:interfaceLanguage()},resourceLimits:{maxOldGenerationSizeMb:192}});}catch(error){reject(error);return;}finally{key?.fill(0);source.key?.fill(0);}
   let done=false,release!:()=>void;const stopped=new Promise<void>(r=>release=r),job={cancel:()=>finish(new SyncError('SYNC_STOPPED')),stopped};this.jobs.add(job);
   const finish=(error?:Error,value?:EncodedSyncItem)=>{if(done){value?.bytes.fill(0);return;}done=true;clearTimeout(timer);const retire=()=>{this.jobs.delete(job);release();if(!live()){value?.bytes.fill(0);reject(new SyncError('SYNC_STOPPED'));}else if(error){value?.bytes.fill(0);reject(error);}else if(value)resolve(value);else reject(new SyncError('SYNC_SEND_DENIED'));};void worker.terminate().then(retire,retire);};
   const timer=setTimeout(()=>finish(new Error(t('读取同步内容超时，请重试'))),this.timeout);timer.unref();
   worker.on('message',message=>finish(message?.ok?undefined:message?.code?new SyncError(message.code):new Error(message?.error||t('无法读取同步内容')),message?.ok?{record:message.record,bytes:message.bytes}:undefined));
   worker.once('error',error=>finish(error));worker.once('exit',()=>finish(new SyncError('SYNC_SEND_DENIED')));
  });
 }
}
