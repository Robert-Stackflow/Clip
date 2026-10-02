import type {DatabaseConnection} from './database';
import {createHash} from 'node:crypto';
import {Store} from './store';
import {validateBackup,MAX_TOTAL} from '../shared/core';

export function databaseFingerprint(db:DatabaseConnection){
 const hash=createHash('sha256');
 for(const table of ['clips','snippets','meta']){hash.update(table);for(const row of db.prepare(`SELECT * FROM ${table} ORDER BY ${table==='meta'?'key':'id'}`).iterate())hash.update(JSON.stringify(row)+'\n');}
 return hash.digest('hex');
}
/** Read-only inspection: no migration, pruning or settings writes to the source. */
export function inspectDatabase(file:string,key?:Uint8Array){
 const store=new Store(file,false,true,key);
 try{
  if((store.db.prepare('PRAGMA quick_check').get() as any).quick_check!=='ok')throw new Error('数据完整性检查失败');
  const empty={format:'clipper-backup',version:Math.max(5,Number((store.db.prepare('PRAGMA user_version').get() as any).user_version)),clips:[],snippets:[],categories:[],scripts:[]};let clips=0,snippets=0;
  for(const row of store.db.prepare('SELECT id,hash,updated,data FROM clips').iterate() as Iterable<any>){
   const c=JSON.parse(row.data);validateBackup({...empty,clips:[c]});
   if(c.id!==row.id||c.hash!==row.hash||c.updatedAt!==row.updated||typeof c.title!=='string'||typeof c.preview!=='string')throw new Error('历史记录索引无效');
   clips++;
  }
  for(const row of store.db.prepare('SELECT id,data FROM snippets').iterate() as Iterable<any>){const s=JSON.parse(row.data);validateBackup({...empty,snippets:[s]});if(s.id!==row.id)throw new Error('模板索引无效');snippets++;}
  const scripts=store.meta('text-scripts',[]);validateBackup({...empty,categories:store.categories,scripts});
  if(store.bytes()>MAX_TOTAL)throw new Error('历史数据超过容量限制');
  const profileId=store.meta('profile-id','');if(profileId&&!/^[0-9a-f-]{36}$/.test(profileId))throw new Error('资料编号无效');
  return {clips,snippets,categories:store.categories.length,scripts:scripts.length,profileId,fingerprint:databaseFingerprint(store.db)};
 }finally{store.close();}
}
