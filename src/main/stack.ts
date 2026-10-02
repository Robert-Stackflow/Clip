import {t as tr} from '../shared/i18n';
import {createHash,randomUUID} from 'node:crypto';
import type {Store} from './store';
import type {Detail,Payload} from '../shared/types';
import type {ClipPreview} from '../shared/preview';
import {matchesStack,stackDefaults,stackParts,validateStack,type StackOptions,type StackPreview} from '../shared/stack';
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Entry={sample:string;localOnly:boolean;hash:string}&({id:string}|{id?:undefined;payload:Payload});
export class StackService {
 private previewTimer?:NodeJS.Timeout;
 private running=false;private reason='';private generation=0;
 private pending?:{token:string;signature:string;ids:string[];entries:Entry[];privates:string[];expires:number};
 constructor(private store:()=>Store,private now=Date.now){}
 options(){return validateStack(this.store().meta('stack-options',stackDefaults));}
 state(){return {options:this.options(),running:this.running,reason:this.reason};}
 get epoch(){return this.generation;}
 get active(){return this.running;}
 start(){this.running=true;this.reason='';this.cancel();this.generation++;}
 stop(reason=''){this.running=false;this.reason=reason;this.cancel();this.generation++;}
 configure(value:unknown){if(this.running)throw new Error(tr('请先停止自动入栈再修改规则'));const next=validateStack(value);this.store().setMeta('stack-options',next);this.cancel();}
 private signature(ids:string[]){const s=this.store();return digest([s.queue,this.options(),ids.map(id=>{const item=s.identity(id);return item?[item.id,item.hash,!!item.localOnly,!!item.shared]:null;})]);}
 private entries(items:(Detail|ClipPreview)[],options:StackOptions){const s=this.store(),seen=new Set(options.duplicates?[]:s.queue.map(id=>{const item=s.identity(id);if(!item)throw new Error(tr('记录已不存在'));return item.hash;})),entries:Entry[]=[],privates=new Set<string>();let duplicates=0;
  for(const item of items){const sample=(item.payload.text||item.payload.files?.join('\n')||item.payload.attachments?.map(a=>a.name).join('\n')||tr('图片 / 富文本')).slice(0,160);
   if(options.mode==='whole'){if(!options.duplicates&&seen.has(item.hash)){duplicates++;continue;}seen.add(item.hash);entries.push({id:item.id,hash:item.hash,localOnly:!!item.localOnly,sample});}
   else{const parts=stackParts({...item,payload:{text:item.payload.text}},options);duplicates+=parts.duplicates;for(const payload of parts.payloads){const hash=digest(payload);if(item.localOnly)privates.add(hash);if(!options.duplicates&&seen.has(hash)){duplicates++;continue;}seen.add(hash);entries.push({payload,localOnly:!!item.localOnly,hash,sample:(payload.text||'').slice(0,160)});}}
   if(entries.length+s.queue.length>200)throw new Error(tr('入栈后超过 200 项，请减少匹配内容或先移出部分项目'));
  }
  return {entries,duplicates,privates:[...privates]};
 }
 private append(entries:Entry[],privates:string[]){const s=this.store(),previous=[...s.queue];s.db.exec('SAVEPOINT stack_append');
  try{const next=[...previous];for(const e of entries){if(!('payload' in e)){if(!s.has(e.id))throw new Error(tr('记录已不存在'));next.push(e.id);continue;}const item=s.add(e.payload,'堆栈按行拆分',undefined,undefined,false);
    if(e.localOnly){if(item.shared)throw new Error(tr('拆分内容已被共享，请先将相同记录设为仅本机'));if(!item.localOnly){item.localOnly=true;s.save(item);}}
    next.push(item.id);
   }for(const hash of privates){const row=s.db.prepare('SELECT id FROM clips WHERE hash=?').get(hash) as {id:string}|undefined;if(row){const item=s.get(row.id);if(item.shared)throw new Error(tr('拆分内容已被共享，请先将相同记录设为仅本机'));if(!item.localOnly){item.localOnly=true;s.save(item);}}}if(next.length>200)throw new Error(tr('堆栈最多 200 项'));s.setQueue(next);s.db.exec('RELEASE stack_append');
  }catch(e){s.db.exec('ROLLBACK TO stack_append; RELEASE stack_append');s.queue=previous;throw e;}
 }
 capture(item:Detail|ClipPreview,epoch:number,source=item.source){if(!this.running||epoch!==this.generation)return;const options=this.options();if(!matchesStack(item,options,source))return;
  try{const {entries,privates}=this.entries([item],options);this.append(entries,privates);}catch(e){this.stop((e as Error).message);throw e;}
 }
 split(id:string){const item=this.store().get(id);if(!item.payload.text?.trim())throw new Error(tr('仅文字可按行拆分'));const {entries,privates}=this.entries([item],{...this.options(),mode:'lines'});this.append(entries,privates);}
 preview(order:unknown):StackPreview {if(order!=='oldest'&&order!=='newest')throw new Error(tr('入栈顺序无效'));this.cancel();const s=this.store(),options=this.options(),all=s.list();if(all.length>10000)throw new Error(tr('历史超过 10,000 条，请先减少范围'));
  const items=all.filter(i=>(options.kind==='all'||i.kind===options.kind)&&(!options.source||i.source.toLowerCase()===options.source)).map(i=>s.preview(i.id)).filter(i=>matchesStack(i,options)).sort((a,b)=>(order==='oldest'?1:-1)*(a.updatedAt-b.updatedAt)||a.id.localeCompare(b.id));
  const {entries,duplicates,privates}=this.entries(items,options),ids=items.map(i=>i.id),token=randomUUID();this.pending={token,signature:this.signature(ids),ids,entries,privates,expires:this.now()+120000};this.previewTimer=setTimeout(()=>this.cancel(),120000);this.previewTimer.unref();
  return {token,matched:items.length,added:entries.length,duplicates,samples:entries.slice(0,12).map(e=>e.sample)};
 }
 commit(token:unknown){const p=this.pending;if(p&&p.expires<this.now())this.cancel();if(!this.pending||!p||p.token!==token)throw new Error(tr('批量预览已失效，请重新预览'));this.cancel();if(p.signature!==this.signature(p.ids))throw new Error(tr('堆栈、规则或来源已变化，请重新预览'));this.append(p.entries,p.privates);return p.entries.length;}
 cancel(){clearTimeout(this.previewTimer);this.previewTimer=undefined;this.pending=undefined;}
 reverse(){const s=this.store();s.setQueue([...s.queue].reverse());this.cancel();}
}
