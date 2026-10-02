import {parentPort,workerData} from 'node:worker_threads';
import {statSync} from 'node:fs';
import {Store} from './store';
import {SyncLedger} from './sync-ledger';
import {payloadDigest} from './payload-digest';
import {validatePayload} from '../shared/core';
import {payloadSyncVersion} from '../shared/formats';
import {syncRecord,MAX_SYNC_BODY} from '../shared/sync';
import {SyncError,syncErrorResponse} from '../shared/sync-errors';
import {setInterfaceLanguage,t} from '../shared/i18n';
import type {SyncMutation} from './sync-receiver';
setInterfaceLanguage(workerData.language);
const flag=new Int32Array(workerData.flag),key:Uint8Array|undefined=workerData.key;let bytes:Uint8Array|undefined=workerData.bytes,store:Store|undefined,value:any,transaction=false;
workerData.bytes=undefined;workerData.key=undefined;
const close=()=>{key?.fill(0);bytes?.fill(0);bytes=undefined;value=undefined;try{store?.db.close();}catch{}store=undefined;};
const failure=(error:unknown)=>{if(transaction)try{store?.db.exec('ROLLBACK');}catch{}transaction=false;close();parentPort!.postMessage({ok:false,...syncErrorResponse(error)});};
try{
 if(!bytes||bytes.byteLength>MAX_SYNC_BODY)throw new SyncError('SYNC_REQUEST_TOO_LARGE');
 try{value=JSON.parse(Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength).toString('utf8'));}finally{bytes.fill(0);bytes=undefined;}
 if(Atomics.load(flag,0)!==0)throw new SyncError('SYNC_STOPPED');
 if(value.payload&&payloadSyncVersion(value.payload)>workerData.version)throw new SyncError('SYNC_ATTACHMENT_UPGRADE');
 const record=syncRecord(value.record);if(workerData.expected&&JSON.stringify(record)!==JSON.stringify(workerData.expected))throw new Error(t('设备内容已改变，请重试'));
 if(record.deleted){value=undefined;key?.fill(0);parentPort!.once('message',()=>{});parentPort!.postMessage({prepared:true,record});}
 else{
  if(!statSync(workerData.source).isFile())throw new SyncError('SYNC_RECORD_INVALID');
  store=new Store(workerData.source,false,false,key,true);key?.fill(0);let thumbnail:string|undefined;const ledger=new SyncLedger(()=>store!,()=>'',()=>thumbnail),mutations:{previous?:SyncMutation;next?:SyncMutation}[]=[];
  const compact=(item:SyncMutation|undefined)=>item?{id:item.id,...(item.localOnly!==undefined?{localOnly:item.localOnly}:{})}:undefined;
  store.onChange=(previous,next)=>{ledger.observe(previous,next);mutations.push({previous:compact(previous),next:compact(next)});};
  let png:string|undefined;
  // Native PNG decoding remains on the main thread. Only a validated, matching PNG crosses back.
  // Existing publications still ignore malformed replay bodies as before; commit rechecks the ledger.
  if(value.payload?.png){try{const valid=validatePayload(value.payload);if(payloadDigest(valid)!==record.hash)throw new SyncError('SYNC_CONTENT_MISMATCH');png=valid.png;}catch(error){if(!ledger.entries().some(e=>e.id===record.id))throw error;}}
  parentPort!.postMessage({prepared:true,record,png});
  parentPort!.once('message',message=>{try{
   if(!message?.commit||Atomics.load(flag,0)!==0)throw new SyncError('SYNC_STOPPED');
   thumbnail=message.thumbnail;store!.db.exec('BEGIN IMMEDIATE');transaction=true;if(Atomics.load(flag,0)!==0)throw new SyncError('SYNC_STOPPED');
   const changed=ledger.apply(record,value.payload);
   if(Atomics.compareExchange(flag,0,0,2)!==0)throw new SyncError('SYNC_STOPPED');
   store!.db.exec('COMMIT');transaction=false;Atomics.store(flag,0,3);close();parentPort!.postMessage({ok:true,changed,mutations});
  }catch(error){failure(error);}});
 }
}catch(error){failure(error);}
