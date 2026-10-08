const {_electron:electron,expect}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {StorageManager,defaults,desktopDefaults,efficiencyDefaults}=require('../work/test-exports.cjs');

(async()=>{
 const version=process.argv[2];assert(/^\d+\.\d+\.\d+$/.test(version),'Pass a release version');
 const executable=path.resolve('release',version,'win-unpacked','Clip.exe');
 const {beginCase}=await import('../scripts/workspace.mjs'),work=await beginCase('tray-menu-packaged-'+version.replaceAll('.','-'));
 const profile=path.join(work.fixtures,'profile'),manager=new StorageManager(profile);
 const store=await manager.start();store.saveSettings({...defaults,paused:true,launchAtLogin:false,shortcut:'',nextShortcut:''});
 store.setMeta('desktop-options',{...desktopDefaults,shelfShortcut:'',shelfAutoDrag:false,shelfTop:false});store.setMeta('efficiency',{...efficiencyDefaults,repliesShortcut:''});
 store.setMeta('quick-panel-shortcut','');store.setMeta('quick-panel-intercept-win-v',false);store.setMeta('ai-chat-options',{shortcut:'',onTop:false,keepOpen:true});store.close();manager.vault.lock();
 const env={...process.env,CLIP_TEST_MODE:'1',CLIP_DATA_DIR:profile,TEMP:work.temp,TMP:work.temp};for(const name of ['ELECTRON_RUN_AS_NODE','CLIP_DEVELOPMENT','CLIP_DEV_DATA_DIR','CLIP_DEV_HIDDEN'])delete env[name];
 let application;const errors=[];
 try{
  application=await electron.launch({executablePath:executable,args:['--startup'],env});
  const main=await application.firstWindow();main.on('pageerror',e=>errors.push(e.message));await main.waitForSelector('#search');
  await expect.poll(()=>main.evaluate(()=>clip.state().then(s=>s.native&&s.settings.paused))).toBe(true);
  const identity=await application.evaluate(({app})=>({version:app.getVersion(),packaged:app.isPackaged,profile:app.getPath('userData')}));
  assert.equal(identity.version,version);assert.equal(identity.packaged,true);assert.equal(identity.profile,profile);
  await application.evaluate(async({BrowserWindow,Tray})=>{
   // Locate the production tray without adding a test API or changing the packaged application.
   const inspector=process.getBuiltinModule('inspector'),session=new inspector.Session();session.connect();
   const post=(name,params)=>new Promise((resolve,reject)=>session.post(name,params,(error,result)=>error?reject(error):resolve(result)));
   globalThis.clipTrayPrototype=Tray.prototype;
   try{const prototype=await post('Runtime.evaluate',{expression:'globalThis.clipTrayPrototype',objectGroup:'clip-tray-fixture'}),objects=await post('Runtime.queryObjects',{prototypeObjectId:prototype.result.objectId,objectGroup:'clip-tray-fixture'});
    await post('Runtime.callFunctionOn',{objectId:objects.objects.objectId,functionDeclaration:'function(){globalThis.clipTrayFixture=Array.from(this).find(tray=>!tray.isDestroyed());}',returnByValue:true});
   }finally{await post('Runtime.releaseObjectGroup',{objectGroup:'clip-tray-fixture'});session.disconnect();delete globalThis.clipTrayPrototype;}
   if(!globalThis.clipTrayFixture)throw Error('Production tray is missing');
   const visible=new Set(BrowserWindow.getAllWindows().filter(w=>w.isVisible()).map(w=>w.id));
   BrowserWindow.prototype.show=function(){visible.add(this.id);};BrowserWindow.prototype.showInactive=BrowserWindow.prototype.show;BrowserWindow.prototype.focus=function(){};BrowserWindow.prototype.isVisible=function(){return visible.has(this.id);};BrowserWindow.prototype.hide=function(){visible.delete(this.id);this.emit('hide');};
  });
  const opened=application.waitForEvent('window');await application.evaluate(()=>globalThis.clipTrayFixture.emit('right-click'));const menu=await opened;menu.on('pageerror',e=>errors.push(e.message));await expect(menu.locator('[data-action=chat]')).toHaveText('AI 对话');
  const menuVisible=()=>application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.webContents.getURL()==='clip://app/tray-menu.html'&&w.isVisible()));
  await expect.poll(menuVisible).toBe(true);
  const geometry=()=>menu.evaluate(()=>({height:innerHeight,last:document.querySelector('[data-action=quit]').getBoundingClientRect().bottom,overflow:document.querySelector('#menu-items').scrollHeight>document.querySelector('#menu-items').clientHeight}));
  const initial=await geometry();assert(!initial.overflow&&initial.height>=initial.last&&initial.height-initial.last<=8);await menu.screenshot({path:path.join(work.output,'tray-menu.png')});
  const chatOpened=application.waitForEvent('window');await menu.locator('[data-action=chat]').click();const chat=await chatOpened;chat.on('pageerror',e=>errors.push(e.message));await chat.waitForSelector('#chat-input');
  await expect.poll(()=>application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.webContents.getURL()==='clip://app/chat.html'&&w.isVisible()))).toBe(true);assert.equal(await menuVisible(),false);
  await chat.evaluate(()=>clipChat.hide());await application.evaluate(()=>globalThis.clipTrayFixture.emit('right-click'));await expect.poll(menuVisible).toBe(true);await expect(menu.locator('[data-action=chat]')).toBeEnabled();
  const reopened=await geometry();assert(!reopened.overflow&&reopened.height>=reopened.last&&reopened.height-reopened.last<=8);
  await menu.keyboard.press('Escape');await expect.poll(menuVisible).toBe(false);assert.deepEqual(errors,[]);
  const result={passed:true,version,packaged:true,isolatedProfile:true,chatEntry:true,chatOpened:true,menuClosed:true,reopened:true,initial,reopenGeometry:reopened,errors,scope:'Actual packaged executable and sandboxed renderers; tray instance located through the test debugger, native windows remain hidden. No installation, physical input or AI generation.'};
  await fs.writeFile(path.join(work.output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{if(application)await application.close();await work.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
