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
  // The preview cache contains full text and file metadata, but no original
  // binary or rich-format bodies. Parse it once instead of scanning the same
  // long JSON three times in SQLite. Legacy databases still project in SQL.
  const projection=needsText?(indexed?',p.payload AS payload':`,json_extract(${payload},'$.text') AS body,(SELECT group_concat(value,char(10)) FROM json_each(${payload},'$.files')) AS paths,(SELECT group_concat(json_extract(value,'$.name'),char(10)) FROM json_each(${payload},'$.attachments')) AS attachments`):'';
  const unfiltered=query.kind==='all'&&!query.category&&!terms.length;
  const rows=db.prepare(`SELECT ${summary} AS summary${projection} FROM clips c ${indexed?'JOIN clip_list_cache i ON i.id=c.id':''} ${indexed&&needsText?'JOIN clip_preview_cache p ON p.id=c.id':''} ORDER BY c.updated DESC,c.id ASC ${unfiltered?'LIMIT '+TRAY_LIMIT:''}`).iterate() as Iterable<{summary:string;payload?:string;body?:string;paths?:string;attachments?:string}>;
  const categorySource=category?.source.toLocaleLowerCase(),categoryTag=category?.tag.toLocaleLowerCase(),categoryContains=category?.contains.toLocaleLowerCase();
  const items:Clip[]=[];let total=0;
  for(const row of rows){const item=JSON.parse(row.summary) as Clip;
   if(query.kind!=='all'&&item.kind!==query.kind||query.category==='favorites'&&!item.favorite)continue;
   if(category&&(category.kind!=='all'&&category.kind!==item.kind||categorySource&&!item.source.toLocaleLowerCase().includes(categorySource)||categoryTag&&!item.tags.some(t=>t.toLocaleLowerCase()===categoryTag)))continue;
   if(needsText){
    const projected=row.payload?JSON.parse(row.payload) as {text?:string;files?:string[];attachments?:{name:string}[]}:undefined;
    const content=[item.title,projected?.text??row.body,projected?.files?.join('\n')??row.paths,projected?.attachments?.map(a=>a.name).join('\n')??row.attachments].join('\n').toLocaleLowerCase();
    if(categoryContains&&!content.includes(categoryContains))continue;
    // Query terms contain no whitespace, so none can straddle the newline
    // between content and metadata. Avoid copying/lowercasing the body again.
    if(terms.length){const metadata=[item.source,...item.tags].join('\n').toLocaleLowerCase();if(!terms.every(t=>content.includes(t)||metadata.includes(t)))continue;}
   }
   total++;if(items.length<TRAY_LIMIT)items.push(item);
  }
 if(unfiltered)total=Number(db.prepare('SELECT count(*) AS n FROM clips').get().n);
 return {items,total,categories:categories.map(c=>({id:c.id,name:c.name}))};
}
