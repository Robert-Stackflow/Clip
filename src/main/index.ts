import {TrayPanel} from './tray-panel';
import {StackService} from './stack';
import {EfficiencyService} from './efficiency';
import {HotkeyRegistry,type HotkeyBinding} from './hotkeys';
import {validateEfficiency,type EfficiencyOptions} from '../shared/efficiency';
import {MetadataService} from './metadata';
import {cancelAttachments,disposeAttachments} from './attachment-runtime';
import {contentInfo,exportFormat,exportAttachment} from './content-info';
import {ImageEditorService} from './image-editor';
import {createHash} from 'node:crypto';
import {ScrollCaptureService} from './scroll-capture';
import {RecordingService} from './recording';
import {SelectionService} from './selection';
import {selectionDefaults,validateSelection,type SelectionOptions} from '../shared/selection';
import {DesktopController} from './desktop';
import {desktopDefaults,validateDesktop,type DesktopOptions} from '../shared/desktop';
import {WebShareService} from './web-share';
import { app, BrowserWindow, Menu, Tray, ipcMain, nativeTheme, nativeImage, globalShortcut, protocol, net, dialog, session } from 'electron';
import { join, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, stat } from 'node:fs/promises';
import { Store } from './store';
import { capture, writePayload, thumbnail } from './clipboard';
import { initNative, nativeAvailable, nativeError, foreground, foregroundTarget, owner, sequence, privateClipboard, pasteTo, windowInfo } from './native';
import { validateSettings } from '../shared/core';
import type { Settings, ClipAction, Payload } from '../shared/types';
import { fillTemplate, matchesCategory, templateVariables, builtins } from '../shared/advanced';
import { chooseFiles, incomingFiles, startDrag, exportImage, initTransfer, disposeTransfer } from './transfer';
import { ocrStatus, recognize, cancelOcr, clearOcrTemporary } from './ocr';
import { CaptureService } from './capture';
import {AIService} from './ai';
import {ScriptService} from './scripts';
import {IntegrationService} from './integrations';
import {toolText,MAX_TOOL_OUTPUT,type TextApply} from '../shared/text-tools';
import {safeStorage,powerMonitor} from 'electron';
import {HistoryVault} from './history-vault';
import {unlockStorage} from './unlock-window';
import {helloAvailable,helloVerify,cancelHello} from './windows-hello';
import {StorageManager,HistoryLockedError} from './storage';
import {BackupManager} from './backups';
import {recoverStorage} from './recovery-window';
import {exportInWorker,cancelBackupJobs} from './backup-jobs';
import {SyncService} from './sync-service';
app.setName('Clipper');
const testing=process.env.CLIPPER_TEST_MODE==='1';
if(testing&&process.env.CLIPPER_DATA_DIR)app.setPath('userData',resolve(process.env.CLIPPER_DATA_DIR));
else app.setPath('userData',join(app.getPath('appData'),'Clipper'));
protocol.registerSchemesAsPrivileged([{scheme:'clipper',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
let store:Store,main:BrowserWindow,quick:BrowserWindow|undefined,tray:Tray,quitting=false,status='',hotkeyError='',lastSequence=0,lastTarget=0,lastTargetPid=0,timer:NodeJS.Timeout,polling=false;
let serial:Promise<unknown>=Promise.resolve();
const backgroundTasks=new Set<Promise<unknown>>();
function background<T>(task:Promise<T>):Promise<T>{backgroundTasks.add(task);void task.then(()=>backgroundTasks.delete(task),()=>backgroundTasks.delete(task));return task;}
let recordingShortcut=false,changingStore=false;
let desktop:DesktopController|undefined;
let trayPanel:TrayPanel|undefined;
let selection:SelectionService|undefined;
let captureService:CaptureService;
const metadataService=new MetadataService();
const stack=new StackService(activeStore);
const efficiency=new EfficiencyService(activeStore),hotkeys=new HotkeyRegistry(globalShortcut);let replyBusy=false;
let imageEditor:ImageEditorService;let recorder:RecordingService;let scrollCapture:ScrollCaptureService;
let quitRecordingConfirmed=false,quitRecordingPrompt=false;
let aiService:AIService,scriptService:ScriptService,integrationService:IntegrationService;
let storageManager:StorageManager,backupManager:BackupManager,backupTimer:NodeJS.Timeout;
let syncService:SyncService;
let webService:WebShareService;
let startupArgv=process.argv;
let secured=true,storeOpen=false,vaultSetup=false,sessionEpoch=0,lastUnlock=0,systemPaused=false,vaultSetupExpires=0;let unlockWindow:BrowserWindow|undefined;
const localProtector={available:()=>safeStorage.isAsyncEncryptionAvailable(),encrypt:async(value:string)=>(await safeStorage.encryptStringAsync(value)).toString('base64'),decrypt:async(value:string)=>(await safeStorage.decryptStringAsync(Buffer.from(value,'base64'))).result};
function activeStore(){if(secured||!storeOpen)throw new Error('历史已锁定');return store;}
function stopTools(cancelBackups=true){trayPanel?.close();stack.stop();efficiency.cancel();metadataService.dispose();cancelAttachments();imageEditor?.abort();scrollCapture?.abort();if(recorder)background(recorder.abort());selection?.suspend();cancelOcr();cancelHello();if(cancelBackups)cancelBackupJobs();captureService?.cancel();aiService?.dispose();scriptService?.dispose();}
async function switchStore(operation:()=>Promise<Store>){if(imageEditor?.hasUnsaved)throw new Error('请先保存或放弃图片编辑，再更改数据存储');if(scrollCapture?.hasUnsaved)throw new Error('请先保存或放弃长截图，再更改数据存储');if(recorder?.hasUnsaved)throw new Error('请先保存或放弃录制，再更改数据存储');desktop?.flushBounds();changingStore=true;try{stopTools();await webService.stop();await syncService.stop();try{store=await operation();}finally{if(!secured){aiService=new AIService(store);scriptService=new ScriptService(store);syncService.bindStore();await syncService.resume();}lastSequence=sequence();if(!secured)hotkeyError=registerHotkeys(store.settings,undefined,undefined,undefined,false);broadcast();}}finally{changingStore=false;}}
function lockHistory(){if(secured)return;if(!storageManager.vault.state().encrypted)throw new Error('请先启用历史加密');const shortcuts=[store.settings.shortcut,store.settings.quickShortcut,changingStore?desktopDefaults.shelfShortcut:desktop?.options.shelfShortcut||desktopDefaults.shelfShortcut,selection?.options.shortcut||selectionDefaults.shortcut];desktop?.flushBounds();secured=true;sessionEpoch++;recordingShortcut=false;hotkeys.clear();globalShortcut.unregisterAll();for(const key of shortcuts)globalShortcut.register(key,()=>show());stopTools();selection?.dispose();selection=undefined;desktop?.dispose();desktop=undefined;for(const w of windows())w.destroy();quick=undefined;trayMenu();
 const closing=(async()=>{await Promise.all([webService.stop(),syncService.stop()]);await serial.catch(()=>{});await Promise.allSettled([...backgroundTasks]);stopTools();await Promise.all([webService.stop(),syncService.stop()]);backupManager.dispose();storageManager.cancelEncryption();vaultSetup=false;disposeTransfer();await clearOcrTemporary();try{store.close();}finally{storeOpen=false;storageManager.vault.lock();}aiService=undefined!;scriptService=undefined!;integrationService=undefined!;backupManager=undefined!;webService=undefined!;syncService=undefined!;status='';lastTarget=0;lastTargetPid=0;})();
 void unlockStorage(storageManager,w=>unlockWindow=w,closing,()=>!systemPaused&&!quitting).then(async next=>{store=next;if(quitting){next.close();storageManager.vault.lock();return;}await activateStore();}).catch(e=>{if(!quitting){dialog.showErrorBox('Clipper 解锁失败',String(e));app.quit();}});
}
function endShortcutRecording(){if(recordingShortcut&&!secured){recordingShortcut=false;try{hotkeyError=registerHotkeys(store.settings,undefined,undefined,undefined,false);}catch(e){hotkeyError=String((e as Error).message);}broadcast();}}
function enqueue<T>(work:()=>Promise<T>|T):Promise<T>{const epoch=sessionEpoch;const task=serial.catch(()=>{}).then(()=>{if(secured||quitting||epoch!==sessionEpoch)throw new Error('历史已锁定或正在退出');return work();});serial=task;return task;}
const windows=()=>[main,quick,trayPanel?.window,desktop?.shelf,selection?.window,recorder?.window,scrollCapture?.window,imageEditor?.window].filter((w):w is BrowserWindow=>!!w&&!w.isDestroyed());
function notice(e:unknown){if(secured||quitting)return;status=String(e instanceof Error?e.message:e);for(const w of windows())w.webContents.send('clipper:notice',status);broadcast();}
function broadcast(){if(secured||quitting)return;webService?.reconcile();for(const w of windows())if(w!==trayPanel?.window)w.webContents.send('clipper:changed');trayPanel?.changed();}
function dark(){return store.settings.theme==='dark'||store.settings.theme==='system'&&nativeTheme.shouldUseDarkColors;}
function appearance(){if(secured||quitting)return;for(const w of windows()){w.setBackgroundColor(dark()?'#181818':'#ffffff');if(w!==selection?.window&&w!==trayPanel?.window)w.setTitleBarOverlay({color:dark()?'#181818':'#ffffff',symbolColor:dark()?'#eeeeee':'#242424',height:46});}recorder?.refreshAppearance();broadcast();}
function state(){const bindings=new Map(efficiency.options().bindings.map(b=>[b.id,b.shortcut]));return {stack:stack.state(),clips:store.list(),snippets:store.snippets().map(({payload,...s})=>({...s,shortcut:bindings.get(s.id)||''})),queue:store.queue,shelf:store.shelf,categories:store.categories,settings:store.settings,desktop:desktop?.options||desktopDefaults,dark:dark(),native:nativeAvailable(),status,hotkeyError,bytes:store.bytes()};}
function rememberTarget(){const f=foregroundTarget();if(f&&f.pid!==process.pid){lastTarget=f.hwnd;lastTargetPid=f.pid;}}
function trayTarget(){rememberTarget();const target=windowInfo(lastTarget);return target&&target.pid===lastTargetPid&&target.pid!==process.pid?target:undefined;}
function createWindow(compact=false){const w=new BrowserWindow({width:compact?600:1180,height:compact?560:780,minWidth:compact?440:860,minHeight:compact?360:600,show:false,title:'Clipper',icon:join(__dirname,'../clipper.png'),titleBarStyle:'hidden',titleBarOverlay:{height:46,color:dark()?'#181818':'#ffffff',symbolColor:dark()?'#eeeeee':'#242424'},backgroundColor:dark()?'#181818':'#ffffff',autoHideMenuBar:true,skipTaskbar:compact,resizable:true,webPreferences:{preload:join(__dirname,'../preload/index.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());w.webContents.on('will-attach-webview',e=>e.preventDefault());
  w.on('close',e=>{if(!quitting){e.preventDefault();w.hide();}});w.on('blur',endShortcutRecording);if(compact)w.on('blur',()=>{if(!desktop?.options.dockEnabled||desktop.options.autoHide)w.hide();});
  void w.loadURL('clipper://app/index.html'+(compact?'?quick=1':''));return w;
}
function show(compact=false){if(secured){if(unlockWindow&&!unlockWindow.isDestroyed()){unlockWindow.show();unlockWindow.focus();}return;}if(compact&&desktop){desktop.showQuick();return;}rememberTarget();const w=compact?(quick??=createWindow(true)):main;if(w.isMinimized())w.restore();if(w.webContents.isLoading())w.webContents.once('did-finish-load',()=>{w.show();w.focus();});else{w.show();w.focus();}w.webContents.send('clipper:changed');}
async function copyPayload(payload:Payload,paste:boolean,plain=false,fixedTarget?:{hwnd:number;pid:number},stillValid:()=>boolean=()=>true){const epoch=sessionEpoch;if(!fixedTarget)rememberTarget();const target=fixedTarget?.hwnd??lastTarget,valid=()=>stillValid()&&!secured&&!quitting&&!systemPaused&&epoch===sessionEpoch&&(!fixedTarget||windowInfo(target)?.pid===fixedTarget.pid);if(!valid())throw new Error('目标窗口或会话已改变');await writePayload(payload,Number(main.getNativeWindowHandle().readBigUInt64LE()),plain,valid);lastSequence=sequence();if(paste){for(const w of windows())w.hide();try{await pasteTo(target,valid);}catch(e){show(false);throw e;}}}
async function next(){const id=store.queue[0];if(!id)throw new Error('堆栈为空');await copyPayload(store.get(id).payload,true);store.setQueue(store.queue.slice(1));broadcast();}
function getSnippet(value:unknown){const s=store.snippets().find(s=>s.id===id(value));if(!s)throw new Error('模板已不存在');return s;}
function repliesBlocked(){return secured||quitting||systemPaused||changingStore||recordingShortcut||captureService?.active||recorder?.active||scrollCapture?.active;}
function openReplies(){if(repliesBlocked())return;if(!efficiency.active)efficiency.browse();show();}
function triggerReply(value:string){if(repliesBlocked()||replyBusy)return;if(efficiency.active){show();notice('请先完成或取消当前快捷回复');return;}rememberTarget();const target=windowInfo(lastTarget);if(!target||target.pid===process.pid){notice('请先切换到需要粘贴的应用');return;}replyBusy=true;const epoch=sessionEpoch;
 void enqueue(async()=>{if(repliesBlocked()||epoch!==sessionEpoch)return;const snippet=getSnippet(value);if(templateVariables(snippet.text).some(v=>!builtins.includes(v))){efficiency.fill(snippet,target);show();}else await copyPayload(fillTemplate(snippet.payload,{}),true,false,target);}).catch(notice).finally(()=>replyBusy=false);
}
function registerHotkeys(s:Settings,d:DesktopOptions=desktop?.options||desktopDefaults,p:SelectionOptions=selection?.options||selectionDefaults,e:EfficiencyOptions=efficiency.options(),strict=true){
 const bindings:HotkeyBinding[]=[[s.shortcut,()=>show()],[s.quickShortcut,()=>show(true)],[s.nextShortcut,()=>void enqueue(next).catch(notice)],[d.shelfShortcut,()=>desktop?.showShelf()],[p.shortcut,()=>void selection?.read(true)]];
 if(e.repliesShortcut)bindings.push([e.repliesShortcut,openReplies]);for(const b of e.bindings)bindings.push([b.shortcut,()=>triggerReply(b.id)]);return hotkeys.replace(bindings,strict);
}
function saveEfficiency(change:()=>void){const previous=efficiency.options();store.db.exec('SAVEPOINT efficiency_change');try{change();registerHotkeys(store.settings);store.db.exec('RELEASE efficiency_change');hotkeyError='';}catch(e){store.db.exec('ROLLBACK TO efficiency_change; RELEASE efficiency_change');try{hotkeyError=registerHotkeys(store.settings,undefined,undefined,previous,false);}catch{}throw e;}broadcast();}

function setStackRunning(value:unknown){if(typeof value!=='boolean')throw new Error('自动入栈状态无效');if(value){if(store.settings.paused||repliesBlocked()||vaultSetup)throw new Error('请先恢复记录并完成当前操作');lastSequence=sequence();stack.start();}else stack.stop();if(!changingStore){trayMenu();broadcast();}}
function trayMenu(){if(!tray)return;if(secured){tray.setContextMenu(Menu.buildFromTemplate([{label:'解锁历史',click:()=>show()},{label:'退出 Clipper',click:()=>app.quit()}]));return;}tray.setContextMenu(Menu.buildFromTemplate([{label:'最近记录',click:()=>trayPanel?.open(tray.getBounds())},{label:'打开 Clipper',click:()=>show()},{label:'快速粘贴',click:()=>show(true)},{label:'快捷回复',click:openReplies},{label:'浮动拖放窗口',click:()=>desktop?.showShelf()},{label:'录屏与录音',click:()=>void recorder.open()},{label:stack.active?'停止自动入栈':'开始自动入栈',click:()=>{if(stack.active)setStackRunning(false);else void enqueue(()=>setStackRunning(true)).catch(notice);}},{type:'separator'},{label:store.settings.paused?'恢复记录':'暂停记录',click:()=>{stack.stop();cancelAttachments();void enqueue(()=>{store.saveSettings({...store.settings,paused:!store.settings.paused});lastSequence=sequence();trayMenu();broadcast();}).catch(notice)}},...(storageManager.vault.state().encrypted?[{label:'锁定历史',click:()=>lockHistory()}]:[]),{label:'退出 Clipper',click:()=>app.quit()}]));}
function id(v:unknown):string{if(typeof v!=='string'||! /^[0-9a-f-]{36}$/.test(v))throw new Error('项目编号无效');return v;}
function handle(name:string,fn:(...args:any[])=>unknown,serialized=true,scope:'main'|'shelf'|'selection'|'tray'='main'){ipcMain.handle('clipper:'+name,(event,...args)=>{
  if(quitting||secured)throw new Error('历史已锁定或正在退出，请先解锁');
  const w=windows().find(w=>w.webContents===event.sender);if(!w||event.senderFrame!==event.sender.mainFrame||(scope==='tray'?(w!==trayPanel?.window||event.senderFrame.url!=='clipper://app/tray.html'):scope==='selection'?(w!==selection?.window||event.senderFrame.url!=='clipper://app/selection.html'):scope==='shelf'?(w!==desktop?.shelf||event.senderFrame.url!=='clipper://app/shelf.html'):!event.senderFrame.url.startsWith('clipper://app/index.html')))throw new Error('拒绝访问');
  if(name==='vault-lock')return fn(...args);if(name==='stack-running'&&args[0]===false)return fn(...args);if(name==='settings'){const next=validateSettings(args[0]);if(next.paused||JSON.stringify(next.excludedApps)!==JSON.stringify(store.settings.excludedApps)){stack.stop();cancelAttachments();}}return background(serialized?enqueue(()=>fn(...args)):Promise.resolve().then(()=>{activeStore();return fn(...args);}));
});}
async function backup(mode:unknown){if(mode==='export'){
  const result=await dialog.showSaveDialog(main,{title:'导出 Clipper 备份',defaultPath:`Clipper-${new Date().toISOString().slice(0,10)}.json`,filters:[{name:'Clipper 备份',extensions:['json']}]});if(result.canceled||!result.filePath)return null;
  protectDataFile(result.filePath);
  return backupManager.export(result.filePath);
}if(mode==='import'){
  const result=await dialog.showOpenDialog(main,{title:'导入 Clipper 备份',properties:['openFile'],filters:[{name:'Clipper 备份',extensions:['json']}]});if(result.canceled)return null;
  const file=result.filePaths[0];if((await stat(file)).size>384*1024*1024)throw new Error('备份文件过大');const count=store.import(JSON.parse(await readFile(file,'utf8')),thumbnail);broadcast();return `已合并 ${count} 条记录`;
}throw new Error('备份操作无效');}
function protectDataFile(file:string){if(/^Clipper-auto-/i.test(basename(file)))throw new Error('此文件名保留给自动备份，请选择其他名称');const target=resolve(file).toLowerCase();for(const root of [storageManager.directory,storageManager.defaultDirectory,storageManager.previousDirectory].filter(Boolean))for(const name of ['history.sqlite','history.sqlite-wal','history.sqlite-shm','storage-location.json','history-vault.json','plaintext-predecessor.json'])if(target===resolve(root,name).toLowerCase())throw new Error('备份不能覆盖数据库或存储位置配置，请选择其他文件名');}
function ipc(){
  handle('tray-open',()=>{if(secured){show();return;}trayPanel?.open(tray.getBounds());},false);
  handle('tray-state',query=>trayPanel!.state(query),false,'tray');handle('tray-preview',token=>trayPanel!.preview(token),false,'tray');handle('tray-use',(token,paste)=>trayPanel!.use(token,paste),false,'tray');handle('tray-hide',()=>trayPanel!.close(),false,'tray');handle('tray-main',()=>trayPanel!.main(),false,'tray');
  ipcMain.on('clipper:tray-drag',(event,token)=>{if(secured||quitting||event.sender!==trayPanel?.window?.webContents||event.senderFrame!==event.sender.mainFrame||event.senderFrame.url!=='clipper://app/tray.html')return;void background(trayPanel!.drag(token)).catch(notice);});
  handle('stack-state',()=>stack.state());handle('stack-configure',value=>{stack.configure(value);broadcast();});handle('stack-running',setStackRunning);handle('stack-preview',order=>stack.preview(order));handle('stack-commit',token=>{const added=stack.commit(token);broadcast();return added;});handle('stack-cancel',()=>stack.cancel());handle('stack-reverse',()=>{stack.reverse();broadcast();});
  handle('record-open',()=>recorder.open(),false);
  handle('selection-state',()=>selection!.state());handle('selection-input',()=>selection!.takeInput());handle('selection-read',()=>selection!.read(true),false);
  handle('selection-configure',value=>{const previous=selection!.options,next=validateSelection(value);try{registerHotkeys(store.settings,desktop!.options,next);selection!.configure(next);hotkeyError='';}catch(e){try{registerHotkeys(store.settings,desktop!.options,previous);}catch{}throw e;}});
  handle('selection-view',()=>selection!.view(),false,'selection');handle('selection-hide',()=>selection!.hide(),false,'selection');handle('selection-action',(token,action)=>selection!.action(token,action),false,'selection');

  handle('desktop-state',()=>desktop!.state());
  handle('desktop-configure',value=>{const previous=desktop!.options,next=validateDesktop(value);try{registerHotkeys(store.settings,next);desktop!.configure(next);hotkeyError='';}catch(e){try{registerHotkeys(store.settings,previous);}catch{}throw e;}});
  handle('desktop-quick',()=>show(true));handle('desktop-shelf',()=>desktop!.showShelf());

  handle('vault-state',async()=>({...storageManager.vault.state(),helloAvailable:await helloAvailable(),plaintextDirectory:(await storageManager.predecessor())?.directory||''}));
  handle('vault-prepare',async password=>{vaultSetup=true;vaultSetupExpires=Date.now()+600000;lastSequence=sequence();try{return await storageManager.prepareEncryption(password);}catch(e){vaultSetup=false;throw e;}});
  handle('vault-cancel',()=>{storageManager.cancelEncryption();vaultSetup=false;lastSequence=sequence();});
  handle('vault-encrypt',(token,proof)=>backupManager.exclusive(async()=>{try{await switchStore(()=>storageManager.encrypt(token,proof));lastUnlock=Date.now();trayMenu();}finally{vaultSetup=false;lastSequence=sequence();}}));
  handle('vault-cleanup',()=>backupManager.exclusive(()=>storageManager.removePredecessor()));
  handle('vault-password',password=>storageManager.vault.changePassword(password));handle('vault-configure',(hello,idle)=>storageManager.vault.configure(hello,idle));handle('vault-lock',lockHistory,false);
  handle('web-state',()=>webService.state(),false);handle('web-start',value=>webService.start(value));handle('web-stop',()=>webService.stop());handle('web-invite',()=>webService.invite());handle('web-approve',(value,accept,allowSend)=>webService.approve(id(value),accept,allowSend));handle('web-revoke',value=>webService.revoke(id(value)));handle('web-publish',value=>webService.publish(id(value)));handle('web-remove',value=>webService.remove(id(value)));handle('web-follow',value=>webService.setFollow(value));
  handle('sync-state',()=>syncService.state(),false);handle('sync-configure',value=>syncService.configure(value));handle('sync-invite',host=>syncService.invite(host));handle('sync-join',code=>background(syncService.join(code)),false);handle('sync-approve',(value,accept)=>syncService.approve(id(value),accept));handle('sync-cancel',()=>background(syncService.cancelPairing()),false);handle('sync-revoke',value=>syncService.revoke(id(value)));handle('sync-now',()=>background(syncService.tick()),false);handle('sync-share',value=>syncService.share(id(value)));handle('sync-local',(value,only)=>syncService.local(id(value),only));
  handle('data-state',async()=>({directory:storageManager.directory,defaultDirectory:storageManager.defaultDirectory,databaseBytes:await storageManager.bytes(),previousDirectory:storageManager.previousDirectory,backup:backupManager.status(),entries:await backupManager.entries()}));
  handle('storage-choose',async()=>{const result=await dialog.showOpenDialog(main,{title:'选择新的空数据文件夹',properties:['openDirectory','createDirectory']});return result.canceled?null:storageManager.prepare(result.filePaths[0]);});
  handle('storage-migrate',token=>backupManager.exclusive(()=>switchStore(()=>storageManager.migrate(token))));
  handle('backup-folder',async()=>{const result=await dialog.showOpenDialog(main,{title:'选择自动备份文件夹',properties:['openDirectory','createDirectory']});return result.canceled?null:result.filePaths[0];});
  handle('backup-configure',async value=>{await backupManager.configure(value);});
  handle('backup-now',()=>background(backupManager.run(Date.now(),true)),false);
  handle('backup-protected',password=>background((async()=>{if(password!==undefined&&typeof password!=='string')throw new Error('备份密码无效');const result=await dialog.showSaveDialog(main,{title:'导出备份',defaultPath:'Clipper-'+new Date().toISOString().slice(0,10)+(password===undefined?'.json':'.clipper'),filters:[{name:password===undefined?'Clipper 备份':'Clipper 加密备份',extensions:[password===undefined?'json':'clipper']}]});if(result.canceled||!result.filePath)return null;protectDataFile(result.filePath);return backupManager.export(result.filePath,password);})()),false);
  handle('restore-choose',async name=>{if(name!==undefined)return backupManager.chooseOwn(name);const result=await dialog.showOpenDialog(main,{title:'选择要校验并恢复的备份',properties:['openFile'],filters:[{name:'Clipper 备份',extensions:['json','clipper']}]});return result.canceled?null:backupManager.chooseRestore(result.filePaths[0]);});
  handle('restore-preview',(token,password)=>backupManager.preview(token,password));handle('restore-commit',token=>backupManager.restore(token));
  handle('restore-cancel',token=>backupManager.cancelRestore(token));
  handle('ai-state',()=>aiService.state(),false);handle('ai-profile',async value=>{if(value?.id)id(value.id);const result=await aiService.save(value);broadcast();return result;});handle('ai-remove',value=>{aiService.remove(id(value));broadcast();});handle('ai-default',value=>{aiService.setDefault(id(value));broadcast();});
  handle('ai-models',(profile,request)=>aiService.models(id(profile),request),false);handle('ai-run',value=>aiService.run(value),false);handle('ai-cancel',value=>aiService.cancel(value),false);
  handle('scripts',()=>scriptService.list());handle('script-save',value=>{if(value?.id)id(value.id);const result=scriptService.save(value);broadcast();return result;});handle('script-remove',value=>{scriptService.remove(id(value));broadcast();});handle('script-run',value=>scriptService.run(value),false);handle('script-cancel',value=>scriptService.cancel(value),false);handle('script-backup',async mode=>{const result=await scriptService.backup(main,mode,protectDataFile);broadcast();return result;});
  handle('apply-text',async(value:TextApply)=>{if(!value||!['copy','save','replace'].includes(value.mode)||!['AI 处理','脚本处理'].includes(value.source))throw new Error('应用结果参数无效');const text=toolText(value.text,MAX_TOOL_OUTPUT);if(value.mode==='copy'){await copyPayload({text},false);return null;}if(value.mode==='save'){const clip=store.add({text},value.source);broadcast();return clip.id;}const clip=store.get(id(value.clipId));if(!clip.payload.text||value.expectedHash!==clip.hash)throw new Error('原记录已改变或不是文字，请另存结果');store.edit(clip.id,text,clip.tags);broadcast();return clip.id;});
  handle('integrations',()=>integrationService.state(),false);handle('integration-register',value=>integrationService.register(value));handle('external-resolve',async(value,accept)=>{const intent=integrationService.resolve(id(value),accept);if(!intent)return null;let clipId:string|undefined;if(intent.action==='copy')await copyPayload({text:intent.text},false);if(intent.action==='add'){clipId=store.add({text:intent.text},'URL 导入').id;broadcast();}return {...intent,clipId};});
  const addToShelf=(payload:Payload)=>{activeStore();if(store.shelf.length>=200)throw new Error('拖拽容器最多 200 项');const item=store.add(payload,payload.text?'拖入文字':'拖入文件',thumbnail(payload),undefined,false);store.batch([item.id],'shelf');broadcast();};
  const shelfItem=(value:unknown)=>{const key=id(value);if(!store.shelf.includes(key))throw new Error('项目已移出拖放窗口');return store.get(key);};
  const shelfHandle=(name:string,fn:(...args:any[])=>unknown)=>handle('shelf-'+name,fn,true,'shelf');
  shelfHandle('state',()=>({items:store.list().filter(c=>store.shelf.includes(c.id)),dark:dark(),onTop:desktop!.options.shelfOnTop}));
  shelfHandle('choose',async()=>{const payload=await chooseFiles(desktop!.shelf!);if(payload)addToShelf(payload);});
  shelfHandle('files',async paths=>addToShelf(await incomingFiles(paths)));
  shelfHandle('text',text=>{if(typeof text!=='string'||!text.trim())throw new Error('拖入文字不能为空');addToShelf({text});});
  shelfHandle('remove',value=>{const item=shelfItem(value);store.batch([item.id],'unshelf');broadcast();});
  shelfHandle('copy',(value,paste)=>{if(typeof paste!=='boolean')throw new Error('粘贴参数无效');return copyPayload(shelfItem(value).payload,paste);});
  shelfHandle('hide',()=>desktop!.shelf!.hide());shelfHandle('main',()=>show());
  shelfHandle('top',value=>{if(typeof value!=='boolean')throw new Error('置顶选项无效');desktop!.configure({...desktop!.options,shelfOnTop:value});});
  ipcMain.on('clipper:shelf-drag',(event,value)=>{if(secured||quitting||event.sender!==desktop?.shelf?.webContents||event.senderFrame!==event.sender.mainFrame||event.senderFrame.url!=='clipper://app/shelf.html')return;try{void background(startDrag(event.sender,shelfItem(value),()=>!secured&&!quitting&&!systemPaused)).catch(notice);}catch(e){notice(e);}});

  handle('batch',(values,action,tags=[])=>{store.batch(values,action,tags);broadcast();});
  handle('category',value=>{if(value?.id)id(value.id);store.saveCategory(value);broadcast();});handle('remove-category',value=>{store.removeCategory(id(value));broadcast();});
  handle('add-files',async()=>{const payload=await chooseFiles(main);if(payload)addToShelf(payload);});handle('drop-files',async(paths)=>addToShelf(await incomingFiles(paths)));
  handle('metadata',value=>{const item=store.get(id(value?.id)),epoch=sessionEpoch;return metadataService.read(item,value,()=>!secured&&!quitting&&!systemPaused&&epoch===sessionEpoch&&store.find(item.id)?.hash===item.hash);},false);
  handle('metadata-cancel',value=>metadataService.cancel(value),false);
  handle('content-info',async(value,readFiles)=>{if(typeof readFiles!=='boolean')throw new Error('信息请求无效');const epoch=sessionEpoch,item=store.get(id(value)),result=await contentInfo(item,readFiles);if(epoch!==sessionEpoch||secured)throw new Error('历史已锁定');return result;},false);
  handle('export-attachment',(value,index)=>{const item=store.get(id(value)),epoch=sessionEpoch;return exportAttachment(main,item,index,protectDataFile,()=>!secured&&!quitting&&!systemPaused&&epoch===sessionEpoch&&store.find(item.id)?.hash===item.hash);},false);
  handle('export-format',(value,name)=>{const item=store.get(id(value)),epoch=sessionEpoch;return exportFormat(main,item,name,protectDataFile,()=>!secured&&!quitting&&epoch===sessionEpoch&&store.find(item.id)?.hash===item.hash);},false);
  handle('image-open',value=>imageEditor.open(id(value)),false);
  handle('export-image',value=>exportImage(main,store.get(id(value)),protectDataFile));
  handle('ocr-status',ocrStatus,false);handle('ocr',(value,language)=>recognize(store.get(id(value)).payload,language),false);handle('cancel-ocr',cancelOcr,false);
  handle('save-ocr',(text)=>{const item=store.add({text},'OCR 识别');broadcast();return item.id;});
  handle('capture-windows',()=>captureService.captureWindows(),false);handle('screenshot-window',async token=>{if(scrollCapture?.active||recorder?.active)throw new Error('请先完成其他捕获');selection?.suspend();const payload=await captureService.takeWindow(token,windows());if(!payload)return null;const item=store.add(payload,'窗口截图',thumbnail(payload));broadcast();return item.id;});handle('scroll-open',()=>scrollCapture.open(),false);handle('screens',()=>captureService.screens(),false);handle('screenshot',async(mode,displayId)=>{if(scrollCapture?.active)throw new Error('请先完成长截图');if(recorder?.active)throw new Error('请先停止录制后再截图');selection?.suspend();const payload=await captureService.take(mode,displayId,windows());if(!payload)return null;const item=store.add(payload,'屏幕截图',thumbnail(payload));broadcast();return item.id;});
  ipcMain.on('clipper:drag',(event,value)=>{if(secured||quitting||!windows().some(w=>w.webContents===event.sender)||event.senderFrame!==event.sender.mainFrame||!event.senderFrame.url.startsWith('clipper://app/index.html'))return;try{void background(startDrag(event.sender,store.get(id(value)),()=>!secured&&!quitting&&!systemPaused)).catch(notice);}catch(e){notice(e);}});
  handle('record-shortcut',(active)=>{if(typeof active!=='boolean')throw new Error('录入状态无效');if(active){selection?.suspend();recordingShortcut=true;hotkeys.clear();globalShortcut.unregisterAll();}else endShortcutRecording();});
  handle('efficiency-state',()=>efficiency.state());handle('efficiency-configure',value=>saveEfficiency(()=>efficiency.save(validateEfficiency({...efficiency.options(),historyEnabled:value?.historyEnabled,repliesShortcut:value?.repliesShortcut}))));
  handle('remember-search',query=>efficiency.remember(query));handle('remove-search',query=>{efficiency.remove(query);broadcast();});
  handle('reply-intent',()=>systemPaused?null:efficiency.take());handle('resolve-reply',async(token,values)=>{if(values===null){efficiency.cancel(token);return;}if(repliesBlocked())throw new Error('快捷回复已取消');const pending=efficiency.resolve(token);await copyPayload(fillTemplate(pending.snippet.payload,values),true,false,pending.target);efficiency.cancel(token);});
  handle('search',(query,categoryId)=>{if(typeof query!=='string'||query.length>512)throw new Error('搜索内容过长');const category=categoryId?store.categories.find(c=>c.id===id(categoryId)):undefined;if(categoryId&&!category)throw new Error('分类已不存在');const terms=query.toLocaleLowerCase().trim().split(/\s+/);return store.all().filter(c=>{const text=[c.title,c.payload.text,...(c.payload.files||[]),...(c.payload.attachments?.map(a=>a.name)||[]),...c.tags,c.source].join('\n').toLocaleLowerCase();return terms.every(t=>text.includes(t))&&(!category||matchesCategory(c,category));}).map(c=>c.id);});
  handle('state',state);handle('detail',(value)=>store.get(id(value)));
  handle('action',(value,action:ClipAction)=>{const key=id(value),item=store.get(key);switch(action){
    case 'favorite':store.update(key,{favorite:!item.favorite});break;
    case 'pin':store.update(key,{pinned:!item.pinned});break;
    case 'delete':store.delete(key);break;
    case 'enqueue':if(store.queue.length>=200)throw new Error('堆栈最多 200 项');store.setQueue([...store.queue,key]);break;
    case 'dequeue':store.setQueue(store.queue.filter(i=>i!==key));break;
    case 'up':case 'down':{const q=[...store.queue],from=q.indexOf(key),to=from+(action==='up'?-1:1);if(from>=0&&to>=0&&to<q.length){[q[from],q[to]]=[q[to],q[from]];store.setQueue(q);}break;}
    case 'split':stack.split(key);break;
    default:throw new Error('操作无效');}broadcast();
  });
  handle('undo',()=>{store.undo();broadcast();});handle('edit',(value,text,tags)=>{if(typeof text!=='string')throw new Error('文字无效');store.edit(id(value),text,tags);broadcast();});
  handle('copy',(value,paste,plain=false)=>{if(typeof paste!=='boolean'||typeof plain!=='boolean')throw new Error('粘贴参数无效');return copyPayload(store.get(id(value)).payload,paste,plain);});
  handle('next',next);handle('clear-queue',()=>{store.setQueue([]);broadcast();});
  handle('snippet',value=>saveEfficiency(()=>{if(value?.id)id(value.id);const options=efficiency.options(),clip=value?.clipId?store.get(id(value.clipId)):undefined;const key=store.saveSnippet({id:value?.id,title:value?.title,text:value?.text,payload:clip?.payload},clip?.thumbnail);if(value?.shortcut!==undefined){options.bindings=options.bindings.filter(b=>b.id!==key);if(value.shortcut!=='')options.bindings.push({id:key,shortcut:value.shortcut});efficiency.save(options);}}));handle('remove-snippet',value=>saveEfficiency(()=>{const key=id(value),options=efficiency.options();store.removeSnippet(key);options.bindings=options.bindings.filter(b=>b.id!==key);efficiency.save(options);}));
  handle('snippet-detail',getSnippet);handle('use-snippet',(value,paste,values={})=>{if(typeof paste!=='boolean')throw new Error('参数无效');return copyPayload(fillTemplate(getSnippet(value).payload,values),paste);});
  handle('settings',(value)=>{const next=validateSettings(value),old=store.settings;try{registerHotkeys(next);if(!testing&&next.launchAtLogin!==old.launchAtLogin)app.setLoginItemSettings({openAtLogin:next.launchAtLogin});store.saveSettings(next);hotkeyError='';}catch(e){try{registerHotkeys(old);}catch{}throw e;}lastSequence=sequence();appearance();trayMenu();});
  handle('backup',mode=>mode==='export'?background(backup(mode)):enqueue(()=>backup(mode)),false);handle('clear',()=>{store.clear();broadcast();});handle('hide',()=>{for(const w of windows())w.hide();},false);handle('quit',()=>app.quit(),false);
}
async function poll(){if(secured||quitting)return;if(systemPaused){lastSequence=sequence();return;}if(vaultSetup){lastSequence=sequence();if(Date.now()>=vaultSetupExpires){storageManager.cancelEncryption();vaultSetup=false;}return;}const epoch=sessionEpoch,stackEpoch=stack.epoch;rememberTarget();const seq=sequence();if(seq===lastSequence)return;if(store.settings.paused){lastSequence=seq;return;}const source=owner()||foreground();if(source?.pid===process.pid||store.settings.excludedApps.includes((source?.name||'').toLowerCase())||privateClipboard()){lastSequence=seq;return;}
  try{const payload=await capture();if(secured||systemPaused||epoch!==sessionEpoch||sequence()!==seq)return;if(payload){const item=store.add(payload,source?.name||'未知应用',thumbnail(payload),undefined,false);status='';try{stack.capture(item,stackEpoch,source?.name||'未知应用');}catch(error){notice(error);trayMenu();}store.prune();syncService.capture(item);webService.capture(store.get(item.id));broadcast();}lastSequence=seq;}catch(e){if(/^(附件读取已取消|剪贴板已改变)$/.test(e instanceof Error?e.message:String(e)))return;if(/忙|正在|temporarily|busy/i.test(String(e)))return;lastSequence=seq;notice(e);}
}
async function activateStore(){
  storeOpen=true;secured=false;const epoch=++sessionEpoch;lastUnlock=Date.now();
  backupManager=new BackupManager(activeStore,storageManager.profileId,join(app.getPath('userData'),'backups'),localProtector,broadcast,thumbnail,(file,password)=>{activeStore();const key=storageManager.vault.copyKey();try{return exportInWorker(join(storageManager.directory,'history.sqlite'),file,password,undefined,undefined,key);}finally{key?.fill(0);}});
  webService=new WebShareService(activeStore,broadcast,enqueue,thumbnail,join(__dirname,'../web'),{...(testing?{addresses:()=>['127.0.0.1']}:{}),publicImage:png=>nativeImage.createFromBuffer(Buffer.from(png,'base64')).toPNG()});
  syncService=new SyncService(activeStore,localProtector,broadcast,enqueue,thumbnail,{...(testing?{bindHost:'127.0.0.1',discovery:false}:{}),afterMutation:(p,n)=>webService.observe(p,n)});await background(syncService.resume());if(secured||quitting||epoch!==sessionEpoch)return;
  if(!nativeAvailable())status='Windows 接口不可用：'+nativeError;
  aiService=new AIService(store);scriptService=new ScriptService(store);main=createWindow();trayPanel?.dispose();trayPanel=new TrayPanel({store:activeStore,blocked:()=>repliesBlocked()||vaultSetup,dark,target:trayTarget,validTarget:target=>windowInfo(target.hwnd)?.pid===target.pid,main:()=>show(),copy:(item,paste,target,valid)=>enqueue(async()=>{if(!valid())throw new Error('托盘操作已失效');await copyPayload(item.payload,paste,false,target,valid);}),drag:(window,item,valid)=>startDrag(window.webContents,item,valid)});desktop=new DesktopController({store:activeStore,blocked:()=>secured||quitting||changingStore||captureService.active||recorder?.active||scrollCapture?.active||recordingShortcut,quick:()=>quick??=createWindow(true),peekQuick:()=>quick,rememberTarget,dark,changed:broadcast,enqueue});selection=new SelectionService({store:activeStore,blocked:()=>secured||quitting||changingStore||systemPaused||captureService.active||recorder?.active||scrollCapture?.active||recordingShortcut,dark,changed:broadcast,show:()=>show(),notice,commit:(action,text,source,valid)=>enqueue(async()=>{if(!valid())throw new Error('选区已失效，请重新选择');if(action==='copy')await copyPayload({text},false);else{store.add({text},'划词 · '+source);broadcast();}})});integrationService=new IntegrationService(broadcast,()=>show(),notice);trayMenu();
  hotkeys.clear();globalShortcut.unregisterAll();try{hotkeyError=registerHotkeys(store.settings,undefined,undefined,undefined,false);}catch(e){hotkeyError=String((e as Error).message);}lastSequence=sequence();show();if(startupArgv.length){integrationService.receive(startupArgv);startupArgv=[];}
}
async function start(){
  Menu.setApplicationMenu(null);
  const renderer=resolve(__dirname,'../renderer');protocol.handle('clipper',request=>{const url=new URL(request.url),name=url.pathname.slice(1);if(url.host!=='app'||!['index.html','app.js','app.css','capture.html','capture.js','capture.css','recovery.html','recovery.js','recovery.css','unlock.html','unlock.js','unlock.css','tray.html','tray.js','tray.css','shelf.html','shelf.js','shelf.css','selection.html','selection.js','selection.css'].includes(name))return new Response('Not found',{status:404});return net.fetch(pathToFileURL(join(renderer,name)).toString());});
  session.defaultSession.setPermissionRequestHandler((_wc,_p,callback)=>callback(false));session.defaultSession.setPermissionCheckHandler(()=>false);
  initNative();await initTransfer();await clearOcrTemporary();tray=new Tray(nativeImage.createFromPath(join(__dirname,'../clipper.png')).resize({width:32,height:32}));tray.setToolTip('Clipper · 左键最近记录，右键菜单');tray.on('click',(_event,bounds)=>{if(secured)show();else trayPanel?.toggle(bounds);});trayMenu();
  const vault=new HistoryVault(localProtector,{available:helloAvailable,verify:async()=>{const w=unlockWindow||main;if(!w||w.isDestroyed())throw new Error('解锁窗口不可用');return helloVerify(w.getNativeWindowHandle().readBigUInt64LE());}});
  storageManager=new StorageManager(app.getPath('userData'),vault);
  const systemLock=()=>{systemPaused=true;sessionEpoch++;trayPanel?.close();stack.stop();if(!changingStore){trayMenu();broadcast();}efficiency.cancel();metadataService.dispose();cancelAttachments();disposeAttachments();lastSequence=sequence();imageEditor?.abort();captureService?.cancel();scrollCapture?.abort();if(recorder)background(recorder.abort());selection?.suspend();if(!secured&&vault.state().encrypted)lockHistory();else{if(secured){vault.lock();cancelHello();}if(webService)void background(webService.stop());}};
  powerMonitor.on('lock-screen',systemLock);powerMonitor.on('suspend',systemLock);powerMonitor.on('unlock-screen',()=>{systemPaused=false;lastSequence=sequence();});powerMonitor.on('resume',()=>{systemPaused=false;lastSequence=sequence();});
  try{store=await storageManager.start();}catch(error){store=error instanceof HistoryLockedError?await unlockStorage(storageManager,w=>unlockWindow=w,undefined,()=>!systemPaused&&!quitting):await recoverStorage(storageManager,error);}if(quitting){store.close();return;}
  if(systemPaused&&vault.state().encrypted){store.close();vault.lock();store=await unlockStorage(storageManager,w=>unlockWindow=w,undefined,()=>!systemPaused&&!quitting);}
  imageEditor=new ImageEditorService({blocked:()=>secured||quitting||systemPaused||changingStore,dark,get:id=>activeStore().get(id),protect:protectDataFile,background,commit:(id,hash,payload,mode,valid)=>enqueue(async()=>{if(!valid())throw new Error('图片编辑已取消');const source=store.get(id);if(source.hash!==hash)throw new Error('原图内容已改变，请重新打开图片');if(mode==='copy'){await copyPayload(payload,false);return 'copied';}const outputHash=createHash('sha256').update(JSON.stringify(payload)).digest('hex'),row=store.db.prepare('SELECT data FROM clips WHERE hash=?').get(outputHash) as any,existing=row?JSON.parse(row.data):undefined;if(source.localOnly&&existing?.shared)throw new Error('相同图片已共享，请先将该记录设为仅本机');const item=store.add(payload,'图片编辑',thumbnail(payload),{tags:source.tags},false);if(source.localOnly&&!item.localOnly){item.localOnly=true;store.save(item);}broadcast();return item.id;})});captureService=new CaptureService();recorder=new RecordingService({chooseRegion:displayId=>captureService.choose(displayId,windows(),'选定录制区域'),cancelRegion:()=>captureService.cancel(),blocked:()=>secured||quitting||systemPaused||changingStore||captureService.active||scrollCapture?.active,dark,prepare:()=>{selection?.suspend();},protect:protectDataFile,copy:(file,valid)=>enqueue(async()=>{if(!valid())throw new Error('录制已失效');const payload=await incomingFiles([file]);if(!valid())throw new Error('录制已失效');await copyPayload(payload,false);if(valid()){store.add(payload,'录屏与录音');broadcast();}}),windows,background});await recorder.init();scrollCapture=new ScrollCaptureService({capture:captureService,blocked:()=>secured||quitting||systemPaused||changingStore||recorder.active||captureService.active,dark,prepare:()=>selection?.suspend(),protect:protectDataFile,windows,background,copy:(png,valid)=>enqueue(async()=>{if(!valid())throw new Error('长截图已失效');const payload={png:png.toString('base64')};const thumb=thumbnail(payload);if(!valid())throw new Error('长截图已失效');store.add(payload,'长截图',thumb);broadcast();await copyPayload(payload,false);})});ipc();await activateStore();nativeTheme.on('updated',appearance);
  timer=setInterval(()=>{if(secured||quitting||!nativeAvailable()||polling)return;polling=true;void enqueue(poll).catch(notice).finally(()=>polling=false);},350);
  const scheduled=()=>{if(!quitting&&!secured)void background((async()=>{const previous=backupManager.status().lastAttempt;await backupManager.run();if(secured)return;const current=backupManager.status();if(current.lastAttempt!==previous&&current.lastError)notice('自动备份：'+current.lastError);})()).catch(notice);};backupTimer=setInterval(scheduled,60000);setTimeout(scheduled,1200);powerMonitor.on('resume',scheduled);
  const idleTimer=setInterval(()=>{const minutes=vault.state().idleMinutes;if(!secured&&vault.state().encrypted&&minutes>0&&Date.now()-lastUnlock>=minutes*60000&&powerMonitor.getSystemIdleTime()>=minutes*60)lockHistory();},1000);app.once('before-quit',()=>clearInterval(idleTimer));
}
if(!testing&&!app.requestSingleInstanceLock())app.quit();else{app.on('second-instance',(_event,argv)=>{show();if(!secured&&integrationService)integrationService.receive(argv);else if(argv.some(s=>/^clipper-win:/i.test(s)))startupArgv=argv;});app.whenReady().then(start).catch(e=>{if(!quitting)dialog.showErrorBox('Clipper 启动失败',String(e));app.quit();});}
app.on('before-quit',event=>{if(quitting)return;event.preventDefault();if((recorder?.hasUnsaved||scrollCapture?.hasUnsaved||imageEditor?.hasUnsaved)&&!quitRecordingConfirmed){if(!quitRecordingPrompt){quitRecordingPrompt=true;void dialog.showMessageBox({type:'question',message:'退出并放弃尚未保存的捕获内容和图片修改？',buttons:['返回','退出并放弃'],defaultId:0,cancelId:0}).then(result=>{if(result.response===1){quitRecordingConfirmed=true;app.quit();}else if(recorder?.active)void recorder.open();else if(scrollCapture?.hasUnsaved)void scrollCapture.open();else if(imageEditor?.window)imageEditor.window.show();else void recorder.open();}).catch(()=>{}).finally(()=>quitRecordingPrompt=false);}return;}desktop?.flushBounds();quitting=true;sessionEpoch++;clearInterval(timer);clearInterval(backupTimer);hotkeys.clear();globalShortcut.unregisterAll();selection?.dispose();selection=undefined;desktop?.dispose();desktop=undefined;stopTools(false);if(webService)background(webService.stop());if(syncService)background(syncService.stop());void serial.catch(()=>{}).then(async()=>{await webService?.stop();await syncService?.stop();return Promise.allSettled([...backgroundTasks]);}).then(()=>app.quit());});
app.on('will-quit',()=>{trayPanel?.dispose();imageEditor?.abort();void recorder?.dispose();scrollCapture?.dispose();disposeTransfer();if(storeOpen)store?.close();storageManager?.cancelEncryption();storageManager?.vault.lock();});app.on('window-all-closed',()=>{});
