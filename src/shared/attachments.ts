import {canonicalBase64} from './base64';
import {t as tr} from './i18n';
export const MAX_ATTACHMENT_BYTES=12*1024*1024;
export const MAX_ATTACHMENT_NODES=256,MAX_ATTACHMENT_DEPTH=16;
export interface Attachment {name:string;data:string;directory?:true;created?:number;accessed?:number;modified?:number;attributes?:number}
export function attachmentName(value:unknown):string{if(typeof value!=='string'||!value||value.length>255||/[\x00-\x1f\x7f\\/:*?"<>|]/.test(value)||/[. ]$/.test(value)||/^\s/.test(value)||/^(con|prn|aux|nul|conin\$|conout\$|clock\$|com[1-9¹²³]|lpt[1-9¹²³])(?:[ .]|$)/i.test(value)||value==='.'||value==='..')throw new Error(tr('附件文件名无效'));return value;}
export function attachmentPath(value:unknown):string {
 if(typeof value!=='string'||value.length>259)throw new Error(tr('附件文件名或路径过长'));
 const parts=value.split('\\');if(parts.length>MAX_ATTACHMENT_DEPTH)throw new Error(tr('附件目录超过 16 层'));parts.forEach(attachmentName);return value;
}
export function validateAttachments(value:unknown):Attachment[]{
 if(!Array.isArray(value)||!value.length||value.length>MAX_ATTACHMENT_NODES)throw new Error(tr('附件数量需为 1–256'));
 let bytes=0;const nodes=new Map<string,Attachment>();
 const result:Attachment[]=value.map(v=>{
  if(!v||typeof v!=='object')throw new Error(tr('附件无效'));const name=attachmentPath(v.name),key=name.toUpperCase();
  if(nodes.has(key))throw new Error(tr('附件文件名重复'));
  if(v.directory!==undefined&&v.directory!==true)throw new Error(tr('附件目录标记无效或备份版本不支持'));
  if(typeof v.data!=='string'||v.data.length>MAX_ATTACHMENT_BYTES*4/3||!canonicalBase64(v.data))throw new Error(tr('附件编码或大小无效'));
  if(v.directory&&v.data!=='')throw new Error(tr('文件夹不能包含文件内容'));bytes+=Buffer.byteLength(v.data,'base64');if(bytes>MAX_ATTACHMENT_BYTES)throw new Error(tr('附件总量超过 12 MiB'));
  const item:Attachment={name,data:v.data};if(v.directory)item.directory=true;
  for(const field of ['created','accessed','modified'] as const)if(v[field]!==undefined){if(!Number.isSafeInteger(v[field])||v[field]<0||v[field]>253402300799999)throw new Error(tr('附件时间无效'));item[field]=v[field];}
  if(v.attributes!==undefined){if(!Number.isInteger(v.attributes)||v.attributes<0||v.attributes>0xffffffff||(v.attributes&0x440)||!!(v.attributes&0x10)!==!!v.directory)throw new Error(tr('附件属性无效或目录标记不一致'));item.attributes=v.attributes;}
  nodes.set(key,item);return item;
 });
 for(const item of [...result]){const parts=item.name.split('\\');for(let depth=1;depth<parts.length;depth++){const name=parts.slice(0,depth).join('\\'),key=name.toUpperCase(),parent=nodes.get(key);if(parent){if(!parent.directory)throw new Error(tr('附件文件不能作为父目录'));if(parent.name!==name)throw new Error(tr('附件目录名称大小写冲突'));}else{const directory:Attachment={name,data:'',directory:true};nodes.set(key,directory);result.push(directory);if(result.length>MAX_ATTACHMENT_NODES)throw new Error(tr('附件及父目录超过 256 项'));}}}
 return result;
}
export const attachmentRoots=(items:Attachment[])=>items.filter(a=>!a.name.includes('\\'));
export function attachmentSubtree(value:Attachment[],name:string):Attachment[]{const all=validateAttachments(value),root=all.find(a=>a.name===name);if(!root?.directory)throw new Error(tr('附件文件夹不存在'));const prefix=name+'\\';return all.filter(a=>a.name.startsWith(prefix)).map(a=>({...a,name:a.name.slice(prefix.length)}));}
