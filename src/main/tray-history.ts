import {randomUUID} from 'node:crypto';
import type {Store} from './store';
import type {Clip,Detail} from '../shared/types';
import {TRAY_LIMIT,TRAY_TEXT_LIMIT,validateTrayQuery,type TrayState,type TrayPreview} from '../shared/tray';
interface Ticket{id:string;hash:string;expires:number}
/** Transient capabilities for only the rows displayed by the current tray query. */
export class TrayHistory{
 private active=false;private generation=0;private tickets=new Map<string,Ticket>();
 constructor(private store:()=>Store,private now:()=>number=Date.now){}
 open(){this.close();this.active=true;}
 close(){this.active=false;this.generation++;this.tickets.clear();}
 query(value:unknown):Pick<TrayState,'items'|'total'|'categories'>{
  this.ensure();const query=validateTrayQuery(value),store=this.store(),category=query.category&&query.category!=='favorites'?store.categories.find(c=>c.id===query.category):undefined;
  if(query.category&&query.category!=='favorites'&&!category)throw new Error('分类已不存在');
  this.generation++;this.tickets.clear();const terms=query.text.toLocaleLowerCase().split(/\s+/).filter(Boolean),needsText=!!(terms.length||category?.contains);
  const projection=needsText?`,json_extract(c.data,'$.payload.text') AS body,(SELECT group_concat(value,char(10)) FROM json_each(c.data,'$.payload.files')) AS paths,(SELECT group_concat(json_extract(value,'$.name'),char(10)) FROM json_each(c.data,'$.payload.attachments')) AS attachments`:'';
  const rows=store.db.prepare(`SELECT json_remove(c.data,'$.payload','$.thumbnail') AS summary${projection} FROM clips c ORDER BY updated DESC,id ASC`).iterate() as Iterable<{summary:string;body?:string;paths?:string;attachments?:string}>;
  const items:TrayState['items']=[];let total=0;
  for(const row of rows){const item=JSON.parse(row.summary) as Clip,content=[item.title,row.body,row.paths,row.attachments].join('\n').toLocaleLowerCase();
   if(query.kind!=='all'&&item.kind!==query.kind||query.category==='favorites'&&!item.favorite)continue;
   if(category&&(category.kind!=='all'&&category.kind!==item.kind||category.source&&!item.source.toLocaleLowerCase().includes(category.source.toLocaleLowerCase())||category.tag&&!item.tags.some(t=>t.toLocaleLowerCase()===category.tag.toLocaleLowerCase())||category.contains&&!content.includes(category.contains.toLocaleLowerCase())))continue;
   const searchable=[content,item.source,...item.tags].join('\n').toLocaleLowerCase();if(!terms.every(t=>searchable.includes(t)))continue;
   total++;if(items.length===TRAY_LIMIT)continue;const token=randomUUID();this.tickets.set(token,{id:item.id,hash:item.hash,expires:this.now()+10*60*1000});
   items.push({token,id:item.id,kind:item.kind,title:item.title,preview:item.preview,source:item.source,updatedAt:item.updatedAt,favorite:item.favorite,pinned:item.pinned,draggable:item.kind==='image'||item.kind==='files'});
  }
  return {items,total,categories:store.categories.map(c=>({id:c.id,name:c.name}))};
 }
 private ensure(){if(!this.active)throw new Error('托盘面板已关闭，请重新打开');}
 resolve(value:unknown){this.ensure();if(typeof value!=='string'||!this.tickets.has(value))throw new Error('此记录已失效，请重新选择');const ticket=this.tickets.get(value)!;if(ticket.expires<this.now())throw new Error('托盘预览已过期，请重新打开');const item=this.store().find(ticket.id);if(!item||item.hash!==ticket.hash)throw new Error('记录已改变或删除，请重新选择');return item;}
 operation(value:unknown){const item=this.resolve(value),generation=this.generation,ticket=this.tickets.get(value as string)!;return {item,valid:()=>{try{return this.active&&generation===this.generation&&ticket.expires>=this.now()&&(this.store().db.prepare('SELECT hash FROM clips WHERE id=?').get(item.id) as {hash?:string}|undefined)?.hash===item.hash;}catch{return false;}}};}
 preview(token:string):TrayPreview{const item=this.resolve(token),text=item.payload.text||'',image=item.payload.png?'data:image/png;base64,'+item.payload.png:trustedThumbnail(item),files=item.payload.attachments?.map(a=>({name:a.name,directory:!!a.directory,saved:true}))||item.payload.files?.map(name=>({name,directory:false,saved:false}))||[];
  return {token,kind:item.kind,title:item.title,source:item.source,bytes:item.bytes,updatedAt:item.updatedAt,text:text.slice(0,TRAY_TEXT_LIMIT),truncated:text.length>TRAY_TEXT_LIMIT,...(image?{image}:{}),files};
 }
}
function trustedThumbnail(item:Detail){return item.thumbnail&&/^data:image\/(?:png|jpeg|webp|gif);base64,/.test(item.thumbnail)?item.thumbnail:undefined;}
