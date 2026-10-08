import {utilityProcess} from 'electron';
import {join} from 'node:path';
import {limitChildProcess} from './native';
import {MAX_ITEM} from '../shared/core';
import {t as tr} from '../shared/i18n';

let active=0;
export function decodeHEIC(bytes:Buffer,valid:()=>boolean):Promise<string>{
 if(!valid())return Promise.reject(new Error(tr('记录已取消')));
 if(active>=2)return Promise.reject(new Error(tr('正在保存剪贴板，请稍后')));
 active++;
 return new Promise((resolve,reject)=>{
  let worker:Electron.UtilityProcess|undefined,release:(()=>void)|undefined,monitor:NodeJS.Timeout|undefined,done=false;
  const finish=(error?:Error,png?:string)=>{if(done)return;done=true;clearInterval(monitor);worker?.kill();release?.();active--;error?reject(error):resolve(png!);};
  try{
   worker=utilityProcess.fork(join(__dirname,'heic-decode-worker.cjs'),[],{stdio:'ignore',serviceName:'Clip image decoder'});
   const deadline=Date.now()+15000;
   monitor=setInterval(()=>{if(!valid()||Date.now()>deadline)finish(new Error(tr(valid()?'图片无法解码':'记录已取消')));},50);monitor.unref();
   worker.once('spawn',()=>{try{if(!valid())throw new Error(tr('记录已取消'));release=limitChildProcess(worker!.pid!,512);worker!.postMessage({data:bytes.toString('base64')});}catch(error){finish(error as Error);}});
   worker.once('exit',()=>finish(new Error(tr('图片无法解码'))));
   worker.once('message',value=>{if(!valid())finish(new Error(tr('记录已取消')));else if(typeof value?.png!=='string'||value.png.length>MAX_ITEM*1.34)finish(new Error(tr('图片无法解码')));else finish(undefined,value.png);});
  }catch(error){finish(error as Error);}
 });
}
