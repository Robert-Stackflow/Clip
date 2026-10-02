import {t as tr} from '../shared/i18n';
import {readdir,readFile} from 'node:fs/promises';
import {win32} from 'node:path';
import {lockMetadataFile} from './metadata-file';
import {validateAttachments,MAX_ATTACHMENT_BYTES,MAX_ATTACHMENT_NODES as MAX_ATTACHMENT_ITEMS,MAX_ATTACHMENT_DEPTH,type Attachment} from '../shared/attachments';
// Leases deny source writes/deletes. Directory inventories are checked again before publishing.
export async function snapshotSyncFiles(files:string[]):Promise<Attachment[]>{
 if(!Array.isArray(files)||!files.length||files.length>256)throw new Error(tr('请选择 1–256 个本机文件或文件夹'));
 const leases:ReturnType<typeof lockMetadataFile>[]=[],directories:{path:string;names:string[]}[]=[],nodes:{lease:ReturnType<typeof lockMetadataFile>;name:string}[]=[],roots=new Set<string>(),rootNames=new Set<string>();let bytes=0;
 const visit=async(path:string,name:string,depth:number)=>{if(depth>MAX_ATTACHMENT_DEPTH||nodes.length>=MAX_ATTACHMENT_ITEMS)throw new Error(tr('共享目录超过 256 项或 16 层'));const lease=lockMetadataFile(path,true);leases.push(lease);nodes.push({lease,name});bytes+=lease.size;if(bytes>MAX_ATTACHMENT_BYTES)throw new Error(tr('一组共享文件最多 12 MiB，请减少文件后重试'));if(lease.directory){const names=(await readdir(lease.path)).sort((a,b)=>a.localeCompare(b,'en'));directories.push({path:lease.path,names});for(const child of names)await visit(win32.join(lease.path,child),name+'\\'+child,depth+1);}};
 try{for(const value of files){const key=value.toLowerCase();if(roots.has(key))continue;roots.add(key);const original=win32.basename(value),extension=win32.extname(original),stem=extension?original.slice(0,-extension.length):original;let name=original,number=2;while(rootNames.has(name.toLowerCase()))name=stem+' ('+number+++')'+extension;rootNames.add(name.toLowerCase());await visit(value,name,1);}
  const attachments:Attachment[]=[];for(const {lease,name}of nodes){let data='';if(!lease.directory){const buffer=await readFile(lease.path);try{if(buffer.length!==lease.size)throw new Error(tr('源文件发生改变，请重新共享'));data=buffer.toString('base64');}finally{buffer.fill(0);}}attachments.push({name,data,...(lease.directory?{directory:true as const}:{}),created:lease.created,modified:lease.modified,accessed:lease.accessed,attributes:lease.attributes});}
  for(const directory of directories){const now=(await readdir(directory.path)).sort((a,b)=>a.localeCompare(b,'en'));if(JSON.stringify(now)!==JSON.stringify(directory.names))throw new Error(tr('源文件夹发生改变，请重新共享'));}return validateAttachments(attachments);
 }finally{for(const lease of leases.reverse())lease.release();}
}
