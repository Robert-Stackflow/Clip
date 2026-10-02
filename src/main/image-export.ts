import {dialog,type BrowserWindow} from 'electron';
import {open,lstat} from 'node:fs/promises';
import {lstatSync,realpathSync,unlinkSync,type Stats} from 'node:fs';
import {dirname,join,basename,extname} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {Detail} from '../shared/types';
import {t as tr} from '../shared/i18n';
import {writeBase64} from './base64-file';
import {commitImageFile} from './recording-move';

async function destination(path:string){try{const file=await lstat(path);if(file.isSymbolicLink()||!file.isFile())throw new Error(tr('目标文件不能是文件夹或链接'));return file;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw e;}}
const unchanged=(a:Stats|undefined,b:Stats|undefined)=>!a?!b:!!b&&a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;

/** Preserve PNG bytes and an existing destination until the complete, still-current write is committed. */
export async function saveImage(window:BrowserWindow,item:Pick<Detail,'payload'>,protect:(file:string)=>void,valid:()=>boolean,options:{title?:string;defaultPath?:string;pngExtension?:boolean}={}){
 if(!item.payload.png)throw new Error(tr('仅图片可另存'));const encoded=item.payload.png;
 const live=()=>{if(!valid())throw new Error(tr('记录已改变、删除或历史已锁定'));};live();
 const result=await dialog.showSaveDialog(window,{title:options.title||tr('图片另存为'),defaultPath:options.defaultPath||`Clipper-${new Date().toISOString().replaceAll(':','-').slice(0,19)}.png`,filters:[{name:tr('PNG 图片'),extensions:['png']}]});
 live();if(result.canceled||!result.filePath)return null;const target=options.pngExtension&&extname(result.filePath).toLowerCase()!=='.png'?result.filePath+'.png':result.filePath;protect(target);
 const directory=dirname(target),parent=lstatSync(directory),physical=realpathSync(directory);
 if(parent.isSymbolicLink()||!parent.isDirectory())throw new Error(tr('目标文件夹已改变，请重新选择'));
 const checkParent=()=>{const current=lstatSync(directory);if(current.isSymbolicLink()||!current.isDirectory()||current.ino!==parent.ino||current.dev!==parent.dev||realpathSync(directory)!==physical)throw new Error(tr('目标文件夹已改变，请重新选择'));};
 const check=()=>{live();checkParent();};
 const original=await destination(target);if(original&&target!==result.filePath)throw Object.assign(new Error(tr('文件已存在，请选择新文件名')),{code:'EEXIST'});const staging=join(directory,'.Clipper-image-'+randomUUID()+'.part');let file;let created=false;
 try{check();file=await open(staging,'wx',0o600);created=true;await writeBase64(file,encoded,check);await file.sync();await file.close();file=undefined;check();const current=await destination(target);check();if(!unchanged(original,current))throw new Error(tr('目标文件已改变，请重新选择保存位置'));await commitImageFile(staging,target,!!original);return basename(target);}
 finally{await file?.close().catch(()=>{});if(created){try{checkParent();unlinkSync(staging);}catch{}}}
}
