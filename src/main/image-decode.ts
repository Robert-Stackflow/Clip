import {BrowserWindow,session} from 'electron';
import {t as tr} from '../shared/i18n';
import {MAX_ITEM} from '../shared/core';

let active=0;
/** Chromium decodes browser image formats that nativeImage cannot read on Windows. */
export async function decodeBrowserImage(bytes:Buffer,mime:string,valid:()=>boolean):Promise<string>{
 if(!valid())throw new Error(tr('记录已取消'));
 if(active>=2)throw new Error(tr('正在保存剪贴板，请稍后'));
 active++;
 let window:BrowserWindow|undefined,monitor:NodeJS.Timeout|undefined;
 try{
  const partition=session.fromPartition('clipper-image-decoder');
  partition.setPermissionCheckHandler(()=>false);
  partition.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
  partition.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','file://*/*']},(_request,callback)=>callback({cancel:true}));
  window=new BrowserWindow({show:false,skipTaskbar:true,focusable:false,webPreferences:{session:partition,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:false}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  const decoder=window,deadline=Date.now()+15000;
  let cancel!:()=>void;
  const interrupted=new Promise<never>((_resolve,reject)=>{
   cancel=()=>reject(new Error(tr(valid()?'图片无法解码':'记录已取消')));
   decoder.webContents.once('render-process-gone',cancel);
   decoder.once('closed',cancel);
  });
  monitor=setInterval(()=>{if(!valid()||Date.now()>deadline){cancel();if(!decoder.isDestroyed())decoder.destroy();}},50);
  monitor.unref();
  const decoding=(async()=>{
   await decoder.loadURL('data:text/html,'+encodeURIComponent('<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src blob:">'));
   if(!valid())throw new Error(tr('记录已取消'));
   return decoder.webContents.executeJavaScript(`(async()=>{
    const bytes=Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}),c=>c.charCodeAt(0));
    const blob=new Blob([bytes],{type:${JSON.stringify(mime)}});
    const source=URL.createObjectURL(blob),bitmap=new Image();
    try{
     await new Promise((resolve,reject)=>{bitmap.onload=resolve;bitmap.onerror=()=>reject(Error('Image decoding'));bitmap.src=source});
     if(!bitmap.width||!bitmap.height||bitmap.width>16384||bitmap.height>16384||bitmap.width*bitmap.height>40000000)throw Error('Image dimensions');
     const canvas=new OffscreenCanvas(bitmap.width,bitmap.height);canvas.getContext('2d').drawImage(bitmap,0,0);
     const png=await canvas.convertToBlob({type:'image/png'});canvas.width=canvas.height=1;
     if(png.size>${MAX_ITEM})throw Error('Image size');
     return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.slice(22));reader.onerror=()=>reject(Error('Image encoding'));reader.readAsDataURL(png)});
    }finally{bitmap.src='';URL.revokeObjectURL(source);bytes.fill(0)}
   })()`,false) as Promise<string>;
  })();
  try{const png=await Promise.race([decoding,interrupted]);if(!valid())throw new Error(tr('记录已取消'));return png;}
  catch{throw new Error(tr(valid()?'图片无法解码':'记录已取消'));}
  finally{decoder.removeListener('closed',cancel);if(!decoder.isDestroyed())decoder.webContents.removeListener('render-process-gone',cancel);}
 }finally{clearInterval(monitor);if(window&&!window.isDestroyed())window.destroy();active--;}
}
