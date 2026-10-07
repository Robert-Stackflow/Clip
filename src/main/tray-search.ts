import {Worker} from 'node:worker_threads';
import {join} from 'node:path';
import {t,interfaceLanguage} from '../shared/i18n';
import type {TrayQuery} from '../shared/tray';
import type {TrayRows} from './tray-query';
/** One bounded, short-lived reader for the recent window; never retains history payloads. */
export class TraySearch{
 private revision=0;private job?:{cancel():void;stopped:Promise<void>};
 constructor(private workerFile=join(__dirname,'tray-query-worker.cjs'),private timeout=30000){}
 private stop(){this.job?.cancel();return this.job?.stopped||Promise.resolve();}
 cancel(){this.revision++;return this.stop();}
 async run(source:string,query:TrayQuery,key:Uint8Array|undefined,valid:()=>boolean,pinnedFirst=false):Promise<TrayRows>{
  const revision=++this.revision;
  try{await this.stop();if(!valid()||revision!==this.revision)throw new Error(t('最近记录查询已取消'));
   return await new Promise<TrayRows>((resolve,reject)=>{
    const worker=new Worker(this.workerFile,{workerData:{source,query,key,pinnedFirst,language:interfaceLanguage()},resourceLimits:{maxOldGenerationSizeMb:96}});key?.fill(0);
    let done=false,release!:()=>void;const stopped=new Promise<void>(resolve=>release=resolve);
    const finish=(error?:Error,result?:TrayRows)=>{if(done)return;done=true;clearTimeout(timer);const finished=()=>{
     if(this.job?.stopped===stopped)this.job=undefined;release();
     if(!valid()||revision!==this.revision){reject(new Error(t('最近记录查询已取消')));return;}
     if(error)reject(error);else if(result)resolve(result);else reject(new Error(t('最近记录查询已取消')));
    };void worker.terminate().then(finished,finished);};
    this.job={cancel:()=>finish(),stopped};const timer=setTimeout(()=>finish(new Error(t('搜索超时，请缩小范围后重试'))),this.timeout);timer.unref();
    worker.once('message',message=>finish(message?.ok?undefined:new Error(message?.error||t('搜索未完成，请重试')),message?.result));
    worker.once('error',error=>finish(error));worker.once('exit',()=>finish(new Error(t('搜索未完成，请重试'))));
   });
  }finally{key?.fill(0);}
 }
}
