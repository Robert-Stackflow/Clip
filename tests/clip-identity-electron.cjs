const {_electron:electron,expect}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {StorageManager,defaults,desktopDefaults,efficiencyDefaults}=require('../work/test-exports.cjs');
(async()=>{
 const {beginCase}=await import('../scripts/workspace.mjs'),work=await beginCase('clip-identity-electron'),profile=path.join(work.fixtures,'Clip'),manager=new StorageManager(profile);
 const store=await manager.start();store.saveSettings({...defaults,paused:true,launchAtLogin:false,shortcut:'',nextShortcut:''});
 store.setMeta('desktop-options',{...desktopDefaults,shelfShortcut:'',shelfAutoDrag:false,shelfTop:false});store.setMeta('efficiency',{...efficiencyDefaults,repliesShortcut:''});
 store.setMeta('quick-panel-shortcut','');store.setMeta('quick-panel-intercept-win-v',false);store.setMeta('ai-chat-options',{shortcut:'',onTop:false});store.close();manager.vault.lock();
 const env={...process.env,CLIP_TEST_MODE:'1',CLIP_DATA_DIR:profile};for(const name of ['ELECTRON_RUN_AS_NODE','CLIP_DEVELOPMENT','CLIP_DEV_DATA_DIR','CLIP_DEV_HIDDEN'])delete env[name];
 const executable=process.env.CLIP_PACKAGED_EXE,options=executable?{executablePath:path.resolve(executable),args:['--startup'],env}:{args:['.','--startup'],env};
 let application;const errors=[];
 try{
  application=await electron.launch(options);const page=await application.firstWindow();page.on('pageerror',error=>errors.push(error.message));await page.waitForSelector('#search');
  await expect.poll(()=>page.evaluate(()=>window.clip.state().then(state=>state.settings.paused))).toBe(true);
  const identity=await application.evaluate(({app})=>({name:app.getName(),version:app.getVersion(),packaged:app.isPackaged,userData:app.getPath('userData'),sessionData:app.getPath('sessionData'),logs:app.getPath('logs'),crashDumps:app.getPath('crashDumps')}));
  assert.equal(identity.name,'Clip');assert.equal(identity.version,require('../package.json').version);assert.equal(identity.userData,profile);assert.equal(identity.sessionData,path.join(profile,'session'));assert.equal(identity.logs,path.join(profile,'logs'));assert.equal(identity.crashDumps,path.join(profile,'crash-dumps'));if(executable)assert.equal(identity.packaged,true);
  assert.equal(await page.evaluate(()=>typeof window.clipper),'undefined');
  await expect.poll(()=>application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(window=>window.isVisible()))).toBe(false);
  assert.equal(await application.evaluate(({globalShortcut})=>globalShortcut.isRegistered('Super+V')),false);
  await application.evaluate(({app})=>app.emit('second-instance',{},[process.execPath],process.cwd()));
  await expect.poll(()=>application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(window=>window.isVisible()))).toBe(true);
  assert.equal(await page.title(),'Clip');assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(work.output,'identity.json'),JSON.stringify({passed:true,identity,trayStartup:true,manualLaunch:true,errors},null,2));console.log(JSON.stringify({passed:true,identity,trayStartup:true,manualLaunch:true}));
 }finally{if(application)await application.close();await work.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
