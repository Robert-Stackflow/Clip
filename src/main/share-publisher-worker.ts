import {parentPort,workerData} from 'node:worker_threads';
import {statSync} from 'node:fs';
import {Store,prepareCapture} from './store';
import {SyncLedger} from './sync-ledger';
import {snapshotSyncFiles} from './sync-files-core';
import {setInterfaceLanguage,t} from '../shared/i18n';
import {SyncError,syncErrorResponse} from '../shared/sync-errors';
import type {SyncMutation} from './sync-receiver';
setInterfaceLanguage(workerData.language);
const flag=new Int32Array(workerData.flag),key:Uint8Array|undefined=workerData.key;workerData.key=undefined;let store:Store|undefined,transaction=false;
const live=()=>{if(Atomics.load(flag,0)!==0)throw new Error(t('文件共享已取消'));};
const close=()=>{key?.fill(0);try{store?.db.close();}catch{}store=undefined;};
const failed=(error:unknown)=>{if(transaction)try{store?.db.exec('ROLLBACK');}catch{}transaction=false;close();parentPort!.postMessage({ok:false,...syncErrorResponse(error)});};
void (async()=>{try{
 live();if(!statSync(workerData.source).isFile())throw new SyncError('SYNC_RECORD_INVALID');store=new Store(workerData.source,false,false,key,true);key?.fill(0);
 let source=store.get(workerData.id);if(source.hash!==workerData.hash||source.localOnly)throw new SyncError(source.localOnly?'SYNC_LOCAL_ONLY':'SYNC_RECORD_CHANGED');
 const token=source.payload.files?prepareCapture({attachments:await snapshotSyncFiles(source.payload.files)}):undefined;source=undefined!;live();
 const ledger=new SyncLedger(()=>store!,()=>workerData.identity),mutations:{previous?:SyncMutation;next?:SyncMutation}[]=[];const compact=(item:SyncMutation|undefined)=>item?{id:item.id,...(item.localOnly!==undefined?{localOnly:item.localOnly}:{})}:undefined;
 store.onChange=(previous,next)=>{ledger.observe(previous,next);mutations.push({previous:compact(previous),next:compact(next)});};
 parentPort!.once('message',message=>{try{
  if(!message?.commit)throw new SyncError('SYNC_RECORD_INVALID');live();store!.db.exec('BEGIN IMMEDIATE');transaction=true;live();const original=store!.identity(workerData.id);if(!original||original.hash!==workerData.hash||original.localOnly)throw new Error(t('文件共享已取消'));
  let id=workerData.id;if(token){const previous=store!.preview(id),item=store!.addPrepared(token,t('共享文件副本'),undefined,{favorite:previous.favorite,pinned:previous.pinned,tags:previous.tags},false,{retained:false,resetRetained:true});if(item.localOnly)throw new SyncError('SYNC_LOCAL_ONLY');ledger.publishPrepared(item);id=item.id;}else ledger.publish(id);
  if(Atomics.compareExchange(flag,0,0,2)!==0)throw new Error(t('文件共享已取消'));store!.db.exec('COMMIT');transaction=false;Atomics.store(flag,0,3);close();parentPort!.postMessage({ok:true,id,mutations});
 }catch(error){failed(error);}});parentPort!.postMessage({prepared:true});
}catch(error){failed(error);}})();
