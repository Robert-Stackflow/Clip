import {openDatabase,type DatabaseConnection} from './database';
import {t as tr} from '../shared/i18n';
const identifier=(name:string)=>'"'+name.replaceAll('"','""')+'"';
function integerRows(db:DatabaseConnection,sql:string){const statement=db.prepare(sql) as any;statement.safeIntegers?.(true);statement.setReadBigInts?.(true);return statement.iterate();}
/** Preserve the original schema even when an old plaintext point needs encryption. */
export function copyRawDatabase(sourceFile:string,file:string,sourceKey?:Uint8Array,targetKey?:Uint8Array){
 const source=openDatabase(sourceFile,true,sourceKey);let target:DatabaseConnection|undefined;
 try{
  if((!sourceKey&&!targetKey)||(sourceKey&&targetKey&&Buffer.from(sourceKey).equals(Buffer.from(targetKey)))){source.prepare('VACUUM INTO ?').run(file);return;}
  if(!targetKey)throw new Error(tr('回退资料必须保留加密保护'));
  source.exec('BEGIN');target=openDatabase(file,false,targetKey);target.exec('PRAGMA temp_store=MEMORY;PRAGMA foreign_keys=OFF;BEGIN');
  const schema=source.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid").all() as {type:string;name:string;sql:string}[];
  const tables=schema.filter(s=>s.type==='table'&&!s.name.startsWith('sqlite_'));
  if(schema.some(s=>/^CREATE\s+VIRTUAL\s+TABLE/i.test(s.sql)))throw new Error(tr('此资料格式不能安全重新加密，请先使用匹配版本导出备份'));
  for(const table of tables)target.exec(table.sql);
  const copy=(name:string)=>{const columns=(source.prepare(`PRAGMA table_xinfo(${identifier(name)})`).all() as {name:string;hidden:number}[]).filter(c=>c.hidden===0).map(c=>c.name);
   let rowid:string|undefined;const sql=schema.find(s=>s.name===name)?.sql||'';if(!/WITHOUT\s+ROWID/i.test(sql))rowid=['rowid','_rowid_','oid'].find(n=>!columns.some(c=>c.toLowerCase()===n));const selected=[...(rowid?[rowid]:[]),...columns],names=selected.map(identifier).join(',');
   const insert=target!.prepare(`INSERT INTO ${identifier(name)}(${names}) VALUES(${selected.map(()=>'?').join(',')})`);for(const row of integerRows(source,`SELECT ${names} FROM ${identifier(name)}`))insert.run(...selected.map(c=>row[c]));
  };
  for(const table of tables)copy(table.name);
  if(schema.some(s=>s.name==='sqlite_sequence')){target.exec('DELETE FROM sqlite_sequence');copy('sqlite_sequence');}
  for(const item of schema.filter(s=>s.type!=='table'&&!s.name.startsWith('sqlite_')))target.exec(item.sql);
  if(schema.some(s=>s.name.startsWith('sqlite_stat'))){target.exec('ANALYZE');for(const s of schema.filter(s=>s.type==='table'&&s.name.startsWith('sqlite_stat'))){target.exec('DELETE FROM '+identifier(s.name));copy(s.name);}}
  for(const name of ['user_version','application_id']){const value=Number(source.prepare('PRAGMA '+name).get()[name]);if(!Number.isSafeInteger(value))throw new Error(tr('回退资料格式无效'));target.exec('PRAGMA '+name+'='+value);}
  target.exec('COMMIT');source.exec('COMMIT');if(target.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw new Error(tr('回退副本校验失败'));
 }finally{target?.close();source.close();}
}
export function prepareRollbackData(file:string,version:string,key?:Uint8Array){const db=openDatabase(file,false,key);try{
 db.exec('BEGIN');const meta=(name:string,fallback:any)=>{const row=db.prepare('SELECT value FROM meta WHERE key=?').get(name);return row?JSON.parse(row.value):fallback;},save=(name:string,value:unknown)=>db.prepare('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)').run(name,JSON.stringify(value));
 save('settings',{...meta('settings',{}),paused:true});save('automatic-backup',{...meta('automatic-backup',{}),enabled:false,nextAt:0,lastError:''});save('lan-config',{enabled:false,autoNew:false});save('lan-index',[]);save('application-version',version);
 db.exec("UPDATE clips SET data=json_set(data,'$.shared',json('false')) WHERE json_extract(data,'$.shared')=1;COMMIT");
 if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw new Error(tr('回退副本校验失败'));
 }finally{db.close();}}
