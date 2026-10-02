import {parentPort,workerData} from 'node:worker_threads';
import {openDatabase} from './database';
import {matchesCategory} from '../shared/advanced';
import {setInterfaceLanguage} from '../shared/i18n';
import type {Detail} from '../shared/types';
setInterfaceLanguage(workerData.language);
const key:Uint8Array|undefined=workerData.key;let db:ReturnType<typeof openDatabase>|undefined;
try{
 db=openDatabase(workerData.source,true,key);key?.fill(0);db.exec('BEGIN');
 const terms=(workerData.query as string).toLocaleLowerCase().trim().split(/\s+/),ids:string[]=[];
 // Project searchable fields inside SQLite so image/file bytes never enter the JS heap.
 const rows=db.prepare(`SELECT json_extract(data,'$.id','$.title','$.payload.text','$.payload.files','$.tags','$.source','$.kind') AS fields,
 (SELECT json_group_array(json_object('name',json_extract(value,'$.name'))) FROM json_each(clips.data,'$.payload.attachments')) AS names
 FROM clips ORDER BY updated DESC`).iterate();
 for(const row of rows){
  const [id,title,text,files,tags,source,kind]=JSON.parse(row.fields),attachments=JSON.parse(row.names);
  const item={id,title,tags,source,kind,payload:{text,files,attachments}} as Detail;
  const value=[title,text,...(files||[]),...attachments.map((a:{name:string})=>a.name),...tags,source].join('\n').toLocaleLowerCase();
  if(terms.every((term:string)=>value.includes(term))&&(!workerData.category||matchesCategory(item,workerData.category)))ids.push(id);
 }
 db.exec('ROLLBACK');db.close();db=undefined;parentPort!.postMessage({ok:true,ids});
}catch(error){parentPort!.postMessage({ok:false,error:error instanceof Error?error.message:String(error)});}
finally{key?.fill(0);db?.close();}
