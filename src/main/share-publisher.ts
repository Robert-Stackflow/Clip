import {Worker} from 'node:worker_threads';
import {join} from 'node:path';
import {interfaceLanguage,t} from '../shared/i18n';
import {SyncError} from '../shared/sync-errors';
import type {SyncHistorySource} from './sync-item-reader';
import type {SyncMutation} from './sync-receiver';
interface Published {id:string;mutations:{previous?:SyncMutation;next?:SyncMutation}[]}
interface Job {start():void;cancel():void;stopped:Promise<void>}
/** Queue IDs only. One worker reads files, saves their snapshot and indexes it atomically. */
export class SharePublisher {
 private jobs:Job[]=[];private active?:Job;
 constructor(private workerFile=join(__dirname,'share-publisher-worker.cjs'),private timeout=30000){}
 stats(){return {workers:Number(!!this.active),pending:this.jobs.length-Number(!!this.active)};}
 cancel(){void this.stop();}
 async stop(){const jobs=[...this.jobs];for(const job of jobs)job.cancel();await Promise.all(jobs.map(job=>job.stopped));}
 run(source:SyncHistorySource,id:string,hash:string,identity:string,valid:()=>boolean,enqueue:<T>(fn:()=>T|Promise<T>)=>Promise<T>):Promise<Published>{
  const live=()=>{try{return valid();}catch{return false;}};
  if(!live()||this.jobs.length>=4){source.key?.fill(0);return Promise.reject(new Error(t(!live()?'文件共享已取消':'正在保存另一组共享文件，请稍后重试')));}
  return new Promise((resolve,reject)=>{
   const flag=new Int32Array(new SharedArrayBuffer(4));let worker:Worker|undefined,done=false,committed=false,release!:()=>void,commitResolve:((result:Published)=>void)|undefined,commitReject:((error:Error)=>void)|undefined;
   const stopped=new Promise<void>(r=>release=r);
   const retire=()=>{source.key?.fill(0);this.jobs.splice(this.jobs.indexOf(job),1);if(this.active===job)this.active=undefined;release();this.next();};
   const finish=(error?:Error,result?:Published)=>{if(done)return;done=true;clearTimeout(timer);clearInterval(monitor);const complete=()=>{retire();error?reject(error):resolve(result!);};if(worker)void worker.terminate().then(complete,complete);else complete();};
   const cancel=(error:Error)=>{if(done||Atomics.compareExchange(flag,0,0,1)>=2)return;commitReject?.(error);finish(error);};
   const timer=setTimeout(()=>cancel(new Error(t('读取共享文件超过 30 秒，已停止'))),this.timeout);timer.unref();const monitor=setInterval(()=>{if(!live())cancel(new Error(t('文件共享已取消')));},10);monitor.unref();
   const job:Job={stopped,cancel:()=>cancel(new Error(t('文件共享已取消'))),start:()=>{
    if(done)return;if(!live()){job.cancel();return;}
    try{worker=new Worker(this.workerFile,{workerData:{source:source.source,key:source.key,id,hash,identity,flag:flag.buffer,language:interfaceLanguage()},resourceLimits:{maxOldGenerationSizeMb:192}});}catch(error){finish(error as Error);return;}finally{source.key?.fill(0);}
    worker.on('message',message=>{
     if(done)return;
     if(message?.prepared){void enqueue(()=>{if(done||!live()||Atomics.load(flag,0)!==0)throw new Error(t('文件共享已取消'));return new Promise<Published>((r,j)=>{commitResolve=r;commitReject=j;worker!.postMessage({commit:true});});}).then(result=>finish(undefined,result),error=>{commitReject=undefined;cancel(error);});return;}
     const error=message?.code?new SyncError(message.code):new Error(message?.error||t('无法保存共享文件'));if(message?.ok){committed=!!commitResolve&&Atomics.load(flag,0)===3;commitResolve?.({id:message.id,mutations:message.mutations});}else{commitReject?.(error);finish(error);}
    });const failed=(error:Error)=>{commitReject?.(error);finish(error);};worker.once('error',failed);
    // Worker exit can drain its final message before the write queue's Promise settles.
    worker.once('exit',code=>{if(code!==0||!committed)failed(new Error(t('共享文件读取进程已停止')));});
   }};
   this.jobs.push(job);this.next();
  });
 }
 private next(){if(this.active||!this.jobs.length)return;this.active=this.jobs[0];this.active.start();}
}
