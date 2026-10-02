import {parentPort,workerData} from 'node:worker_threads';
import {openDatabase,type DatabaseConnection} from './database';
import {SyncError} from '../shared/sync-errors';
import {payloadSyncVersion} from '../shared/formats';
import {setInterfaceLanguage,t} from '../shared/i18n';
import {MAX_SYNC_BODY,type SyncRecord} from '../shared/sync';
setInterfaceLanguage(workerData.language);
const key:Uint8Array|undefined=workerData.key;let db:DatabaseConnection|undefined;
try{
 db=openDatabase(workerData.source,true,key);key?.fill(0);db.exec('BEGIN');
 const schema=Number(db.prepare('PRAGMA user_version').get().user_version);if(schema!==7)throw new Error(t('内容校验已失效'));
 const index=db.prepare("SELECT value FROM meta WHERE key='lan-index'").get();
 const entry=(index?JSON.parse(index.value):[]).find((value:SyncRecord)=>value.id===workerData.id);
 if(!entry||entry.deleted||!entry.localId)throw new SyncError('SYNC_ITEM_WITHDRAWN');
 const row=db.prepare('SELECT i.data,p.payload FROM clips c JOIN clip_list_cache i ON i.id=c.id JOIN clip_preview_cache p ON p.id=c.id WHERE c.id=?').get(entry.localId);
 if(!row)throw new SyncError('SYNC_ITEM_WITHDRAWN');const clip=JSON.parse(row.data),preview=JSON.parse(row.payload);
 if(clip.localOnly||!clip.shared||clip.hash!==entry.hash)throw new SyncError('SYNC_SEND_DENIED');
 const version=payloadSyncVersion(preview);
 if(version>workerData.version)throw new SyncError(version>=5?'SYNC_ATTACHMENT_UPGRADE':'SYNC_FORMAT_UPGRADE');
 // SQLite supplies the stored payload JSON directly. Avoid parsing binary strings and
 // stringifying them again; original data stays byte-for-byte inside this snapshot.
 const payload=db.prepare("SELECT json_extract(data,'$.payload') AS value FROM clips WHERE id=? AND json_type(data,'$.payload')='object'").get(entry.localId)?.value;
 if(typeof payload!=='string')throw new SyncError('SYNC_SEND_DENIED');
 const {localId,minimumVersion,...record}=entry,prefix='{"record":'+JSON.stringify(record)+',"payload":',prefixBytes=Buffer.byteLength(prefix),length=prefixBytes+Buffer.byteLength(payload)+1;
 if(length>MAX_SYNC_BODY)throw new SyncError('SYNC_REQUEST_TOO_LARGE');
 const bytes=new Uint8Array(length),encoder=new TextEncoder();encoder.encodeInto(prefix,bytes);encoder.encodeInto(payload,bytes.subarray(prefixBytes));bytes[length-1]=125;
 db.exec('ROLLBACK');db.close();db=undefined;parentPort!.postMessage({ok:true,record,bytes},[bytes.buffer]);
}catch(error){parentPort!.postMessage({ok:false,code:error instanceof SyncError?error.code:undefined,error:(error as Error).message});}
finally{key?.fill(0);db?.close();}
