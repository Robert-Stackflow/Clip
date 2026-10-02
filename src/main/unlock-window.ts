import {t as tr,interfaceLanguageArguments} from '../shared/i18n';
import {app,BrowserWindow,ipcMain,nativeTheme} from 'electron';
import {join} from 'node:path';
import {StorageManager} from './storage';
import type {Store} from './store';
import {recoverStorage} from './recovery-window';
import {helloAvailable,cancelHello} from './windows-hello';
export function unlockStorage(storage:StorageManager,onWindow:(window:BrowserWindow|undefined)=>void,closing:Promise<void>=Promise.resolve(),canUnlock:()=>boolean=()=>true):Promise<Store>{
 return new Promise((resolve,reject)=>{let finished=false,busy=false,ready=false,error='',available=false;const channels:string[]=[];
  const window=new BrowserWindow({width:550,height:650,minWidth:480,minHeight:570,title:tr('Clipper · 解锁历史'),show:false,titleBarStyle:'hidden',titleBarOverlay:false,frame:true,thickFrame:true,hasShadow:true,backgroundColor:nativeTheme.shouldUseDarkColors?'#181818':'#fafaf8',icon:join(__dirname,'../clipper.png'),autoHideMenuBar:true,webPreferences:{additionalArguments:interfaceLanguageArguments(),preload:join(__dirname,'../preload/unlock.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});onWindow(window);
  const cleanup=()=>{channels.forEach(c=>ipcMain.removeHandler(c));onWindow(undefined);cancelHello();};
  const finish=(value:Store)=>{finished=true;cleanup();window.destroy();resolve(value);};
  const handle=(name:string,fn:(...args:any[])=>unknown,read=false)=>{const channel='clipper-unlock:'+name;channels.push(channel);ipcMain.handle(channel,async(event,...args)=>{if(event.sender!==window.webContents||event.senderFrame!==event.sender.mainFrame||event.senderFrame.url!=='clipper://app/unlock.html')throw new Error(tr('拒绝访问'));if(read)return fn(...args);if(!ready||busy)throw new Error(tr('正在关闭资料，请稍候'));busy=true;try{return await fn(...args);}finally{busy=false;}});};
  handle('state',()=>({ready,hello:storage.vault.state().hello,helloAvailable:available,error}),true);
  handle('unlock',async(value,mode,newPassword)=>{if(!canUnlock())throw new Error(tr('请先解锁 Windows 会话'));if(!['password','recovery','hello'].includes(mode))throw new Error(tr('解锁方式无效'));if(mode==='recovery'&&(typeof newPassword!=='string'||newPassword.length<12||newPassword.length>1024))throw new Error(tr('使用恢复密钥后，请设置至少 12 个字符的新密码'));let next:Store|undefined;try{next=await storage.start({value,mode});if(mode==='recovery')await storage.vault.changePassword(newPassword);if(!canUnlock())throw new Error(tr('Windows 会话已锁定'));finish(next);}catch(e){next?.close();storage.vault.lock();throw e;}});
  handle('recover',async()=>{if(!canUnlock())throw new Error(tr('请先解锁 Windows 会话'));window.hide();try{const next=await recoverStorage(storage,new Error(tr('从已有资料或备份恢复。原加密资料会保留。')));if(!canUnlock()){next.close();storage.vault.lock();throw new Error(tr('Windows 会话已锁定，资料已恢复，请解锁后继续'));}finish(next);}catch(e){if(!window.isDestroyed())window.show();throw e;}});handle('quit',()=>app.quit(),true);
  window.on('closed',()=>{cleanup();if(!finished){reject(new Error(tr('解锁已取消')));app.quit();}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());window.webContents.on('will-attach-webview',e=>e.preventDefault());window.once('ready-to-show',()=>window.show());void window.loadURL('clipper://app/unlock.html').catch(reject);
  void closing.then(async()=>{available=await helloAvailable();ready=true;}).catch(e=>{error=tr`资料关闭失败，请退出后重新打开：${String(e instanceof Error?e.message:e)}`;});
 });
}
