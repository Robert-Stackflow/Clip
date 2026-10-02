import {t as tr,interfaceLanguage} from '../shared/i18n';
import {Worker} from 'node:worker_threads';
import {join} from 'node:path';
const jobs=new Set<()=>void>();
export function cancelRecoveryJobs(){for(const cancel of jobs)cancel();}
export function recoveryJob<T=any>(value:Record<string,unknown>,workerFile=join(__dirname,'recovery-worker.cjs'),timeout=180000):Promise<T>{
 return new Promise((resolve,reject)=>{const worker=new Worker(workerFile,{workerData:value,env:{...process.env,CLIPPER_UI_LANGUAGE:interfaceLanguage()},resourceLimits:{maxOldGenerationSizeMb:512}});let response:any,workerError:Error|undefined,cancelled=false,finished=false;const cancel=()=>{cancelled=true;void worker.terminate();};jobs.add(cancel);const timer=setTimeout(cancel,timeout);timer.unref();
 const finish=(error?:Error)=>{if(finished)return;finished=true;clearTimeout(timer);jobs.delete(cancel);error?reject(error):resolve(response.value);};worker.on('message',data=>response=data);worker.on('error',error=>workerError=error);worker.on('exit',code=>finish(cancelled?new Error(tr('恢复点处理已取消或超时')):workerError|| (code===0&&response?.ok?undefined:new Error(response?.error||tr('恢复点处理未完成')))));
 });
}
