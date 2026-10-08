import {t as tr,interfaceLanguageArguments} from '../shared/i18n';
import {app,BrowserWindow,dialog,ipcMain,nativeTheme,powerMonitor} from 'electron';
import {join} from 'node:path';
import {RecoveryManager} from './recovery';
import {CheckpointRecovery} from './checkpoint-recovery';
import {cancelRecoveryJobs} from './recovery-jobs';
import {StorageManager} from './storage';
import type {Store} from './store';
import {thumbnail} from './clipboard';
export function recoverStorage(storage:StorageManager,error:unknown,allowed=()=>true,options:{hidden?:boolean;onWindow?:(window:BrowserWindow|undefined)=>void}={}):Promise<Store>{
 return new Promise((resolve,reject)=>{
  const recovery=new RecoveryManager(storage,thumbnail),checkpoint=new CheckpointRecovery(storage,thumbnail),channels:string[]=[];let usingCheckpoint=false,finished=false,busy=false,currentError=String(error instanceof Error?error.message:error);
  const window=new BrowserWindow({width:840,height:720,minWidth:700,minHeight:600,title:tr('Clip · 恢复资料'),show:false,titleBarStyle:'hidden',titleBarOverlay:false,frame:true,thickFrame:true,hasShadow:true,backgroundColor:nativeTheme.shouldUseDarkColors?'#181818':'#fafafa',icon:join(__dirname,'../clip.png'),autoHideMenuBar:true,webPreferences:{additionalArguments:interfaceLanguageArguments(),preload:join(__dirname,'../preload/recovery.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  options.onWindow?.(window);
  const suspend=()=>{recovery.cancel();checkpoint.cancel();cancelRecoveryJobs();};powerMonitor.on('lock-screen',suspend);powerMonitor.on('suspend',suspend);
  const cleanup=()=>{options.onWindow?.(undefined);for(const channel of channels)ipcMain.removeHandler(channel);powerMonitor.removeListener('lock-screen',suspend);powerMonitor.removeListener('suspend',suspend);recovery.cancel();checkpoint.cancel();};
  const finish=(store:Store)=>{finished=true;cleanup();window.destroy();resolve(store);};
  const handle=(name:string,fn:(...args:any[])=>unknown)=>{const channel='clip-recovery:'+name;channels.push(channel);ipcMain.handle(channel,async(event,...args)=>{
   if(event.sender!==window.webContents||event.senderFrame!==event.sender.mainFrame||event.senderFrame.url!=='clip://app/recovery.html')throw new Error(tr('拒绝访问'));
   if(!allowed()&&name!=='quit'&&name!=='state')throw new Error(tr('历史已锁定或正在退出，请先解锁'));
   if(busy)throw new Error(tr('正在处理恢复操作，请稍候'));busy=true;try{return await fn(...args);}finally{busy=false;}
  });};
  handle('state',()=>({error:currentError,directory:storage.defaultDirectory}));
  handle('checkpoints',()=>storage.checkpoints.list());
  handle('checkpoint-choose',async id=>{recovery.cancel();usingCheckpoint=true;return checkpoint.choose(id,false);});
  handle('retry',async()=>{try{finish(await storage.start());}catch(e){currentError=String(e instanceof Error?e.message:e);throw e;}});
  handle('choose',async kind=>{if(!['database','backup'].includes(kind))throw new Error(tr('恢复来源无效'));checkpoint.cancel();usingCheckpoint=false;recovery.cancel();const result=await dialog.showOpenDialog(window,kind==='database'?{title:tr('选择已有 Clip 资料目录'),properties:['openDirectory']}:{title:tr('选择 Clip 备份'),properties:['openFile'],filters:[{name:tr('Clip 备份'),extensions:['json','clip']}]});return result.canceled?null:recovery.choose(kind,result.filePaths[0]);});
  handle('preview',(token,password,newPassword,mode)=>(usingCheckpoint?checkpoint:recovery).preview(token,password,newPassword,mode));handle('commit',async(token,proof)=>finish(await (usingCheckpoint?checkpoint:recovery).commit(token,proof)));
  handle('cancel',()=>{recovery.cancel();checkpoint.cancel();});handle('quit',()=>app.quit());
  window.on('close',event=>{if(busy)event.preventDefault();});
  window.on('closed',()=>{cleanup();if(!finished){reject(new Error(tr('恢复已取消')));app.quit();}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());window.webContents.on('will-attach-webview',event=>event.preventDefault());
  if(!options.hidden)window.once('ready-to-show',()=>window.show());void window.loadURL('clip://app/recovery.html').catch(reject);
 });
}
