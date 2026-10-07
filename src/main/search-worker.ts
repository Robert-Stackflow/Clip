import {parentPort,workerData} from 'node:worker_threads';
import {openDatabase} from './database';
import {categoryPredicate} from '../shared/advanced';
import {setInterfaceLanguage} from '../shared/i18n';
import type {Category,Detail} from '../shared/types';
setInterfaceLanguage(workerData.language);
const key:Uint8Array|undefined=workerData.key;let db:ReturnType<typeof openDatabase>|undefined;
function stringList(value:unknown):string[]{
 const parsed=typeof value==='string'&&value.startsWith('[')?(()=>{try{return JSON.parse(value);}catch{return [];}})():value;
 return Array.isArray(parsed)?parsed.filter((item):item is string=>typeof item==='string'):[];
}
function attachmentNames(value:unknown):string[]{
 const parsed=typeof value==='string'?(()=>{try{return JSON.parse(value);}catch{return [];}})():value;
 return Array.isArray(parsed)?parsed.flatMap(item=>typeof item?.name==='string'?[item.name]:[]):[];
}
try{
 db=openDatabase(workerData.source,true,key);key?.fill(0);db.exec('BEGIN');
 const categories=(workerData.category||[]) as Category[],counts=Object.fromEntries(categories.map(category=>[category.id,0]));
 const countRules=workerData.mode==='counts'?categories.map(category=>({id:category.id,matches:[category,...categories.filter(child=>child.parentId===category.id)].map(category=>categoryPredicate(category))})):undefined;
 const terms=(workerData.query as string).toLocaleLowerCase().trim().split(/\s+/),literal=terms.filter(term=>term===term.toLocaleUpperCase()),folding=terms.filter(term=>term!==term.toLocaleUpperCase()),ids:string[]=[],categoryRules=(workerData.category||[]).map(categoryPredicate),matchesCategory=categoryRules.length?(item:Detail)=>categoryRules.some((match:(item:Detail)=>boolean)=>match(item)):undefined;
 // Project searchable fields inside SQLite so image/file bytes never enter the JS heap.
 const rows=db.prepare(`SELECT json_extract(data,'$.id','$.title','$.payload.text','$.payload.files','$.tags','$.source','$.kind','$.favorite','$.pinned','$.createdAt','$.bytes','$.manualCategories') AS fields,
 (SELECT json_group_array(json_object('name',json_extract(value,'$.name'))) FROM json_each(clips.data,'$.payload.attachments')) AS names
 FROM clips ORDER BY updated DESC,rowid ASC`).iterate();
 for(const row of rows){
  const [id,title,text,rawFiles,rawTags,source,kind,favorite,pinned,createdAt,bytes,rawManualCategories]=JSON.parse(row.fields),files=stringList(rawFiles),tags=stringList(rawTags),manualCategories=stringList(rawManualCategories),attachments=attachmentNames(row.names);
  const item={id,title,tags,source,kind,favorite:!!favorite,pinned:!!pinned,createdAt:Number(createdAt)||0,bytes:Number(bytes)||0,manualCategories,payload:{text,files,attachments:attachments.map(name=>({name}))}} as Detail;
  if(countRules){for(const rule of countRules)if(rule.matches.some(match=>match(item)))counts[rule.id]++;continue;}
  // Query terms contain no whitespace, so field checks preserve newline-joined matching.
  const values=[title,text,...files,...attachments,...tags,source].filter((value):value is string=>typeof value==='string');
  if(!literal.every(term=>!term||values.some(value=>value.includes(term))))continue;
  if(folding.length){const folded=values.map(value=>value.toLocaleLowerCase());if(!folding.every(term=>folded.some(value=>value.includes(term))))continue;}
  if(!matchesCategory||matchesCategory(item))ids.push(id);
 }
 db.exec('ROLLBACK');db.close();db=undefined;parentPort!.postMessage({ok:true,ids,counts});
}catch(error){parentPort!.postMessage({ok:false,error:error instanceof Error?error.message:String(error)});}
finally{key?.fill(0);db?.close();}
