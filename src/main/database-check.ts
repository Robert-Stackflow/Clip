import {t as tr} from '../shared/i18n';
import {openDatabase,type DatabaseConnection} from './database';
import {createHash} from 'node:crypto';
import {Store} from './store';
import {validateBackup,MAX_TOTAL} from '../shared/core';

/** Opening our existing profile needs its identity/schema, not every binary payload.
 * Import, recovery and version changes still use the full read-only inspection. */
export function startupDatabaseInfo(file:string,key?:Uint8Array,expectedProfile?:string){
 const db=openDatabase(file,true,key);
 try{
  db.exec('BEGIN');
  const schema=Number(db.prepare('PRAGMA user_version').get().user_version);
  if(schema>7)throw new Error(tr('数据库来自较新版本，请使用新版 Clip'));
  if(schema!==7)throw new Error(tr('不支持此历史数据库版本'));
  // Check primary table shapes before any writable connection or migration.
  db.prepare('SELECT id,hash,updated,data FROM clips LIMIT 0').all();
  db.prepare('SELECT id,data FROM snippets LIMIT 0').all();
  const read=(name:string)=>{const row=db.prepare('SELECT value FROM meta WHERE key=?').get(name);return row?JSON.parse(row.value):'';};
  const profileId=read('profile-id'),applicationVersion=read('application-version');
  if(expectedProfile&&profileId!==expectedProfile)throw new Error(tr('此目录不属于当前 Clip 数据'));
  if(profileId&& (typeof profileId!=='string'||!/^[0-9a-f-]{36}$/.test(profileId)))throw new Error(tr('资料编号无效'));
  return {schema,profileId,applicationVersion};
 }finally{db.close();}
}

export function databaseFingerprint(db:DatabaseConnection){
 const hash=createHash('sha256');
 for(const table of ['clips','snippets','meta']){hash.update(table);for(const row of db.prepare(`SELECT * FROM ${table} ORDER BY ${table==='meta'?'key':'id'}`).iterate())hash.update(JSON.stringify(row)+'\n');}
 return hash.digest('hex');
}
/** Read-only inspection: no migration, pruning or settings writes to the source. */
export function inspectDatabase(file:string,key?:Uint8Array){
 const store=new Store(file,false,true,key);
 try{
  if((store.db.prepare('PRAGMA quick_check').get() as any).quick_check!=='ok')throw new Error(tr('数据完整性检查失败'));
  const empty={format:'clip-backup',version:7,clips:[],snippets:[],categories:[],scripts:[]};let clips=0,snippets=0;
  for(const row of store.db.prepare('SELECT id,hash,updated,data FROM clips').iterate() as Iterable<any>){
   const c=JSON.parse(row.data);validateBackup({...empty,clips:[c]});
   if(c.id!==row.id||c.hash!==row.hash||c.updatedAt!==row.updated||typeof c.title!=='string'||typeof c.preview!=='string')throw new Error(tr('历史记录索引无效'));
   clips++;
  }
  for(const row of store.db.prepare('SELECT id,data FROM snippets').iterate() as Iterable<any>){const s=JSON.parse(row.data);validateBackup({...empty,snippets:[s]});if(s.id!==row.id)throw new Error(tr('模板索引无效'));snippets++;}
  const scripts=store.meta('text-scripts',[]);validateBackup({...empty,categories:store.categories,scripts,commands:store.meta('text-commands',[])});
  if(store.bytes()>MAX_TOTAL)throw new Error(tr('历史数据超过容量限制'));
  const profileId=store.meta('profile-id','');if(profileId&&!/^[0-9a-f-]{36}$/.test(profileId))throw new Error(tr('资料编号无效'));
  return {clips,snippets,categories:store.categories.length,scripts:scripts.length,profileId,fingerprint:databaseFingerprint(store.db)};
 }finally{store.close();}
}
