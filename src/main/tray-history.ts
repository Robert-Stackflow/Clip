import {t as tr} from '../shared/i18n';
import {randomUUID} from 'node:crypto';
import type {Store} from './store';
import type {Clip,Detail} from '../shared/types';
import type {ClipPreview} from '../shared/preview';
import {TRAY_TEXT_LIMIT,validateTrayQuery,type TrayQuery,type TrayState,type TrayPreview} from '../shared/tray';
import {readTrayRows,type TrayRows} from './tray-query';
interface Ticket{id:string;hash:string;expires:number}
/** Transient capabilities for only the rows displayed by the current tray query. */
export class TrayHistory{
 private active=false;private generation=0;private tickets=new Map<string,Ticket>();private previews=new Map<string,{hash:string;key:string}>();
 constructor(private store:()=>Store,private now:()=>number=Date.now,private image?:(item:ClipPreview)=>string|undefined){}
 open(){this.close();this.active=true;}
 close(){this.active=false;this.generation++;this.tickets.clear();this.previews.clear();}
 query(value:unknown):Pick<TrayState,'items'|'total'|'counts'|'categories'>{
  this.ensure();const store=this.store(),rows=readTrayRows(store.db,store.categories,value);this.generation++;this.tickets.clear();
  return this.accept(rows);
 }
 async queryAsync(value:unknown,read:(query:TrayQuery)=>Promise<TrayRows>):Promise<Pick<TrayState,'items'|'total'|'counts'|'categories'>>{
  this.ensure();const query=validateTrayQuery(value),store=this.store();
  const generation=++this.generation;this.tickets.clear();
  const rows=await read(query);this.ensure();if(generation!==this.generation||store!==this.store())throw new Error(tr('最近记录查询已取消'));
  return this.accept(rows);
 }
 private accept(rows:TrayRows):Pick<TrayState,'items'|'total'|'counts'|'categories'>{
  const items:TrayState['items']=[],previews=new Map<string,{hash:string;key:string}>();
  for(const item of rows.items){const token=randomUUID();this.tickets.set(token,{id:item.id,hash:item.hash,expires:this.now()+10*60*1000});
   const previous=this.previews.get(item.id),preview=previous?.hash===item.hash?previous:{hash:item.hash,key:randomUUID()};previews.set(item.id,preview);
   items.push({token,previewKey:preview.key,id:item.id,kind:item.kind,title:item.title,preview:item.preview,source:item.source,updatedAt:item.updatedAt,favorite:item.favorite,pinned:item.pinned,bytes:item.bytes,draggable:item.kind==='image'||item.kind==='files'});
  }
  this.previews=previews;return {items,total:rows.total,counts:rows.counts,categories:rows.categories};
 }
 private ensure(){if(!this.active)throw new Error(tr('托盘面板已关闭，请重新打开'));}
 resolve(value:unknown){this.ensure();if(typeof value!=='string'||!this.tickets.has(value))throw new Error(tr('此记录已失效，请重新选择'));const ticket=this.tickets.get(value)!;if(ticket.expires<this.now())throw new Error(tr('托盘预览已过期，请重新打开'));const item=this.store().find(ticket.id);if(!item||item.hash!==ticket.hash)throw new Error(tr('记录已改变或删除，请重新选择'));return item;}
 operation(value:unknown){const item=this.resolve(value),generation=this.generation,ticket=this.tickets.get(value as string)!;return {item,valid:()=>{try{return this.active&&generation===this.generation&&ticket.expires>=this.now()&&(this.store().db.prepare('SELECT hash FROM clips WHERE id=?').get(item.id) as {hash?:string}|undefined)?.hash===item.hash;}catch{return false;}}};}
 preview(token:string):TrayPreview{this.ensure();const ticket=this.tickets.get(token);if(!ticket||ticket.expires<this.now())throw new Error(tr('托盘预览已过期，请重新打开'));const item=this.store().preview(ticket.id);if(item.hash!==ticket.hash)throw new Error(tr('记录已改变或删除，请重新选择'));const text=item.payload.text||'',image=item.payload.png?this.image?.(item)||trustedThumbnail(item):trustedThumbnail(item),files=item.payload.attachments?.map(a=>({name:a.name,directory:!!a.directory,saved:true}))||item.payload.files?.map(name=>({name,directory:false,saved:false}))||[];
  return {token,kind:item.kind,title:item.title,source:item.source,bytes:item.bytes,updatedAt:item.updatedAt,text:text.slice(0,TRAY_TEXT_LIMIT),truncated:text.length>TRAY_TEXT_LIMIT,...(image?{image}:{}),files};
 }
}
function trustedThumbnail(item:Clip){return item.thumbnail&&/^data:image\/(?:png|jpeg|webp|gif);base64,/.test(item.thumbnail)?item.thumbnail:undefined;}
