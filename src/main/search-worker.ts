import {parentPort,workerData} from 'node:worker_threads';
import {openDatabase} from './database';
import {matchesCategory} from '../shared/advanced';
import {setInterfaceLanguage} from '../shared/i18n';
import type {Detail} from '../shared/types';
setInterfaceLanguage(workerData.language);
const key:Uint8Array|undefined=workerData.key;let db:ReturnType<typeof openDatabase>|undefined;
try{
 db=openDatabase(workerData.source,true,key);key?.fill(0);db.exec('BEGIN');
 const terms=(workerData.query as string).toLocaleLowerCase().trim().split(/\s+/),literal=terms.filter(term=>term===term.toLocaleUpperCase()),folding=terms.filter(term=>term!==term.toLocaleUpperCase()),ids:string[]=[];
 // Project searchable fields inside SQLite so image/file bytes never enter the JS heap.
 const rows=db.prepare(`SELECT json_extract(data,'$.id','$.title','$.payload.text','$.payload.files','$.tags','$.source','$.kind') AS fields,
 (SELECT json_group_array(json_object('name',json_extract(value,'$.name'))) FROM json_each(clips.data,'$.payload.attachments')) AS names
 FROM clips ORDER BY updated DESC,rowid ASC`).iterate();
 for(const row of rows){
  const [id,title,text,files,tags,source,kind]=JSON.parse(row.fields),attachments=JSON.parse(row.names);
  const item={id,title,tags,source,kind,payload:{text,files,attachments}} as Detail;
  // Query terms contain no whitespace, so field checks preserve newline-joined matching.
  const values=[title,text,...(files||[]),...attachments.map((a:{name:string})=>a.name),...tags,source].filter((value):value is string=>typeof value==='string');
  if(!literal.every(term=>!term||values.some(value=>value.includes(term))))continue;
  if(folding.length){const folded=values.map(value=>value.toLocaleLowerCase());if(!folding.every(term=>folded.some(value=>value.includes(term))))continue;}
  if(!workerData.category||matchesCategory(item,workerData.category))ids.push(id);
 }
 db.exec('ROLLBACK');db.close();db=undefined;parentPort!.postMessage({ok:true,ids});
}catch(error){parentPort!.postMessage({ok:false,error:error instanceof Error?error.message:String(error)});}
finally{key?.fill(0);db?.close();}
