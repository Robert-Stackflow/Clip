import {mkdir,open} from 'node:fs/promises';
import {lstatSync,realpathSync,readdirSync,unlinkSync,type Stats} from 'node:fs';
import {resolve,join,dirname,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {MAX_ITEM,MAX_TOTAL} from '../shared/core';
import {t as tr} from '../shared/i18n';
import {writeBase64} from './base64-file';
import {commitImageFile} from './recording-move';

const image=/^Clip-[0-9a-f]{64}\.(png|jpg|gif|webp|tif|bmp|dib)$/;
const temporary=/^\.Clip-drag-[0-9a-f-]{36}\.part$/;
type Entry={bytes:number;identity?:Stats};
const same=(a:Stats,b:Stats)=>a.isFile()&&!a.isSymbolicLink()&&a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs;

/** Consumes a validated Store payload. Materialize original bytes once, without rescanning its encoding. */
export class ImageDragFiles {
 private root:string;private physical='';private identity?:Stats;private generation=0;private disposed=false;
 private used=0;private entries=new Map<string,Entry>();private cleanup=new Set<string>();private retry?:NodeJS.Timeout;
 private serial:Promise<unknown>=Promise.resolve();
 constructor(root:string,private maximum=MAX_TOTAL){this.root=resolve(root);}
 private checked(file?:string){
  const stat=lstatSync(this.root);
  if(!this.identity||stat.isSymbolicLink()||!stat.isDirectory()||stat.ino!==this.identity.ino||stat.dev!==this.identity.dev||realpathSync(this.root)!==this.physical)throw new Error(tr('图片缓存目录已改变'));
  if(file&&(dirname(resolve(file))!==this.root||!image.test(basename(file))&&!temporary.test(basename(file))))throw new Error(tr('图片缓存文件无效'));
 }
 private remove(file:string){this.checked(file);try{unlinkSync(file);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}this.used-=this.entries.get(file)?.bytes||0;this.entries.delete(file);this.cleanup.delete(file);}
 private retryCleanup(){for(const file of this.cleanup)try{this.remove(file);}catch{}if(!this.cleanup.size&&this.retry){clearInterval(this.retry);this.retry=undefined;}}
 private defer(file:string,bytes:number){if(!this.entries.has(file)){this.entries.set(file,{bytes});this.used+=bytes;}this.cleanup.add(file);this.retry??=setInterval(()=>this.retryCleanup(),1000).unref();}
 async init(){
  await mkdir(this.root,{recursive:true});const stat=lstatSync(this.root);if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error(tr('图片缓存目录不能是链接'));
  this.identity=stat;this.physical=realpathSync(this.root);
  for(const entry of readdirSync(this.root,{withFileTypes:true}))if(image.test(entry.name)||temporary.test(entry.name)){
   const file=join(this.root,entry.name);let bytes=0;try{bytes=lstatSync(file).size;this.remove(file);}catch(e){if(!['EBUSY','EPERM','EACCES'].includes((e as NodeJS.ErrnoException).code||''))throw e;this.defer(file,bytes);}
  }
 }
 cancel(){this.generation++;}
 dispose(){this.disposed=true;this.cancel();for(const file of this.entries.keys())this.cleanup.add(file);this.retryCleanup();if(this.cleanup.size)this.retry??=setInterval(()=>this.retryCleanup(),1000).unref();}
 get retainedBytes(){return this.used;}
 materialize(hash:string,extension:string,encoded:string,valid:()=>boolean=()=>true,prepare:()=>void=()=>{}){
  const epoch=this.generation;
  const task=this.serial.catch(()=>{}).then(()=>this.write(hash,extension,encoded,epoch,valid,prepare));this.serial=task.then(()=>{},()=>{});return task;
 }
 private async write(hash:string,extension:string,encoded:string,epoch:number,valid:()=>boolean,prepare:()=>void){
  const live=()=>{if(this.disposed||epoch!==this.generation||!valid())throw new Error(tr('记录已改变、删除或历史已锁定'));this.checked();};live();
  if(!/^[0-9a-f]{64}$/.test(hash)||!image.test(`Clip-${hash}.${extension}`)||typeof encoded!=='string')throw new Error(tr('图片缓存文件无效'));
  const file=join(this.root,`Clip-${hash}.${extension}`),bytes=Buffer.byteLength(encoded,'base64'),cached=this.entries.get(file);
  if(cached){let current;try{current=lstatSync(file);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
   if(!this.cleanup.has(file)&&cached.bytes===bytes&&cached.identity&&current&&same(current,cached.identity)){live();return file;}
   this.remove(file);
  }
  if(!bytes||bytes>MAX_ITEM)throw new Error(tr('图片数据无效或过大'));
  if(this.used+bytes>this.maximum)throw new Error(tr('本次运行的临时图片已达上限，请重启 Clip 后重试'));
  prepare();live();const staging=join(this.root,'.Clip-drag-'+randomUUID()+'.part');let output;let created=false;let committed=false;let success=false;
  try{output=await open(staging,'wx',0o600);created=true;await writeBase64(output,encoded,live);await output.close();output=undefined;live();await commitImageFile(staging,file);committed=true;live();this.entries.set(file,{bytes,identity:lstatSync(file)});this.used+=bytes;success=true;return file;}
  finally{await output?.close().catch(()=>{});if(created)try{this.remove(staging);}catch{this.defer(staging,bytes);}if(committed&&!success)try{this.remove(file);}catch{this.defer(file,bytes);}}
 }
}
