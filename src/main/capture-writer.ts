import {Worker} from 'node:worker_threads';
import {join} from 'node:path';
import {interfaceLanguage,t} from '../shared/i18n';
import type {Payload} from '../shared/types';
import type {ClipPreview} from '../shared/preview';
export class CaptureCancelledError extends Error{constructor(){super(t('记录已取消'));}}
interface Job{worker:Worker;flag:Int32Array;cancel:()=>void;stopped:Promise<void>;phase:'preparing'|'committing';}
/** Heavy automatic captures only. Small captures keep the existing synchronous fast path. */
export function heavyCapture(payload:Payload){return (payload.files?.reduce((n,f)=>n+f.length,0)||0)+(payload.text?.length||0)+(payload.html?.length||0)+(payload.rtf?.length||0)+(payload.png?.length||0)+(payload.attachments?.reduce((n,a)=>n+a.data.length+a.name.length,0)||0)+(payload.formats?.reduce((n,f)=>n+f.data.length+f.name.length,0)||0)>32768;}
export class CaptureWriter{
 private job?:Job;private stopping=new Set<Promise<void>>();
 constructor(private workerFile=join(__dirname,'capture-writer-worker.cjs'),private timeout=30000){}
 stats(){return {workers:Number(!!this.job),stopping:this.stopping.size,phase:this.job?.phase};}
 async stop(){this.job?.cancel();while(this.job||this.stopping.size)await Promise.all([...(this.job?[this.job.stopped]:[]),...this.stopping]);}
 run(source:string,payload:Payload,name:string,thumbnail:string|undefined,key:Uint8Array|undefined,valid:()=>boolean):Promise<ClipPreview>{
  if(this.job){key?.fill(0);return Promise.reject(new Error(t('正在保存剪贴板，请稍后')));}const live=()=>{try{return valid();}catch{return false;}};if(!live()){key?.fill(0);return Promise.reject(new CaptureCancelledError());}
  return new Promise<ClipPreview>((resolve,reject)=>{let worker:Worker;const flag=new Int32Array(new SharedArrayBuffer(4));try{worker=new Worker(this.workerFile,{workerData:{source,payload,name,thumbnail,key,flag:flag.buffer,language:interfaceLanguage()},resourceLimits:{maxOldGenerationSizeMb:128}});}catch(error){key?.fill(0);reject(error);return;}finally{key?.fill(0);}
   let done=false,cancelled=false,release!:()=>void;const stopped=new Promise<void>(r=>release=r);
   const finish=(error?:Error,value?:ClipPreview)=>{if(done)return;done=true;clearTimeout(timer);clearInterval(monitor);if(this.job?.worker===worker)this.job=undefined;const retirement=worker.terminate().then(()=>{},()=>{});this.stopping.add(retirement);void retirement.finally(()=>{this.stopping.delete(retirement);release();if(cancelled||!live()){reject(new CaptureCancelledError());return;}error?reject(error):value?resolve(value):reject(new Error(t('记录未完成，请重试')));});};
   const cancel=()=>{cancelled=true;Atomics.compareExchange(flag,0,0,1);finish(new CaptureCancelledError());};
   const timer=setTimeout(()=>{Atomics.compareExchange(flag,0,0,1);finish(new Error(t('记录超时，请重试')));},this.timeout);timer.unref();const monitor=setInterval(()=>{if(!live())cancel();},10);monitor.unref();this.job={worker,flag,cancel,stopped,phase:'preparing'};
   worker.on('message',message=>{if(done)return;if(message?.prepared){if(!live()){cancel();return;}this.job!.phase='committing';worker.postMessage('commit');return;}if(message?.ok)finish(undefined,message.item);else finish(message?.cancelled?new CaptureCancelledError():new Error(message?.error||t('记录未完成，请重试')));});worker.once('error',error=>finish(error));worker.once('exit',()=>finish(new Error(t('记录未完成，请重试'))));
  });
 }
}
