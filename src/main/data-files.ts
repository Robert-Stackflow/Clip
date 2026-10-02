import {open,rename,unlink,lstat,realpath,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {isAbsolute,parse,resolve,dirname,join} from 'node:path';
export const MAX_BACKUP_FILE=384*1024*1024;
export async function localDirectory(value:unknown){
 if(typeof value!=='string'||!isAbsolute(value)||value.startsWith('\\\\')||value.length>30000||/[\0\r\n]/.test(value))throw new Error('请选择本机的完整文件夹路径');
 const path=resolve(value);if(path===parse(path).root)throw new Error('请选择磁盘中的文件夹，而不是磁盘根目录');
 const info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink())throw new Error('请选择普通本地文件夹，不支持目录链接');return realpath(path);
}
export async function writeAtomic(file:string,data:Buffer|string,temp=join(dirname(file),`.clipper-${randomUUID()}.tmp`)){
 let owned=false;
 try{const handle=await open(temp,'wx');owned=true;try{await handle.writeFile(data);await handle.sync();}finally{await handle.close();}await rename(temp,file);owned=false;}
 finally{if(owned)await unlink(temp).catch(()=>{});}
}
export async function boundedFile(file:string){
 const info=await stat(file);if(!info.isFile()||info.size>MAX_BACKUP_FILE)throw new Error('备份文件无效或超过 384 MiB');
 const handle=await open(file,'r');try{const checked=await handle.stat();if(checked.size>MAX_BACKUP_FILE)throw new Error('备份文件过大');const data=Buffer.alloc(checked.size);let offset=0;while(offset<data.length){const {bytesRead}=await handle.read(data,offset,data.length-offset,offset);if(!bytesRead)throw new Error('备份文件在读取时改变');offset+=bytesRead;}const end=Buffer.alloc(1);if((await handle.read(end,0,1,offset)).bytesRead)throw new Error('备份文件在读取时改变');return data;}finally{await handle.close();}
}
