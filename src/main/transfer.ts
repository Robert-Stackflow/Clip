import {t as tr} from '../shared/i18n';
import {initAttachments,disposeAttachments,attachmentFiles} from './attachment-runtime';
import { app, dialog, nativeImage, net } from 'electron';
import {ImageDragFiles} from './image-drag-files';
import {saveImage} from './image-export';
import type { BrowserWindow, WebContents } from 'electron';
import { extname, join } from 'node:path';
import { readFile, stat, access } from 'node:fs/promises';
import type { Detail, Payload } from '../shared/types';
import { MAX_ITEM, validatePayload,contentBytes } from '../shared/core';
import { prepareThumbnail,pngDimensions,convertJPEG } from './clipboard';
import {formatDefinition,type FormatName} from '../shared/formats';
import { imageSize } from 'image-size';
import {fileURLToPath} from 'node:url';
import {canonicalBase64} from '../shared/base64';
import {decodeBrowserImage} from './image-decode';
import {decodeHEIC} from './heic-decode';
import {IMAGE_EXTENSIONS} from '../shared/image-drop';
export async function incomingFiles(paths:unknown,valid:()=>boolean=()=>true):Promise<Payload>{
  const epoch=transferGeneration,live=()=>epoch===transferGeneration&&valid(),check=()=>{if(!live())throw new Error(tr('记录已取消'));};check();
  const payload=validatePayload({files:paths});for(const file of payload.files!)await stat(file).catch(()=>{throw new Error(tr`文件无法访问：${file}`);});
  if(payload.files!.length===1&&IMAGE_EXTENSIONS.test(extname(payload.files![0]))){
    const file=payload.files![0];if((await stat(file)).size>MAX_ITEM)throw new Error(tr('图片文件过大'));const buffer=await readFile(file);try{return await incomingImageBytes(buffer,live);}finally{buffer.fill(0);}
  }check();return payload;
}
async function incomingImageBytes(buffer:Buffer,valid:()=>boolean):Promise<Payload>{
 const check=()=>{if(!valid())throw new Error(tr('记录已取消'));};check();if(buffer.length>MAX_ITEM)throw new Error(tr('图片文件过大'));let dimensions;try{dimensions=imageSize(buffer);}catch{throw new Error(tr('图片文件无效'));}
 if(!['png','jpg','gif','webp','bmp','avif','svg','heic','heif','tiff'].includes(dimensions.type||''))throw new Error(tr('图片格式不支持'));
 if(!dimensions.width||!dimensions.height||dimensions.width>16384||dimensions.height>16384||dimensions.width*dimensions.height>40_000_000)throw new Error(tr('图片像素过大'));
 const heic=['heic','heif'].includes(dimensions.type!),image=['png','jpg','svg','avif','heic','heif'].includes(dimensions.type!)?undefined:nativeImage.createFromBuffer(buffer);
 const png=dimensions.type==='png'?buffer.toString('base64'):dimensions.type==='jpg'?await convertJPEG(buffer,valid):heic?await decodeHEIC(buffer,valid):image&&!image.isEmpty()?image.toPNG().toString('base64'):await decodeBrowserImage(buffer,dimensions.type==='svg'?'image/svg+xml':'image/'+dimensions.type,valid);
 check();const size=pngDimensions(png);if(!['heic','heif','avif','svg'].includes(dimensions.type!)&&(size.width!==dimensions.width||size.height!==dimensions.height))throw new Error(tr('PNG 图片无效'));
 const original:Record<string,FormatName>={jpg:'JFIF',gif:'GIF',webp:'image/webp',bmp:'image/bmp',avif:'image/avif',svg:'image/svg+xml',heic:'image/heic',heif:'image/heif',tiff:'image/tiff'};
 const payload=validatePayload({png,...(original[dimensions.type!]?{formats:[{name:original[dimensions.type!],data:buffer.toString('base64')}]}:{})});await prepareThumbnail(payload,valid);check();return payload;
}
/** Validate the entire batch before the caller writes any records. */
export async function incomingImages(value:unknown,valid:()=>boolean=()=>true):Promise<Payload[]>{
 const items=Array.isArray(value)?value:[value];if(!items.length||items.length>32)throw new Error(tr('一次最多拖入 32 个文件'));
 const payloads:Payload[]=[];let total=0;
 for(const item of items){const payload=await incomingImage(item,valid);total+=contentBytes(payload);if(total>48*1024*1024)throw new Error(tr('图片文件过大'));payloads.push(payload);}
 if(!valid())throw new Error(tr('记录已取消'));return payloads;
}
export async function incomingImage(value:unknown,valid:()=>boolean=()=>true):Promise<Payload>{
 const epoch=transferGeneration,live=()=>epoch===transferGeneration&&valid(),check=()=>{if(!live())throw new Error(tr('记录已取消'));};check();
 if(!value||typeof value!=='object')throw new Error(tr('图片文件无效'));const input=value as {data?:unknown;url?:unknown;referrer?:unknown;fallback?:unknown};if((input.data===undefined)===(input.url===undefined))throw new Error(tr('图片文件无效'));
 if(input.fallback!==undefined){if(typeof input.fallback!=='string'||input.fallback.length>32767||input.data!==undefined)throw new Error(tr('图片地址无效'));try{return await incomingImage({url:input.url,referrer:input.referrer},live);}catch(error){check();if(input.fallback===input.url)throw error;return incomingImage({url:input.fallback,referrer:input.referrer},live);}}
 let bytes:Buffer;
 if(input.data!==undefined){if(typeof input.data!=='string'||input.data.length>MAX_ITEM*1.34||!canonicalBase64(input.data))throw new Error(tr('图片文件无效'));bytes=Buffer.from(input.data,'base64');}
 else{
  if(typeof input.url!=='string'||input.url.length>MAX_ITEM*1.34)throw new Error(tr('图片地址无效'));let url:URL;try{url=new URL(input.url);}catch{throw new Error(tr('图片地址无效'));}
  if(url.protocol==='file:'){if(url.href.length>32767)throw new Error(tr('图片地址无效'));const payload=await incomingFiles([fileURLToPath(url)],live);if(!payload.png)throw new Error(tr('图片文件无效'));return payload;}
  if(url.protocol==='data:'){const match=/^data:image\/[^;,]+(?:;charset=[^;,]+)?(;base64)?,(.*)$/is.exec(input.url);if(!match)throw new Error(tr('图片文件无效'));if(match[1]){if(!canonicalBase64(match[2]))throw new Error(tr('图片文件无效'));bytes=Buffer.from(match[2],'base64');}else{try{bytes=Buffer.from(decodeURIComponent(match[2]),'utf8');}catch{throw new Error(tr('图片文件无效'));}}}
  else{
   if(!['http:','https:'].includes(url.protocol)||url.href.length>32767||url.username||url.password)throw new Error(tr('图片地址无效'));
   const headers:Record<string,string>={};if(input.referrer!==undefined){let referrer:URL;try{if(typeof input.referrer!=='string'||input.referrer.length>32767)throw Error();referrer=new URL(input.referrer);if(!['http:','https:'].includes(referrer.protocol)||referrer.username||referrer.password)throw Error();}catch{throw new Error(tr('图片地址无效'));}headers.Referer=referrer.href;}
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);timer.unref();const monitor=setInterval(()=>{if(!live())controller.abort();},50);monitor.unref();const chunks:Buffer[]=[];let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
   try{const response=await net.fetch(url.href,{signal:controller.signal,credentials:'omit',headers});check();if([401,403].includes(response.status))throw new Error(tr('此图片需要浏览器权限，请启用浏览器拖放扩展'));if(!response.ok||!response.body)throw new Error(tr('图片下载失败'));if(Number(response.headers.get('content-length'))>MAX_ITEM)throw new Error(tr('图片文件过大'));reader=response.body.getReader();let size=0;for(;;){check();const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_ITEM)throw new Error(tr('图片文件过大'));chunks.push(Buffer.from(part.value));}bytes=Buffer.concat(chunks,size);}
   catch(error){check();throw error instanceof Error?error:new Error(tr('图片下载失败'));}
   finally{clearTimeout(timer);clearInterval(monitor);controller.abort();await reader?.cancel().catch(()=>{});for(const chunk of chunks)chunk.fill(0);}
  }
 }
 try{return await incomingImageBytes(bytes,live);}finally{bytes.fill(0);}
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
export async function startDrag(contents:WebContents,item:Detail,valid:()=>boolean=()=>true){if(dragging)return;dragging=true;try{const live=()=>!contents.isDestroyed()&&valid();const files=await prepareDrag(item,live);if(!live())return;const preview=smallThumbnail(item);let icon=preview?nativeImage.createFromDataURL(preview):nativeImage.createFromPath(join(__dirname,'../clip.png'));if(icon.isEmpty())icon=nativeImage.createFromPath(join(__dirname,'../clip.png'));const size=icon.getSize(),scale=Math.min(1,(preview?64:48)/size.width,(preview?64:48)/size.height);icon=icon.resize({width:Math.max(1,Math.round(size.width*scale)),height:Math.max(1,Math.round(size.height*scale))});contents.startDrag({file:files[0],files,icon});}finally{dragging=false;}}
export async function exportImage(window:BrowserWindow,item:Detail,protect:(file:string)=>void=()=>{},valid:()=>boolean=()=>true){return saveImage(window,item,protect,valid);}
