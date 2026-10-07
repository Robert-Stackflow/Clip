import {t as tr} from '../shared/i18n';
import type {Clip,Category,Detail} from '../shared/types';
import type {TrayCounts} from '../shared/tray';
import type {DatabaseConnection} from './database';
import {categoryPredicate} from '../shared/advanced';
import {clipFilterPredicate,emptyClipFilters,hasClipFilters} from '../shared/clip-filters';
import {TRAY_LIMIT,TRAY_CATEGORY_MISSING,validateTrayQuery} from '../shared/tray';
export interface TrayRows{items:Clip[];total:number;counts:TrayCounts;categories:{id:string;name:string}[];sources?:{name:string;count:number}[]}
export function readTrayRows(db:DatabaseConnection,categories:Category[],value:unknown,pinnedFirst=false):TrayRows{
 const query=validateTrayQuery(value),custom=!!query.category&&!['favorites','pinned'].includes(query.category),category=custom?categories.find(c=>c.id===query.category):undefined;
 if(custom&&!category)throw new Error(TRAY_CATEGORY_MISSING+': '+tr('分类已不存在'));
 const rules=category?[category,...categories.filter(c=>c.parentId===category.id)]:[],matchesCategories=rules.map(rule=>categoryPredicate(rule));
 const terms=query.text.toLocaleLowerCase().split(/\s+/).filter(Boolean),needsText=!!(terms.length||rules.some(rule=>!rule.manual&&rule.contains));
 const filters=query.filters||emptyClipFilters(),matchFilter=clipFilterPredicate({...filters,sources:[]}),selectedSources=new Set(filters.sources);
 const indexed=!!db.prepare("SELECT 1 FROM sqlite_master WHERE name='clip_list_cache'").get();
 const summary=indexed?"json_remove(i.data,'$.thumbnail')":"json_remove(c.data,'$.payload','$.thumbnail')";
 const payload=indexed?'p.payload':"json_extract(c.data,'$.payload')",listSource=indexed?'i.data':'c.data',listJoin=indexed?'JOIN clip_list_cache i ON i.id=c.id':'';
 const order=(pinnedFirst?`coalesce(json_extract(${listSource},'$.pinned'),0) DESC,`:'')+'c.updated DESC,c.id ASC';
 const unfiltered=!needsText&&!query.category&&!hasClipFilters(filters);
 const sources=new Map<string,number>();
 const result=(items:Clip[],total:number,counts:TrayCounts):TrayRows=>({items,total,counts,categories:categories.map(c=>({id:c.id,name:c.name})),sources:[...sources].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name))});
 // Read only compact projections for the initial page; never parse full image bodies.
 if(unfiltered){
  const counts:TrayCounts={all:0,text:0,image:0,files:0,link:0,code:0};
  for(const row of db.prepare(`SELECT json_extract(${listSource},'$.kind') AS kind,count(*) AS n FROM clips c ${listJoin} GROUP BY kind`).iterate() as Iterable<{kind:keyof TrayCounts;n:number}>)if(row.kind in counts){counts[row.kind]=Number(row.n);counts.all+=Number(row.n);}
  const clause=query.kind==='all'?'':`WHERE json_extract(${listSource},'$.kind')=?`;
  const statement=db.prepare(`SELECT ${summary} AS summary FROM clips c ${listJoin} ${clause} ORDER BY ${order} LIMIT ${TRAY_LIMIT}`);
  const items=Array.from((query.kind==='all'?statement.iterate():statement.iterate(query.kind)) as Iterable<{summary:string}>,row=>JSON.parse(row.summary) as Clip);
  for(const row of db.prepare(`SELECT json_extract(${listSource},'$.source') AS source,count(*) AS n FROM clips c ${listJoin} ${clause} GROUP BY source`).iterate(...(query.kind==='all'?[]:[query.kind])) as Iterable<{source:string;n:number}>)sources.set(row.source,Number(row.n));
  return result(items,counts[query.kind],counts);
 }
 const projection=needsText?(indexed?'':`,json_extract(${payload},'$.text') AS body,(SELECT group_concat(value,char(10)) FROM json_each(${payload},'$.files')) AS paths,(SELECT group_concat(json_extract(value,'$.name'),char(10)) FROM json_each(${payload},'$.attachments')) AS attachments`):'';
 const rows=db.prepare(`SELECT c.id AS lookupId,${summary} AS summary${projection} FROM clips c ${listJoin} ${indexed&&needsText?'JOIN clip_preview_cache p ON p.id=c.id':''} ORDER BY ${order}`).iterate() as Iterable<{lookupId:string;summary:string;body?:string;paths?:string;attachments?:string}>;
 const bodyReader=indexed&&needsText?db.prepare('SELECT payload FROM clip_preview_cache WHERE id=?'):undefined;
 const items:Clip[]=[],counts:TrayCounts={all:0,text:0,image:0,files:0,link:0,code:0};let total=0;
 for(const row of rows){const item=JSON.parse(row.summary) as Clip;
  if(query.category==='favorites'&&!item.favorite||query.category==='pinned'&&!item.pinned||!matchFilter(item))continue;
  let projected:Detail['payload']|undefined;
  const detail=()=>{if(!projected){const body=bodyReader?.get(row.lookupId)?.payload;projected=body?JSON.parse(body):{text:row.body,files:row.paths?.split('\n'),attachments:row.attachments?.split('\n').map(name=>({name}))};}return {...item,payload:projected!} as Detail;};
  if(matchesCategories.length&&!matchesCategories.some((match,index)=>match(rules[index].manual||!rules[index].contains?{...item,payload:{}} as Detail:detail())))continue;
  if(terms.length){const metadata=[item.title,item.source,...item.tags].join('\n').toLocaleLowerCase(),remaining=terms.filter(term=>!metadata.includes(term));if(remaining.length){const data=detail().payload,fields=[data.text,...data.files||[],...data.attachments?.map(a=>a.name)||[]].map(field=>(field||'').toLocaleLowerCase());if(!remaining.every(term=>fields.some(field=>field.includes(term))))continue;}}
  if(query.kind==='all'||item.kind===query.kind)sources.set(item.source,(sources.get(item.source)||0)+1);
  if(selectedSources.size&&!selectedSources.has(item.source.trim().toLocaleLowerCase()))continue;
  counts.all++;counts[item.kind]++;if(query.kind==='all'||item.kind===query.kind){total++;if(items.length<TRAY_LIMIT)items.push(item);}
 }
 return result(items,total,counts);
}
