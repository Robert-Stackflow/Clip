import {t as tr} from '../shared/i18n';
import koffi from 'koffi';
import {win32} from 'node:path';
// Hold every directory against rename and reject links before traversing the next component.
export function lockMetadataFile(value:string,allowDirectory=false){
 const path=value.replaceAll('/','\\');if(path.length>32000||! /^[A-Za-z]:\\/.test(path)||/[\x00-\x1f:*?"<>|]/.test(path.slice(3)))throw new Error(tr('仅可读取本机普通文件'));
 const parts=path.slice(3).split('\\');if(parts.some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)))throw new Error(tr('文件路径无效'));
 const k=koffi.load('kernel32.dll'),drive=k.func('uint32 __stdcall GetDriveTypeW(str16)'),create=k.func('intptr_t __stdcall CreateFileW(str16,uint32,uint32,void*,uint32,uint32,intptr_t)'),info=k.func('bool __stdcall GetFileInformationByHandle(intptr_t,void*)'),close=k.func('bool __stdcall CloseHandle(intptr_t)');
 if(![2,3,5,6].includes(drive(path.slice(0,3))))throw new Error(tr('不读取网络或不可用驱动器'));const handles:number[]=[];let done=false;
 const release=()=>{if(done)return;done=true;for(const h of handles.reverse())close(h);};
 try{let current=path.slice(0,3),size=0,attributes=0,created=0,modified=0,accessed=0,directory=false;for(let i=-1;i<parts.length;i++){if(i>=0)current=win32.join(current,parts[i]);const last=i===parts.length-1,h=create('\\\\?\\'+current,last?0x80000000:0x80,last?1:3,null,3,0x02200000,0);if(h===-1||h===0)throw new Error(tr('文件不存在、被占用或无法读取'));handles.push(h);const b=Buffer.alloc(52);if(!info(h,b))throw new Error(tr('无法验证文件信息'));attributes=b.readUInt32LE(0);if(attributes&0x400||attributes&0x1000||attributes&0x40000||attributes&0x400000)throw new Error(tr('不读取链接、重解析点或云端占位文件'));if(last){directory=!!(attributes&0x10);if(directory&&!allowDirectory)throw new Error(tr('请选择普通文件'));size=directory?0:b.readUInt32LE(32)*2**32+b.readUInt32LE(36);const time=(offset:number)=>Math.max(0,Number(b.readBigUInt64LE(offset)/10000n-11644473600000n));created=time(4);accessed=time(12);modified=time(20);}else if(!(attributes&0x10))throw new Error(tr('父路径不是文件夹'));}return {path,size,attributes,created,modified,accessed,directory,release};}catch(e){release();throw e;}
}
