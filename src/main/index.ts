import {QUICK_SHORTCUT,quickShortcut,quickRecent,rememberGlyph} from '../shared/quick-panel';
import referenceLinks from '../renderer/reference-data/reference-links.json';
import {AppIcons} from './app-icons';
import {configureLoginItem,isLoginStartup,manualLaunchArguments} from './login-item';
import {imageHostState,configureImageHost,testImageHost,formatImageHostLink,uploadOptions,uploadKey,imageUploadRecord,resolveImageUpload} from './image-host';
import {TaskCenter} from './tasks';
import {ChatService} from './chat';
import {ChatWindow} from './chat-window';
import {rendererAssetAllowed} from '../shared/renderer-assets';
import {development,developmentHidden,developmentMessage,installDevelopmentBridge,recoverDevelopmentRenderer} from './development';
import {ShortcutRecorder} from './shortcut-recorder';
import {WinVShortcut,type WinVTarget} from './win-v-shortcut';
import {CaptureWriter,CaptureCancelledError,heavyCapture} from './capture-writer';
import {Thumbnails} from './thumbnails';
import {PreviewImages} from './preview-images';
import {watchCollectionWindow,notifyCollectionWindow,flushCollectionWindow} from './collection-window';
import {HistorySearch} from './history-search';
import {fileAction} from './file-actions';
import {t as tr} from '../shared/i18n';
import {languageStore} from './language-bootstrap';
import {initLanguageService} from './language-service';
import {setInterfaceLanguage,interfaceLanguageArguments} from '../shared/i18n';
import {AppearanceService} from './appearance-service';
import {TrayPanel} from './tray-panel';
import {trayMenuTemplate} from './tray-menu';
import {TrayMenuPanel} from './tray-menu-panel';
import {StackService} from './stack';
import {EfficiencyService} from './efficiency';
import {HotkeyRegistry,type HotkeyBinding} from './hotkeys';
import {validateEfficiency,type EfficiencyOptions} from '../shared/efficiency';
import {MetadataService} from './metadata';
import {cancelAttachments,disposeAttachments} from './attachment-runtime';
import {contentInfo,exportFormat,exportAttachment} from './content-info';
import {DesktopController} from './desktop';
import {desktopDefaults,validateDesktop,type DesktopOptions} from '../shared/desktop';
import {WebShareService} from './web-share';
import { app, BrowserWindow, Menu, Tray, ipcMain, nativeTheme, nativeImage, globalShortcut, protocol, net, dialog, session, screen } from 'electron';
import { join, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, stat } from 'node:fs/promises';
import { Store } from './store';
import { capture, writePayload, thumbnail, prepareThumbnail, useThumbnails } from './clipboard';
import { initNative, nativeAvailable, nativeError, foreground, foregroundTarget, owner, sequence, privateClipboard, pasteTo, windowInfo, capturePasteTarget, type PasteTarget } from './native';
import {panelPlacement} from './panel-placement';
import { validateSettings,validateBackup } from '../shared/core';
import type { Settings, ClipAction, Payload, Detail } from '../shared/types';
import { fillTemplate, matchesCategory, templateVariables, builtins } from '../shared/advanced';
import { chooseFiles, incomingFiles, incomingImages, startDrag, exportImage, initTransfer, disposeTransfer,cancelTransfers } from './transfer';
import {AIService} from './ai';
import {ScriptService} from './scripts';
import {IntegrationService,MAX_EXTERNAL_PENDING} from './integrations';
import {toolText,MAX_TOOL_OUTPUT,MAX_EXTERNAL_URL_LENGTH,type TextApply} from '../shared/text-tools';
import {safeStorage,powerMonitor} from 'electron';
import {HistoryVault} from './history-vault';
import {unlockStorage} from './unlock-window';
import {helloAvailable,helloVerify,cancelHello} from './windows-hello';
import {StorageManager,HistoryLockedError} from './storage';
import {BackupManager} from './backups';
import {recoverStorage} from './recovery-window';
import {CheckpointRecovery} from './checkpoint-recovery';
import {cancelRecoveryJobs} from './recovery-jobs';
import {checkpointID} from '../shared/checkpoints';
import {exportInWorker,cancelBackupJobs} from './backup-jobs';
import {cancelBackupPreviews} from './backup-preview-job';
import {restoreBackupJob} from './backup-restore-job';
import {SyncService} from './sync-service';
import {UpdateService} from './updates';
import {installedClip,armUpdate,activeUpdate} from './update-host';
import {ProgramRollbackManager,programVersionContext} from './program-versions';
import {shell,Notification} from 'electron';
app.setName('Clip');
const testing=process.env.CLIP_TEST_MODE==='1';
const thumbnails=new Thumbnails(app.isPackaged?join(process.resourcesPath,'app.asar.unpacked/dist/native/ImageHost.exe'):join(__dirname,'../native/ImageHost.exe'));
useThumbnails(thumbnails);

protocol.registerSchemesAsPrivileged([{scheme:'clip-font',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}},{scheme:'clip',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
let appearanceService:AppearanceService;
let updateService:UpdateService;
let programRollback:ProgramRollbackManager|undefined;
let updateTimer:NodeJS.Timeout;
function updateAllowed(forRollback=false){return !secured&&!quitting&&!systemPaused&&!changingStore&&!vaultSetup&&(forRollback?!updateService?.installing:!programRollback?.installing);}
let store:Store,main:BrowserWindow,tray:Tray,quitting=false,status='',hotkeyError='',lastSequence=0,lastTarget=0,lastTargetPid=0,timer:NodeJS.Timeout,polling=false;
let serial:Promise<unknown>=Promise.resolve();
const backgroundTasks=new Set<Promise<unknown>>();
function background<T>(task:Promise<T>):Promise<T>{backgroundTasks.add(task);void task.then(()=>backgroundTasks.delete(task),()=>backgroundTasks.delete(task));return task;}
const shortcutRecorder=new ShortcutRecorder();
let recordingShortcut=false,changingStore=false;
let desktop:DesktopController|undefined;
let trayPanel:TrayPanel|undefined;let quickPanel:TrayPanel|undefined;
let trayMenuPanel:TrayMenuPanel|undefined;
let fallbackTrayMenu:Menu|undefined;
const metadataService=new MetadataService();
const stack=new StackService(activeStore);
const winVShortcut=new WinVShortcut(error=>{if(secured||quitting)return;hotkeys.clear();hotkeyError=registerHotkeys(store.settings,undefined,undefined,false);broadcast();notice(error);});
let winVTarget:WinVTarget|undefined;
const efficiency=new EfficiencyService(activeStore),hotkeys=new HotkeyRegistry({register:(key,callback)=>key==='Super+V'?winVShortcut.register(target=>{winVTarget=target;try{callback();}finally{winVTarget=undefined;}}):globalShortcut.register(key,callback),unregister:key=>key==='Super+V'?winVShortcut.unregister():globalShortcut.unregister(key)});let replyBusy=false;
let restartRequested=false;
function restartClip(){
 if(quitting||restartRequested)return;
 if(changingStore||vaultSetup||updateService?.installing||programRollback?.installing)throw new Error(tr('请先完成当前操作再重启 Clip'));
 restartRequested=true;setTimeout(()=>app.quit(),0);
}
let aiService:AIService,scriptService:ScriptService,integrationService:IntegrationService;
let chatService:ChatService,chatWindow:ChatWindow|undefined;
function initChat(){
 chatService=new ChatService(store,aiService,taskCenter,event=>chatWindow?.emit(event),background);
 if(!chatWindow)chatWindow=new ChatWindow({service:()=>chatService,store:activeStore,blocked:()=>secured||quitting||systemPaused||changingStore||vaultSetup||!!updateService?.installing||!!programRollback?.installing,dark,development,target:trayTarget,validTarget:target=>usablePasteTarget(target),copy:(text,paste,target)=>copyPayload({text},paste,false,target),saved:broadcast,main:()=>{show();main.webContents.send('clip:open-text-tools');},shortcutAvailable:()=>app.isReady()&&!developmentHidden&&!!store.meta('ai-chat-options',{shortcut:'Alt+Space'}).shortcut&&globalShortcut.isRegistered(store.meta('ai-chat-options',{shortcut:'Alt+Space'}).shortcut),configure:value=>{const previous=store.meta('ai-chat-options',{shortcut:'Alt+Space'});store.setMeta('ai-chat-options',value);try{if(value.shortcut!==previous.shortcut){registerHotkeys(store.settings);hotkeyError='';}}catch(error){store.setMeta('ai-chat-options',previous);registerHotkeys(store.settings,undefined,undefined,false);throw error;}broadcast();}});
}
let taskCenter:TaskCenter;
const textTaskRequests=new Map<string,string>();
const activeUploads=new Map<string,{id:string;promise:Promise<string>}>();
function startImageUpload(value:unknown,force:unknown=false){
 if(typeof force!=='boolean')throw new Error(tr('图片上传参数无效'));
 const source=activeStore(),item=source.get(id(value)),epoch=sessionEpoch,options=uploadOptions(source);
 if(!item.payload.png)throw new Error(tr('请选择 PNG 图片记录'));
 if(!options.enabled||!options.endpoint)throw new Error(tr('请先在设置中启用图片上传'));
 const key=uploadKey(options,item.payload.png),existing=activeUploads.get(key);if(existing)return existing;
 const clipboardSequence=sequence(),valid=()=>transferValid(item,epoch)&&store===source;
 const job=taskCenter.start({kind:'image-upload',title:item.title,recordId:item.id,recordHash:item.hash,retryable:true},async context=>{
  const result=await resolveImageUpload(source,item,options,force,{signal:context.signal,valid,phase:context.phase});
  context.result(result);let copied=false;
  if(valid()&&!context.signal.aborted&&sequence()===clipboardSequence){
   try{await copyPayload({text:formatImageHostLink(options,result.link)},false,false,undefined,()=>valid()&&!context.signal.aborted&&sequence()===clipboardSequence);copied=true;}catch{/* The uploaded link remains available in the task receipt. */}
  }
  context.result({...result,copied});return formatImageHostLink(options,result.link);
 },true);
 background(job.promise);const entry={id:job.id,promise:job.promise};activeUploads.set(key,entry);
 void job.promise.then(()=>{if(activeUploads.get(key)===entry)activeUploads.delete(key);},()=>{if(activeUploads.get(key)===entry)activeUploads.delete(key);});
 return entry;
}
let storageManager:StorageManager,backupManager:BackupManager,backupTimer:NodeJS.Timeout;
let checkpointRecovery:CheckpointRecovery;
let syncService:SyncService;
let webService:WebShareService;
const startupUrls:string[]=[];
let startupOverflow=false,startupTooLong=false;
function queueStartupExternal(argv:string[]){const url=argv.find(s=>/^clip-win:/i.test(s));if(!url)return;if(url.length>MAX_EXTERNAL_URL_LENGTH){startupTooLong=true;return;}if(startupUrls.length<MAX_EXTERNAL_PENDING)startupUrls.push(url);else startupOverflow=true;}
queueStartupExternal(process.argv);
let secured=true,storeOpen=false,startupPending=true,vaultSetup=false,sessionEpoch=0,lastUnlock=0,systemPaused=false,vaultSetupExpires=0;let unlockWindow:BrowserWindow|undefined;
let launchInTray=isLoginStartup(process.argv);
const localProtector={available:()=>safeStorage.isAsyncEncryptionAvailable(),encrypt:async(value:string)=>(await safeStorage.encryptStringAsync(value)).toString('base64'),decrypt:async(value:string)=>(await safeStorage.decryptStringAsync(Buffer.from(value,'base64'))).result};
function activeStore(){if(secured||!storeOpen)throw new Error(tr('历史已锁定'));return store;}
const historySearch=new HistorySearch(),categoryCountSearch=new HistorySearch(),categoryCountCache=new Map<number,{store:Store;signature:string;pending:Promise<Record<string,number>>}>(),previewImages=new PreviewImages(),captureWriter=new CaptureWriter();
function categoryCounts(caller:number){
 const source=activeStore(),epoch=sessionEpoch;if(!source.categories.length)return Promise.resolve({});
 const signature=JSON.stringify([source.db.prepare('SELECT total_changes() AS n').get(),source.db.prepare('PRAGMA data_version').get(),source.categories,new Date().toDateString()]);
 const cached=categoryCountCache.get(caller);if(cached?.store===source&&cached.signature===signature)return cached.pending;
 const pending=categoryCountSearch.counts(caller,join(storageManager.directory,'history.sqlite'),source.categories,storageManager.vault.copyKey(),()=>!secured&&!quitting&&!systemPaused&&!changingStore&&storeOpen&&epoch===sessionEpoch&&source===store&&windows().some(w=>w.webContents.id===caller)).then(counts=>{if(!Object.keys(counts).length&&categoryCountCache.get(caller)?.pending===pending)categoryCountCache.delete(caller);return counts;}).catch(error=>{if(categoryCountCache.get(caller)?.pending===pending)categoryCountCache.delete(caller);throw error;});
 categoryCountCache.set(caller,{store:source,signature,pending});return pending;
}
function previewSource(caller:number,id:string,snippet:boolean,version:string|number){const source=activeStore(),epoch=sessionEpoch;return {source:join(storageManager.directory,'history.sqlite'),id,snippet,key:()=>storageManager.vault.copyKey(),valid:()=>!secured&&!quitting&&!systemPaused&&!changingStore&&storeOpen&&epoch===sessionEpoch&&source===store&&windows().some(w=>w.webContents.id===caller)&&(snippet?store.snippetRevision(id)===version:store.matchesHash(id,version as string))};}
function preview(caller:number,id:string,snippet=false){const item=snippet?activeStore().snippetPreview(id):activeStore().preview(id),imageURL=item.payload.png?previewImages.register(caller,previewSource(caller,id,snippet,'revision'in item?item.revision:item.hash)):undefined;return {...item,...(imageURL?{imageURL}:{})};}

function stopTools(cancelBackups=true){chatService?.dispose();chatWindow?.destroy();taskCenter?.stop();activeUploads.clear();cancelTransfers();backupManager?.cancelPendingRestore();cancelBackupPreviews();background(captureWriter.stop());background(thumbnails.stop());previewImages.clear();void historySearch.cancel();void categoryCountSearch.cancel();categoryCountCache.clear();syncService?.cancelFileShares();programRollback?.cancel();cancelRecoveryJobs();trayPanel?.close();quickPanel?.close();if(trayPanel)background(trayPanel.stopSearch());if(quickPanel)background(quickPanel.stopSearch());stack.stop();efficiency.cancel();metadataService.dispose();cancelAttachments();cancelHello();if(cancelBackups)cancelBackupJobs();aiService?.dispose();scriptService?.dispose();}
async function switchStore(operation:()=>Promise<Store>){flushDesktopBounds();changingStore=true;winVShortcut.suspend(true);sessionEpoch++;try{stopTools();await trayPanel?.stopSearch();await quickPanel?.stopSearch();await captureWriter.stop();await thumbnails.stop();await previewImages.stop();await webService.stop();await syncService.stop();try{store=await operation();}finally{if(!secured){taskCenter=new TaskCenter(store,value=>{if(!secured&&!quitting&&main&&!main.isDestroyed())main.webContents.send('clip:tasks-changed',value);});aiService=new AIService(store);initChat();scriptService=new ScriptService(store);syncService.bindStore();await syncService.resume();}lastSequence=sequence();if(!secured){hotkeys.clear();const preparation=await prepareWinVShortcut();if(!secured&&!quitting)hotkeyError=[preparation,registerHotkeys(store.settings,undefined,undefined,false)].filter(Boolean).join('；');}broadcast();}}finally{changingStore=false;winVShortcut.suspend(secured||quitting||systemPaused);}}
function lockHistory(){if(secured)return;checkpointRecovery?.cancel();if(!storageManager.vault.state().encrypted)throw new Error(tr('请先启用历史加密'));const shortcuts=[store.settings.shortcut,changingStore?desktopDefaults.shelfShortcut:desktop?.options.shelfShortcut??desktopDefaults.shelfShortcut];flushDesktopBounds();secured=true;sessionEpoch++;recordingShortcut=false;background(shortcutRecorder.stop());background(winVShortcut.stop());hotkeys.clear();globalShortcut.unregisterAll();if(!developmentHidden)for(const key of shortcuts.filter(Boolean))globalShortcut.register(key,()=>show());stopTools();desktop?.dispose();desktop=undefined;for(const w of windows())w.destroy();trayMenu();
 void updateService?.stop();
 const closing=(async()=>{await Promise.all([webService.stop(),syncService.stop()]);await serial.catch(()=>{});await Promise.allSettled([...backgroundTasks]);stopTools();await Promise.all([webService.stop(),syncService.stop()]);backupManager.dispose();storageManager.cancelEncryption();vaultSetup=false;disposeTransfer();await previewImages.stop();try{store.close();}finally{storeOpen=false;storageManager.vault.lock();}aiService=undefined!;scriptService=undefined!;integrationService=undefined!;backupManager=undefined!;webService=undefined!;syncService=undefined!;status='';lastTarget=0;lastTargetPid=0;})();
 void unlockStorage(storageManager,w=>unlockWindow=w,closing,()=>!systemPaused&&!quitting).then(async next=>{store=next;if(quitting){next.close();storageManager.vault.lock();return;}await activateStore();}).catch(e=>{if(!quitting){dialog.showErrorBox(tr('Clip 解锁失败'),String(e));app.quit();}});
}
async function endShortcutRecording(){if(recordingShortcut){recordingShortcut=false;await shortcutRecorder.stop();if(recordingShortcut||secured||quitting)return;try{hotkeyError=registerHotkeys(store.settings,undefined,undefined,false);}catch(e){hotkeyError=String((e as Error).message);}broadcast();}}
function flushDesktopBounds(){const original=store,persist=(key:string,bounds:object)=>{const save=()=>original.setMeta(key,bounds);if(backupManager?.restoringBackup)background(serial.catch(()=>{}).then(save));else save();};desktop?.flushBounds(bounds=>persist('desktop-shelf-bounds',bounds));chatWindow?.flushBounds(bounds=>persist('ai-chat-bounds',bounds));}
function enqueue<T>(work:()=>Promise<T>|T):Promise<T>{const epoch=sessionEpoch;const task=serial.catch(()=>{}).then(()=>{if(secured||quitting||epoch!==sessionEpoch)throw new Error(tr('历史已锁定或正在退出'));return work();});serial=task;return task;}
function transferValid(item:Detail,epoch:number){return !secured&&!quitting&&!systemPaused&&!changingStore&&storeOpen&&epoch===sessionEpoch&&store.matchesHash(item.id,item.hash);}
const windows=()=>[main,trayPanel?.window,quickPanel?.window,quickPanel?.previewWindow,desktop?.shelf,chatWindow?.window].filter((w):w is BrowserWindow=>!!w&&!w.isDestroyed());
function notice(e:unknown){if(secured||quitting)return;status=String(e instanceof Error?e.message:e);for(const w of windows())w.webContents.send('clip:notice',status);broadcast();}
function broadcast(){if(secured||quitting)return;webService?.reconcile();for(const w of windows())if(w!==trayPanel?.window&&w!==quickPanel?.window)notifyCollectionWindow(w);trayPanel?.changed();quickPanel?.changed();chatWindow?.emit({type:'changed'});}
function dark(){return store.settings.theme==='dark'||store.settings.theme==='system'&&nativeTheme.shouldUseDarkColors;}
function appearance(){if(secured||quitting)return;for(const w of windows()){w.setBackgroundColor(dark()?'#181818':'#ffffff');}broadcast();}
const appIcons=new AppIcons(()=>activeStore(),join(app.getPath('userData'),'source-icons'));
function state(){const bindings=new Map(efficiency.options().bindings.map(b=>[b.id,b.shortcut]));return {interceptWinV:store.meta('quick-panel-intercept-win-v',false)===true,quickShortcut:store.meta('quick-panel-shortcut',QUICK_SHORTCUT),chatShortcut:store.meta('ai-chat-options',{shortcut:'Alt+Space'}).shortcut,services:{sync:syncService?.summary()||'off',web:webService?.running||false},stack:stack.state(),clips:store.cachedList(),snippets:store.snippetList().map(s=>({...s,shortcut:bindings.get(s.id)||''})),favoriteOrder:store.favoriteOrder(),queue:store.queue,shelf:store.shelf,categories:store.categories,settings:store.settings,desktop:desktop?.options||desktopDefaults,dark:dark(),native:nativeAvailable(),status,hotkeyError,bytes:store.bytes()};}
let lastPasteTarget:PasteTarget|undefined;
const windowHandle=(w:BrowserWindow|undefined)=>w&&!w.isDestroyed()?Number(w.getNativeWindowHandle().readBigUInt64LE()):0;
function usablePasteTarget(target:PasteTarget|undefined){if(!target)return false;const info=windowInfo(target.hwnd);return info?.pid===target.pid&&(target.pid!==process.pid||[windowHandle(main),windowHandle(chatWindow?.window)].includes(target.hwnd));}
function rememberTarget(){const f=foregroundTarget();if(f&&f.pid!==process.pid&&usablePasteTarget(f)){lastTarget=f.hwnd;lastTargetPid=f.pid;lastPasteTarget=capturePasteTarget(f.hwnd);}}
function trayTarget(){
 if(winVTarget){const target=capturePasteTarget(winVTarget.hwnd);if(target?.pid===winVTarget.pid&&usablePasteTarget(target))return target;}
 const current=foregroundTarget();if(current&&usablePasteTarget(current))return capturePasteTarget(current.hwnd);
 rememberTarget();return lastPasteTarget?.hwnd===lastTarget&&lastPasteTarget.pid===lastTargetPid&&usablePasteTarget(lastPasteTarget)?lastPasteTarget:undefined;
}
function createWindow(){const w=new BrowserWindow({width:1180,height:780,minWidth:860,minHeight:600,show:false,title:development?'Clip · Dev':'Clip',icon:join(__dirname,'../clip.png'),titleBarStyle:'hidden',titleBarOverlay:false,frame:true,thickFrame:true,hasShadow:true,backgroundColor:dark()?'#181818':'#ffffff',autoHideMenuBar:true,skipTaskbar:false,resizable:true,webPreferences:{additionalArguments:interfaceLanguageArguments(),preload:join(__dirname,'../preload/index.cjs'),backgroundThrottling:!developmentHidden,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  if(development){const title='Clip · Dev';w.webContents.on('page-title-updated',event=>{event.preventDefault();w.setTitle(title);});w.webContents.on('did-finish-load',()=>w.setTitle(title));}
  w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());w.webContents.on('will-attach-webview',e=>e.preventDefault());
  recoverDevelopmentRenderer(w);
  w.on('close',e=>{if(!quitting){e.preventDefault();w.hide();}});w.on('hide',()=>{store.dropListCache();endShortcutRecording();});w.on('blur',endShortcutRecording);w.webContents.on('did-start-loading',endShortcutRecording);
  const caller=w.webContents.id;watchCollectionWindow(w,()=>{void historySearch.cancel(caller);void categoryCountSearch.cancel(caller);categoryCountCache.delete(caller);previewImages.clear(caller);});w.webContents.on('destroyed',()=>previewImages.clear(caller));void w.loadURL('clip://app/index.html');return w;
}
function show(){if(developmentHidden)return;launchInTray=false;if(secured){if(unlockWindow&&!unlockWindow.isDestroyed()){unlockWindow.show();unlockWindow.focus();}return;}rememberTarget();const w=main;if(!w||w.isDestroyed())return;const wasVisible=w.isVisible()&&!w.isMinimized();if(w.isMinimized())w.restore();if(w.webContents.isLoading())w.webContents.once('did-finish-load',()=>{w.show();w.focus();});else{w.show();w.focus();}if(wasVisible)notifyCollectionWindow(w);else flushCollectionWindow(w);}
async function copyPayload(payload:Payload,paste:boolean,plain=false,fixedTarget?:PasteTarget,stillValid:()=>boolean=()=>true){const epoch=sessionEpoch,targetInfo=paste?fixedTarget??trayTarget():fixedTarget;if(paste&&!targetInfo)throw new Error(tr('请先切换到需要粘贴的应用'));if(!targetInfo)rememberTarget();const target=targetInfo?.hwnd??lastTarget,valid=()=>stillValid()&&!secured&&!quitting&&!systemPaused&&epoch===sessionEpoch&&(!targetInfo||usablePasteTarget(targetInfo));if(!valid())throw new Error(tr('目标窗口或会话已改变'));await writePayload(payload,Number(main.getNativeWindowHandle().readBigUInt64LE()),plain,valid);lastSequence=sequence();if(paste){try{await pasteTo(target,valid,()=>{for(const w of windows())if(windowHandle(w)!==target)w.hide();},targetInfo?.focus);}catch(e){show();if(fixedTarget&&trayPanel?.window&&!trayPanel.window.isVisible())notice(e);throw e;}}}
async function next(){const id=store.queue[0];if(!id)throw new Error(tr('堆栈为空'));await copyPayload(store.get(id).payload,true);store.setQueue(store.queue.slice(1));broadcast();}
function getSnippet(value:unknown){return store.snippet(id(value));}
function panelsBlocked(){return updateService?.installing||programRollback?.installing||secured||quitting||systemPaused||changingStore||recordingShortcut;}
function repliesBlocked(){return panelsBlocked();}
function openReplies(){if(panelsBlocked())return;if(!efficiency.active)efficiency.browse();show();}
function triggerReply(value:string){if(panelsBlocked()||replyBusy)return;if(efficiency.active){show();notice(tr('请先完成或取消当前快捷回复'));return;}const target=trayTarget();if(!target){notice(tr('请先切换到需要粘贴的应用'));return;}replyBusy=true;const epoch=sessionEpoch;
 void enqueue(async()=>{if(panelsBlocked()||epoch!==sessionEpoch)return;const snippet=getSnippet(value);if(templateVariables(snippet.text).some(v=>!builtins.includes(v))){efficiency.fill(snippet,target);show();}else await copyPayload(fillTemplate(snippet.payload,{}),true,false,target);}).catch(notice).finally(()=>replyBusy=false);
}
function registerHotkeys(s:Settings,d:DesktopOptions=desktop?.options||desktopDefaults,e:EfficiencyOptions=efficiency.options(),strict=true){
 if(!app.isReady()||developmentHidden)return '';
 const bindings:HotkeyBinding[]=[[store.meta('quick-panel-shortcut',QUICK_SHORTCUT),()=>{trayPanel?.close();quickPanel?.toggle();}],[s.shortcut,()=>show()],[s.nextShortcut,()=>void enqueue(next).catch(notice)],[d.shelfShortcut,()=>desktop?.showShelf()],[store.meta('ai-chat-options',{shortcut:'Alt+Space'}).shortcut,()=>chatWindow?.toggle(),'chat']];
 if(bindings[0][0]&&store.meta('quick-panel-intercept-win-v',false)===true&&quickShortcut(bindings[0][0])!=='Super+V')bindings.push(['Super+V',bindings[0][1]]);
 if(e.repliesShortcut)bindings.push([e.repliesShortcut,openReplies]);for(const b of e.bindings)bindings.push([b.shortcut,()=>triggerReply(b.id)]);return hotkeys.replace(bindings,strict);
}
function needsWinV(){return store.meta('quick-panel-intercept-win-v',false)===true||quickShortcut(store.meta('quick-panel-shortcut',QUICK_SHORTCUT))==='Super+V';}
async function prepareWinVShortcut(){if(developmentHidden||!needsWinV()){await winVShortcut.stop();return '';}try{await winVShortcut.prepare();return '';}catch(error){return (error as Error).message;}}
function saveEfficiency(change:()=>void){const previous=efficiency.options();store.db.exec('SAVEPOINT efficiency_change');try{change();registerHotkeys(store.settings);store.db.exec('RELEASE efficiency_change');hotkeyError='';}catch(e){store.db.exec('ROLLBACK TO efficiency_change; RELEASE efficiency_change');try{hotkeyError=registerHotkeys(store.settings,undefined,previous,false);}catch{}throw e;}broadcast();}

function setStackRunning(value:unknown){if(typeof value!=='boolean')throw new Error(tr('自动入栈状态无效'));if(value){if(store.settings.paused||repliesBlocked()||vaultSetup)throw new Error(tr('请先恢复记录并完成当前操作'));lastSequence=sequence();stack.start();}else stack.stop();if(!changingStore){trayMenu();broadcast();}}
function trayClick(bounds:Electron.Rectangle){trayMenuPanel?.close();if(secured||startupPending){show();return;}const action=store.settings.trayClickAction||'open';if(action==='recent'){quickPanel?.close();trayPanel?.toggle(bounds);return;}trayPanel?.close();if(action==='quick'){quickPanel?.toggle();return;}quickPanel?.close();if(action==='replies')openReplies();else if(action==='shelf')desktop?.showShelf();else show();}
function trayMenu(){if(!tray)return;const menuState={initializing:startupPending,secured,stackActive:!secured&&stack.active,paused:!secured&&store.settings.paused,encrypted:!secured&&storageManager.vault.state().encrypted,launchAtLogin:!secured&&store.settings.launchAtLogin};const actions={
  recent:()=>trayPanel?.open(tray.getBounds()),open:()=>show(),replies:openReplies,chat:()=>chatWindow?.open(),shelf:()=>desktop?.showShelf(),
 stack:()=>stack.active?setStackRunning(false):enqueue(()=>setStackRunning(true)).catch(notice),
 pause:()=>{stack.stop();cancelAttachments();return enqueue(()=>{store.saveSettings({...store.settings,paused:!store.settings.paused});lastSequence=sequence();trayMenu();broadcast();}).catch(notice);},
 lock:()=>lockHistory(),startup:()=>enqueue(()=>{const next=validateSettings({...store.settings,launchAtLogin:!store.settings.launchAtLogin});if(!testing&&!development&&app.isPackaged)configureLoginItem(app,next.launchAtLogin);store.saveSettings(next);trayMenu();broadcast();}).catch(notice),restart:restartClip,quit:()=>app.quit()
};trayMenuPanel?.configure(menuState,actions);fallbackTrayMenu=Menu.buildFromTemplate(trayMenuTemplate(menuState,actions));}
function id(v:unknown):string{if(typeof v!=='string'||! /^[0-9a-f-]{36}$/.test(v))throw new Error(tr('项目编号无效'));return v;}
function handle(name:string,fn:(...args:any[])=>unknown,serialized=true,scope:'main'|'shelf'|'tray'|'quick'='main'){ipcMain.handle('clip:'+name,(event,...args)=>{
  if(quitting||secured)throw new Error(tr('历史已锁定或正在退出，请先解锁'));if(updateService?.installing&&name!=='update-state')throw new Error('UPDATE_BUSY');if(programRollback?.installing&&!['update-state','vault-lock'].includes(name))throw new Error(tr('正在准备程序回退'));
  const w=windows().find(w=>w.webContents===event.sender);if(!w||event.senderFrame!==event.sender.mainFrame||(scope==='quick'?(w!==quickPanel?.window||event.senderFrame.url!=='clip://app/quick.html'):scope==='tray'?(w!==trayPanel?.window||event.senderFrame.url!=='clip://app/tray.html'):scope==='shelf'?(w!==desktop?.shelf||event.senderFrame.url!=='clip://app/shelf.html'):!event.senderFrame.url.startsWith('clip://app/index.html')))throw new Error(tr('拒绝访问'));
  if(name==='language-reload')return fn(w);if(name==='category-counts')return background(Promise.resolve().then(()=>{activeStore();return fn(w.webContents.id);}));if(['preview','snippet-preview','preview-release'].includes(name))return background(Promise.resolve().then(()=>{activeStore();return fn(args[0],w.webContents.id);}));if(name==='search')return background(Promise.resolve().then(()=>{activeStore();return fn(args[0],args[1],w.webContents.id);}));if(name==='vault-lock')return fn(...args);if(name==='stack-running'&&args[0]===false)return fn(...args);if(name==='settings'){const next=validateSettings(args[0]);if(next.paused||JSON.stringify(next.excludedApps)!==JSON.stringify(store.settings.excludedApps)){stack.stop();cancelAttachments();}}return background(serialized?enqueue(()=>fn(...args)):Promise.resolve().then(()=>{activeStore();return fn(...args);}));
});}
async function backup(mode:unknown){if(mode==='export'){
  const result=await dialog.showSaveDialog(main,{title:tr('导出 Clip 备份'),defaultPath:`Clip-${new Date().toISOString().slice(0,10)}.json`,filters:[{name:tr('Clip 备份'),extensions:['json']}]});if(result.canceled||!result.filePath)return null;
  protectDataFile(result.filePath);
  return backupManager.export(result.filePath);
}if(mode==='import'){
  const result=await dialog.showOpenDialog(main,{title:tr('导入 Clip 备份'),properties:['openFile'],filters:[{name:tr('Clip 备份'),extensions:['json']}]});if(result.canceled)return null;
  const manager=backupManager,epoch=sessionEpoch,valid=()=>!secured&&!quitting&&!systemPaused&&!changingStore&&epoch===sessionEpoch&&manager===backupManager;if(!valid())throw new Error(tr('历史已锁定'));const choice=await manager.chooseRestore(result.filePaths[0]);await manager.preview(choice.token);if(!valid()){manager.cancelRestore(choice.token);throw new Error(tr('历史已锁定'));}const count=await manager.restore(choice.token);return tr`已合并 ${count} 条记录`;
}throw new Error(tr('备份操作无效'));}
function protectDataFile(file:string){if(/^Clip-auto-/i.test(basename(file)))throw new Error(tr('此文件名保留给自动备份，请选择其他名称'));const target=resolve(file).toLowerCase();for(const name of ['program-versions','rollback-actions']){const root=resolve(storageManager.defaultDirectory,name).toLowerCase();if(target===root||target.startsWith(root+'\\'))throw new Error(tr('不能覆盖程序回退文件，请选择其他位置'));}const checkpointRoot=resolve(storageManager.checkpoints.root).toLowerCase();if(target===checkpointRoot||target.startsWith(checkpointRoot+'\\'))throw new Error(tr('不能覆盖升级恢复点，请选择其他位置'));if(['appearance.json','language.json'].some(name=>target===resolve(app.getPath('userData'),name).toLowerCase()))throw new Error(tr('此文件用于保存界面设置，请选择其他文件名'));for(const root of [storageManager.directory,storageManager.defaultDirectory,storageManager.previousDirectory].filter(Boolean))for(const name of ['history.sqlite','history.sqlite-wal','history.sqlite-shm','storage-location.json','history-vault.json','plaintext-predecessor.json'])if(target===resolve(root,name).toLowerCase())throw new Error(tr('备份不能覆盖数据库或存储位置配置，请选择其他文件名'));}
function ipc(){
  const referenceUrls=new Set([...referenceLinks,'https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt','https://www.unicode.org/Public/UCD/latest/ucd/UnicodeData.txt','https://html.spec.whatwg.org/entities.json','https://www.w3.org/TR/css-color-4/#named-colors','https://www.iana.org/assignments/media-types/','https://www.rfc-editor.org/rfc/rfc20','https://git-scm.com/docs','https://www.latex-project.org/help/documentation/','https://www.gnu.org/software/bash/manual/bash.html','https://man7.org/linux/man-pages/','https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions/Cheatsheet']);

  handle('restart',restartClip,false);
  handle('reference-open',(url:unknown)=>{if(typeof url!=='string'||!referenceUrls.has(url))throw new Error('Invalid reference URL');return shell.openExternal(url);},false);
  handle('update-state',()=>updateService.state(),false);handle('update-configure',value=>updateService.configure(value),false);handle('update-check',()=>updateService.check(),false);handle('update-download',()=>updateService.download(),false);handle('update-cancel',()=>updateService.cancel(),false);handle('update-show',()=>updateService.showDownload(),false);
  handle('update-install',async()=>{const epoch=sessionEpoch,state=updateService.state();let checkpoint:{id:string;profileId:string}|undefined;if(state.phase==='ready'&&state.installed&&state.release&&updateAllowed())checkpoint=await backupManager.exclusive(()=>storageManager.checkpoint('update',state.release!.version,()=>updateAllowed()&&sessionEpoch===epoch));await updateService.install(()=>updateAllowed()&&sessionEpoch===epoch,checkpoint);setTimeout(()=>app.quit(),0);return updateService.state();});
  handle('program-version-list',()=>programRollback!.list());
  handle('program-version-delete',value=>backupManager.exclusive(()=>programRollback!.remove(value)));
  handle('program-version-choose',value=>programRollback!.choose(value));
  handle('program-version-preview',(token,password,newPassword,mode)=>programRollback!.preview(token,password,newPassword,mode));
  handle('program-version-cancel',()=>programRollback!.cancel());
  handle('program-version-commit',(token,proof)=>backupManager.exclusive(async()=>{const epoch=sessionEpoch;if(!updateAllowed(true))throw new Error(tr('请先完成资料操作'));await programRollback!.commit(token,proof,()=>updateAllowed(true)&&sessionEpoch===epoch);setTimeout(()=>app.quit(),0);}));
  handle('app-icons',names=>appIcons.get(names),false);
  handle('language-reload',(window:BrowserWindow)=>{setTimeout(()=>{if(!window.isDestroyed())window.webContents.reload();},0);},false);
  handle('language-save',async value=>{const result=await languageStore.save(value);setInterfaceLanguage(result.current);process.env.CLIP_UI_LANGUAGE=result.current;trayMenu();return result;});
  handle('appearance-save',value=>appearanceService.save(value));
  handle('chat-shortcut',value=>chatWindow?.configure({shortcut:value}));
  handle('chat-open',async value=>{if(value!==undefined)await chatService.state(id(value));chatWindow?.open();},false);
  handle('tray-open',()=>{if(secured){show();return;}trayPanel?.open(tray.getBounds());},false);

  handle('quick-open',()=>{trayPanel?.close();quickPanel?.open();},false);
  handle('quick-shortcut',async value=>{
   const next=quickShortcut(value),previous=store.meta('quick-panel-shortcut',QUICK_SHORTCUT),intercept=store.meta('quick-panel-intercept-win-v',false)===true,epoch=sessionEpoch,previousNeeds=needsWinV();
   try{
    if(!developmentHidden&&(next==='Super+V'||!!next&&intercept))await winVShortcut.prepare();
    if(secured||quitting||systemPaused||changingStore||epoch!==sessionEpoch)throw new Error(tr('操作已失效，请重试'));
    store.setMeta('quick-panel-shortcut',next);if(!next)store.setMeta('quick-panel-intercept-win-v',false);
    registerHotkeys(store.settings);hotkeyError='';if(!needsWinV())await winVShortcut.stop();
   }catch(error){
    if(epoch===sessionEpoch&&!secured&&!quitting){store.setMeta('quick-panel-shortcut',previous);store.setMeta('quick-panel-intercept-win-v',intercept);hotkeyError=registerHotkeys(store.settings,undefined,undefined,false);}
    if(!previousNeeds)await winVShortcut.stop();throw error;
   }broadcast();
  });
  handle('quick-intercept-win-v',async value=>{
   if(typeof value!=='boolean')throw new Error(tr('Win+V 拦截选项无效'));
   const previous=store.meta('quick-panel-intercept-win-v',false)===true,epoch=sessionEpoch,previousNeeds=needsWinV();
   try{
    if(!developmentHidden&&(value||quickShortcut(store.meta('quick-panel-shortcut',QUICK_SHORTCUT))==='Super+V'))await winVShortcut.prepare();
    if(secured||quitting||systemPaused||changingStore||epoch!==sessionEpoch)throw new Error(tr('操作已失效，请重试'));
    store.setMeta('quick-panel-intercept-win-v',value);registerHotkeys(store.settings);hotkeyError='';if(!needsWinV())await winVShortcut.stop();
   }catch(error){
    if(epoch===sessionEpoch&&!secured&&!quitting){store.setMeta('quick-panel-intercept-win-v',previous);hotkeyError=registerHotkeys(store.settings,undefined,undefined,false);}
    if(!previousNeeds)await winVShortcut.stop();throw error;
   }broadcast();
  });
  handle('quick-focus',()=>quickPanel!.focus(),false,'quick');
  handle('quick-state',async query=>{await store.waitForUndo();return {...await quickPanel!.state(query),recent:quickRecent(store.meta('quick-panel-recent',[])),hoverPreview:desktop!.options.quickHoverPreview};},false,'quick');
  handle('quick-hover',(token,rect,immediate)=>quickPanel!.hover(token,rect,immediate),false,'quick');handle('quick-preview',token=>quickPanel!.preview(token),false,'quick');handle('quick-use',(token,paste)=>quickPanel!.use(token,paste),false,'quick');
  handle('quick-text',(value,paste)=>quickPanel!.text(value,paste),false,'quick');handle('quick-action',(token,action)=>quickPanel!.action(token,action),false,'quick');
  handle('quick-create-reply',value=>quickPanel!.createReply(value),false,'quick');handle('quick-move',()=>quickPanel!.move(),false,'quick');handle('quick-clear',()=>quickPanel!.clear(),false,'quick');handle('quick-replies',text=>quickPanel!.replyState(text),false,'quick');handle('quick-reply',(token,paste,values)=>quickPanel!.reply(token,paste,values),false,'quick');
  handle('quick-app-icons',names=>appIcons.get(names),false,'quick');handle('quick-hide',()=>quickPanel!.close(),false,'quick');handle('quick-main',()=>quickPanel!.main(),false,'quick');
  handle('tray-app-icons',names=>appIcons.get(names),false,'tray');
  handle('tray-state',async query=>{await store.waitForUndo();return trayPanel!.state(query);},false,'tray');handle('tray-preview',token=>trayPanel!.preview(token),false,'tray');handle('tray-use',(token,paste)=>trayPanel!.use(token,paste),false,'tray');handle('tray-hide',()=>trayPanel!.close(),false,'tray');handle('tray-main',()=>trayPanel!.main(),false,'tray');
  ipcMain.on('clip:tray-drag',(event,token)=>{if(secured||quitting||event.sender!==trayPanel?.window?.webContents||event.senderFrame!==event.sender.mainFrame||event.senderFrame.url!=='clip://app/tray.html')return;void background(trayPanel!.drag(token)).catch(notice);});
  handle('stack-state',()=>stack.state());handle('stack-configure',value=>{stack.configure(value);broadcast();});handle('stack-running',setStackRunning);handle('stack-preview',order=>stack.preview(order));handle('stack-commit',token=>{const added=stack.commit(token);broadcast();return added;});handle('stack-cancel',()=>stack.cancel());handle('stack-reverse',()=>{stack.reverse();broadcast();});

  handle('desktop-state',()=>desktop!.state());
  handle('desktop-configure',value=>{const previous=desktop!.options,next=validateDesktop(value);try{registerHotkeys(store.settings,next);desktop!.configure(next);hotkeyError='';}catch(e){try{registerHotkeys(store.settings,previous);}catch{}throw e;}});
  handle('desktop-shelf',()=>desktop!.showShelf());

  handle('vault-state',async()=>({...storageManager.vault.state(),helloAvailable:await helloAvailable(),plaintextDirectory:(await storageManager.predecessor())?.directory||''}));
  handle('vault-prepare',async password=>{vaultSetup=true;vaultSetupExpires=Date.now()+600000;lastSequence=sequence();try{return await storageManager.prepareEncryption(password);}catch(e){vaultSetup=false;throw e;}});
  handle('vault-cancel',()=>{storageManager.cancelEncryption();vaultSetup=false;lastSequence=sequence();});
  handle('vault-encrypt',(token,proof)=>backupManager.exclusive(async()=>{try{await switchStore(()=>storageManager.encrypt(token,proof));lastUnlock=Date.now();trayMenu();}finally{vaultSetup=false;lastSequence=sequence();}}));
  handle('vault-decrypt',()=>backupManager.exclusive(async()=>{await switchStore(()=>storageManager.decrypt());trayMenu();}));
  handle('vault-cleanup',()=>backupManager.exclusive(()=>storageManager.removePredecessor()));
  handle('vault-password',password=>storageManager.vault.changePassword(password));handle('vault-configure',(hello,idle)=>storageManager.vault.configure(hello,idle));handle('vault-lock',lockHistory,false);
  handle('web-state',()=>webService.state(),false);handle('web-start',value=>webService.start(value));handle('web-stop',()=>webService.stop());handle('web-invite',()=>webService.invite());handle('web-copy-invite',()=>{const invitation=webService.state();if(!invitation.running||!invitation.invitation||invitation.inviteExpires<=Date.now())throw new Error(tr('邀请已失效，请生成新邀请'));return copyPayload({text:invitation.invitation},false,false,undefined,()=>{const current=webService.state();return current.running&&current.invitation===invitation.invitation&&current.inviteExpires>Date.now();});});handle('web-approve',(value,accept,allowSend)=>webService.approve(id(value),accept,allowSend));handle('web-revoke',value=>webService.revoke(id(value)));handle('web-publish',value=>webService.publish(id(value)));handle('web-remove',value=>webService.remove(id(value)));handle('web-follow',value=>webService.setFollow(value));
  handle('sync-state',()=>syncService.state(),false);handle('sync-configure',value=>syncService.configure(value));handle('sync-invite',host=>syncService.invite(host));handle('sync-join',code=>background(syncService.join(code)),false);handle('sync-approve',(value,accept)=>syncService.approve(id(value),accept));handle('sync-cancel',()=>background(syncService.cancelPairing()),false);handle('sync-revoke',value=>syncService.revoke(id(value)));handle('sync-now',()=>background(syncService.tick()),false);handle('sync-share',value=>background(syncService.share(id(value))),false);handle('sync-local',(value,only)=>syncService.local(id(value),only));
  handle('data-state',async()=>({directory:storageManager.directory,defaultDirectory:storageManager.defaultDirectory,databaseBytes:await storageManager.bytes(),previousDirectory:storageManager.previousDirectory,backup:backupManager.status(),entries:await backupManager.entries()}));
  handle('checkpoint-list',()=>storageManager.checkpoints.list(storageManager.profileId));
  handle('checkpoint-create',()=>backupManager.exclusive(async()=>{const epoch=sessionEpoch;await storageManager.checkpoint('manual',undefined,()=>sessionEpoch===epoch&&!secured&&!quitting&&!systemPaused);}));
  handle('checkpoint-delete',value=>{if(!checkpointID(value))throw new Error(tr('恢复点编号无效'));return backupManager.exclusive(()=>storageManager.checkpoints.remove(value,storageManager.profileId));});
  handle('checkpoint-choose',value=>checkpointRecovery.choose(value));
  handle('checkpoint-preview',(token,password,newPassword,mode)=>checkpointRecovery.preview(token,password,newPassword,mode));
  handle('checkpoint-commit',(token,proof)=>backupManager.exclusive(()=>switchStore(()=>checkpointRecovery.commit(token,proof))));
  handle('checkpoint-cancel',()=>checkpointRecovery.cancel());
  handle('storage-choose',async()=>{const result=await dialog.showOpenDialog(main,{title:tr('选择新的空数据文件夹'),properties:['openDirectory','createDirectory']});return result.canceled?null:storageManager.prepare(result.filePaths[0]);});
  handle('storage-migrate',token=>backupManager.exclusive(()=>switchStore(()=>storageManager.migrate(token))));
  handle('backup-folder',async()=>{const result=await dialog.showOpenDialog(main,{title:tr('选择自动备份文件夹'),properties:['openDirectory','createDirectory']});return result.canceled?null:result.filePaths[0];});
  handle('backup-configure',async value=>{await backupManager.configure(value);});
  handle('backup-now',()=>background(backupManager.run(Date.now(),true)),false);
  handle('backup-protected',password=>background((async()=>{if(password!==undefined&&typeof password!=='string')throw new Error(tr('备份密码无效'));const result=await dialog.showSaveDialog(main,{title:tr('导出备份'),defaultPath:'Clip-'+new Date().toISOString().slice(0,10)+(password===undefined?'.json':'.clip'),filters:[{name:password===undefined?tr('Clip 备份'):tr('Clip 加密备份'),extensions:[password===undefined?'json':'clip']}]});if(result.canceled||!result.filePath)return null;protectDataFile(result.filePath);return backupManager.export(result.filePath,password);})()),false);
  handle('restore-choose',async name=>{const manager=backupManager,epoch=sessionEpoch,valid=()=>!secured&&!quitting&&!systemPaused&&!changingStore&&epoch===sessionEpoch&&manager===backupManager;if(!valid())throw new Error(tr('历史已锁定'));let file;if(name!==undefined)file=await manager.chooseOwn(name);else{const result=await dialog.showOpenDialog(main,{title:tr('选择要校验并恢复的备份'),properties:['openFile'],filters:[{name:tr('Clip 备份'),extensions:['json','clip']}]});if(result.canceled)return null;if(!valid())throw new Error(tr('历史已锁定'));file=await manager.chooseRestore(result.filePaths[0]);}if(!valid()){manager.cancelRestore(file.token);throw new Error(tr('历史已锁定'));}return file;},false);
  handle('restore-preview',(token,password)=>{if(systemPaused||changingStore)throw new Error(tr('历史已锁定'));return backupManager.preview(token,password);},false);handle('restore-commit',token=>backupManager.restore(token),false);
  handle('restore-cancel',token=>backupManager.cancelRestore(token),false);
  handle('commands',()=>aiService.commands.list(),false);
  handle('command-save',value=>{const result=aiService.commands.save(value);broadcast();return result;});
  handle('command-remove',(commandId,revision)=>{aiService.commands.remove(commandId,revision);broadcast();});
  handle('ai-state',()=>aiService.state(),false);handle('ai-order',value=>{aiService.reorder(value);broadcast();});handle('ai-profile',async value=>{if(value?.id)id(value.id);const result=await aiService.save(value);broadcast();return result;});handle('ai-remove',value=>{aiService.remove(id(value));broadcast();});handle('ai-default',value=>{aiService.setDefault(id(value));broadcast();});
  handle('codex-models',request=>aiService.codexModels(request),false);handle('codex-copy-code',async()=>{const state=await aiService.codexStatus();if(state.login!=='pending'||!state.userCode)throw new Error(tr('请先开始 Codex 登录'));await copyPayload({text:state.userCode},false);});handle('codex-status',()=>aiService.codexStatus(),false);handle('codex-login',()=>aiService.codexLogin(),false);handle('codex-login-cancel',()=>aiService.codexCancelLogin(),false);handle('codex-logout',()=>aiService.codexLogout(),false);
  handle('codex-executable-choose',async()=>{const service=aiService,epoch=sessionEpoch,result=await dialog.showOpenDialog(main,{title:tr('选择本机 Codex 程序'),properties:['openFile'],filters:[{name:tr('Codex 程序与启动入口'),extensions:['exe','ps1','cmd','bat','js']},{name:tr('所有文件'),extensions:['*']}]});if(result.canceled)return null;if(secured||quitting||systemPaused||changingStore||epoch!==sessionEpoch||service!==aiService)throw new Error(tr('历史已锁定'));return service.codexSetExecutable(result.filePaths[0]);},false);
  handle('codex-executable-auto',()=>aiService.codexSetExecutable(''),false);
  handle('codex-open-login',async()=>{const state=await aiService.codexStatus();if(state.login!=='pending'||!state.verificationUrl)throw new Error(tr('请先开始 Codex 登录'));const url=new URL(state.verificationUrl);if(url.protocol!=='https:'||url.hostname!=='auth.openai.com')throw new Error(tr('Codex 授权地址无效'));await shell.openExternal(url.href);},false);
  handle('ai-models',(profile,request)=>aiService.models(id(profile),request),false);handle('ai-model-catalog',(profile,request)=>aiService.modelCatalog(id(profile),request),false);handle('ai-run',value=>{const title=value?.command?aiService.commands.get(value.command.id,value.command.revision).title:value?.image?tr('AI 图片处理'):tr('AI 文本处理');const job=taskCenter.start({kind:'ai',title,recordId:value?.image?.clipId,recordHash:value?.image?.hash},async context=>{context.signal.addEventListener('abort',()=>aiService.cancel(value?.requestId),{once:true});return aiService.run(value);});if(typeof value?.requestId==='string'){textTaskRequests.set(value.requestId,job.id);void job.promise.finally(()=>textTaskRequests.delete(value.requestId)).catch(()=>{});}return job.promise;},false);handle('ai-cancel',value=>{const task=textTaskRequests.get(value);if(task)taskCenter.cancel(task);else aiService.cancel(value);},false);
  handle('scripts',()=>scriptService.list());handle('script-save',value=>{if(value?.id)id(value.id);const result=scriptService.save(value);broadcast();return result;});handle('script-remove',value=>{scriptService.remove(id(value));broadcast();});handle('script-run',value=>{const job=taskCenter.start({kind:'script',title:tr('运行文本脚本')},async context=>{context.signal.addEventListener('abort',()=>scriptService.cancel(value?.requestId),{once:true});return scriptService.run(value);});if(typeof value?.requestId==='string'){textTaskRequests.set(value.requestId,job.id);void job.promise.finally(()=>textTaskRequests.delete(value.requestId)).catch(()=>{});}return job.promise;},false);handle('script-cancel',value=>{const task=textTaskRequests.get(value);if(task)taskCenter.cancel(task);else scriptService.cancel(value);},false);handle('script-backup',async mode=>{const result=await scriptService.backup(main,mode,protectDataFile);broadcast();return result;});
  handle('apply-text',async(value:TextApply)=>{if(!value||!['copy','save','replace'].includes(value.mode)||!['AI 处理','脚本处理'].includes(value.source))throw new Error(tr('应用结果参数无效'));const text=toolText(value.text,MAX_TOOL_OUTPUT);if(value.mode==='copy'){await copyPayload({text},false);return null;}if(value.mode==='save'){const clip=store.add({text},value.source);broadcast();return clip.id;}const clip=store.get(id(value.clipId));if(!clip.payload.text||value.expectedHash!==clip.hash)throw new Error(tr('原记录已改变或不是文字，请另存结果'));store.edit(clip.id,text,clip.tags);broadcast();return clip.id;});
  handle('integrations',()=>integrationService.state(),false);handle('integration-register',value=>integrationService.register(value));handle('external-resolve',async(value,accept)=>{const intent=integrationService.resolve(id(value),accept);if(!intent)return null;let clipId:string|undefined;if(intent.action==='copy')await copyPayload({text:intent.text},false);if(intent.action==='add'){clipId=store.add({text:intent.text},'URL 导入').id;broadcast();}return {...intent,clipId};});
  const addToShelf=async(payload:Payload)=>{const source=activeStore(),epoch=sessionEpoch,valid=()=>!secured&&!quitting&&!systemPaused&&!changingStore&&storeOpen&&epoch===sessionEpoch&&source===store;if(store.shelf.length>=200)throw new Error(tr('拖拽容器最多 200 项'));const thumbnail=await prepareThumbnail(payload,valid);if(!valid())throw new Error(tr('记录已取消'));const name=payload.png?'拖入图片':payload.text?'拖入文字':'拖入文件';if(heavyCapture(payload)){const pending=captureWriter.run(join(storageManager.directory,'history.sqlite'),payload,name,thumbnail,storageManager.vault.copyKey(),valid,{shelf:true,committed:result=>{source.shelf=result.shelf;for(const change of result.mutations)webService?.observe(change.previous,change.next);}});payload=null!;await pending;}else{const item=source.add(payload,name,thumbnail,undefined,false);source.batch([item.id],'shelf');}broadcast();};
  const importing=async<T>(fn:()=>Promise<T>)=>{const release=desktop!.holdImport();try{return await fn();}finally{release();}};
  const addImageToShelf=(value:unknown)=>importing(async()=>{const epoch=sessionEpoch,source=activeStore(),valid=()=>!secured&&!quitting&&!systemPaused&&!changingStore&&storeOpen&&epoch===sessionEpoch&&source===store;if(source.shelf.length+(Array.isArray(value)?value.length:1)>200)throw new Error(tr('拖拽容器最多 200 项'));const payloads=await incomingImages(value,valid);if(!valid())throw new Error(tr('记录已取消'));for(const payload of payloads)await addToShelf(payload);});
  const shelfItem=(value:unknown)=>{const key=id(value);if(!store.shelf.includes(key))throw new Error(tr('项目已移出拖放窗口'));return store.get(key);};
  const shelfHandle=(name:string,fn:(...args:any[])=>unknown,serial=true)=>handle('shelf-'+name,fn,serial,'shelf');
  shelfHandle('activity',active=>{if(typeof active!=='boolean')throw new Error(tr('拖放窗口布局无效'));desktop!.dropActivity(active);},false);
  shelfHandle('state',()=>({items:store.shelfList(),dark:dark(),locked:desktop!.options.shelfLocked,mode:desktop!.shelfMode}));
  shelfHandle('choose',()=>importing(async()=>{const payload=await chooseFiles(desktop!.activeShelf!);if(payload)await addToShelf(payload);}));
  shelfHandle('image',addImageToShelf);
  shelfHandle('files',paths=>importing(async()=>addToShelf(await incomingFiles(paths))));
  shelfHandle('text',text=>{if(typeof text!=='string'||!text.trim())throw new Error(tr('拖入文字不能为空'));return addToShelf({text});});
  shelfHandle('remove',value=>{const item=shelfItem(value);store.batch([item.id],'unshelf');broadcast();});
  shelfHandle('copy',(value,paste)=>{if(typeof paste!=='boolean')throw new Error(tr('粘贴参数无效'));return copyPayload(shelfItem(value).payload,paste);});
  shelfHandle('hide',()=>desktop!.activeShelf!.hide());shelfHandle('main',()=>show());
  shelfHandle('top',value=>{if(typeof value!=='boolean')throw new Error(tr('锁定选项无效'));desktop!.configure({...desktop!.options,shelfLocked:value});});
  shelfHandle('mode',(value,reducedMotion)=>{if(value!=='compact'&&value!=='expanded'||typeof reducedMotion!=='boolean')throw new Error(tr('拖放窗口布局无效'));desktop!.setShelfMode(value,reducedMotion);});
  ipcMain.on('clip:shelf-drag',(event,value)=>{if(secured||quitting||event.sender!==desktop?.shelf?.webContents||event.senderFrame!==event.sender.mainFrame||event.senderFrame.url!=='clip://app/shelf.html')return;try{const item=shelfItem(value),epoch=sessionEpoch;void background(startDrag(event.sender,item,()=>transferValid(item,epoch)&&store.shelf.includes(item.id))).catch(notice);}catch(e){notice(e);}});

  handle('batch',async(values,action,tags=[])=>{if(action==='delete'){const current=store,epoch=sessionEpoch;await current.deleteAsync(values,()=>store===current&&epoch===sessionEpoch&&!secured&&!quitting&&!systemPaused);}else store.batch(values,action,tags);broadcast();});
  handle('category',value=>{if(value?.id)id(value.id);store.saveCategory(value);broadcast();});handle('remove-category',value=>{store.removeCategory(id(value));broadcast();});handle('category-order',value=>{store.reorderCategories(value);broadcast();});handle('manual-category',(ids,category,assigned)=>{store.setManualCategory(ids,category,assigned);broadcast();});
  handle('drop-image',addImageToShelf);
  handle('add-files',async()=>{const payload=await chooseFiles(main);if(payload)await addToShelf(payload);});handle('drop-files',async(paths)=>addToShelf(await incomingFiles(paths)));
  handle('metadata',value=>{const item=store.get(id(value?.id)),epoch=sessionEpoch;return metadataService.read(item,value,()=>!secured&&!quitting&&!systemPaused&&!changingStore&&storeOpen&&epoch===sessionEpoch&&store.matchesHash(item.id,item.hash));},false);
  handle('metadata-cancel',value=>metadataService.cancel(value),false);
  handle('content-info',async(value,readFiles)=>{if(typeof readFiles!=='boolean')throw new Error(tr('信息请求无效'));const epoch=sessionEpoch,item=store.get(id(value)),result=await contentInfo(item,readFiles);if(epoch!==sessionEpoch||secured)throw new Error(tr('历史已锁定'));return result;},false);
  handle('export-attachment',(value,index)=>{const item=store.get(id(value)),epoch=sessionEpoch;return exportAttachment(main,item,index,protectDataFile,()=>!secured&&!quitting&&!systemPaused&&!changingStore&&storeOpen&&epoch===sessionEpoch&&store.matchesHash(item.id,item.hash));},false);
  handle('file-action',(value,index,action)=>{const source=activeStore(),item=source.preview(id(value)),epoch=sessionEpoch,valid=()=>!secured&&!quitting&&!systemPaused&&!changingStore&&storeOpen&&epoch===sessionEpoch&&source===store&&source.matchesHash(item.id,item.hash);return fileAction(item,index,action,{valid,open:path=>shell.openPath(path),reveal:path=>shell.showItemInFolder(path),copy:text=>enqueue(()=>copyPayload({text},false,false,undefined,valid))});},false);
  handle('export-format',(value,name)=>{const item=store.get(id(value)),epoch=sessionEpoch;return exportFormat(main,item,name,protectDataFile,()=>!secured&&!quitting&&!changingStore&&storeOpen&&epoch===sessionEpoch&&store.matchesHash(item.id,item.hash));},false);

  handle('tasks',()=>taskCenter.state(),false);handle('task-cancel',value=>taskCenter.cancel(id(value)),false);handle('task-clear',()=>taskCenter.clear());
  handle('task-copy-link',async value=>{const task=taskCenter.get(id(value));if(!task.link)throw new Error(tr('任务尚无图片链接'));await copyPayload({text:formatImageHostLink(imageHostState(store),task.link)},false);});
  handle('task-retry',value=>{const task=taskCenter.get(id(value));if(!task.retryable||!task.recordId||!['failed','cancelled'].includes(task.status))throw new Error(tr('此任务不能重试'));const item=store.get(id(task.recordId));if(task.recordHash&&item.hash!==task.recordHash)throw new Error(tr('原记录已改变，请从记录重新上传'));return startImageUpload(task.recordId).id;},false);
  handle('image-upload-record',value=>imageUploadRecord(store,store.get(id(value))),false);
  handle('image-upload-start',(value,force)=>startImageUpload(value,force).id,false);
  handle('image-host-state',()=>imageHostState(store),false);handle('image-host-configure',value=>configureImageHost(store,value));handle('image-host-test',value=>{const source=store,epoch=sessionEpoch;return taskCenter.start({kind:'image-test',title:tr('图床连接测试')},async context=>{context.phase(tr('正在上传测试图片…'));const link=await testImageHost(source,value,fetch,{signal:context.signal,valid:()=>!secured&&!quitting&&store===source&&epoch===sessionEpoch});context.result({link});return link;}).promise;},false);
  handle('image-host-upload',value=>startImageUpload(value).promise,false);
  handle('export-image',value=>{const item=store.get(id(value)),epoch=sessionEpoch;return exportImage(main,item,protectDataFile,()=>transferValid(item,epoch));},false);  ipcMain.on('clip:drag',(event,value)=>{if(secured||quitting||!windows().some(w=>w.webContents===event.sender)||event.senderFrame!==event.sender.mainFrame||!event.senderFrame.url.startsWith('clip://app/index.html'))return;try{const item=store.get(id(value)),epoch=sessionEpoch;void background(startDrag(event.sender,item,()=>transferValid(item,epoch))).catch(notice);}catch(e){notice(e);}});
  handle('record-shortcut',async(active)=>{
    if(typeof active!=='boolean')throw new Error(tr('录入状态无效'));
    if(!active){await endShortcutRecording();return;}
    recordingShortcut=true;hotkeys.clear();globalShortcut.unregisterAll();
    try{await shortcutRecorder.start(main,input=>{if(recordingShortcut&&!main.isDestroyed())main.webContents.send('clip:shortcut-input',input);},()=>{void endShortcutRecording();});}
    catch(error){await endShortcutRecording();throw error;}
  });
  handle('efficiency-state',()=>efficiency.state());handle('efficiency-configure',value=>saveEfficiency(()=>efficiency.save(validateEfficiency({...efficiency.options(),historyEnabled:value?.historyEnabled,repliesShortcut:value?.repliesShortcut}))));
  handle('remember-search',query=>efficiency.remember(query));handle('remove-search',query=>{efficiency.remove(query);broadcast();});
  handle('reply-intent',()=>{const intent=systemPaused?null:efficiency.take();return intent?.kind==='fill'?{...intent,snippet:{...intent.snippet,payload:{text:intent.snippet.text}}}:intent;});handle('resolve-reply',async(token,values)=>{if(values===null){efficiency.cancel(token);return;}if(repliesBlocked())throw new Error(tr('快捷回复已取消'));const pending=efficiency.resolve(token);await copyPayload(fillTemplate(pending.snippet.payload,values),true,false,pending.target);efficiency.cancel(token);});
  handle('category-counts',categoryCounts,false);
  handle('search',(query,categoryId,caller)=>{if(typeof query!=='string'||query.length>512)throw new Error(tr('搜索内容过长'));const category=categoryId?store.categories.find(c=>c.id===id(categoryId)):undefined;if(categoryId&&!category)throw new Error(tr('分类已不存在'));const categories=category?[category,...store.categories.filter(item=>item.parentId===category.id)]:undefined;const source=activeStore(),epoch=sessionEpoch;return historySearch.run(caller,join(storageManager.directory,'history.sqlite'),query,categories,storageManager.vault.copyKey(),()=>!secured&&!quitting&&!systemPaused&&!changingStore&&epoch===sessionEpoch&&source===store&&windows().some(w=>w.webContents.id===caller));},false);
  handle('preview',(...args)=>preview(args.at(-1),id(args[0])),false);handle('snippet-preview',(...args)=>preview(args.at(-1),id(args[0]),true),false);handle('preview-release',(...args)=>{if(typeof args[0]==='string')previewImages.release(args[0],args.at(-1));},false);
  handle('state',async()=>{await store.waitForUndo();if(changingStore)throw new Error(tr('历史已锁定'));return store.readSnapshot(state);},false);handle('detail',(value)=>store.get(id(value)));
  handle('action',async(value,action:ClipAction)=>{const key=id(value),item=store.preview(key),current=store,epoch=sessionEpoch;switch(action){
    case 'favorite':store.update(key,{favorite:!item.favorite});break;
    case 'pin':store.update(key,{pinned:!item.pinned});break;
    case 'delete':await current.deleteAsync([key],()=>store===current&&epoch===sessionEpoch&&!secured&&!quitting&&!systemPaused);break;
    case 'enqueue':if(!stack.options().duplicates&&store.queue.includes(key))break;if(store.queue.length>=200)throw new Error(tr('堆栈最多 200 项'));store.setQueue([...store.queue,key]);break;
    case 'dequeue':store.setQueue(store.queue.filter(i=>i!==key));break;
    case 'up':case 'down':{const q=[...store.queue],from=q.indexOf(key),to=from+(action==='up'?-1:1);if(from>=0&&to>=0&&to<q.length){[q[from],q[to]]=[q[to],q[from]];store.setQueue(q);}break;}
    case 'split':stack.split(key);break;
    default:throw new Error(tr('操作无效'));}broadcast();
  });
  handle('undo',async()=>{const current=store,epoch=sessionEpoch;await current.undoAsync(()=>store===current&&epoch===sessionEpoch&&!secured&&!quitting&&!systemPaused);broadcast();});handle('edit',(value,text,tags)=>{if(typeof text!=='string')throw new Error(tr('文字无效'));store.edit(id(value),text,tags);broadcast();});
  handle('copy',(value,paste,plain=false)=>{if(typeof paste!=='boolean'||typeof plain!=='boolean')throw new Error(tr('粘贴参数无效'));return copyPayload(store.get(id(value)).payload,paste,plain);});
  handle('queue-action',(index,value,action,expected)=>{store.queueAction(index,id(value),action,expected);stack.cancel();broadcast();});handle('next',next);handle('clear-queue',()=>{store.setQueue([]);broadcast();});
  handle('snippet',value=>saveEfficiency(()=>{if(value?.id)id(value.id);const options=efficiency.options(),clip=value?.clipId?store.get(id(value.clipId)):undefined;const key=store.saveSnippet({id:value?.id,title:value?.title,text:value?.text,payload:clip?.payload},clip?.thumbnail);if(value?.shortcut!==undefined){options.bindings=options.bindings.filter(b=>b.id!==key);if(value.shortcut!=='')options.bindings.push({id:key,shortcut:value.shortcut});efficiency.save(options);}}));handle('remove-snippet',value=>saveEfficiency(()=>{const key=id(value),options=efficiency.options();store.removeSnippet(key);options.bindings=options.bindings.filter(b=>b.id!==key);efficiency.save(options);}));
  handle('remove-snippets',values=>saveEfficiency(()=>efficiency.removeSnippets(values)));
  handle('snippet-order',value=>{store.reorderSnippets(value);broadcast();});handle('favorite-order',value=>{store.reorderFavorites(value);broadcast();});handle('snippet-detail',getSnippet);handle('use-snippet',(value,paste,values={})=>{if(typeof paste!=='boolean')throw new Error(tr('参数无效'));return copyPayload(fillTemplate(getSnippet(value).payload,values),paste);});
  handle('settings',(value)=>{const next=validateSettings(value),old=store.settings;try{registerHotkeys(next);if(!testing&&!development&&app.isPackaged&&next.launchAtLogin!==old.launchAtLogin)configureLoginItem(app,next.launchAtLogin);store.saveSettings(next);hotkeyError='';}catch(e){try{registerHotkeys(old);}catch{}throw e;}lastSequence=sequence();appearance();trayMenu();});
  handle('backup',mode=>backup(mode),false);handle('clear',async()=>{const current=store,epoch=sessionEpoch;await current.clearAsync(()=>store===current&&epoch===sessionEpoch&&!secured&&!quitting&&!systemPaused);broadcast();});handle('hide',()=>{for(const w of windows())w.hide();},false);handle('quit',()=>app.quit(),false);
}
async function poll(){if(secured||quitting||programRollback?.installing)return;if(systemPaused){lastSequence=sequence();return;}if(vaultSetup){lastSequence=sequence();if(Date.now()>=vaultSetupExpires){storageManager.cancelEncryption();vaultSetup=false;}return;}const epoch=sessionEpoch,stackEpoch=stack.epoch;rememberTarget();const seq=sequence();if(seq===lastSequence)return;if(store.settings.paused){lastSequence=seq;return;}const source=owner()||foreground();if(source?.pid===process.pid||store.settings.excludedApps.includes((source?.name||'').toLowerCase())||privateClipboard()){lastSequence=seq;return;}
  try{let payload=await capture();if(secured||systemPaused||epoch!==sessionEpoch||sequence()!==seq)return;if(payload){const original=store,live=()=>!secured&&!quitting&&!systemPaused&&!changingStore&&!vaultSetup&&storeOpen&&epoch===sessionEpoch&&store===original&&sequence()===seq;appIcons.remember(source);const name=source?.name||'未知应用',thumb=await prepareThumbnail(payload,live);let item:Detail|import('../shared/preview').ClipPreview;if(heavyCapture(payload)){const pending=captureWriter.run(join(storageManager.directory,'history.sqlite'),payload,name,thumb,storageManager.vault.copyKey(),live);payload=null;item=await pending;if(!live())return;}else item=store.add(payload,name,thumb,undefined,false);status='';try{stack.capture(item,stackEpoch,source?.name||'未知应用');}catch(error){notice(error);trayMenu();}store.prune();syncService.capture(item);webService.capture(store.preview(item.id));broadcast();}lastSequence=seq;}catch(e){if(e instanceof CaptureCancelledError)return;if(/^(附件读取已取消|剪贴板已改变)$/.test(e instanceof Error?e.message:String(e)))return;if(/忙|正在|temporarily|busy/i.test(String(e)))return;lastSequence=seq;notice(e);}
}
async function activateStore(){checkpointRecovery?.cancel();checkpointRecovery=new CheckpointRecovery(storageManager,thumbnail);programRollback?.cancel();programRollback=new ProgramRollbackManager(storageManager,programVersionContext(storageManager.defaultDirectory,app.getVersion()));
  if(development){store.setMeta('desktop-options',{...validateDesktop(store.meta('desktop-options',desktopDefaults)),shelfTop:false});}
  storeOpen=true;secured=false;const epoch=++sessionEpoch;lastUnlock=Date.now();await initTransfer();if(secured||quitting||epoch!==sessionEpoch)return;
  backupManager?.dispose();backupManager=new BackupManager(activeStore,storageManager.profileId,join(app.getPath('userData'),'backups'),localProtector,broadcast,thumbnail,(file,password)=>{activeStore();const key=storageManager.vault.copyKey();try{return exportInWorker(join(storageManager.directory,'history.sqlite'),file,password,undefined,undefined,key);}finally{key?.fill(0);}},{imageHost:app.isPackaged?join(process.resourcesPath,'app.asar.unpacked/dist/native/ImageHost.exe'):join(__dirname,'../native/ImageHost.exe')},(snapshot,valid,previous)=>{const original=activeStore(),epoch=sessionEpoch;return restoreBackupJob(snapshot,{source:join(storageManager.directory,'history.sqlite'),imageHost:app.isPackaged?join(process.resourcesPath,'app.asar.unpacked/dist/native/ImageHost.exe'):join(__dirname,'../native/ImageHost.exe'),valid:()=>valid()&&!secured&&!quitting&&!systemPaused&&!changingStore&&storeOpen&&epoch===sessionEpoch&&store===original,key:()=>storageManager.vault.copyKey(),enqueue,committed:result=>{original.categories=result.categories;if(!secured&&!quitting)for(const change of result.mutations)webService?.observe(change.previous,change.next);}},previous);});
  webService=new WebShareService(activeStore,broadcast,enqueue,prepareThumbnail,join(__dirname,'../web'),{...(testing?{addresses:()=>['127.0.0.1']}:{}),publicImage:png=>nativeImage.createFromBuffer(Buffer.from(png,'base64')).toPNG()});
  syncService=new SyncService(activeStore,localProtector,broadcast,enqueue,undefined,{...(testing?{bindHost:'127.0.0.1',discovery:false}:{}),history:()=>({source:join(storageManager.directory,'history.sqlite'),key:storageManager.vault.copyKey()}),prepareThumbnail,afterMutation:(p,n)=>webService.observe(p,n)});await background(syncService.resume());if(secured||quitting||epoch!==sessionEpoch)return;
  if(!nativeAvailable())status=tr`Windows 接口不可用：${nativeError}`;
  store.db.prepare("DELETE FROM meta WHERE key='selection-options'").run();taskCenter=new TaskCenter(store,value=>{if(!secured&&!quitting&&main&&!main.isDestroyed())main.webContents.send('clip:tasks-changed',value);});aiService=new AIService(store);initChat();scriptService=new ScriptService(store);main=createWindow();trayPanel?.dispose();quickPanel?.dispose();const trayPanelContext=():ConstructorParameters<typeof TrayPanel>[0]=>({source:()=>join(storageManager.directory,'history.sqlite'),key:()=>storageManager.vault.copyKey(),image:(window,item)=>previewImages.register(window.webContents.id,previewSource(window.webContents.id,item.id,false,item.hash)),releaseImage:owner=>previewImages.clear(owner),store:activeStore,blocked:()=>panelsBlocked()||vaultSetup,dark,target:trayTarget,placement:panelPlacement,validTarget:target=>usablePasteTarget(target),main:()=>show(),copy:(item,paste,target,valid)=>enqueue(async()=>{if(!valid())throw new Error(tr('托盘操作已失效'));await copyPayload(item.payload,paste,false,target,valid);}),drag:(window,item,valid)=>{const epoch=sessionEpoch;return startDrag(window.webContents,item,()=>valid()&&transferValid(item,epoch));}});trayPanel=new TrayPanel(trayPanelContext());quickPanel=new TrayPanel({...trayPanelContext(),hoverPreviewEnabled:()=>desktop?.options.quickHoverPreview??desktopDefaults.quickHoverPreview,createReply:(value,valid)=>enqueue(async()=>{if(!valid())throw new Error(tr('面板操作已失效'));store.saveSnippet(value);broadcast();}),clear:valid=>enqueue(async()=>{if(!valid())throw new Error(tr('面板操作已失效'));await store.clearAsync(valid);broadcast();}),reply:(item,paste,values,target,valid)=>enqueue(async()=>{if(!valid())throw new Error(tr('面板操作已失效'));await copyPayload(fillTemplate(item.payload,values),paste,false,target,valid);}),text:(value,paste,target,valid)=>enqueue(async()=>{if(!valid())throw new Error(tr('面板操作已失效'));await copyPayload({text:value.text},paste,false,target,valid);if(valid())store.setMeta('quick-panel-recent',rememberGlyph(store.meta('quick-panel-recent',[]),value));}),action:(item,action,valid)=>enqueue(async()=>{if(!valid())throw new Error(tr('面板操作已失效'));if(action==='delete')await store.deleteAsync([item.id],valid);else store.update(item.id,action==='pin'?{pinned:!item.pinned}:{favorite:!item.favorite});broadcast();})},'quick');desktop=new DesktopController({store:activeStore,blocked:()=>updateService?.installing||programRollback?.installing||secured||quitting||changingStore||recordingShortcut,rememberTarget,dark,changed:broadcast,enqueue});integrationService=new IntegrationService(broadcast,()=>show(),notice);trayMenu();
  hotkeys.clear();globalShortcut.unregisterAll();try{const preparation=await prepareWinVShortcut();if(secured||quitting||epoch!==sessionEpoch)return;winVShortcut.suspend(systemPaused);hotkeyError=[preparation,registerHotkeys(store.settings,undefined,undefined,false)].filter(Boolean).join('；');}catch(e){hotkeyError=String((e as Error).message);}lastSequence=sequence();startupPending=false;trayMenu();if(!launchInTray)show();for(const url of startupUrls.splice(0))integrationService.receive([url]);if(startupOverflow){startupOverflow=false;notice(tr('外部请求过多，请稍后重试'));}if(startupTooLong){startupTooLong=false;notice(tr('外部请求过长或无效'));}
}
async function start(){
  initLanguageService(languageStore);if(process.platform==='win32')app.setAppUserModelId('com.cloudchewie.clip');
  appearanceService=new AppearanceService(join(app.getPath('userData'),'appearance.json'));await appearanceService.init();
  updateService=new UpdateService({version:app.getVersion(),directory:join(app.getPath('userData'),'updates'),installed:installedClip,active:activeUpdate,changed:value=>{if(secured||quitting)return;if(value.phase==='available'&&value.automatic&&value.release&&![main].some(w=>w&&!w.isDestroyed()&&w.isVisible())&&Notification.isSupported()){const n=new Notification({title:tr('Clip 有新版本可用'),body:tr('在设置的「应用更新」中下载并安装')});n.on('click',()=>show());n.show();}for(const w of [main])if(w&&!w.isDestroyed())w.webContents.send('clip:update-changed',value);},arm:armUpdate,openFolder:file=>shell.showItemInFolder(file)});const updateReady=background(updateService.init());
  Menu.setApplicationMenu(null);
  const renderer=resolve(__dirname,'../renderer');protocol.handle('clip',request=>{const url=new URL(request.url),name=url.pathname.slice(1);if(url.host==='app'&&name.startsWith('preview-image/'))return previewImages.response(request);if(url.host!=='app'||!rendererAssetAllowed('main',name))return new Response('Not found',{status:404});return net.fetch(pathToFileURL(join(renderer,name)).toString());});
  session.defaultSession.setPermissionRequestHandler((_wc,_p,callback)=>callback(false));session.defaultSession.setPermissionCheckHandler(()=>false);
  initNative();
  const trayImage=nativeImage.createEmpty();
  for(const [scale,size] of [[1,16],[1.25,20],[1.5,24],[2,32]] as const){
    const data=await readFile(join(__dirname,`../clip-tray-${size}.png`));
    trayImage.addRepresentation({scaleFactor:scale,dataURL:'data:image/png;base64,'+data.toString('base64')});
  }
  tray=new Tray(trayImage);tray.setToolTip('Clip');trayMenuPanel=new TrayMenuPanel(dark);tray.on('click',(_event,bounds)=>trayClick(bounds));tray.on('right-click',(_event,bounds)=>{try{trayPanel?.close();quickPanel?.close();trayMenuPanel?.toggle(bounds);}catch{if(fallbackTrayMenu)tray.popUpContextMenu(fallbackTrayMenu);}});trayMenu();
  const vault=new HistoryVault(localProtector,{available:helloAvailable,verify:async()=>{const w=unlockWindow||main;if(!w||w.isDestroyed())throw new Error(tr('解锁窗口不可用'));return helloVerify(w.getNativeWindowHandle().readBigUInt64LE());}});
  storageManager=new StorageManager(app.getPath('userData'),vault);
  const systemLock=()=>{winVShortcut.suspend(true);chatWindow?.hide();taskCenter?.cancelAll();backupManager?.cancelPendingRestore();cancelBackupPreviews();background(thumbnails.stop());background(captureWriter.stop());previewImages.clear();void historySearch.cancel();syncService?.cancelFileShares();programRollback?.cancel();cancelRecoveryJobs();checkpointRecovery?.cancel();systemPaused=true;sessionEpoch++;trayPanel?.close();quickPanel?.close();if(trayPanel)background(trayPanel.stopSearch());if(quickPanel)background(quickPanel.stopSearch());stack.stop();if(!changingStore){trayMenu();broadcast();}efficiency.cancel();metadataService.dispose();cancelAttachments();disposeAttachments();lastSequence=sequence();if(!secured&&vault.state().encrypted)lockHistory();else{if(secured){vault.lock();cancelHello();}if(webService)void background(webService.stop());}};
  powerMonitor.on('lock-screen',systemLock);powerMonitor.on('suspend',systemLock);powerMonitor.on('unlock-screen',()=>{systemPaused=false;winVShortcut.suspend(secured||quitting||changingStore);lastSequence=sequence();});powerMonitor.on('resume',()=>{systemPaused=false;winVShortcut.suspend(secured||quitting||changingStore);lastSequence=sequence();});
  try{store=await storageManager.start();}catch(error){if(error instanceof HistoryLockedError){startupPending=false;trayMenu();store=await unlockStorage(storageManager,w=>unlockWindow=w,undefined,()=>!systemPaused&&!quitting,launchInTray);}else{startupPending=false;trayMenu();store=await recoverStorage(storageManager,error,()=>!systemPaused&&!quitting,{hidden:launchInTray,onWindow:w=>unlockWindow=w});}}if(quitting){store.close();return;}
  if(systemPaused&&vault.state().encrypted){store.close();vault.lock();store=await unlockStorage(storageManager,w=>unlockWindow=w,undefined,()=>!systemPaused&&!quitting,launchInTray);}
  await updateReady;if(!testing&&!development&&app.isPackaged)configureLoginItem(app,store.settings.launchAtLogin);ipc();await activateStore();nativeTheme.on('updated',appearance);
  timer=setInterval(()=>{if(secured||quitting||!nativeAvailable()||polling||development&&store.settings.paused)return;polling=true;void enqueue(poll).catch(notice).finally(()=>polling=false);},350);
  const scheduled=()=>{if(!quitting&&!secured)void background((async()=>{const previous=backupManager.status().lastAttempt;await backupManager.run();if(secured)return;const current=backupManager.status();if(current.lastAttempt!==previous&&current.lastError)notice(tr`自动备份：${current.lastError}`);})()).catch(notice);};backupTimer=setInterval(scheduled,60000);setTimeout(scheduled,1200);powerMonitor.on('resume',scheduled);
  const idleTimer=setInterval(()=>{const minutes=vault.state().idleMinutes;if(!secured&&vault.state().encrypted&&minutes>0&&Date.now()-lastUnlock>=minutes*60000&&powerMonitor.getSystemIdleTime()>=minutes*60)lockHistory();},1000);app.once('before-quit',()=>clearInterval(idleTimer));
  const checkUpdates=()=>{if(!testing&&!development&&!secured&&!quitting)void updateService.scheduled().catch(()=>{});};updateTimer=setInterval(checkUpdates,3600000);setTimeout(checkUpdates,15000);
}
installDevelopmentBridge(()=>secured||changingStore||vaultSetup);
if(!testing&&!app.requestSingleInstanceLock())app.quit();else{app.on('second-instance',(_event,argv)=>{if(!isLoginStartup(argv))show();if(!secured&&integrationService)integrationService.receive(argv);else queueStartupExternal(argv);});app.whenReady().then(start).then(()=>developmentMessage({type:'clip:dev-ready',profile:app.getPath('userData'),pid:process.pid})).catch(e=>{if(!quitting){if(development)console.error(e);else dialog.showErrorBox(tr('Clip 启动失败'),String(e));}app.quit();});}
app.on('before-quit',event=>{if(quitting)return;if(!app.isReady()){quitting=true;return;}event.preventDefault();flushDesktopBounds();checkpointRecovery?.cancel();quitting=true;sessionEpoch++;recordingShortcut=false;background(shortcutRecorder.stop());background(winVShortcut.stop());clearInterval(timer);clearInterval(backupTimer);hotkeys.clear();globalShortcut.unregisterAll();desktop?.dispose();desktop=undefined;stopTools(false);if(updateService)background(updateService.stop());if(webService)background(webService.stop());if(syncService)background(syncService.stop());void serial.catch(()=>{}).then(async()=>{await webService?.stop();await syncService?.stop();return Promise.allSettled([...backgroundTasks]);}).then(()=>app.quit());});
app.on('will-quit',()=>{clearInterval(updateTimer);void updateService?.stop();trayMenuPanel?.dispose();trayPanel?.dispose();quickPanel?.dispose();disposeTransfer();if(storeOpen)store?.close();storageManager?.cancelEncryption();storageManager?.vault.lock();if(restartRequested){if(development&&process.connected)developmentMessage({type:'clip:dev-restart'});else app.relaunch({args:manualLaunchArguments(process.argv.slice(1))});}});app.on('window-all-closed',()=>{});
