import {Worker} from 'node:worker_threads';
import {join} from 'node:path';
import {t,interfaceLanguage} from '../shared/i18n';
import type {Category} from '../shared/types';
export class HistorySearch {
 private jobs=new Map<number,{cancel:()=>void;stopped:Promise<void>}>();private epochs=new Map<number,number>();
 constructor(private workerFile=join(__dirname,'search-worker.cjs'),private timeout=30000){}
 private stop(caller:number){const job=this.jobs.get(caller);job?.cancel();return job?.stopped||Promise.resolve();}
 async cancel(caller?:number){const callers=caller===undefined?[...new Set([...this.jobs.keys(),...this.epochs.keys()])]:[caller],epochs=callers.map(id=>{const epoch=(this.epochs.get(id)||0)+1;this.epochs.set(id,epoch);return epoch;});await Promise.all(callers.map(id=>this.stop(id)));callers.forEach((id,i)=>{if(this.epochs.get(id)===epochs[i]&&!this.jobs.has(id))this.epochs.delete(id);});}
 async run(caller:number,source:string,query:string,category:Category|undefined,key:Uint8Array|undefined,valid:()=>boolean):Promise<string[]>{
  const epoch=(this.epochs.get(caller)||0)+1;this.epochs.set(caller,epoch);
  try{await this.stop(caller);if(!valid()||this.epochs.get(caller)!==epoch)return [];
   return await new Promise<string[]>((resolve,reject)=>{
    const worker=new Worker(this.workerFile,{workerData:{source,query,category,key,language:interfaceLanguage()},resourceLimits:{maxOldGenerationSizeMb:96}});key?.fill(0);
    let done=false,release!:()=>void;const stopped=new Promise<void>(resolve=>release=resolve);
    const finish=(error?:Error,ids:string[]=[])=>{if(done)return;done=true;clearTimeout(timer);const finished=()=>{
     if(this.jobs.get(caller)?.stopped===stopped)this.jobs.delete(caller);release();
     if(!valid()||this.epochs.get(caller)!==epoch){resolve([]);return;}error?reject(error):resolve(ids);
    };void worker.terminate().then(finished,finished);};
    const cancel=()=>finish();this.jobs.set(caller,{cancel,stopped});const timer=setTimeout(()=>finish(new Error(t('搜索超时，请缩小范围后重试'))),this.timeout);timer.unref();
    worker.once('message',message=>finish(message?.ok?undefined:new Error(message?.error||t('搜索未完成，请重试')),message?.ok?message.ids:[]));
    worker.once('error',error=>finish(error));worker.once('exit',()=>finish(new Error(t('搜索未完成，请重试'))));
   });
  }finally{key?.fill(0);if(this.epochs.get(caller)===epoch&&!this.jobs.has(caller))this.epochs.delete(caller);}
 }
}
