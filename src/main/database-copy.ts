import {t as tr} from '../shared/i18n';
import {Store} from './store';
import {databaseFingerprint} from './database-check';
/** Copy through an encrypted destination connection; never create a plaintext staging file. */
export function copyDatabase(source:Store,file:string,key?:Uint8Array){
 const target=new Store(file,false,false,key);source.db.exec('SAVEPOINT cipher_copy');
 try{const fingerprint=databaseFingerprint(source.db);target.db.exec('BEGIN');
  for(const table of ['clips','snippets','meta']){const columns=table==='clips'?['id','hash','updated','data']:table==='snippets'?['id','data']:['key','value'];const insert=target.db.prepare(`INSERT OR REPLACE INTO ${table} VALUES(${columns.map(()=>'?').join(',')})`);for(const row of source.db.prepare(`SELECT * FROM ${table}`).iterate())insert.run(...columns.map(c=>row[c]));}
  target.db.exec('COMMIT');if(databaseFingerprint(target.db)!==fingerprint)throw new Error(tr('加密副本校验失败'));return fingerprint;
 }catch(e){try{target.db.exec('ROLLBACK');}catch{}throw e;}finally{try{source.db.exec('RELEASE cipher_copy');}finally{target.close();}}
}
