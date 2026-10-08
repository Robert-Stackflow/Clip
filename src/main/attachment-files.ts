import {t as tr} from '../shared/i18n';
import {mkdir} from 'node:fs/promises';
import {attachmentTreeBytes,writeAttachmentTree} from './attachment-tree';
import {lstatSync,realpathSync,readdirSync,rmSync,unlinkSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateAttachments,type Attachment} from '../shared/attachments';
const groupPattern=/^Clip-attachments-[0-9a-f-]{36}$/;
// Only this dedicated cache's direct, generated child directories may be removed.
export class AttachmentFiles {
 private root:string;private physical='';private generation=0;private used=0;private reserved=0;private pending=0;private groups=new Map<string,number>();private cleanup=new Set<string>();private retry?:NodeJS.Timeout;
 constructor(root:string,private maximum=256*1024*1024){this.root=resolve(root);}
 private checked(directory:string){if(!this.physical||realpathSync(this.root)!==this.physical||dirname(resolve(directory))!==this.root||!groupPattern.test(directory.slice(this.root.length+1)))throw new Error(tr('附件缓存目录已改变'));return resolve(directory);}
 private remove(directory:string){const target=this.checked(directory);try{const stat=lstatSync(target);if(stat.isSymbolicLink()){unlinkSync(target);return;}if(!stat.isDirectory()||dirname(realpathSync(target))!==this.physical)throw new Error(tr('附件缓存目录无效'));rmSync(target,{recursive:true,force:true});}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
 private retryCleanup(){for(const group of this.cleanup)try{this.remove(group);this.used-=this.groups.get(group)||0;this.groups.delete(group);this.cleanup.delete(group);}catch{}if(!this.cleanup.size&&this.retry){clearInterval(this.retry);this.retry=undefined;}}
 private deferCleanup(group:string,bytes:number){if(!this.groups.has(group)){this.groups.set(group,bytes);this.used+=bytes;}this.cleanup.add(group);this.retry??=setInterval(()=>this.retryCleanup(),1000).unref();}
 async init(){await mkdir(this.root,{recursive:true});if(lstatSync(this.root).isSymbolicLink())throw new Error(tr('附件缓存不能是链接'));this.physical=realpathSync(this.root);for(const entry of readdirSync(this.root,{withFileTypes:true}))if(groupPattern.test(entry.name)){const group=join(this.root,entry.name);try{this.remove(group);}catch(e){if(!['EBUSY','EPERM','EACCES'].includes((e as NodeJS.ErrnoException).code||''))throw e;let bytes=0;try{if(lstatSync(group).isSymbolicLink())throw new Error('Linked cache entry');bytes=attachmentTreeBytes(group);}catch{bytes=this.maximum;}this.deferCleanup(group,bytes);}}}
 cancel(){this.generation++;}
 dispose(){this.cancel();for(const group of this.groups.keys())this.cleanup.add(group);this.retryCleanup();if(this.cleanup.size)this.retry??=setInterval(()=>this.retryCleanup(),1000).unref();return this.cleanup.size;}
 async materialize(value:Attachment[],valid:()=>boolean=()=>true){const attachments=validateAttachments(value),epoch=this.generation,bytes=attachments.reduce((n,a)=>n+Buffer.byteLength(a.data,'base64'),0),live=()=>{if(epoch!==this.generation||!valid())throw new Error(tr('附件操作已取消或历史已锁定'));};live();if(this.used+this.reserved+bytes>this.maximum||this.groups.size+this.pending>=200)throw new Error(tr('本次运行的临时附件已达上限，请重启 Clip 后重试'));const directory=join(this.root,'Clip-attachments-'+randomUUID());this.checked(directory);this.reserved+=bytes;this.pending++;let success=false,created=false;try{await mkdir(directory);created=true;const files=await writeAttachmentTree(directory,attachments,()=>{live();return true;});live();this.groups.set(directory,bytes);this.used+=bytes;success=true;return files;}finally{this.reserved-=bytes;this.pending--;if(!success&&created)try{this.remove(directory);}catch{this.deferCleanup(directory,bytes);}}}
}
