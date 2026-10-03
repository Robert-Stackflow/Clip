import {t as tr} from '../shared/i18n';
import type {Clip,Category} from '../shared/types';
import type {DatabaseConnection} from './database';
import {TRAY_LIMIT,TRAY_CATEGORY_MISSING,validateTrayQuery} from '../shared/tray';
export interface TrayRows{items:Clip[];total:number;categories:{id:string;name:string}[]}
export function readTrayRows(db:DatabaseConnection,categories:Category[],value:unknown):TrayRows{
 const query=validateTrayQuery(value),category=query.category&&query.category!=='favorites'?categories.find(c=>c.id===query.category):undefined;
 if(query.category&&query.category!=='favorites'&&!category)throw new Error(TRAY_CATEGORY_MISSING+': '+tr('分类已不存在'));
 const terms=query.text.toLocaleLowerCase().split(/\s+/).filter(Boolean),needsText=!!(terms.length||category?.contains);
  // Use the existing rebuildable projections. Opening Recent must never parse
  // every full PNG or attachment just to remove it again inside SQLite.
  const indexed=!!db.prepare("SELECT 1 FROM sqlite_master WHERE name='clip_list_cache'").get();
  const summary=indexed?"json_remove(i.data,'$.thumbnail')":"json_remove(c.data,'$.payload','$.thumbnail')";
  const payload=indexed?'p.payload':"json_extract(c.data,'$.payload')";
  const projection=needsText?`,json_extract(${payload},'$.text') AS body,(SELECT group_concat(value,char(10)) FROM json_each(${payload},'$.files')) AS paths,(SELECT group_concat(json_extract(value,'$.name'),char(10)) FROM json_each(${payload},'$.attachments')) AS attachments`:'';
  const unfiltered=query.kind==='all'&&!query.category&&!terms.length;
  const rows=db.prepare(`SELECT ${summary} AS summary${projection} FROM clips c ${indexed?'JOIN clip_list_cache i ON i.id=c.id':''} ${indexed&&needsText?'JOIN clip_preview_cache p ON p.id=c.id':''} ORDER BY c.updated DESC,c.id ASC ${unfiltered?'LIMIT '+TRAY_LIMIT:''}`).iterate() as Iterable<{summary:string;body?:string;paths?:string;attachments?:string}>;
  const items:Clip[]=[];let total=0;
  for(const row of rows){const item=JSON.parse(row.summary) as Clip,content=[item.title,row.body,row.paths,row.attachments].join('\n').toLocaleLowerCase();
   if(query.kind!=='all'&&item.kind!==query.kind||query.category==='favorites'&&!item.favorite)continue;
   if(category&&(category.kind!=='all'&&category.kind!==item.kind||category.source&&!item.source.toLocaleLowerCase().includes(category.source.toLocaleLowerCase())||category.tag&&!item.tags.some(t=>t.toLocaleLowerCase()===category.tag.toLocaleLowerCase())||category.contains&&!content.includes(category.contains.toLocaleLowerCase())))continue;
   const searchable=[content,item.source,...item.tags].join('\n').toLocaleLowerCase();if(!terms.every(t=>searchable.includes(t)))continue;
   total++;if(items.length<TRAY_LIMIT)items.push(item);
  }
 if(unfiltered)total=Number(db.prepare('SELECT count(*) AS n FROM clips').get().n);
 return {items,total,categories:categories.map(c=>({id:c.id,name:c.name}))};
}
