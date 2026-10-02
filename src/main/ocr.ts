import { app, nativeImage } from 'electron';
import { execFile, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { mkdir, mkdtemp, writeFile, unlink, rmdir, readdir } from 'node:fs/promises';
import type { OcrResult, OcrStatus, Payload } from '../shared/types';
import { thumbnail } from './clipboard';
let running:ChildProcess|undefined,cancelled=false,statusCache:OcrStatus|undefined;
function execute(args:string[],recognition=false):Promise<any>{return new Promise((accept,reject)=>{
  const executable=join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
  const script=join(__dirname,'ocr.ps1').replace('app.asar\\','app.asar.unpacked\\');
  const child=execFile(executable,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,...args],{windowsHide:true,timeout:30000,maxBuffer:4*1024*1024,encoding:'utf8'},(error,stdout)=>{
    if(recognition)running=undefined;try{if(recognition&&cancelled)throw new Error('识别已取消');const data=JSON.parse(stdout.trim());if(data.error)throw new Error(data.error);if(error)throw new Error('OCR 服务失败或超时');accept(data);}catch(e){reject(e instanceof SyntaxError?new Error('Windows OCR 服务未能返回结果，请确认系统语言组件可用'):e);}
  });if(recognition)running=child;
});}
export async function ocrStatus():Promise<OcrStatus>{if(statusCache)return statusCache;try{const value=await execute(['-Mode','Status']);if(!Array.isArray(value.languages)||!Number.isInteger(value.maxDimension))throw new Error('OCR 服务返回无效');return statusCache=value;}catch(e){return {languages:[],maxDimension:2600,error:String((e as Error).message)};}}
export async function clearOcrTemporary(){const root=join(app.getPath('userData'),'work');for(const entry of await readdir(root,{withFileTypes:true}).catch(()=>[])){if(!entry.isDirectory()||entry.isSymbolicLink()||!/^ocr-[A-Za-z0-9]{6}$/.test(entry.name))continue;const directory=join(root,entry.name);await unlink(join(directory,'input.png')).catch(()=>{});await rmdir(directory).catch(()=>{});}}
let busy=false;
export const cancelOcr=()=>{cancelled=true;running?.kill();};
export async function recognize(payload:Payload,language:string):Promise<OcrResult>{
  if(busy)throw new Error('已有识别任务，请等待或取消');if(!payload.png)throw new Error('请选择图片进行文字识别');if(typeof language!=='string'||language.length>40||! /^[a-zA-Z0-9-]*$/.test(language))throw new Error('OCR 语言无效');
  busy=true;cancelled=false;let directory='';try{
    thumbnail(payload);const info=await ocrStatus();if(cancelled)throw new Error('识别已取消');if(info.error)throw new Error(info.error);if(!info.languages.length)throw new Error('没有可用 OCR 语言，请在 Windows 设置中安装语言识别组件');if(language&&!info.languages.some(l=>l.tag===language))throw new Error('未安装所选 OCR 语言');
    let image=nativeImage.createFromBuffer(Buffer.from(payload.png,'base64'));const size=image.getSize(),scale=Math.min(1,info.maxDimension/size.width,info.maxDimension/size.height);if(scale<1)image=image.resize({width:Math.max(1,Math.floor(size.width*scale)),height:Math.max(1,Math.floor(size.height*scale)),quality:'best'});
    const root=join(app.getPath('userData'),'work');await mkdir(root,{recursive:true});directory=await mkdtemp(join(root,'ocr-'));const file=join(directory,'input.png');await writeFile(file,image.toPNG());if(cancelled)throw new Error('识别已取消');
    const result=await execute(['-Mode','Recognize','-ImagePath',file,'-Language',language||info.languages[0].tag],true);if(typeof result.text!=='string'||result.text.length>1024*1024)throw new Error('识别文字无效或过长');return {text:result.text,language:result.language,scaled:scale<1};
  }finally{busy=false;if(directory){await unlink(join(directory,'input.png')).catch(()=>{});await rmdir(directory).catch(()=>{});}}
}
