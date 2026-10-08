const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{EventEmitter}=require('node:events'),ts=require('typescript'),{buildSync}=require('esbuild');
const core=require('../work/test-exports.cjs');
const source=ts.createSourceFile('index.ts',fs.readFileSync('src/main/index.ts','utf8'),ts.ScriptTarget.Latest,true);
const parts=source.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='restartClip'||ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(source)==='app.on'&&['before-quit','will-quit'].includes(node.expression.arguments[0]?.text));
assert.equal(parts.length,3);
const runtime=ts.transpileModule(parts.map(node=>node.getText(source)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const menuCode=buildSync({entryPoints:['src/main/tray-menu.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const menuModule={exports:{}};vm.runInNewContext(menuCode,{module:menuModule,exports:menuModule.exports});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({language='zh-CN',development=false,unsaved=false,response=0,reject=false,ready=true}={}){
 core.setInterfaceLanguage(language);const calls=[],timers=[],dialogs=[],app=new EventEmitter();
 app.isReady=()=>ready;app.quit=()=>calls.push('quit');app.relaunch=options=>{calls.push('relaunch');app.relaunchArguments=options.args;};
 const service=(name)=>({stop:async()=>calls.push(name+'-stop'),dispose:()=>calls.push(name+'-dispose')});
 const context={app,process:{connected:development,argv:['Clip.exe','--startup']},manualLaunchArguments:core.manualLaunchArguments,development,quitting:false,restartRequested:false,quitRecordingConfirmed:false,quitRecordingPrompt:false,changingStore:false,vaultSetup:false,sessionEpoch:0,storeOpen:true,timer:0,backupTimer:0,updateTimer:0,main:{isDestroyed:()=>false,show:()=>calls.push('show')},recorder:undefined,imageEditor:unsaved?{hasUnsaved:true,window:{isDestroyed:()=>false,show:()=>calls.push('editor-show')},abort:()=>calls.push('editor-abort')}:undefined,tr:core.t,
 confirmWindow:async(_window,options)=>{dialogs.push(options);if(reject)throw Error('confirmation failed');return {response};},setTimeout:fn=>timers.push(fn),clearInterval:()=>{},flushDesktopBounds:()=>calls.push('bounds'),checkpointRecovery:{cancel:()=>calls.push('checkpoint-cancel')},recordingShortcut:false,shortcutRecorder:service('shortcut-recorder'),winVShortcut:service('win-v'),hotkeys:{clear:()=>calls.push('hotkeys-clear')},globalShortcut:{unregisterAll:()=>calls.push('shortcuts-clear')},desktop:service('desktop'),updateService:service('update'),webService:service('web'),syncService:service('sync'),programRollback:undefined,serial:Promise.resolve(),backgroundTasks:new Set(),
 stopTools:()=>calls.push('tools-stop'),trayMenuPanel:service('tray-menu'),trayPanel:service('recent'),quickPanel:service('quick'),disposeTransfer:()=>calls.push('transfer-dispose'),store:{close:()=>calls.push('store-close')},storageManager:{cancelEncryption:()=>calls.push('encryption-cancel'),vault:{lock:()=>calls.push('vault-lock')}},developmentMessage:message=>calls.push(message.type),notice:error=>calls.push(error.message)};
 context.background=task=>{context.backgroundTasks.add(task);void task.then(()=>context.backgroundTasks.delete(task),()=>context.backgroundTasks.delete(task));return task;};
 vm.runInNewContext(runtime,context);
 return {context,app,calls,timers,dialogs,quit:()=>{let prevented=false;app.emit('before-quit',{preventDefault:()=>prevented=true});return prevented;}};
}
test('restart waits for queued work, closes data before relaunch, and ignores repeated clicks',async()=>{
 const f=fixture();let finish;const pending=new Promise(resolve=>finish=resolve);f.context.stopTools=()=>{f.calls.push('tools-stop');f.context.background(pending);};
 f.context.restartClip();f.context.restartClip();assert.equal(f.timers.length,1);assert(!f.calls.includes('quit'));f.timers.shift()();assert.equal(f.quit(),true);await flush();assert.equal(f.calls.filter(x=>x==='quit').length,1);assert(!f.calls.includes('store-close'));assert(!f.calls.includes('relaunch'));
 finish();await flush();assert.equal(f.calls.filter(x=>x==='quit').length,2);assert.equal(f.quit(),false);f.app.emit('will-quit');assert.equal(f.calls.filter(x=>x==='relaunch').length,1);assert.deepEqual(Array.from(f.app.relaunchArguments),[]);assert(f.calls.indexOf('store-close')<f.calls.indexOf('relaunch'));assert(f.calls.indexOf('vault-lock')<f.calls.indexOf('relaunch'));assert(f.calls.includes('bounds'));assert.equal(f.context.sessionEpoch,1);f.context.restartClip();assert.equal(f.timers.length,0);
});
test('canceling restart preserves unsaved edits, and retry/discard uses the same safe exit path',async()=>{
 for(const language of ['zh-CN','en'])for(const response of [0,1]){
  const f=fixture({language,unsaved:true,response});f.context.restartClip();f.timers.shift()();assert(f.quit());assert(f.quit());await flush();assert.equal(f.dialogs.length,1);const options=f.dialogs[0];assert.equal(options.cancelId,0);assert.equal(options.defaultId,0);assert.equal(options.buttons[1],language==='en'?'Restart and discard':'重启并放弃');
  if(response===0){assert.equal(f.context.restartRequested,false);assert(!f.calls.includes('tools-stop'));assert(!f.calls.includes('store-close'));assert(!f.calls.includes('relaunch'));assert(f.calls.includes('editor-show'));f.context.restartClip();assert.equal(f.timers.length,1);f.timers.shift()();assert(f.quit());await flush();assert.equal(f.dialogs.length,2);}
  else{assert(f.quit());await flush();f.app.emit('will-quit');assert(f.calls.includes('editor-abort'));assert(f.calls.includes('relaunch'));}
 }
});
test('failed confirmation cancels pending restart without abandoning edits',async()=>{const f=fixture({unsaved:true,reject:true});f.context.restartClip();f.timers.shift()();f.quit();await flush();assert.equal(f.context.restartRequested,false);assert(!f.calls.includes('tools-stop'));assert(f.calls.includes('confirmation failed'));f.context.restartClip();assert.equal(f.timers.length,1);});
test('restart rejects active data changes, encryption setup, installer and rollback handoff',()=>{
 for(const field of ['changingStore','vaultSetup','updateService','programRollback']){const f=fixture();f.context[field]=field.endsWith('Service')||field==='programRollback'?{installing:true}:true;assert.throws(()=>f.context.restartClip(),/重启 Clip/);assert.equal(f.context.restartRequested,false);assert.equal(f.timers.length,0);}
});
test('development restart goes back to its supervisor only after resources are closed',async()=>{const f=fixture({development:true});f.context.restartClip();f.timers.shift()();f.quit();await flush();f.app.emit('will-quit');assert(!f.calls.includes('relaunch'));assert(f.calls.indexOf('store-close')<f.calls.indexOf('clip:dev-restart'));});
test('normal quit never schedules a relaunch',async()=>{const f=fixture();f.quit();await flush();f.app.emit('will-quit');assert(!f.calls.includes('relaunch'));assert(!f.calls.includes('clip:dev-restart'));});
test('restart is immediately above quit in every tray state and both menu actions dispatch',()=>{
 const {trayMenuEntries,trayMenuTemplate}=menuModule.exports;
 for(const values of [{},{initializing:true},{secured:true},{encrypted:true}]){const state={initializing:false,secured:false,encrypted:false,stackActive:false,paused:false,launchAtLogin:false,...values};const entries=trayMenuEntries(state);assert.deepEqual(Array.from(entries.slice(-2),item=>item.id),['restart','quit']);const calls=[],actions=new Proxy({},{get:(_target,id)=>()=>calls.push(id)}),template=trayMenuTemplate(state,actions);template.at(-2).click();template.at(-1).click();assert.deepEqual(calls,['restart','quit']);}
 core.setInterfaceLanguage('zh-CN');
});

test('development quit before Electron readiness leaves global shortcut APIs untouched',()=>{
 const f=fixture({development:true,ready:false});assert.equal(f.quit(),false);assert(f.context.quitting);assert.deepEqual(f.calls,[]);
});
