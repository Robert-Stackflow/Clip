import {app,BrowserWindow,dialog,ipcMain,nativeTheme} from 'electron';
import {join} from 'node:path';
import {RecoveryManager} from './recovery';
import {StorageManager} from './storage';
import type {Store} from './store';
import {thumbnail} from './clipboard';
export function recoverStorage(storage:StorageManager,error:unknown):Promise<Store>{
 return new Promise((resolve,reject)=>{
  const recovery=new RecoveryManager(storage,thumbnail),channels:string[]=[];let finished=false,busy=false,currentError=String(error instanceof Error?error.message:error);
  const window=new BrowserWindow({width:840,height:720,minWidth:700,minHeight:600,title:'Clipper · 恢复资料',show:false,backgroundColor:nativeTheme.shouldUseDarkColors?'#181818':'#fafafa',icon:join(__dirname,'../clipper.png'),autoHideMenuBar:true,webPreferences:{preload:join(__dirname,'../preload/recovery.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  const cleanup=()=>{for(const channel of channels)ipcMain.removeHandler(channel);recovery.cancel();};
  const finish=(store:Store)=>{finished=true;cleanup();window.destroy();resolve(store);};
  const handle=(name:string,fn:(...args:any[])=>unknown)=>{const channel='clipper-recovery:'+name;channels.push(channel);ipcMain.handle(channel,async(event,...args)=>{
   if(event.sender!==window.webContents||event.senderFrame!==event.sender.mainFrame||event.senderFrame.url!=='clipper://app/recovery.html')throw new Error('拒绝访问');
   if(busy)throw new Error('正在处理恢复操作，请稍候');busy=true;try{return await fn(...args);}finally{busy=false;}
  });};
  handle('state',()=>({error:currentError,directory:storage.defaultDirectory}));
  handle('retry',async()=>{try{finish(await storage.start());}catch(e){currentError=String(e instanceof Error?e.message:e);throw e;}});
  handle('choose',async kind=>{if(!['database','backup'].includes(kind))throw new Error('恢复来源无效');recovery.cancel();const result=await dialog.showOpenDialog(window,kind==='database'?{title:'选择已有 Clipper 资料目录',properties:['openDirectory']}:{title:'选择 Clipper 备份',properties:['openFile'],filters:[{name:'Clipper 备份',extensions:['json','clipper']}]});return result.canceled?null:recovery.choose(kind,result.filePaths[0]);});
  handle('preview',(token,password,newPassword,mode)=>recovery.preview(token,password,newPassword,mode));handle('commit',async(token,proof)=>finish(await recovery.commit(token,proof)));
  handle('cancel',()=>recovery.cancel());handle('quit',()=>app.quit());
  window.on('close',event=>{if(busy)event.preventDefault();});
  window.on('closed',()=>{cleanup();if(!finished){reject(new Error('恢复已取消'));app.quit();}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.once('ready-to-show',()=>window.show());void window.loadURL('clipper://app/recovery.html').catch(reject);
 });
}
