import {t as tr} from '../shared/i18n';
import type {Clip,Category} from '../shared/types';
import type {TrayCounts} from '../shared/tray';
import type {DatabaseConnection} from './database';
import {TRAY_LIMIT,TRAY_CATEGORY_MISSING,validateTrayQuery} from '../shared/tray';
export interface TrayRows{items:Clip[];total:number;counts:TrayCounts;categories:{id:string;name:string}[]}
export function readTrayRows(db:DatabaseConnection,categories:Category[],value:unknown):TrayRows{
 const query=validateTrayQuery(value),category=query.category&&query.category!=='favorites'?categories.find(c=>c.id===query.category):undefined;
 if(query.category&&query.category!=='favorites'&&!category)throw new Error(TRAY_CATEGORY_MISSING+': '+tr('分类已不存在'));
 const terms=query.text.toLocaleLowerCase().split(/\s+/).filter(Boolean),needsText=!!(terms.length||category?.contains);
  // Use the existing rebuildable projections. Opening Recent must never parse
  // every full PNG or attachment just to remove it again inside SQLite.
  const indexed=!!db.prepare("SELECT 1 FROM sqlite_master WHERE name='clip_list_cache'").get();
  const summary=indexed?"json_remove(i.data,'$.thumbnail')":"json_remove(c.data,'$.payload','$.thumbnail')";
  const payload=indexed?'p.payload':"json_extract(c.data,'$.payload')";
  const listSource=indexed?'i.data':'c.data',listJoin=indexed?'JOIN clip_list_cache i ON i.id=c.id':'';
  const countsFromSql=()=>{const counts:TrayCounts={all:0,text:0,image:0,files:0,link:0,code:0};
   for(const row of db.prepare(`SELECT json_extract(${listSource},'$.kind') AS kind,count(*) AS n FROM clips c ${listJoin} GROUP BY kind`).iterate() as Iterable<{kind:keyof TrayCounts;n:number}>){
    if(row.kind in counts){counts[row.kind]=Number(row.n);counts.all+=Number(row.n);}
   }
   return counts;
  };
  // A type tab without text or category filters only needs the first page of
  // that type. Let SQLite filter and count compact summaries instead of
  // parsing every record on the main process side.
  if(!needsText&&!query.category&&query.kind!=='all'){
   const rows=db.prepare(`SELECT ${summary} AS summary FROM clips c ${listJoin} WHERE json_extract(${listSource},'$.kind')=? ORDER BY c.updated DESC,c.id ASC LIMIT ${TRAY_LIMIT}`).iterate(query.kind) as Iterable<{summary:string}>;
   const items=Array.from(rows,row=>JSON.parse(row.summary) as Clip),counts=countsFromSql();return {items,total:counts[query.kind],counts,categories:categories.map(c=>({id:c.id,name:c.name}))};
  }
  // Match compact metadata first. The preview body is fetched only when a
  // remaining term or a content-based category needs it. Keep the cache join
  // so incomplete projections retain the existing inner-join behavior.
  // Legacy databases still project text/file metadata inside SQLite.
  const projection=needsText?(indexed?'':`,json_extract(${payload},'$.text') AS body,(SELECT group_concat(value,char(10)) FROM json_each(${payload},'$.files')) AS paths,(SELECT group_concat(json_extract(value,'$.name'),char(10)) FROM json_each(${payload},'$.attachments')) AS attachments`):'';
  const unfiltered=query.kind==='all'&&!query.category&&!terms.length;
  const rows=db.prepare(`SELECT c.id AS lookupId,${summary} AS summary${projection} FROM clips c ${indexed?'JOIN clip_list_cache i ON i.id=c.id':''} ${indexed&&needsText?'JOIN clip_preview_cache p ON p.id=c.id':''} ORDER BY c.updated DESC,c.id ASC ${unfiltered?'LIMIT '+TRAY_LIMIT:''}`).iterate() as Iterable<{lookupId:string;summary:string;body?:string;paths?:string;attachments?:string}>;
  const categorySource=category?.source.toLocaleLowerCase(),categoryTag=category?.tag.toLocaleLowerCase(),categoryContains=category?.contains.toLocaleLowerCase();
  const items:Clip[]=[],counts:TrayCounts={all:0,text:0,image:0,files:0,link:0,code:0};
  const bodyReader=indexed&&needsText?db.prepare('SELECT payload FROM clip_preview_cache WHERE id=?'):undefined;
  for(const row of rows){const item=JSON.parse(row.summary) as Clip;
   if(query.category==='favorites'&&!item.favorite)continue;
   if(category&&(category.kind!=='all'&&category.kind!==item.kind||categorySource&&!item.source.toLocaleLowerCase().includes(categorySource)||categoryTag&&!item.tags.some(t=>t.toLocaleLowerCase()===categoryTag)))continue;
   if(needsText){
    // Query terms contain no whitespace and cannot straddle field separators.
    const metadata=[item.title,item.source,...item.tags].join('\n').toLocaleLowerCase(),remaining=terms.filter(t=>!metadata.includes(t));
    if(categoryContains||remaining.length){
     const body=bodyReader?.get(row.lookupId)?.payload;
     const projected=body?JSON.parse(body) as {text?:string;files?:string[];attachments?:{name:string}[]}:undefined;
     const fields=[projected?.text??row.body,projected?.files?.join('\n')??row.paths,projected?.attachments?.map(a=>a.name).join('\n')??row.attachments];
     // Content categories may span newlines; query terms cannot. Avoid
     // copying a long body into another joined string for ordinary searches.
     if(categoryContains){const content=[item.title,...fields].join('\n').toLocaleLowerCase();if(!content.includes(categoryContains)||!remaining.every(t=>content.includes(t)))continue;}
     else{const content=fields.map(field=>(field??'').toLocaleLowerCase());if(!remaining.every(t=>content.some(field=>field.includes(t))))continue;}
    }
   }
   counts.all++;counts[item.kind]++;if((query.kind==='all'||item.kind===query.kind)&&items.length<TRAY_LIMIT)items.push(item);
  }
 const finalCounts=unfiltered?countsFromSql():counts;
 return {items,total:finalCounts[query.kind],counts:finalCounts,categories:categories.map(c=>({id:c.id,name:c.name}))};
}
