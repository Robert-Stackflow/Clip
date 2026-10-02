import {t as tr} from '../shared/i18n';
import {readAttachments,attachmentFiles} from './attachment-runtime';
import {hasVirtualFiles,sequence} from './native';
import {clipboard,ClipboardItem,nativeImage} from 'electron';
import {stat} from 'node:fs/promises';
import {imageSize} from 'image-size';
import type {Payload} from '../shared/types';
import {MAX_ITEM,validatePayload,contentBytes} from '../shared/core';
import {formatDefinitions,formatDefinition,clipboardFormatId,htmlClipboard,htmlContext,type StoredFormat} from '../shared/formats';
import {pngDimensions} from './png-header';
export {pngDimensions} from './png-header';
import {readFiles,writeFiles,readClipboardFormats,writeClipboardBlocks} from './native';
import type {ClipboardBlock} from './clipboard-blocks';
import type {Thumbnails} from './thumbnails';
let backgroundThumbnails:Thumbnails|undefined;
export function useThumbnails(service:Thumbnails){backgroundThumbnails=service;}
export async function prepareThumbnail(payload:Payload,valid:()=>boolean=()=>true){return backgroundThumbnails?backgroundThumbnails.run(payload,valid):thumbnail(payload);}
const previews=new WeakMap<Payload,{png:string;url:string}>();
export function decodePng(encoded:string){const header=pngDimensions(encoded),data=Buffer.from(encoded,'base64');try{const image=nativeImage.createFromBuffer(data);if(image.isEmpty())throw new Error(tr('图片无法解码'));const size=image.getSize();if(size.width!==header.width||size.height!==header.height)throw new Error(tr('PNG 图片无效'));return {data,image,size};}catch(error){data.fill(0);throw error;}}
export function thumbnail(p:Payload){if(!p.png){previews.delete(p);return undefined;}const existing=previews.get(p);if(existing?.png===p.png)return existing.url;const {data,image,size:s}=decodePng(p.png);try{const scale=Math.min(1,280/s.width,180/s.height),url=image.resize({width:Math.max(1,Math.round(s.width*scale)),height:Math.max(1,Math.round(s.height*scale)),quality:'good'}).toDataURL();previews.set(p,{png:p.png,url});return url;}finally{data.fill(0);}}
export function decodeOriginal(data:Buffer){const size=imageSize(data);if(!size.width||!size.height||size.width>16384||size.height>16384||size.width*size.height>40_000_000)throw new Error(tr('图片像素过大'));const image=nativeImage.createFromBuffer(data);return image.isEmpty()?undefined:image.toPNG().toString('base64');}
export async function capture():Promise<Payload|null>{
 const files=readFiles();if(files)return validatePayload({files});
 if(hasVirtualFiles())return validatePayload({attachments:await readAttachments(sequence())});
 const items=await clipboard.read(),payload:Payload={};
 for(const item of items)for(const type of ['text/plain','text/html','text/rtf','image/png'])if(item.types.includes(type)){
  const blob=await item.getType(type);if(!(blob instanceof Blob))continue;if(blob.size>MAX_ITEM)throw new Error(tr('单条剪贴板内容过大，已跳过'));
  if(type==='image/png')payload.png=Buffer.from(await blob.arrayBuffer()).toString('base64');else payload[type==='text/plain'?'text':type==='text/html'?'html':'rtf']=await blob.text();
 }
 const budget=Math.max(0,Math.floor((MAX_ITEM-contentBytes(payload)-4096)/1.34));const formats=readClipboardFormats(formatDefinitions.map(f=>f.name),budget,true) as StoredFormat[]&{omitted?:string[]};if(formats.omitted?.length)payload.omittedFormats=formats.omitted;
 const originalPng=formats.find(f=>f.name==='PNG');if(originalPng){payload.png=originalPng.data;formats.splice(formats.indexOf(originalPng),1);}
 const rawHtml=formats.find(f=>f.name==='HTML Format');if(rawHtml){const fragment=htmlContext(Buffer.from(rawHtml.data,'base64')).fragment;if(fragment!==undefined)payload.html=fragment;}
 if(!payload.png){const image=formats.find(f=>!['CF_DIB','CF_DIBV5'].includes(f.name)&&formatDefinition(f.name)?.mime.startsWith('image/'));if(image)payload.png=decodeOriginal(Buffer.from(image.data,'base64'));}
 if(formats.length)payload.formats=formats;if(!payload.text?.trim()&&!payload.png&&!payload.html&&!payload.rtf&&!formats.length)return null;return validatePayload(payload);
}
function bitmapV5(encoded:string){const {data,image,size:{width,height}}=decodePng(encoded);let bitmap:Buffer|undefined;try{bitmap=image.toBitmap();const header=Buffer.alloc(124);header.writeUInt32LE(124,0);header.writeInt32LE(width,4);header.writeInt32LE(-height,8);header.writeUInt16LE(1,12);header.writeUInt16LE(32,14);header.writeUInt32LE(3,16);header.writeUInt32LE(bitmap.length,20);header.writeUInt32LE(0xff0000,40);header.writeUInt32LE(0xff00,44);header.writeUInt32LE(0xff,48);header.writeUInt32LE(0xff000000,52);header.writeUInt32LE(0x73524742,56);header.writeUInt32LE(4,108);return Buffer.concat([header,bitmap]);}finally{data.fill(0);bitmap?.fill(0);}}
export async function writePayload(value:Payload,hwnd:number,plain=false,valid:()=>boolean=()=>true){
 const live=()=>{if(!valid())throw new Error(tr('复制已取消或历史已锁定'));};live();const p=validatePayload(value);if(plain){if(p.text===undefined)throw new Error(tr('此记录没有纯文本'));await clipboard.writeText(p.text);return;}
 if(p.attachments){const paths=await attachmentFiles(p.attachments,valid);live();writeFiles(paths,hwnd);return;}
 if(p.files){for(const path of p.files)await stat(path).catch(()=>{throw new Error(tr`源文件已移动、删除或无法访问：${path}`);});live();writeFiles(p.files,hwnd);return;}
 if(!p.formats?.length&&!p.png&&!p.html&&!p.rtf){await clipboard.write([new ClipboardItem({'text/plain':p.text||''})]);return;}
 const blocks:ClipboardBlock[]=[],names=new Set(p.formats?.map(f=>f.name));let generatedBitmap:Buffer|undefined;if(p.text!==undefined)blocks.push({format:13,data:Buffer.from(p.text+'\0','utf16le')});
 if(p.html&&!names.has('HTML Format'))blocks.push({format:'HTML Format',data:htmlClipboard(p.html)});if(p.rtf&&!names.has('Rich Text Format'))blocks.push({format:'Rich Text Format',data:Buffer.from(p.rtf+'\0','utf8')});
 try{if(p.png){if(!names.has('CF_DIBV5')&&!names.has('CF_DIB')){generatedBitmap=bitmapV5(p.png);blocks.push({format:17,data:generatedBitmap});}else{const {data}=decodePng(p.png);data.fill(0);}if(!names.has('PNG'))blocks.push({format:'PNG',base64:p.png});}
 for(const f of p.formats||[])blocks.push({format:clipboardFormatId(f.name),base64:f.data});await writeClipboardBlocks(blocks,hwnd,valid);
 }finally{generatedBitmap?.fill(0);}
}
