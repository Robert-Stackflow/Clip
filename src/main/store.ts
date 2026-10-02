import {openDatabase,type DatabaseConnection} from './database';
import { createHash, randomUUID } from 'node:crypto';
import { defaults, classify, validatePayload, validateSettings, validateTags, validateBackup, MAX_TOTAL, MAX_TEXT } from '../shared/core';
import type { Clip, Detail, Payload, Settings, Snippet, Category, BatchAction } from '../shared/types';
import { validateCategory, templateVariables } from '../shared/advanced';
export class Store {
  private closed=false;
  onChange?: (previous:Detail|undefined,next?:Detail)=>void;
  db:DatabaseConnection; settings:Settings; queue:string[]; shelf:string[]; categories:Category[]; undoItems:Detail[]=[];
  constructor(path:string,prune=true,private readOnly=false,key?:Uint8Array){
    this.db=openDatabase(path,readOnly,key);try{if(readOnly)this.db.exec('BEGIN');const version=Number((this.db.prepare('PRAGMA user_version').get() as any).user_version);if(version>6)throw new Error('数据库来自较新版本，请使用新版 Clipper');
    if(!readOnly)this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS clips(id TEXT PRIMARY KEY,hash TEXT NOT NULL UNIQUE,updated INTEGER NOT NULL,data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS clips_recent ON clips(updated DESC); CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS snippets(id TEXT PRIMARY KEY,data TEXT NOT NULL); PRAGMA user_version=6;');
    this.settings=validateSettings({...defaults,...this.meta('settings',{})});this.queue=this.meta('queue',[]).filter((id:unknown)=>typeof id==='string'&&this.find(id));this.shelf=this.meta('shelf',[]).filter((id:unknown)=>typeof id==='string'&&this.find(id));this.categories=this.meta('categories',[]);if(prune&&!readOnly)this.prune();
    }catch(e){try{this.db.close();}catch{}throw e;}
  }
  meta(key:string,fallback:any){const row=this.db.prepare('SELECT value FROM meta WHERE key=?').get(key) as any;return row?JSON.parse(row.value):fallback;}
  setMeta(key:string,value:unknown){this.db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run(key,JSON.stringify(value));}
  all():Detail[]{return (this.db.prepare('SELECT data FROM clips ORDER BY updated DESC').all() as any[]).map(r=>JSON.parse(r.data));}
  list():Clip[]{return (this.db.prepare("SELECT json_remove(data,'$.payload') AS data FROM clips ORDER BY updated DESC").all() as any[]).map(r=>JSON.parse(r.data)).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt-a.updatedAt);}
  find(id:string):Detail|undefined {const r=this.db.prepare('SELECT data FROM clips WHERE id=?').get(id) as any;return r?JSON.parse(r.data):undefined;}
  get(id:string):Detail{const item=this.find(id);if(!item)throw new Error('记录已不存在');return item;}
  bytes(){return Number((this.db.prepare('SELECT (SELECT coalesce(sum(length(CAST(data AS BLOB))),0) FROM clips)+(SELECT coalesce(sum(length(CAST(data AS BLOB))),0) FROM snippets) AS n').get() as any).n);}
  save(item:Detail){if(!this.onChange){this.db.prepare('INSERT OR REPLACE INTO clips VALUES(?,?,?,?)').run(item.id,item.hash,item.updatedAt,JSON.stringify(item));return;}const previous=this.find(item.id);this.db.exec('SAVEPOINT store_save');try{this.db.prepare('INSERT OR REPLACE INTO clips VALUES(?,?,?,?)').run(item.id,item.hash,item.updatedAt,JSON.stringify(item));this.onChange(previous,item);this.db.exec('RELEASE store_save');}catch(e){this.db.exec('ROLLBACK TO store_save; RELEASE store_save');throw e;}}
  add(value:Payload,source:string,thumbnail?:string,metadata?:Partial<Detail>,prune=true):Detail{
    const payload=validatePayload(value),hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const existing=this.db.prepare('SELECT data FROM clips WHERE hash=?').get(hash) as any;
    if(existing){const item:Detail=JSON.parse(existing.data);item.updatedAt=Math.max(item.updatedAt,metadata?.updatedAt||Date.now());if(metadata){item.favorite ||= !!metadata.favorite;item.pinned ||= !!metadata.pinned;item.tags=[...new Set([...item.tags,...(metadata.tags||[])])].slice(0,12);}this.save(item);return item;}
    const now=Date.now(),kind=classify(payload),text=payload.text||payload.files?.join('\n')||payload.attachments?.map(a=>a.name).join('\n')||(kind==='image'?'图片':'富文本内容');
    const item:Detail={id:randomUUID(),hash,kind,title:kind==='image'?'剪贴板图片':kind==='files'?(payload.attachments?`${payload.attachments.length} ${payload.attachments.some(a=>a.directory)?"项文件与文件夹":"个附件"} · ${payload.attachments[0].name}`:`${payload.files!.length} 个文件 · ${payload.files![0].split('\\').pop()}`):text.trim().split(/\r?\n/)[0].slice(0,100),preview:text.slice(0,240),source:source.slice(0,256),createdAt:metadata?.createdAt||now,updatedAt:metadata?.updatedAt||now,favorite:!!metadata?.favorite,pinned:!!metadata?.pinned,tags:metadata?.tags||[],bytes:Buffer.byteLength(JSON.stringify(payload)),payload,thumbnail};
    if(this.bytes()+Buffer.byteLength(JSON.stringify(item))>MAX_TOTAL)throw new Error('本地历史已达到 256 MiB，请删除不需要的内容');
    this.save(item);if(prune)this.prune();return item;
  }
  update(id:string,patch:Partial<Pick<Detail,'favorite'|'pinned'|'tags'>>){const item=this.get(id);Object.assign(item,patch);this.save(item);}
  edit(id:string,text:string,tags:string[]){const item=this.get(id);item.tags=validateTags(tags);if(item.kind!=='image'&&item.kind!=='files'&&item.payload.text!==undefined){
      const payload=validatePayload({text});const hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');const dup=this.db.prepare('SELECT id FROM clips WHERE hash=? AND id<>?').get(hash,id);if(dup)throw new Error('已有相同内容的记录');item.payload=payload;item.hash=hash;item.kind=classify(payload);item.title=text.trim().split(/\r?\n/)[0].slice(0,100);item.preview=text.slice(0,240);item.bytes=Buffer.byteLength(JSON.stringify(payload));
    }if(this.bytes()-Buffer.byteLength(JSON.stringify(this.get(id)))+Buffer.byteLength(JSON.stringify(item))>MAX_TOTAL)throw new Error('历史容量已满');this.save(item);}
  delete(id:string){this.batch([id],'delete');}
  undo(){if(!this.undoItems.length)throw new Error('没有可撤销的删除');this.db.exec('BEGIN');try{for(const i of this.undoItems)this.add(i.payload,i.source,i.thumbnail,{...i,updatedAt:Date.now()},false);this.db.exec('COMMIT');this.undoItems=[];}catch(e){this.db.exec('ROLLBACK');throw e;}}
  clear(){const removable=this.all().filter(i=>!this.protected(i));this.undoItems=removable;this.db.exec('BEGIN');try{for(const i of removable)this.db.prepare('DELETE FROM clips WHERE id=?').run(i.id);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
  protected(i:Clip){return i.favorite||i.pinned||i.shared||this.queue.includes(i.id)||this.shelf.includes(i.id);}
  prune(){const cutoff=Date.now()-this.settings.retentionDays*86400000;let count=0;const removable=this.list().filter(i=>!this.protected(i));for(const i of removable){count++;if(count>this.settings.maxItems||i.updatedAt<cutoff)this.db.prepare('DELETE FROM clips WHERE id=?').run(i.id);}}
  setQueue(ids:string[]){this.queue=[...new Set(ids)].filter(id=>!!this.find(id)).slice(0,200);this.setMeta('queue',this.queue);}
  saveSettings(value:Settings){const next=validateSettings(value);this.setMeta('settings',next);this.settings=next;this.prune();}
  snippets():Snippet[]{return (this.db.prepare('SELECT data FROM snippets').all() as any[]).map(r=>{const s=JSON.parse(r.data);const payload=s.payload||{text:s.text};return {...s,payload,kind:classify(payload),text:payload.text||''};}).sort((a,b)=>b.updatedAt-a.updatedAt);}
  saveSnippet(value:{id?:string;title:string;text?:string;payload?:Payload},thumbnail?:string){
    if(typeof value?.title!=='string'||!value.title.trim()||value.title.length>120)throw new Error('填写标题，最多 120 字');
    const previous=value.id?this.snippets().find(s=>s.id===value.id):undefined;if(value.id&&!previous)throw new Error('模板已不存在');if(!value.id&&this.snippets().length>=2000)throw new Error('模板数量已达上限');
    const payload=validatePayload(value.payload??(value.text!==undefined?{text:value.text}:previous?.payload));if(templateVariables(payload.text||'').length>30)throw new Error('模板变量最多 30 个');
    const s:Snippet={id:value.id||randomUUID(),title:value.title.trim(),text:payload.text||'',payload,kind:classify(payload),thumbnail:thumbnail??previous?.thumbnail,updatedAt:Date.now()};
    const oldBytes=previous?Number((this.db.prepare('SELECT length(CAST(data AS BLOB)) AS n FROM snippets WHERE id=?').get(previous.id) as any).n):0;
    if(this.bytes()-oldBytes+Buffer.byteLength(JSON.stringify(s))>MAX_TOTAL)throw new Error('本地历史已达到 256 MiB');this.db.prepare('INSERT OR REPLACE INTO snippets VALUES(?,?)').run(s.id,JSON.stringify(s));return s.id;
  }
  removeSnippet(id:string){this.db.prepare('DELETE FROM snippets WHERE id=?').run(id);}
  saveCategory(value:unknown){const c=validateCategory(value);if(c.id&&!this.categories.some(x=>x.id===c.id))throw new Error('分类已不存在');if(!c.id&&this.categories.length>=50)throw new Error('最多 50 个自定义分类');const category:Category={...c,id:c.id||randomUUID()};const next=[...this.categories.filter(x=>x.id!==category.id),category];this.setMeta('categories',next);this.categories=next;}
  removeCategory(id:string){const next=this.categories.filter(x=>x.id!==id);this.setMeta('categories',next);this.categories=next;}
  batch(ids:string[],action:BatchAction,tags:string[]=[]){
    if(!Array.isArray(ids)||!ids.length||ids.length>500||ids.some(x=>typeof x!=='string'))throw new Error('一次选择 1–500 条记录');const unique=[...new Set(ids)],items=unique.map(id=>this.get(id));
    const queue=[...this.queue],shelf=[...this.shelf];const validTags=validateTags(tags);this.db.exec('SAVEPOINT batch_change');
    try{switch(action){
      case 'delete':for(const item of items){this.onChange?.(item);this.db.prepare('DELETE FROM clips WHERE id=?').run(item.id);}this.setQueue(this.queue.filter(x=>!unique.includes(x)));this.shelf=this.shelf.filter(x=>!unique.includes(x));this.setMeta('shelf',this.shelf);break;
      case 'favorite':for(const i of items)this.update(i.id,{favorite:true});break;
      case 'tag':for(const i of items)this.update(i.id,{tags:validateTags([...new Set([...i.tags,...validTags])])});break;
      case 'enqueue':{const next=[...new Set([...this.queue,...unique])];if(next.length>200)throw new Error('堆栈最多 200 项');this.setQueue(next);break;}
      case 'shelf':{const next=[...new Set([...this.shelf,...unique])];if(next.length>200)throw new Error('拖拽容器最多 200 项');this.setMeta('shelf',next);this.shelf=next;break;}
      case 'unshelf':this.shelf=this.shelf.filter(x=>!unique.includes(x));this.setMeta('shelf',this.shelf);break;
      default:throw new Error('批量操作无效');
    }this.db.exec('RELEASE batch_change');if(action==='delete')this.undoItems=items;
    }catch(e){this.db.exec('ROLLBACK TO batch_change; RELEASE batch_change');this.queue=queue;this.shelf=shelf;throw e;}
  }
  backup(){return {format:'clipper-backup',version:6,exportedAt:new Date().toISOString(),clips:this.all(),snippets:this.snippets(),categories:this.categories,scripts:this.meta('text-scripts',[])};}
  import(value:unknown,thumbnail:(p:Payload)=>string|undefined=()=>undefined){const data=validateBackup(value),previousCategories=[...this.categories];this.db.exec('BEGIN');try{for(const c of data.clips)this.add(c.payload,c.source,thumbnail(c.payload),c,false);const snippets=this.snippets();for(const s of data.snippets)if(!snippets.some(x=>x.title===s.title&&JSON.stringify(x.payload)===JSON.stringify(s.payload))){this.saveSnippet({title:s.title,payload:s.payload},thumbnail(s.payload));snippets.push(s);}for(const c of data.categories)if(!this.categories.some(x=>x.name===c.name&&x.kind===c.kind&&x.contains===c.contains&&x.source===c.source&&x.tag===c.tag))this.saveCategory({...c,id:undefined});if(data.scripts.length){const scripts=this.meta('text-scripts',[]);for(const script of data.scripts)if(!scripts.some((s:any)=>s.name===script.name&&s.code===script.code))scripts.push({...script,id:randomUUID(),updatedAt:Date.now()});if(scripts.length>100||Buffer.byteLength(JSON.stringify(scripts))>4*1024*1024)throw new Error('合并后脚本超过容量限制');this.setMeta('text-scripts',scripts);}this.db.exec('COMMIT');return data.clips.length;}catch(e){this.db.exec('ROLLBACK');this.categories=previousCategories;throw e;}}
  close(){if(this.closed)return;try{this.db.exec(this.readOnly?'ROLLBACK':'PRAGMA wal_checkpoint(TRUNCATE)');}finally{this.closed=true;this.undoItems=[];this.categories=[];this.queue=[];this.shelf=[];this.onChange=undefined;this.db.close();}}
}
