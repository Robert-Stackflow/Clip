import {t as tr,interfaceLanguage} from '../shared/i18n';
import {utilityProcess,type UtilityProcess} from 'electron';
import {join} from 'node:path';
import type {Detail} from '../shared/types';
import {requestId} from '../shared/text-tools';
import {metadataKind,validateMetadataResult,validateMetadataTarget,type MetadataRequest,type MetadataResult} from '../shared/metadata';
import {metadataSource} from './metadata-source';
import {limitChildProcess} from './native';
export class MetadataService {
 private active?:{id:string;child:UtilityProcess;cancel:()=>void};
 read(item:Detail,value:MetadataRequest,valid:()=>boolean):Promise<MetadataResult>{if(!value||typeof value.includeLocation!=='boolean'||value.password!==undefined&&(typeof value.password!=='string'||Buffer.byteLength(value.password)>2048))throw new Error(tr('内部信息请求无效'));requestId(value.requestId);validateMetadataTarget(value.target);if(!valid())throw new Error(tr('记录已改变或历史已锁定'));const source=metadataSource(item,value.target);if(!metadataKind(source.name))throw new Error(tr('暂不支持此文件的内部信息'));this.dispose();
  return new Promise((resolve,reject)=>{let done=false,release=()=>{};const child=utilityProcess.fork(join(__dirname,'metadata-worker.cjs'),[],{serviceName:tr('Clipper 内容信息'),stdio:'ignore',execArgv:['--max-old-space-size=192'],env:{SystemRoot:process.env.SystemRoot||'C:\\Windows',TEMP:process.env.TEMP||'',TMP:process.env.TMP||'',CLIPPER_UI_LANGUAGE:interfaceLanguage()}});
   const finish=(error?:Error,result?:MetadataResult)=>{if(done)return;done=true;clearTimeout(timer);if(this.active?.child===child)this.active=undefined;child.kill();release();if('bytes'in source)source.bytes.fill(0);error?reject(error):resolve(result!);};const timer=setTimeout(()=>finish(new Error(tr('内部信息读取超过 15 秒，已停止'))),15000);this.active={id:value.requestId,child,cancel:()=>finish(new Error(tr('内部信息读取已取消')))};
   child.on('exit',()=>finish(new Error(tr('内部信息解析进程已停止，可能超过容量限制'))));child.on('message',(message:any)=>{try{if(!valid())throw new Error(tr('记录已改变或历史已锁定'));if(!message?.ok)throw new Error(typeof message?.error==='string'?message.error.slice(0,300):tr('无法读取内部信息'));finish(undefined,validateMetadataResult(message.result));}catch(e){finish(e as Error);}});child.once('spawn',()=>{if(done)return;try{if(!valid()||!child.pid)throw new Error(tr('内部信息读取已取消'));release=limitChildProcess(child.pid,512);child.postMessage({source,includeLocation:value.includeLocation,password:value.password||''});}catch(e){finish(e as Error);}});
  });
 }
 cancel(id:string){requestId(id);if(this.active?.id===id)this.active.cancel();}
 dispose(){this.active?.cancel();}
}
