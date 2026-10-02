import {readAttachments,attachmentFiles} from './attachment-runtime';
import {hasVirtualFiles,sequence} from './native';
import {clipboard,ClipboardItem,nativeImage} from 'electron';
import {stat} from 'node:fs/promises';
import {imageSize} from 'image-size';
import type {Payload} from '../shared/types';
import {MAX_ITEM,validatePayload} from '../shared/core';
import {formatDefinitions,formatDefinition,htmlClipboard,htmlContext,type StoredFormat} from '../shared/formats';
import {readFiles,writeFiles,readClipboardFormats,writeClipboardBlocks} from './native';
export function thumbnail(p:Payload){if(!p.png)return undefined;const data=Buffer.from(p.png,'base64');if(data.length<24||data.toString('ascii',12,16)!=='IHDR')throw new Error('PNG 图片无效');const width=data.readUInt32BE(16),height=data.readUInt32BE(20);if(!width||!height||width*height>40_000_000||width>16384||height>16384)throw new Error('图片像素过大');const image=nativeImage.createFromBuffer(data);if(image.isEmpty())throw new Error('图片无法解码');const s=image.getSize();const scale=Math.min(1,280/s.width,180/s.height);return image.resize({width:Math.max(1,Math.round(s.width*scale)),height:Math.max(1,Math.round(s.height*scale)),quality:'good'}).toDataURL();}
export function decodeOriginal(data:Buffer){const size=imageSize(data);if(!size.width||!size.height||size.width>16384||size.height>16384||size.width*size.height>40_000_000)throw new Error('图片像素过大');const image=nativeImage.createFromBuffer(data);return image.isEmpty()?undefined:image.toPNG().toString('base64');}
export async function capture():Promise<Payload|null>{
 const files=readFiles();if(files)return validatePayload({files});
 if(hasVirtualFiles())return validatePayload({attachments:await readAttachments(sequence())});
 const formats=readClipboardFormats(formatDefinitions.map(f=>f.name),MAX_ITEM) as StoredFormat[],items=await clipboard.read(),payload:Payload={};
 for(const item of items)for(const type of ['text/plain','text/html','text/rtf','image/png'])if(item.types.includes(type)){
  const blob=await item.getType(type);if(!(blob instanceof Blob))continue;if(blob.size>MAX_ITEM)throw new Error('单条剪贴板内容过大，已跳过');
  if(type==='image/png')payload.png=Buffer.from(await blob.arrayBuffer()).toString('base64');else payload[type==='text/plain'?'text':type==='text/html'?'html':'rtf']=await blob.text();
 }
 const originalPng=formats.find(f=>f.name==='PNG');if(originalPng){const p={png:originalPng.data};thumbnail(p);payload.png=p.png;formats.splice(formats.indexOf(originalPng),1);}
 const rawHtml=formats.find(f=>f.name==='HTML Format');if(rawHtml){const fragment=htmlContext(Buffer.from(rawHtml.data,'base64')).fragment;if(fragment!==undefined)payload.html=fragment;}
 if(!payload.png){const image=formats.find(f=>formatDefinition(f.name)?.mime.startsWith('image/'));if(image)payload.png=decodeOriginal(Buffer.from(image.data,'base64'));}
 if(formats.length)payload.formats=formats;if(!payload.text?.trim()&&!payload.png&&!payload.html&&!payload.rtf&&!formats.length)return null;return validatePayload(payload);
}
function bitmapV5(png:Buffer){const image=nativeImage.createFromBuffer(png),{width,height}=image.getSize(),bitmap=image.toBitmap(),header=Buffer.alloc(124);header.writeUInt32LE(124,0);header.writeInt32LE(width,4);header.writeInt32LE(-height,8);header.writeUInt16LE(1,12);header.writeUInt16LE(32,14);header.writeUInt32LE(3,16);header.writeUInt32LE(bitmap.length,20);header.writeUInt32LE(0xff0000,40);header.writeUInt32LE(0xff00,44);header.writeUInt32LE(0xff,48);header.writeUInt32LE(0xff000000,52);header.writeUInt32LE(0x73524742,56);header.writeUInt32LE(4,108);return Buffer.concat([header,bitmap]);}
export async function writePayload(value:Payload,hwnd:number,plain=false,valid:()=>boolean=()=>true){
 const live=()=>{if(!valid())throw new Error('复制已取消或历史已锁定');};live();const p=validatePayload(value);if(plain){if(p.text===undefined)throw new Error('此记录没有纯文本');await clipboard.writeText(p.text);return;}
 if(p.attachments){const paths=await attachmentFiles(p.attachments,valid);live();writeFiles(paths,hwnd);return;}
 if(p.files){for(const path of p.files)await stat(path).catch(()=>{throw new Error('源文件已移动、删除或无法访问：'+path);});live();writeFiles(p.files,hwnd);return;}
 if(!p.formats?.length&&!p.png&&!p.html&&!p.rtf){await clipboard.write([new ClipboardItem({'text/plain':p.text||''})]);return;}
 const blocks:{format:number|string;data:Buffer}[]=[],names=new Set(p.formats?.map(f=>f.name));if(p.text!==undefined)blocks.push({format:13,data:Buffer.from(p.text+'\0','utf16le')});
 if(p.html&&!names.has('HTML Format'))blocks.push({format:'HTML Format',data:htmlClipboard(p.html)});if(p.rtf&&!names.has('Rich Text Format'))blocks.push({format:'Rich Text Format',data:Buffer.from(p.rtf+'\0','utf8')});
 if(p.png){thumbnail(p);const png=Buffer.from(p.png,'base64');blocks.push({format:17,data:bitmapV5(png)});if(!names.has('PNG'))blocks.push({format:'PNG',data:png});}
 for(const f of p.formats||[])blocks.push({format:f.name,data:Buffer.from(f.data,'base64')});writeClipboardBlocks(blocks,hwnd);
}
