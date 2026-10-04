const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');

(async()=>{
 const profile=path.resolve('work/development/renderer-recovery-'+randomUUID());await fs.mkdir(profile,{recursive:true});
 const env={...process.env,CLIPPER_DEVELOPMENT:'1',CLIPPER_DEV_HIDDEN:'1',CLIPPER_DEV_DATA_DIR:profile,CLIPPER_TEST_MODE:'1'};delete env.ELECTRON_RUN_AS_NODE;
 let app;
 try{
  app=await electron.launch({args:[path.resolve('.')],env});const page=await app.firstWindow();await page.waitForSelector('#search');await expect(page).toHaveTitle('Clipper');expect(await page.evaluate(()=>document.title)).toBe('Clipper');expect(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>window.webContents.getURL()==='clipper://app/index.html').getTitle())).toBe('Clipper · Dev');const before=await page.evaluate(()=>performance.timeOrigin);
  const original=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>window.webContents.getURL()==='clipper://app/index.html').webContents.id);
  await app.evaluate(({BrowserWindow},id)=>{globalThis.__clipperRendererReloads=0;const contents=BrowserWindow.getAllWindows().find(window=>window.webContents.id===id).webContents;contents.on('did-finish-load',()=>globalThis.__clipperRendererReloads++);contents.forcefullyCrashRenderer();},original);
  await expect.poll(()=>app.evaluate(()=>globalThis.__clipperRendererReloads),{timeout:10000}).toBeGreaterThan(0);
  const recovered=await app.evaluate(async({BrowserWindow},id)=>BrowserWindow.getAllWindows().find(window=>window.webContents.id===id).webContents.executeJavaScript("({origin:performance.timeOrigin,ready:!!document.querySelector('#content h1')})"),original);
  expect(recovered.ready).toBe(true);expect(recovered.origin).not.toBe(before);expect(await app.evaluate(({BrowserWindow},id)=>BrowserWindow.getAllWindows().find(window=>window.webContents.id===id).getTitle(),original)).toBe('Clipper · Dev');
  console.log(JSON.stringify({passed:true,profile,rendererRecovered:true,windowRetained:true}));
 }finally{await app?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
