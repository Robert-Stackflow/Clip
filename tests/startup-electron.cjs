const {_electron:electron,expect}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{build}=require('esbuild');
const {Store,StorageManager,defaults,desktopDefaults,efficiencyDefaults}=require('../work/test-exports.cjs');
const version=require('../package.json').version,password='isolated startup test password';
(async()=>{
 const {beginCase}=await import('../scripts/workspace.mjs'),work=await beginCase('startup-electron'),host=path.join(work.fixtures,'host');await fs.mkdir(host);
 let source=await fs.readFile('src/main/index.ts','utf8');
 source=source.replace("startupPending=false;trayMenu();if(!launchInTray)show();", "startupPending=false;trayMenu();globalThis.__startupReady=true;if(!launchInTray)show();");
 // Mark actual startup completion without changing production timing or behavior.
 await build({stdin:{contents:source,resolveDir:path.resolve('src/main'),sourcefile:'index.ts',loader:'ts'},outfile:path.join(host,'main.cjs'),bundle:true,platform:'node',target:'node22',packages:'external',define:{__dirname:JSON.stringify(path.resolve('dist/main'))}});
 await fs.writeFile(path.join(host,'package.json'),JSON.stringify({name:'clip-startup-test',version,main:'main.cjs'}));
 const results=[],errors=[];
 async function seed(name,encrypted=false){
  const profile=path.join(work.fixtures,name);await fs.mkdir(profile);const manager=new StorageManager(profile),store=await manager.start();
  store.saveSettings({...defaults,paused:true,launchAtLogin:true,shortcut:'',nextShortcut:''});
  store.setMeta('desktop-options',{...desktopDefaults,shelfShortcut:'',shelfAutoDrag:false,shelfTop:false});store.setMeta('efficiency',{...efficiencyDefaults,repliesShortcut:''});
  store.setMeta('quick-panel-shortcut','');store.setMeta('quick-panel-intercept-win-v',false);store.setMeta('ai-chat-options',{shortcut:'',onTop:false,keepOpen:true});
  // A large synthetic history exercises opening projections without reading bodies.
  if(!encrypted)for(let i=0;i<24;i++)store.add({text:`${i}-`+'x'.repeat(900000)},'fixture',undefined,undefined,false);
  if(encrypted){const plan=await manager.prepareEncryption(password);await manager.encrypt(plan.token,plan.recoveryKey);}
  manager.store.close();manager.vault.lock();return profile;
 }
 for(const mode of ['manual','login','encrypted-login','recovery-login']){
  const encrypted=mode==='encrypted-login',profile=await seed(mode,encrypted);if(mode==='recovery-login')await fs.writeFile(path.join(profile,'storage-location.json'),'{broken pointer');const env={...process.env,CLIP_TEST_MODE:'1',CLIP_DATA_DIR:profile};
  for(const key of ['ELECTRON_RUN_AS_NODE','CLIP_DEVELOPMENT','CLIP_DEV_DATA_DIR','CLIP_DEV_HIDDEN'])delete env[key];
  let app;
  try{
   const begin=performance.now();app=await electron.launch({args:[host,...(mode==='manual'?[]:['--startup'])],env});const page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));
   await page.waitForLoadState('domcontentloaded');
   if(encrypted||mode==='recovery-login'){
    await page.waitForFunction(()=>!!window.unlock||!!window.recovery);await page.waitForTimeout(400);
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible())),false,'Login must keep unlock/recovery dialogs hidden');
   }else{
    await page.waitForSelector('#search');await expect.poll(()=>app.evaluate(()=>!!globalThis.__startupReady)).toBe(true);
    assert.equal(await app.evaluate(({globalShortcut})=>globalShortcut.isRegistered('Super+V')),false);
    assert.equal(await page.evaluate(()=>clip.state().then(s=>s.settings.paused)),true);
   }
   const readyMs=Math.round(performance.now()-begin);
   await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible()))).toBe(mode==='manual');
   if(mode!=='manual'){
    await app.evaluate(({app})=>app.emit('second-instance',{},[process.execPath,'--startup'],process.cwd()));await page.waitForTimeout(400);
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible())),false,'Repeated login startup must stay in the tray');
    // Tray activation and a manual second launch use the production show() path.
    await app.evaluate(({app})=>app.emit('second-instance',{},[process.execPath],process.cwd()));
    await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible()))).toBe(true);
   }
   results.push({mode,readyMs,trayOnly:mode!=='manual',manualOpen:true});
   await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.hide()));
  }finally{if(app)await app.close();}
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(work.output,'startup.json'),JSON.stringify({passed:true,results,scope:'Isolated profiles, paused capture, no global shortcuts; actual production main and renderer, manual/login/encrypted-login/recovery-login behavior.'},null,2));
 console.log(JSON.stringify({passed:true,results}));await work.close();
})().catch(error=>{console.error(error);process.exitCode=1;});
