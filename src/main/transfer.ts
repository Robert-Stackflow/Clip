import {t as tr} from '../shared/i18n';
import {initAttachments,disposeAttachments,attachmentFiles} from './attachment-runtime';
import { app, dialog, nativeImage } from 'electron';
import {ImageDragFiles} from './image-drag-files';
import {saveImage} from './image-export';
import type { BrowserWindow, WebContents } from 'electron';
import { extname, join } from 'node:path';
import { readFile, stat, access } from 'node:fs/promises';
import type { Detail, Payload } from '../shared/types';
import { MAX_ITEM, validatePayload } from '../shared/core';
import { prepareThumbnail,pngDimensions,convertJPEG } from './clipboard';
import {formatDefinition,type FormatName} from '../shared/formats';
import { imageSize } from 'image-size';
export async function incomingFiles(paths:unknown,valid:()=>boolean=()=>true):Promise<Payload>{
  const epoch=transferGeneration,live=()=>epoch===transferGeneration&&valid(),check=()=>{if(!live())throw new Error(tr('记录已取消'));};check();
  const payload=validatePayload({files:paths});for(const file of payload.files!)await stat(file).catch(()=>{throw new Error(tr`文件无法访问：${file}`);});
  if(payload.files!.length===1&&/\.(png|jpg|jpeg|webp|bmp|gif)$/i.test(extname(payload.files![0]))){
    const file=payload.files![0];if((await stat(file)).size>MAX_ITEM)throw new Error(tr('图片文件过大'));const buffer=await readFile(file);try{check();if(buffer.length>MAX_ITEM)throw new Error(tr('图片文件过大'));let dimensions;try{dimensions=imageSize(buffer);}catch{throw new Error(tr('图片文件无效'));}
    if(!['png','jpg','gif','webp','bmp'].includes(dimensions.type||''))throw new Error(tr('图片格式不支持'));
    if(!dimensions.width||!dimensions.height||dimensions.width>16384||dimensions.height>16384||dimensions.width*dimensions.height>40_000_000)throw new Error(tr('图片像素过大'));
    const image=['png','jpg'].includes(dimensions.type!)?undefined:nativeImage.createFromBuffer(buffer);if(image?.isEmpty())throw new Error(tr('图片无法解码'));const png=dimensions.type==='png'?buffer.toString('base64'):dimensions.type==='jpg'?await convertJPEG(buffer,live):image!.toPNG().toString('base64');check();const size=pngDimensions(png);if(size.width!==dimensions.width||size.height!==dimensions.height)throw new Error(tr('PNG 图片无效'));const original:Record<string,FormatName>={jpg:'JFIF',gif:'GIF',webp:'image/webp',bmp:'image/bmp'};const p=validatePayload({png,...(original[dimensions.type!]?{formats:[{name:original[dimensions.type!],data:buffer.toString('base64')}]}:{})});await prepareThumbnail(p,live);check();return p;}finally{buffer.fill(0);}
  }check();return payload;
}
export async function chooseFiles(window:BrowserWindow){const epoch=transferGeneration,result=await dialog.showOpenDialog(window,{title:tr('添加到拖拽容器'),properties:['openFile','multiSelections']});if(result.canceled)return null;return incomingFiles(result.filePaths,()=>epoch===transferGeneration&&!window.isDestroyed());}
let imageFiles:ImageDragFiles|undefined,initializing:Promise<void>|undefined,transferGeneration=0;
export async function initTransfer(){const epoch=transferGeneration;if(initializing)await initializing;if(epoch!==transferGeneration||imageFiles)return;const cache=new ImageDragFiles(join(app.getPath('userData'),'work','drag'));const task=(async()=>{await initAttachments();await cache.init();if(epoch===transferGeneration)imageFiles=cache;else{cache.dispose();disposeAttachments();}})();initializing=task;try{await task;}finally{if(initializing===task)initializing=undefined;}}
export function disposeTransfer(){transferGeneration++;disposeAttachments();imageFiles?.dispose();imageFiles=undefined;}
export function cancelTransfers(){transferGeneration++;}
function smallThumbnail(item:Detail){const value=item.thumbnail;if(!value||value.length>512*1024||!value.startsWith('data:image/png;base64,'))return undefined;try{const size=pngDimensions(value.slice(22));if(size.width<=280&&size.height<=180)return value;}catch{}return undefined;}
export async function prepareDrag(item:Detail,valid:()=>boolean=()=>true){
 const live=()=>{if(!valid())throw new Error(tr('记录已改变、删除或历史已锁定'));};live();
 if(item.payload.attachments)return attachmentFiles(item.payload.attachments,valid);
 if(item.payload.files){for(const file of item.payload.files){live();await access(file).catch(()=>{throw new Error(tr`源文件已移动或删除：${file}`);});live();}return item.payload.files;}
 const original=item.payload.formats?.find(f=>formatDefinition(f.name)?.mime.startsWith('image/')),extension=original?formatDefinition(original.name)!.extension:'png';
 if(!item.payload.png&&!original)throw new Error(tr('仅图片或文件可拖出'));if(!imageFiles)throw new Error(tr('图片缓存尚未就绪'));
 if(item.payload.png&&!smallThumbnail(item))await prepareThumbnail(item.payload,valid);const file=await imageFiles.materialize(item.hash,extension,original?.data||item.payload.png!,valid,()=>{if(item.payload.png)pngDimensions(item.payload.png);});live();return [file];
}
let dragging=false;
export async function startDrag(contents:WebContents,item:Detail,valid:()=>boolean=()=>true){if(dragging)return;dragging=true;try{const live=()=>!contents.isDestroyed()&&valid();const files=await prepareDrag(item,live);if(!live())return;const preview=smallThumbnail(item);let icon=preview?nativeImage.createFromDataURL(preview):nativeImage.createFromPath(join(__dirname,'../clipper.png'));if(icon.isEmpty())icon=nativeImage.createFromPath(join(__dirname,'../clipper.png'));const size=icon.getSize(),scale=Math.min(1,(preview?64:48)/size.width,(preview?64:48)/size.height);icon=icon.resize({width:Math.max(1,Math.round(size.width*scale)),height:Math.max(1,Math.round(size.height*scale))});contents.startDrag({file:files[0],files,icon});}finally{dragging=false;}}
export async function exportImage(window:BrowserWindow,item:Detail,protect:(file:string)=>void=()=>{},valid:()=>boolean=()=>true){return saveImage(window,item,protect,valid);}
