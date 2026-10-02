import {t as tr} from '../shared/i18n';
import {mkdir,lstat,utimes} from 'node:fs/promises';
import {dirname,join,resolve,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {attachmentSubtree,validateAttachments,type Attachment} from '../shared/attachments';
import {attachmentTreeGuard,writeAttachmentTree} from './attachment-tree';
import {commitRecording} from './recording-move';
export async function exportAttachmentDirectory(value:Attachment[],name:string,target:string,valid:()=>boolean=()=>true){
 const all=validateAttachments(value),root=all.find(a=>a.name===name),items=attachmentSubtree(all,name),destination=resolve(target),parent=dirname(destination);
 const parentGuard=attachmentTreeGuard(parent),live=()=>{parentGuard.check();if(!valid())throw new Error(tr('记录已改变、删除或历史已锁定'));};live();
 try{await lstat(destination);throw new Error(tr('文件或文件夹已存在，请选择新名称'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const staging=join(parent,'.Clipper-folder-'+randomUUID()+'.part');await mkdir(staging);const guard=attachmentTreeGuard(staging);let committed=false;
 try{await writeAttachmentTree(staging,items,()=>{live();return true;},true);if(root!.modified!==undefined)await utimes(staging,new Date(root!.accessed??root!.modified),new Date(root!.modified));live();guard.check();commitRecording(staging,destination);committed=true;return basename(destination);}finally{if(!committed){parentGuard.check();guard.remove();}}
}
