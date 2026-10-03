import {t as tr} from '../shared/i18n';
import {app,BrowserWindow,ipcMain,session,net,type IpcMainInvokeEvent} from 'electron';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {installedFonts,fontSource} from './fonts';
import {AppearanceStore} from './appearance-store';
import {trustedAppearancePage} from '../shared/appearance';
import {answerWindowConfirmation} from './window-confirm';
import {nativeWindowState,watchNativeWindowState} from './window-state';
export class AppearanceService {
 private store:AppearanceStore;
 constructor(file:string){this.store=new AppearanceStore(file);}
 async init(){await this.store.load();
  const trusted=(event:IpcMainInvokeEvent)=>{const w=BrowserWindow.fromWebContents(event.sender);if(!w||event.senderFrame!==event.sender.mainFrame||!trustedAppearancePage(event.senderFrame.url))throw new Error(tr('拒绝访问外观设置'));return w;};
  ipcMain.handle('clipper:appearance-state',event=>{trusted(event);return this.store.state();});
  const sources=new Map<string,{path:string;local:string[]}>(),families=new Map<string,string>(),pending=new Map<string,Promise<{local:string[];url?:string}|null>>();let fontRevision=0;
  ipcMain.handle('clipper:installed-fonts',(event,refresh)=>{trusted(event);if(refresh!==undefined&&typeof refresh!=='boolean')throw new Error('Invalid refresh');if(refresh){fontRevision++;families.clear();pending.clear();}return installedFonts(refresh);});
  ipcMain.handle('clipper:font-source',async(event,family)=>{
   trusted(event);const token=families.get(family),cached=token?sources.get(token):undefined;
   if(cached)return {local:[...cached.local],url:'clipper-font://local/'+token};
   let job=pending.get(family);
   if(!job){
    const revision=fontRevision;
    job=(async()=>{
     const source=await fontSource(family);if(!source)return null;if(!source.path)return {local:source.local};
     const token=randomUUID();sources.set(token,{path:source.path,local:[...source.local]});if(revision===fontRevision)families.set(family,token);
     if(sources.size>64){const oldest=sources.keys().next().value!;sources.delete(oldest);for(const [key,value]of families)if(value===oldest)families.delete(key);}
     return {local:source.local,url:'clipper-font://local/'+token};
    })();pending.set(family,job);
    const current=job;void job.finally(()=>{if(pending.get(family)===current)pending.delete(family);}).catch(()=>{});
   }
   const value=await job;return value?{...value,local:[...value.local]}:null;
  });
  for(const target of [session.defaultSession,...['clipper-recording','clipper-scroll','clipper-image-editor'].map(name=>session.fromPartition(name))])target.protocol.handle('clipper-font',request=>{const url=new URL(request.url),file=sources.get(url.pathname.slice(1))?.path;if(request.method!=='GET'||url.host!=='local'||!file)return new Response('Not found',{status:404});if(request.headers.get('Origin')!=='clipper://app')return new Response('Forbidden',{status:403});return net.fetch(pathToFileURL(file).toString()).then(response=>{const headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin','clipper://app');return new Response(response.body,{status:response.status,statusText:response.statusText,headers});});});
  ipcMain.handle('clipper:chrome-state',event=>nativeWindowState(trusted(event)));
  ipcMain.handle('clipper:window-confirm-answer',(event,token,response)=>answerWindowConfirmation(event,trusted(event),token,response));
  ipcMain.handle('clipper:chrome-action',(event,kind)=>{const w=trusted(event);if(kind==='close')w.close();else if(kind==='minimize'&&w.isMinimizable())w.minimize();else if(kind==='maximize'&&w.isMaximizable()){if(w.isMaximized())w.unmaximize();else w.maximize();}else throw new Error('Invalid window action');});
  app.on('browser-window-created',(_event,w)=>watchNativeWindowState(w));
 }
 async save(value:unknown){const state=await this.store.save(value);for(const window of BrowserWindow.getAllWindows()){if(window.isDestroyed()||window.webContents.isDestroyed()||!trustedAppearancePage(window.webContents.getURL()))continue;try{window.webContents.send('clipper:appearance-changed',state);}catch{/* A closing renderer will read the saved value when it opens again. */}}return state;}
}
