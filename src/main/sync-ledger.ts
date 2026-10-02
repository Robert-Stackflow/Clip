import {createHash,randomUUID} from 'node:crypto';
import {Store} from './store';
import {validatePayload} from '../shared/core';
import {syncRecord,type SyncRecord} from '../shared/sync';
import type {Detail,Payload} from '../shared/types';
interface Entry extends SyncRecord {localId?:string}
export class SyncLedger {
 private suppress=false;
 constructor(private store:()=>Store,private identity:()=>string,private thumbnail:(p:Payload)=>string|undefined=()=>undefined){}
 entries():Entry[]{return this.store().meta('lan-index',[]);}
 manifest(extended=true):SyncRecord[]{const hidden=extended?new Set<string>():new Set((this.store().db.prepare("SELECT id FROM clips WHERE coalesce(json_array_length(data,'$.payload.formats'),0)>0").all() as {id:string}[]).map(row=>row.id));return this.entries().filter(e=>e.deleted||!e.localId||!hidden.has(e.localId)).map(({localId,...record})=>record);}
 private persist(entries:Entry[]){if(entries.length>20000)throw new Error('同步目录已达 20,000 条，请停止新增共享并保留本机内容');this.store().setMeta('lan-index',entries);}
 private transaction<T>(fn:()=>T):T{const s=this.store(),q=[...s.queue],shelf=[...s.shelf];s.db.exec('SAVEPOINT lan_change');const before=this.suppress;this.suppress=true;try{const result=fn();s.db.exec('RELEASE lan_change');return result;}catch(e){s.db.exec('ROLLBACK TO lan_change; RELEASE lan_change');s.queue=q;s.shelf=shelf;throw e;}finally{this.suppress=before;}}
 publish(localId:string){return this.transaction(()=>{const s=this.store(),clip=s.get(localId);if(clip.payload.files||clip.payload.attachments)throw new Error('仅支持文字和图片同步，不发送文件路径');if(clip.localOnly)throw new Error('此内容已设为仅本机，请先允许同步');const entries=this.entries();if(!entries.some(e=>!e.deleted&&e.localId===clip.id)){entries.push({id:this.identity()+'.'+randomUUID(),hash:clip.hash,createdAt:Date.now(),deleted:false,localId:clip.id});this.persist(entries);}clip.shared=true;clip.syncRetained=false;s.save(clip);});}
 private tombstone(localId:string){const entries=this.entries();for(const entry of entries)if(entry.localId===localId){entry.deleted=true;delete entry.localId;}this.persist(entries);}
 local(localId:string,only:boolean){if(typeof only!=='boolean')throw new Error('共享设置无效');return this.transaction(()=>{const clip=this.store().get(localId);this.tombstone(localId);clip.shared=false;clip.localOnly=only;this.store().save(clip);});}
 observe(previous:Detail|undefined,next?:Detail){if(this.suppress||!previous?.shared)return;if(!next){this.tombstone(previous.id);return;}if(next.hash!==previous.hash){this.tombstone(previous.id);this.publish(next.id);}}
 item(id:string){const entry=this.entries().find(e=>e.id===id);if(!entry||entry.deleted)throw new Error('共享内容已撤回');const clip=this.store().get(entry.localId!);if(clip.localOnly||!clip.shared||clip.hash!==entry.hash)throw new Error('此记录不允许发送');const {localId,...record}=entry;return {record,payload:clip.payload};}
 apply(value:unknown,payload?:unknown){const record=syncRecord(value);return this.transaction(()=>{
  const s=this.store(),entries=this.entries(),existing=entries.find(e=>e.id===record.id);if(existing&&(existing.hash!==record.hash||existing.createdAt!==record.createdAt))throw new Error('同一发布的内容不允许被替换');if(existing?.deleted)return false;
  if(record.deleted){const localId=existing?.localId;if(existing)Object.assign(existing,record,{localId:undefined});else entries.push(record);this.persist(entries);
   if(localId&&!entries.some(e=>!e.deleted&&e.localId===localId)){const clip=s.find(localId);if(clip?.shared&&!clip.localOnly){if(clip.syncRetained){clip.shared=false;clip.syncRetained=false;s.save(clip);}else s.delete(localId);}}return true;
  }
  if(existing)return false;const valid=validatePayload(payload);if(valid.files||valid.attachments)throw new Error('不接受文件路径同步');const hash=createHash('sha256').update(JSON.stringify(valid)).digest('hex');if(hash!==record.hash)throw new Error('同步内容校验失败');
  const same=s.db.prepare('SELECT data FROM clips WHERE hash=?').get(hash) as any;if(same&&JSON.parse(same.data).localOnly){entries.push({...record,deleted:true});this.persist(entries);return true;}
  const retain=!!same&&!JSON.parse(same.data).shared;const clip=s.add(valid,'局域网同步',this.thumbnail(valid),undefined,false);if(retain)clip.syncRetained=true;clip.shared=true;s.save(clip);entries.push({...record,localId:clip.id});this.persist(entries);return true;
 });}
}
