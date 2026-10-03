import {t as tr} from '../shared/i18n';
import {openDatabase,type DatabaseConnection} from './database';
import { createHash, randomUUID } from 'node:crypto';
import {zstdCompressSync,zstdDecompressSync,constants as zlibConstants} from 'node:zlib';
import { defaults, classify, validatePayload, validateSettings, validateTags, validateBackup, MAX_TOTAL, MAX_TEXT, contentBytes } from '../shared/core';
import type { Clip, Detail, Payload, Settings, Snippet, Category, BatchAction } from '../shared/types';
import { validateCategory, templateVariables } from '../shared/advanced';
import {initializePreviewIndex} from './preview-index';
import {previewPayload,type ClipPreview,type SnippetPreview,type SnippetSummary,type PreviewPayload} from '../shared/preview';
import {initializeListIndex} from './store-index';
import {payloadDigest} from './payload-digest';
export interface PreparedCapture {readonly prepared:true}
const preparedCaptures=new WeakMap<PreparedCapture,{payload:Payload;hash:string}>();
/** Opaque, one-use preparation; only validated owned objects can reach a write. */
export function prepareCapture(value:unknown):PreparedCapture{const payload=validatePayload(value),token=Object.freeze({prepared:true as const});preparedCaptures.set(token,{payload,hash:payloadDigest(payload)});return token;}
export class Store {
  private closed=false;private indexed=false;private importTotal?:number;
  onChange?: (previous:Detail|undefined,next?:Detail)=>void;
  db:DatabaseConnection; settings:Settings; queue:string[]; shelf:string[]; categories:Category[];
  constructor(path:string,prune=true,private readOnly=false,key?:Uint8Array,initialized=false){
    this.db=openDatabase(path,readOnly,key);try{if(initialized)this.db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL; PRAGMA secure_delete=ON;');if(readOnly)this.db.exec('BEGIN');const version=Number((this.db.prepare('PRAGMA user_version').get() as any).user_version);if(version>7)throw new Error(tr('数据库来自较新版本，请使用新版 Clipper'));
    if(!readOnly&&!initialized)this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS clips(id TEXT PRIMARY KEY,hash TEXT NOT NULL UNIQUE,updated INTEGER NOT NULL,data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS clips_recent ON clips(updated DESC); CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS snippets(id TEXT PRIMARY KEY,data TEXT NOT NULL); PRAGMA user_version=7;');
    if(!readOnly&&!initialized){initializeListIndex(this.db);initializePreviewIndex(this.db);this.indexed=true;}else if(initialized){if(version!==7)throw new Error(tr('内容校验已失效'));this.db.prepare('SELECT i.data,p.payload,s.source,r.updated FROM clip_list_cache i JOIN clip_preview_cache p ON p.id=i.id JOIN clip_source_cache s ON s.id=i.id JOIN clip_retention_cache r ON r.id=i.id LIMIT 0').all();this.indexed=true;}
    // The single deletion snapshot stays in SQLite memory, including for an
    // encrypted history. It never becomes a plaintext temporary file or part
    // of the persistent database/backup, and closing the connection discards it.
    if(!readOnly)this.db.exec('PRAGMA temp_store=MEMORY;CREATE TEMP TABLE clipper_delete_undo(position INTEGER PRIMARY KEY,data BLOB NOT NULL);');
    this.settings=validateSettings({...defaults,...this.meta('settings',{})});this.queue=this.meta('queue',[]).filter((id:unknown)=>typeof id==='string'&&this.has(id));this.shelf=this.meta('shelf',[]).filter((id:unknown)=>typeof id==='string'&&this.has(id));this.categories=this.meta('categories',[]);if(prune&&!readOnly)this.prune();
    }catch(e){try{this.db.close();}catch{}throw e;}
  }
  meta(key:string,fallback:any){const row=this.db.prepare('SELECT value FROM meta WHERE key=?').get(key) as any;return row?JSON.parse(row.value):fallback;}
  setMeta(key:string,value:unknown){this.db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run(key,JSON.stringify(value));}
  all():Detail[]{return (this.db.prepare('SELECT data FROM clips ORDER BY updated DESC').all() as any[]).map(r=>JSON.parse(r.data));}
  list():Clip[]{return (this.db.prepare(this.indexed?"SELECT i.data FROM clips c JOIN clip_list_cache i ON i.id=c.id ORDER BY c.updated DESC":"SELECT json_remove(data,'$.payload') AS data FROM clips ORDER BY updated DESC").all() as any[]).map(r=>JSON.parse(r.data)).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt-a.updatedAt);}
  /** Source checks use a compact SQL index; thumbnails and record bodies never enter JS. */
  sourceApplications():string[]{return (this.db.prepare(this.indexed?'SELECT DISTINCT s.source FROM clip_source_cache s JOIN clips c ON c.id=s.id':"SELECT DISTINCT json_extract(data,'$.source') AS source FROM clips").all() as {source:string}[]).map(row=>row.source);}
  preview(id:string):ClipPreview{if(!this.indexed){const {payload,...item}=this.get(id);return {...item,payload:previewPayload(payload)};}const row=this.db.prepare('SELECT i.data,p.payload FROM clips c JOIN clip_list_cache i ON i.id=c.id JOIN clip_preview_cache p ON p.id=c.id WHERE c.id=?').get(id) as {data:string;payload:string}|undefined;if(!row)throw new Error(tr('记录已不存在'));return {...JSON.parse(row.data),payload:cleanPreview(JSON.parse(row.payload))};}
  snippetIDs(){return (this.db.prepare('SELECT id FROM snippets').all() as {id:string}[]).map(s=>s.id);}
  snippetList():SnippetSummary[]{if(!this.indexed)return this.snippets().map(({payload,...s})=>({...s,revision:0}));return (this.db.prepare('SELECT i.data,i.payload,i.revision FROM snippets s JOIN snippet_list_cache i ON i.id=s.id').all() as {data:string;payload:string;revision:number}[]).map(row=>{const s=JSON.parse(row.data),p=JSON.parse(row.payload);return {...s,kind:previewKind(s.text,p),revision:row.revision};}).sort((a,b)=>b.updatedAt-a.updatedAt);}
  snippet(id:string):Snippet{const row=this.db.prepare('SELECT data FROM snippets WHERE id=?').get(id) as {data:string}|undefined;if(!row)throw new Error(tr('模板已不存在'));const s=JSON.parse(row.data),payload=s.payload||{text:s.text};return {...s,payload,kind:classify(payload),text:payload.text||''};}
  snippetPreview(id:string):SnippetPreview{if(!this.indexed){const {payload,...s}=this.snippet(id);return {...s,payload:{...previewPayload(payload),text:s.text},revision:0};}const row=this.db.prepare('SELECT i.data,i.payload,i.revision FROM snippets s JOIN snippet_list_cache i ON i.id=s.id WHERE s.id=?').get(id) as {data:string;payload:string;revision:number}|undefined;if(!row)throw new Error(tr('模板已不存在'));const s=JSON.parse(row.data),p=cleanPreview(JSON.parse(row.payload));return {...s,kind:previewKind(s.text,p),payload:{...p,text:s.text},revision:row.revision};}
  snippetRevision(id:string){return (this.db.prepare('SELECT i.revision FROM snippets s JOIN snippet_list_cache i ON i.id=s.id WHERE s.id=?').get(id) as {revision:number}|undefined)?.revision;}
  /** Existence and identity checks must not materialize binary payloads. */
  has(id:string):boolean{return !!this.db.prepare('SELECT 1 FROM clips WHERE id=?').get(id);}
  identity(id:string):Pick<Clip,'id'|'hash'|'localOnly'|'shared'>|undefined{const row=this.db.prepare(this.indexed?"SELECT json_extract(i.data,'$.id') AS id,json_extract(i.data,'$.hash') AS hash,json_extract(i.data,'$.localOnly') AS localOnly,json_extract(i.data,'$.shared') AS shared FROM clips c JOIN clip_list_cache i ON i.id=c.id WHERE c.id=?":"SELECT json_extract(data,'$.id') AS id,json_extract(data,'$.hash') AS hash,json_extract(data,'$.localOnly') AS localOnly,json_extract(data,'$.shared') AS shared FROM clips WHERE id=?").get(id) as {id:string;hash:string;localOnly?:boolean;shared?:boolean}|undefined;return row?{id:row.id,hash:row.hash,localOnly:!!row.localOnly,shared:!!row.shared}:undefined;}
  find(id:string):Detail|undefined {const r=this.db.prepare('SELECT data FROM clips WHERE id=?').get(id) as any;return r?JSON.parse(r.data):undefined;}
  get(id:string):Detail{const item=this.find(id);if(!item)throw new Error(tr('记录已不存在'));return item;}
  matchesHash(id:string,hash:string):boolean{return (this.db.prepare('SELECT hash FROM clips WHERE id=?').get(id) as {hash?:string}|undefined)?.hash===hash;}
  bytes(){if(this.importTotal!==undefined)return this.importTotal;return Number((this.db.prepare(this.indexed?'SELECT (SELECT coalesce(sum(i.bytes),0) FROM clips c JOIN clip_list_cache i ON i.id=c.id)+(SELECT coalesce(sum(i.bytes),0) FROM snippets s JOIN snippet_list_cache i ON i.id=s.id) AS n':'SELECT (SELECT coalesce(sum(length(CAST(data AS BLOB))),0) FROM clips)+(SELECT coalesce(sum(length(CAST(data AS BLOB))),0) FROM snippets) AS n').get() as any).n);}
  save(item:Detail){const data=JSON.stringify(item),previousBytes=this.importTotal===undefined?0:Number((this.db.prepare(this.indexed?'SELECT bytes AS n FROM clip_list_cache WHERE id=?':'SELECT length(CAST(data AS BLOB)) AS n FROM clips WHERE id=?').get(item.id) as {n?:number}|undefined)?.n||0);if(!this.onChange){this.db.prepare('INSERT OR REPLACE INTO clips VALUES(?,?,?,?)').run(item.id,item.hash,item.updatedAt,data);if(this.importTotal!==undefined)this.importTotal+=Buffer.byteLength(data)-previousBytes;return;}const previous=this.find(item.id);this.db.exec('SAVEPOINT store_save');try{this.db.prepare('INSERT OR REPLACE INTO clips VALUES(?,?,?,?)').run(item.id,item.hash,item.updatedAt,data);this.onChange(previous,item);this.db.exec('RELEASE store_save');if(this.importTotal!==undefined)this.importTotal+=Buffer.byteLength(data)-previousBytes;}catch(e){this.db.exec('ROLLBACK TO store_save; RELEASE store_save');throw e;}}
  add(value:Payload,source:string,thumbnail?:string,metadata?:Partial<Detail>,prune=true,publication?:{retained:boolean;resetRetained?:boolean}):Detail{
    return this.addPrepared(prepareCapture(value),source,thumbnail,metadata,prune,publication);
  }
  addPrepared(token:PreparedCapture,source:string,thumbnail?:string,metadata?:Partial<Detail>,prune=true,publication?:{retained:boolean;resetRetained?:boolean}):Detail{
    const prepared=preparedCaptures.get(token);if(!prepared)throw new Error(tr('内容校验已失效'));preparedCaptures.delete(token);const {payload,hash}=prepared;
    const existing=this.db.prepare('SELECT data FROM clips WHERE hash=?').get(hash) as any;
    if(existing){const item:Detail=JSON.parse(existing.data);item.updatedAt=Math.max(item.updatedAt,metadata?.updatedAt||Date.now());if(metadata){item.favorite ||= !!metadata.favorite;item.pinned ||= !!metadata.pinned;item.tags=[...new Set([...item.tags,...(metadata.tags||[])])].slice(0,12);}if(publication){item.shared=true;if(publication.retained)item.syncRetained=true;else if(publication.resetRetained)item.syncRetained=false;}this.save(item);return item;}
    const now=Date.now(),kind=classify(payload),text=payload.text||payload.files?.join('\n')||payload.attachments?.map(a=>a.name).join('\n')||(kind==='image'?tr('图片'):tr('富文本内容'));
    const item:Detail={id:randomUUID(),hash,kind,title:kind==='image'?tr('剪贴板图片'):kind==='files'?(payload.attachments?(payload.attachments.some(a=>a.directory)?tr`${payload.attachments.length} 项文件与文件夹 · ${payload.attachments[0].name}`:tr`${payload.attachments.length} 个附件 · ${payload.attachments[0].name}`):tr`${payload.files!.length} 个文件 · ${payload.files![0].split('\\').pop()}`):text.trim().split(/\r?\n/)[0].slice(0,100),preview:text.slice(0,240),source:source.slice(0,256),createdAt:metadata?.createdAt||now,updatedAt:metadata?.updatedAt||now,favorite:!!metadata?.favorite,pinned:!!metadata?.pinned,tags:metadata?.tags||[],bytes:contentBytes(payload),payload,thumbnail};
    // Restore and undo preserve saved labels across language changes; legacy backups may omit them.
    if(typeof metadata?.title==='string'&&metadata.title.length<=33000)item.title=metadata.title;
    if(typeof metadata?.preview==='string'&&metadata.preview.length<=240)item.preview=metadata.preview;
    if(publication){item.shared=true;if(publication.retained)item.syncRetained=true;}
    if(this.bytes()+contentBytes(item)>MAX_TOTAL)throw new Error(tr('本地历史已达到 256 MiB，请删除不需要的内容'));
    this.save(item);if(prune)this.prune();return item;
  }
  update(id:string,patch:Partial<Pick<Detail,'favorite'|'pinned'|'tags'>>){const item=this.get(id);Object.assign(item,patch);this.save(item);}
  edit(id:string,text:string,tags:string[]){const item=this.get(id);item.tags=validateTags(tags);if(item.kind!=='image'&&item.kind!=='files'&&item.payload.text!==undefined&&text!==item.payload.text){
      const payload=validatePayload({text});const hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');const dup=this.db.prepare('SELECT id FROM clips WHERE hash=? AND id<>?').get(hash,id);if(dup)throw new Error(tr('已有相同内容的记录'));item.payload=payload;item.hash=hash;item.kind=classify(payload);item.title=text.trim().split(/\r?\n/)[0].slice(0,100);item.preview=text.slice(0,240);item.bytes=contentBytes(payload);
    }if(this.bytes()-Buffer.byteLength(JSON.stringify(this.get(id)))+contentBytes(item)>MAX_TOTAL)throw new Error(tr('历史容量已满'));this.save(item);}
  delete(id:string){this.batch([id],'delete');}
  private rememberDeletion(id:string){const row=this.db.prepare('SELECT data FROM clips WHERE id=?').get(id),data=zstdCompressSync(row.data,{params:{[zlibConstants.ZSTD_c_compressionLevel]:1}});try{this.db.prepare('INSERT INTO temp.clipper_delete_undo(data) VALUES(?)').run(data);}finally{data.fill(0);}}
  private deletedDetail(data:Uint8Array):Detail{const bytes=zstdDecompressSync(data,{maxOutputLength:MAX_TOTAL});try{return JSON.parse(bytes.toString('utf8'));}finally{bytes.fill(0);}}
  get undoItems():Detail[]{return this.readOnly?[]:[...this.db.prepare('SELECT data FROM temp.clipper_delete_undo ORDER BY position').iterate()].map(row=>this.deletedDetail(row.data));}
  undo(){if(this.readOnly||!this.db.prepare('SELECT 1 FROM temp.clipper_delete_undo LIMIT 1').get())throw new Error(tr('没有可撤销的删除'));this.db.exec('BEGIN');try{const next=this.db.prepare('SELECT position,data FROM temp.clipper_delete_undo WHERE position>? ORDER BY position LIMIT 1');let position=0;for(let row=next.get(position);row;row=next.get(position)){position=row.position;const i=this.deletedDetail(row.data);this.add(i.payload,i.source,i.thumbnail,{...i,updatedAt:Date.now()},false);}this.db.exec('DELETE FROM temp.clipper_delete_undo;COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
  /** Cleanup selects IDs in SQL; thumbnails and full record bodies stay out of JS. */
  private retentionCandidates(cutoff?:number):{id:string}[]{
    const fields=this.indexed?'SELECT c.id,r.updated,r.protected,c.updated AS stored_updated,c.rowid AS sequence FROM clip_retention_cache r JOIN clips c ON c.id=r.id':"SELECT c.id,json_extract(c.data,'$.updatedAt') AS updated,(coalesce(json_extract(c.data,'$.favorite'),0) OR coalesce(json_extract(c.data,'$.pinned'),0) OR coalesce(json_extract(c.data,'$.shared'),0)) AS protected,c.updated AS stored_updated,c.rowid AS sequence FROM clips c";
    const eligible=`SELECT * FROM (${fields}) WHERE protected=0 AND id NOT IN (SELECT value FROM json_each(?))`,order='updated DESC,stored_updated DESC,sequence';
    const protectedIDs=JSON.stringify([...new Set([...this.queue,...this.shelf])]);
    return cutoff===undefined?this.db.prepare(`SELECT id FROM (${eligible}) ORDER BY ${order}`).all(protectedIDs):this.db.prepare(`SELECT id FROM (SELECT id,updated,row_number() OVER (ORDER BY ${order}) AS position FROM (${eligible})) WHERE updated<? OR position>? ORDER BY position`).all(protectedIDs,cutoff,this.settings.maxItems);
  }
  clear(){this.db.exec('BEGIN');try{const removable=this.retentionCandidates();this.db.exec('DELETE FROM temp.clipper_delete_undo');const remove=this.db.prepare('DELETE FROM clips WHERE id=?');for(const i of removable){this.rememberDeletion(i.id);remove.run(i.id);}this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
  protected(i:Clip){return i.favorite||i.pinned||i.shared||this.queue.includes(i.id)||this.shelf.includes(i.id);}
  prune(){this.db.exec('SAVEPOINT retention_prune');try{const remove=this.db.prepare('DELETE FROM clips WHERE id=?');for(const item of this.retentionCandidates(Date.now()-this.settings.retentionDays*86400000))remove.run(item.id);this.db.exec('RELEASE retention_prune');}catch(e){this.db.exec('ROLLBACK TO retention_prune; RELEASE retention_prune');throw e;}}
  setQueue(ids:string[]){this.queue=[...ids].filter(id=>this.has(id)).slice(0,200);this.setMeta('queue',this.queue);}
  queueAction(index:unknown,id:unknown,action:unknown,expected:unknown){
    if(!Number.isInteger(index)||typeof id!=='string'||!Array.isArray(expected)||expected.length>200||expected.some(x=>typeof x!=='string')||JSON.stringify(expected)!==JSON.stringify(this.queue)||this.queue[index as number]!==id||!['dequeue','up','down'].includes(action as string))throw new Error(tr('堆栈顺序已变化，请重新选择副本'));
    const next=[...this.queue],from=index as number;if(action==='dequeue')next.splice(from,1);else{const to=from+(action==='up'?-1:1);if(to>=0&&to<next.length)[next[from],next[to]]=[next[to],next[from]];}this.setQueue(next);
  }
  saveSettings(value:Settings){const next=validateSettings(value);this.setMeta('settings',next);this.settings=next;this.prune();}
  snippets():Snippet[]{return (this.db.prepare('SELECT data FROM snippets').all() as any[]).map(r=>{const s=JSON.parse(r.data);const payload=s.payload||{text:s.text};return {...s,payload,kind:classify(payload),text:payload.text||''};}).sort((a,b)=>b.updatedAt-a.updatedAt);}
  saveSnippet(value:{id?:string;title:string;text?:string;payload?:Payload},thumbnail?:string){
    if(typeof value?.title!=='string'||!value.title.trim()||value.title.length>120)throw new Error(tr('填写标题，最多 120 字'));
    const previous=value.id?this.snippet(value.id):undefined;if(value.id&&!previous)throw new Error(tr('模板已不存在'));if(!value.id&&Number((this.db.prepare('SELECT count(*) AS n FROM snippets').get() as any).n)>=2000)throw new Error(tr('模板数量已达上限'));
    const payload=validatePayload(value.payload??(value.text!==undefined?{text:value.text}:previous?.payload));if(templateVariables(payload.text||'').length>30)throw new Error(tr('模板变量最多 30 个'));
    const s:Snippet={id:value.id||randomUUID(),title:value.title.trim(),text:payload.text||'',payload,kind:classify(payload),thumbnail:thumbnail??previous?.thumbnail,updatedAt:Date.now()};
    const oldBytes=previous?Number((this.db.prepare('SELECT length(CAST(data AS BLOB)) AS n FROM snippets WHERE id=?').get(previous.id) as any).n):0;
    const data=JSON.stringify(s),newBytes=Buffer.byteLength(data);if(this.bytes()-oldBytes+newBytes>MAX_TOTAL)throw new Error(tr('本地历史已达到 256 MiB'));this.db.prepare('INSERT INTO snippets VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(s.id,data);if(this.importTotal!==undefined)this.importTotal+=newBytes-oldBytes;return s.id;
  }
  removeSnippet(id:string){this.db.prepare('DELETE FROM snippets WHERE id=?').run(id);}
  saveCategory(value:unknown){const c=validateCategory(value);if(c.id&&!this.categories.some(x=>x.id===c.id))throw new Error(tr('分类已不存在'));if(!c.id&&this.categories.length>=50)throw new Error(tr('最多 50 个自定义分类'));const category:Category={...c,id:c.id||randomUUID()};const next=[...this.categories.filter(x=>x.id!==category.id),category];this.setMeta('categories',next);this.categories=next;}
  removeCategory(id:string){const next=this.categories.filter(x=>x.id!==id);this.setMeta('categories',next);this.categories=next;}
  batch(ids:string[],action:BatchAction,tags:string[]=[]){
    if(!Array.isArray(ids)||!ids.length||ids.length>500||ids.some(x=>typeof x!=='string'))throw new Error(tr('一次选择 1–500 条记录'));const unique=[...new Set(ids)];if(unique.some(id=>!this.has(id)))throw new Error(tr('记录已不存在'));
    const queue=[...this.queue],shelf=[...this.shelf];const validTags=validateTags(tags);this.db.exec('SAVEPOINT batch_change');
    try{switch(action){
      case 'delete':{this.db.exec('DELETE FROM temp.clipper_delete_undo');const remove=this.db.prepare('DELETE FROM clips WHERE id=?');for(const id of unique){this.rememberDeletion(id);if(this.onChange)this.onChange(this.get(id));remove.run(id);}this.setQueue(this.queue.filter(x=>!unique.includes(x)));this.shelf=this.shelf.filter(x=>!unique.includes(x));this.setMeta('shelf',this.shelf);break;}
      case 'favorite':for(const id of unique)this.update(id,{favorite:true});break;
      case 'tag':for(const id of unique){const item=this.get(id);item.tags=validateTags([...new Set([...item.tags,...validTags])]);this.save(item);}break;
      case 'enqueue':{const next=this.meta('stack-options',{}).duplicates?[...this.queue,...unique]:[...new Set([...this.queue,...unique])];if(next.length>200)throw new Error(tr('堆栈最多 200 项'));this.setQueue(next);break;}
      case 'shelf':{const next=[...new Set([...this.shelf,...unique])];if(next.length>200)throw new Error(tr('拖拽容器最多 200 项'));this.setMeta('shelf',next);this.shelf=next;break;}
      case 'unshelf':this.shelf=this.shelf.filter(x=>!unique.includes(x));this.setMeta('shelf',this.shelf);break;
      default:throw new Error(tr('批量操作无效'));
    }this.db.exec('RELEASE batch_change');
    }catch(e){this.db.exec('ROLLBACK TO batch_change; RELEASE batch_change');this.queue=queue;this.shelf=shelf;throw e;}
  }
  backup(){return {format:'clipper-backup',version:7,exportedAt:new Date().toISOString(),clips:this.all(),snippets:this.snippets(),categories:this.categories,scripts:this.meta('text-scripts',[])};}
  import(value:unknown,thumbnail:(p:Payload)=>string|undefined=()=>undefined){const data=validateBackup(value),previousCategories=[...this.categories];this.importTotal=this.bytes();try{this.db.exec('BEGIN');try{for(const c of data.clips)this.add(c.payload,c.source,thumbnail(c.payload),c,false);const snippets=this.snippets();for(const s of data.snippets)if(!snippets.some(x=>x.title===s.title&&JSON.stringify(x.payload)===JSON.stringify(s.payload))){this.saveSnippet({title:s.title,payload:s.payload},thumbnail(s.payload));snippets.push(s);}for(const c of data.categories)if(!this.categories.some(x=>x.name===c.name&&x.kind===c.kind&&x.contains===c.contains&&x.source===c.source&&x.tag===c.tag))this.saveCategory({...c,id:undefined});if(data.scripts.length){const scripts=this.meta('text-scripts',[]);for(const script of data.scripts)if(!scripts.some((s:any)=>s.name===script.name&&s.code===script.code))scripts.push({...script,id:randomUUID(),updatedAt:Date.now()});if(scripts.length>100||Buffer.byteLength(JSON.stringify(scripts))>4*1024*1024)throw new Error(tr('合并后脚本超过容量限制'));this.setMeta('text-scripts',scripts);}this.db.exec('COMMIT');return data.clips.length;}catch(e){this.db.exec('ROLLBACK');this.categories=previousCategories;throw e;}}finally{this.importTotal=undefined;}}
  close(){if(this.closed)return;try{this.db.exec(this.readOnly?'ROLLBACK':'PRAGMA wal_checkpoint(TRUNCATE)');}finally{this.closed=true;this.categories=[];this.queue=[];this.shelf=[];this.onChange=undefined;this.db.close();}}
}

function cleanPreview(value:PreviewPayload){for(const key of Object.keys(value) as (keyof PreviewPayload)[])if(value[key]===null)delete value[key];return value;}

function previewKind(text:string,p:PreviewPayload){return classify({text,...(p.png?{png:'image'}:{}),...(p.files?.length||p.attachments?.length?{files:['files']}:{}),...(p.formats?{formats:p.formats.map(f=>({name:f.name,data:''}))}:{})});}
