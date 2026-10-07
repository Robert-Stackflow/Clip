import {randomUUID,createHash} from 'node:crypto';
import {t as tr} from '../shared/i18n';
import {builtins,templateVariables} from '../shared/advanced';
import type {QuickReplyState} from '../shared/quick-panel';
import type {Snippet} from '../shared/types';
import type {Store} from './store';

interface Ticket{id:string;revision?:number;fingerprint?:string;expires:number;store:Store}
const fingerprint=(item:Snippet)=>createHash('sha256').update(JSON.stringify(item)).digest('hex');
/** Reply capabilities are scoped to one visible panel query, like clipboard row capabilities. */
export class QuickReplies{
 private active=false;private generation=0;private tickets=new Map<string,Ticket>();
 constructor(private store:()=>Store,private now:()=>number=Date.now){}
 open(){this.close();this.active=true;}
 close(){this.active=false;this.generation++;this.tickets.clear();}
 query(value:unknown):Pick<QuickReplyState,'items'>{
  this.ensure();if(typeof value!=='string'||value.length>512)throw new Error(tr('托盘搜索条件无效'));
  const store=this.store(),terms=value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);this.generation++;this.tickets.clear();
  const items=store.snippetList().filter(item=>terms.every(term=>(item.title+'\n'+item.text).toLocaleLowerCase().includes(term))).map(item=>{
   const token=randomUUID(),revision=store.snippetRevision(item.id);
   this.tickets.set(token,{id:item.id,store,revision,...(revision===undefined?{fingerprint:fingerprint(store.snippet(item.id)!)}:{}),expires:this.now()+10*60*1000});
   const thumbnail=item.thumbnail&&/^data:image\/(?:png|jpeg|webp|gif);base64,/.test(item.thumbnail)?item.thumbnail:undefined;
   return {token,title:item.title,preview:item.text.slice(0,240),kind:item.kind,...(thumbnail?{thumbnail}:{}),variables:templateVariables(item.text).filter(name=>!builtins.includes(name))};
  });return {items};
 }
 private ensure(){if(!this.active)throw new Error(tr('托盘面板已关闭或不可用'));}
 private current(ticket:Ticket){const store=this.store();if(store!==ticket.store)return false;if(ticket.revision!==undefined)return store.snippetRevision(ticket.id)===ticket.revision;const item=store.snippet(ticket.id);return !!item&&fingerprint(item)===ticket.fingerprint;}
 operation(value:unknown){
  this.ensure();const ticket=typeof value==='string'?this.tickets.get(value):undefined;
  if(!ticket||ticket.expires<this.now()||!this.current(ticket))throw new Error(tr('此记录已失效，请重新选择'));
  const item=this.store().snippet(ticket.id);if(!item)throw new Error(tr('模板已不存在'));const generation=this.generation;
  return {item,valid:()=>{try{return this.active&&generation===this.generation&&ticket.expires>=this.now()&&this.current(ticket);}catch{return false;}}};
 }
}
