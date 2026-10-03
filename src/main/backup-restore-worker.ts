import {parentPort,workerData} from 'node:worker_threads';
import {statSync} from 'node:fs';
import {Store} from './store';
import {parseBackup} from './backup-crypto';
import {validateBackup} from '../shared/core';
import type {Thumbnails} from './thumbnails';
import {SyncLedger} from './sync-ledger';
import {setInterfaceLanguage,t} from '../shared/i18n';
import type {SyncMutation} from './sync-receiver';
setInterfaceLanguage(workerData.language);
const flags=new Int32Array(workerData.flags);
let snapshot:Uint8Array|undefined=workerData.snapshot,store:Store|undefined;
workerData.snapshot=undefined;
const check=()=>{if(Atomics.load(flags,0)!==0)throw new Error(t('备份已取消或处理超时，请稍后重试'));};
const close=()=>{snapshot?.fill(0);snapshot=undefined;try{store?.db.close();}catch{}store=undefined;Atomics.store(flags,1,0);};
const fail=(error:unknown)=>{close();parentPort!.postMessage({ok:false,error:String(error instanceof Error?error.message:error).slice(0,1000)});};
void (async()=>{let thumbnails:Thumbnails|undefined;try{
 check();if(!snapshot)throw new Error(t('请先校验并预览备份'));
 const value=parseBackup(Buffer.from(snapshot.buffer,snapshot.byteOffset,snapshot.byteLength));snapshot.fill(0);snapshot=undefined;
 const validated=validateBackup(value),rendered=new Map<string,string>();
 for(const entries of [validated.clips,validated.snippets])for(const entry of entries)if(entry.payload.png&&!rendered.has(entry.payload.png)){
  check();Atomics.store(flags,1,1);try{thumbnails??=new (await import('./thumbnails')).Thumbnails(workerData.imageHost,15000);check();rendered.set(entry.payload.png,(await thumbnails.run(entry.payload,()=>Atomics.load(flags,0)===0))!);}finally{await thumbnails?.stop();Atomics.store(flags,1,0);}
 }
 check(); // A fresh key is supplied only when the serialized commit actually starts.
 parentPort!.once('message',message=>{const commitKey:Uint8Array|undefined=message?.key;try{
  // Protect an open database from hard termination; cancellation rolls back cooperatively.
  Atomics.store(flags,1,2);
  check();if(!message?.commit||!statSync(workerData.source).isFile())throw new Error(t('内容校验已失效'));
  try{store=new Store(workerData.source,false,false,commitKey,true);}finally{commitKey?.fill(0);}
  const ledger=new SyncLedger(()=>store!,()=>store!.meta('lan-config',{}).id||'');
  const mutations:{previous?:SyncMutation;next?:SyncMutation}[]=[];
  const compact=(item:SyncMutation|undefined)=>item?{id:item.id,...(item.localOnly!==undefined?{localOnly:item.localOnly}:{})}:undefined;
  store.onChange=(previous,next)=>{check();ledger.observe(previous,next);mutations.push({previous:compact(previous),next:compact(next)});};
  const count=store.import(value,p=>{check();return p.png?rendered.get(p.png):undefined;},{check,beforeCommit:()=>{if(Atomics.compareExchange(flags,0,0,2)!==0)check();}});
  Atomics.store(flags,0,3);const categories=store.categories;close();parentPort!.postMessage({ok:true,count,categories,mutations});
 }catch(error){fail(error);}finally{commitKey?.fill(0);}});
 parentPort!.postMessage({prepared:true});
}catch(error){fail(error);}finally{await thumbnails?.stop();}})();
