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
  ipcMain.handle('clipper:installed-fonts',(event,refresh)=>{trusted(event);if(refresh!==undefined&&typeof refresh!=='boolean')throw new Error('Invalid refresh');return installedFonts(refresh);});
  const sources=new Map<string,string>(),families=new Map<string,string>();
  ipcMain.handle('clipper:font-source',async(event,family)=>{trusted(event);const source=await fontSource(family);if(!source)return null;if(!source.path)return {local:source.local};let token=families.get(family);if(!token){token=randomUUID();families.set(family,token);sources.set(token,source.path);}if(sources.size>64){const oldest=sources.keys().next().value!;sources.delete(oldest);for(const [key,value]of families)if(value===oldest)families.delete(key);}return {local:source.local,url:'clipper-font://local/'+token};});
  for(const target of [session.defaultSession,...['clipper-recording','clipper-scroll','clipper-image-editor'].map(name=>session.fromPartition(name))])target.protocol.handle('clipper-font',request=>{const url=new URL(request.url),file=sources.get(url.pathname.slice(1));if(request.method!=='GET'||url.host!=='local'||!file)return new Response('Not found',{status:404});return net.fetch(pathToFileURL(file).toString());});
  ipcMain.handle('clipper:chrome-state',event=>nativeWindowState(trusted(event)));
  ipcMain.handle('clipper:window-confirm-answer',(event,token,response)=>answerWindowConfirmation(event,trusted(event),token,response));
  ipcMain.handle('clipper:chrome-action',(event,kind)=>{const w=trusted(event);if(kind==='close')w.close();else if(kind==='minimize'&&w.isMinimizable())w.minimize();else if(kind==='maximize'&&w.isMaximizable()){if(w.isMaximized())w.unmaximize();else w.maximize();}else throw new Error('Invalid window action');});
  app.on('browser-window-created',(_event,w)=>watchNativeWindowState(w));
 }
 async save(value:unknown){const state=await this.store.save(value);for(const window of BrowserWindow.getAllWindows()){if(window.isDestroyed()||window.webContents.isDestroyed()||!trustedAppearancePage(window.webContents.getURL()))continue;try{window.webContents.send('clipper:appearance-changed',state);}catch{/* A closing renderer will read the saved value when it opens again. */}}return state;}
}
