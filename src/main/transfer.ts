import {initAttachments,disposeAttachments,attachmentFiles} from './attachment-runtime';
import { app, dialog, nativeImage } from 'electron';
import type { BrowserWindow, WebContents } from 'electron';
import { extname, join, basename } from 'node:path';
import { mkdir, readFile, writeFile, stat, access, readdir, unlink } from 'node:fs/promises';
import { existsSync, unlinkSync } from 'node:fs';
import type { Detail, Payload } from '../shared/types';
import { MAX_ITEM, MAX_TOTAL, validatePayload } from '../shared/core';
import { thumbnail } from './clipboard';
import {formatDefinition,type FormatName} from '../shared/formats';
import { imageSize } from 'image-size';
export async function incomingFiles(paths:unknown):Promise<Payload>{
  const payload=validatePayload({files:paths});for(const file of payload.files!)await stat(file).catch(()=>{throw new Error('文件无法访问：'+file);});
  if(payload.files!.length===1&&/\.(png|jpg|jpeg|webp|bmp|gif)$/i.test(extname(payload.files![0]))){
    const file=payload.files![0];if((await stat(file)).size>MAX_ITEM)throw new Error('图片文件过大');const buffer=await readFile(file);let dimensions;try{dimensions=imageSize(buffer);}catch{throw new Error('图片文件无效');}
    if(!['png','jpg','gif','webp','bmp'].includes(dimensions.type||''))throw new Error('图片格式不支持');
    if(!dimensions.width||!dimensions.height||dimensions.width>16384||dimensions.height>16384||dimensions.width*dimensions.height>40_000_000)throw new Error('图片像素过大');
    const image=nativeImage.createFromBuffer(buffer);if(image.isEmpty())throw new Error('图片无法解码');const original:Record<string,FormatName>={jpg:'JFIF',gif:'GIF',webp:'image/webp',bmp:'image/bmp'};const p=validatePayload({png:dimensions.type==='png'?buffer.toString('base64'):image.toPNG().toString('base64'),...(original[dimensions.type!]?{formats:[{name:original[dimensions.type!],data:buffer.toString('base64')}]}:{})});thumbnail(p);return p;
  }return payload;
}
export async function chooseFiles(window:BrowserWindow){const result=await dialog.showOpenDialog(window,{title:'添加到拖拽容器',properties:['openFile','multiSelections']});if(result.canceled)return null;return incomingFiles(result.filePaths);}
const generated=new Set<string>();let generatedBytes=0;
export async function initTransfer(){await initAttachments();const directory=join(app.getPath('userData'),'work','drag');await mkdir(directory,{recursive:true});for(const file of await readdir(directory,{withFileTypes:true}))if(file.isFile()&&/^Clipper-[0-9a-f]{64}\.(png|jpg|gif|webp|tif|bmp)$/.test(file.name))await unlink(join(directory,file.name)).catch(()=>{});}
export function disposeTransfer(){disposeAttachments();for(const file of generated)try{unlinkSync(file);}catch{}generated.clear();generatedBytes=0;}
export async function prepareDrag(item:Detail,valid:()=>boolean=()=>true){
  if(item.payload.attachments)return attachmentFiles(item.payload.attachments,valid);
  if(item.payload.files){for(const file of item.payload.files)await access(file).catch(()=>{throw new Error('源文件已移动或删除：'+file);});return item.payload.files;}
  const original=item.payload.formats?.find(f=>formatDefinition(f.name)?.mime.startsWith('image/')),extension=original?formatDefinition(original.name)!.extension:'png';if(!item.payload.png&&!original)throw new Error('仅图片或文件可拖出');thumbnail(item.payload);const directory=join(app.getPath('userData'),'work','drag');await mkdir(directory,{recursive:true});const file=join(directory,`Clipper-${item.hash}.${extension}`);if(!generated.has(file)||!existsSync(file)){const buffer=Buffer.from(original?.data||item.payload.png!,'base64');if(!generated.has(file)&&generatedBytes+buffer.length>MAX_TOTAL)throw new Error('本次运行的临时图片已达上限，请重启 Clipper 后重试');await writeFile(file,buffer);if(!generated.has(file))generatedBytes+=buffer.length;generated.add(file);}return [file];
}
let dragging=false;
export async function startDrag(contents:WebContents,item:Detail,valid:()=>boolean=()=>true){if(dragging)return;dragging=true;try{const files=await prepareDrag(item,valid);if(contents.isDestroyed()||!valid())return;const icon=item.thumbnail?nativeImage.createFromDataURL(item.thumbnail).resize({width:64}):nativeImage.createFromPath(join(__dirname,'../clipper.png')).resize({width:48});contents.startDrag({file:files[0],files,icon});}finally{dragging=false;}}
export async function exportImage(window:BrowserWindow,item:Detail,protect:(file:string)=>void=()=>{}){if(!item.payload.png)throw new Error('仅图片可另存');const result=await dialog.showSaveDialog(window,{title:'图片另存为',defaultPath:`Clipper-${new Date().toISOString().replaceAll(':','-').slice(0,19)}.png`,filters:[{name:'PNG 图片',extensions:['png']}]});if(result.canceled||!result.filePath)return null;protect(result.filePath);await writeFile(result.filePath,Buffer.from(item.payload.png,'base64'));return basename(result.filePath);}
