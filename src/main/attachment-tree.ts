import {mkdir,open,utimes} from 'node:fs/promises';
import {lstatSync,realpathSync,readdirSync,rmSync,unlinkSync} from 'node:fs';
import {resolve,join,relative,sep} from 'node:path';
import {validateAttachments,attachmentRoots,MAX_ATTACHMENT_NODES,MAX_ATTACHMENT_DEPTH,type Attachment} from '../shared/attachments';
const equal=(a:string,b:string)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
/** Capture one caller-created directory. Never follow a replacement during writes or cleanup. */
export function attachmentTreeGuard(root:string){
 const directory=resolve(root),stat=lstatSync(directory),physical=realpathSync(directory);
 if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('附件目录不能是链接');
 const check=()=>{const current=lstatSync(directory);if(current.isSymbolicLink()||!current.isDirectory()||current.ino!==stat.ino||current.dev!==stat.dev||!equal(realpathSync(directory),physical))throw new Error('附件目录已改变');};
 return {directory,physical,check,remove(){check();rmSync(directory,{recursive:true,force:true});}};
}
export async function writeAttachmentTree(root:string,value:Attachment[],valid:()=>boolean=()=>true,flush=false){
 const items=value.length?validateAttachments(value):[],guard=attachmentTreeGuard(root),created=new Map<string,number>();
 if(readdirSync(guard.directory).length)throw new Error('附件目标目录必须为空');
 const live=()=>{if(!valid())throw new Error('附件操作已取消或历史已锁定');guard.check();};
 const target=(name:string)=>{const path=resolve(guard.directory,...name.split('\\')),part=relative(guard.directory,path);if(!part||part==='..'||part.startsWith('..'+sep)||resolve(guard.directory,part)!==path)throw new Error('附件路径超出目录');return path;};
 const parents=(name:string)=>{live();const parts=name.split('\\');for(let n=1;n<parts.length;n++){const rel=parts.slice(0,n).join('\\'),path=target(rel),stat=lstatSync(path);if(stat.isSymbolicLink()||!stat.isDirectory()||created.get(rel)!==stat.ino||!equal(realpathSync(path),join(guard.physical,...parts.slice(0,n))))throw new Error('附件父目录已改变');}};
 const directories=items.filter(a=>a.directory).sort((a,b)=>a.name.split('\\').length-b.name.split('\\').length);
 for(const item of directories){parents(item.name);const path=target(item.name);await mkdir(path);const stat=lstatSync(path);if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('附件目录已改变');created.set(item.name,stat.ino);}
 for(const item of items){if(item.directory)continue;parents(item.name);const file=await open(target(item.name),'wx',0o600),bytes=Buffer.from(item.data,'base64');try{live();await file.writeFile(bytes);if(item.modified!==undefined)await file.utimes(new Date(item.accessed??item.modified),new Date(item.modified));if(flush)await file.sync();live();}finally{bytes.fill(0);await file.close();}}
 for(const item of directories.reverse()){parents(item.name);const path=target(item.name),stat=lstatSync(path);if(stat.isSymbolicLink()||stat.ino!==created.get(item.name))throw new Error('附件目录已改变');if(item.modified!==undefined)await utimes(path,new Date(item.accessed??item.modified),new Date(item.modified));}
 live();return attachmentRoots(items).map(a=>target(a.name));
}
/** Bounded accounting of an abandoned cache group. Links are never traversed. */
export function attachmentTreeBytes(root:string){const guard=attachmentTreeGuard(root);let nodes=0,bytes=0;const walk=(folder:string,depth:number)=>{guard.check();if(depth>MAX_ATTACHMENT_DEPTH)throw new Error('附件缓存层级过深');for(const name of readdirSync(folder)){if(++nodes>MAX_ATTACHMENT_NODES)throw new Error('附件缓存项目过多');const file=join(folder,name),stat=lstatSync(file);if(stat.isSymbolicLink())throw new Error('附件缓存包含链接');if(stat.isDirectory())walk(file,depth+1);else if(stat.isFile())bytes+=stat.size;else throw new Error('附件缓存包含异常项目');}};walk(guard.directory,0);return bytes;}
export function removeAttachmentCacheGroup(root:string){const stat=lstatSync(root);if(stat.isSymbolicLink()){unlinkSync(root);return;}attachmentTreeGuard(root).remove();}
