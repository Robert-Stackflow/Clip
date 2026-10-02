import {t as tr,interfaceLanguage} from '../shared/i18n';
import {Worker} from 'node:worker_threads';
import {join} from 'node:path';
import {validatePayload} from '../shared/core';
import type {Payload} from '../shared/types';
export class SyncFiles {
 private active?:()=>void;
 cancel(){this.active?.();}
 read(files:string[],valid:()=>boolean):Promise<Payload>{if(this.active)throw new Error(tr('正在保存另一组共享文件，请稍后重试'));if(!valid())throw new Error(tr('文件共享已取消'));
  return new Promise((resolve,reject)=>{let done=false;const worker=new Worker(join(__dirname,'sync-files-worker.cjs'),{workerData:{files,language:interfaceLanguage()},resourceLimits:{maxOldGenerationSizeMb:192}});
   const finish=(error?:Error,payload?:Payload)=>{if(done)return;done=true;clearTimeout(timer);this.active=undefined;void worker.terminate();error?reject(error):resolve(payload!);};
   const timer=setTimeout(()=>finish(new Error(tr('读取共享文件超过 30 秒，已停止'))),30000);this.active=()=>finish(new Error(tr('文件共享已取消')));
   worker.on('error',e=>finish(e));worker.on('exit',()=>finish(new Error(tr('共享文件读取进程已停止'))));worker.once('message',value=>{try{if(!valid())throw new Error(tr('文件共享已取消'));if(!value?.ok)throw new Error(value?.error||tr('无法保存共享文件'));finish(undefined,validatePayload({attachments:value.attachments}));}catch(e){finish(e as Error);}});
  });
 }
}
