import {SyncError} from '../shared/sync-errors';
import {t as tr} from '../shared/i18n';
import {randomUUID} from 'node:crypto';
import {payloadDigest} from './payload-digest';
import {Store} from './store';
import {payloadSyncVersion} from '../shared/formats';
import {validatePayload} from '../shared/core';
import {syncRecord,type SyncRecord} from '../shared/sync';
import type {Detail,Payload} from '../shared/types';
interface Entry extends SyncRecord {localId?:string;minimumVersion?:number}
export class SyncLedger {
 private suppress=false;
 constructor(private store:()=>Store,private identity:()=>string,private thumbnail:(p:Payload)=>string|undefined=()=>undefined){}
 entries():Entry[]{return this.store().meta('lan-index',[]);}
 manifest(version:number|boolean=5):SyncRecord[]{const supported=typeof version==='boolean'?(version?5:3):version;return this.entries().filter(e=>e.deleted||!e.localId||supported>=5||this.versionFor(e)<=supported).map(({localId,minimumVersion,...record})=>record);}
 /** Recheck withdrawal/privacy immediately before releasing an encoded read-only snapshot. */
 canSend(record:SyncRecord){const entry=this.entries().find(e=>e.id===record.id);if(!entry||entry.deleted||entry.hash!==record.hash||entry.createdAt!==record.createdAt||!entry.localId)return false;const clip=this.store().identity(entry.localId);return !!clip&&clip.hash===record.hash&&!clip.localOnly&&!!clip.shared;}
 minimumVersion(id:string){const entry=this.entries().find(e=>e.id===id);if(!entry||entry.deleted||!entry.localId)throw new SyncError('SYNC_ITEM_WITHDRAWN');return this.versionFor(entry);}
 itemBytes(id:string){const entry=this.entries().find(e=>e.id===id);if(!entry||entry.deleted||!entry.localId)throw new SyncError('SYNC_ITEM_WITHDRAWN');return this.store().preview(entry.localId).bytes;}
 private versionFor(entry:Entry){if(entry.minimumVersion!==undefined)return entry.minimumVersion;const payload=this.store().preview(entry.localId!).payload;return payloadSyncVersion({attachments:payload.attachments,formats:payload.formats?.map(f=>({name:f.name,data:''})),omittedFormats:payload.omittedFormats});}
 private persist(entries:Entry[]){if(entries.length>20000)throw new SyncError('SYNC_INDEX_LIMIT');this.store().setMeta('lan-index',entries);}
 private transaction<T>(fn:()=>T):T{const s=this.store(),q=[...s.queue],shelf=[...s.shelf];s.db.exec('SAVEPOINT lan_change');const before=this.suppress;this.suppress=true;try{const result=fn();s.db.exec('RELEASE lan_change');return result;}catch(e){s.db.exec('ROLLBACK TO lan_change; RELEASE lan_change');s.queue=q;s.shelf=shelf;throw e;}finally{this.suppress=before;}}
 publish(localId:string){return this.transaction(()=>{const s=this.store(),clip=s.get(localId);if(clip.payload.files)throw new SyncError('SYNC_FILES_UNSUPPORTED');if(clip.localOnly)throw new SyncError('SYNC_LOCAL_ONLY');const entries=this.entries();if(!entries.some(e=>!e.deleted&&e.localId===clip.id)){entries.push({id:this.identity()+'.'+randomUUID(),hash:clip.hash,createdAt:Date.now(),deleted:false,localId:clip.id,minimumVersion:payloadSyncVersion(clip.payload)});this.persist(entries);}clip.shared=true;clip.syncRetained=false;s.save(clip);});}
 /** Store has already saved the validated snapshot as shared in this transaction. */
 publishPrepared(clip:Detail){return this.transaction(()=>{const identity=this.store().identity(clip.id);if(!identity||identity.hash!==clip.hash||!identity.shared||identity.localOnly||clip.syncRetained||clip.payload.files)throw new SyncError('SYNC_SEND_DENIED');const entries=this.entries();if(!entries.some(e=>!e.deleted&&e.localId===clip.id)){entries.push({id:this.identity()+'.'+randomUUID(),hash:clip.hash,createdAt:Date.now(),deleted:false,localId:clip.id,minimumVersion:payloadSyncVersion(clip.payload)});this.persist(entries);}});}
 private tombstone(localId:string){const entries=this.entries();for(const entry of entries)if(entry.localId===localId){entry.deleted=true;delete entry.localId;}this.persist(entries);}
 local(localId:string,only:boolean){if(typeof only!=='boolean')throw new SyncError('SYNC_OPTIONS_INVALID');return this.transaction(()=>{const clip=this.store().get(localId);this.tombstone(localId);clip.shared=false;clip.localOnly=only;this.store().save(clip);});}
 observe(previous:Detail|undefined,next?:Detail){if(this.suppress||!previous?.shared)return;if(!next){this.tombstone(previous.id);return;}if(next.hash!==previous.hash){this.tombstone(previous.id);this.publish(next.id);}}
 item(id:string){const entry=this.entries().find(e=>e.id===id);if(!entry||entry.deleted)throw new SyncError('SYNC_ITEM_WITHDRAWN');const clip=this.store().get(entry.localId!);if(clip.localOnly||!clip.shared||clip.hash!==entry.hash)throw new SyncError('SYNC_SEND_DENIED');const {localId,minimumVersion,...record}=entry;return {record,payload:clip.payload};}
 apply(value:unknown,payload?:unknown,preparedThumbnail?:{value:string|undefined}){const record=syncRecord(value);return this.transaction(()=>{
  const s=this.store(),entries=this.entries(),existing=entries.find(e=>e.id===record.id);if(existing&&(existing.hash!==record.hash||existing.createdAt!==record.createdAt))throw new SyncError('SYNC_RECORD_CHANGED');if(existing?.deleted)return false;
  if(record.deleted){const localId=existing?.localId;if(existing)Object.assign(existing,record,{localId:undefined});else entries.push(record);this.persist(entries);
   if(localId&&!entries.some(e=>!e.deleted&&e.localId===localId)){const clip=s.find(localId);if(clip?.shared&&!clip.localOnly){if(clip.syncRetained){clip.shared=false;clip.syncRetained=false;s.save(clip);}else s.delete(localId);}}return true;
  }
  if(existing)return false;const valid=validatePayload(payload);if(valid.files)throw new SyncError('SYNC_FILE_RECEIVE_DENIED');const hash=payloadDigest(valid);if(hash!==record.hash)throw new SyncError('SYNC_CONTENT_MISMATCH');
  const row=s.db.prepare('SELECT id FROM clips WHERE hash=?').get(hash) as {id:string}|undefined,same=row?s.identity(row.id):undefined;if(same?.localOnly){entries.push({...record,deleted:true});this.persist(entries);return true;}
  const retain=!!same&&!same.shared;const clip=s.add(valid,'局域网同步',preparedThumbnail?preparedThumbnail.value:this.thumbnail(valid),undefined,false,{retained:retain});entries.push({...record,localId:clip.id,minimumVersion:payloadSyncVersion(valid)});this.persist(entries);return true;
 });}
}
