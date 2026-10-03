const {_electron:electron}=require('@playwright/test');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');

(async()=>{
 const {beginCase}=await import('../scripts/workspace.mjs'),work=await beginCase('reference-native');
 const profile=path.join(work.fixtures,'profile'),{StorageManager}=require('../work/test-exports.cjs'),storage=new StorageManager(profile),store=await storage.start();store.saveSettings({...store.settings,paused:true});store.close();
 const env={...process.env,CLIPPER_TEST_MODE:'1',CLIPPER_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.CLIPPER_PACKAGED_EXE?{executablePath:process.env.CLIPPER_PACKAGED_EXE,args:[],env}:{args:[path.resolve('.')],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.waitForSelector('[data-page="symbols"]');
  await page.locator('[data-page="symbols"]').click();
  await page.waitForSelector('.reference-item',{timeout:8000}).catch(async error=>{console.error('Renderer errors:',errors,'Toast:',await page.locator('#toast').textContent(),'Content:',(await page.locator('#content').textContent()).slice(0,300));throw error;});
  await page.waitForSelector('canvas.reference-emoji-image.ready');
  await page.evaluate(()=>{window.referenceCopies=[];Object.defineProperty(navigator.clipboard,'writeText',{value:async text=>window.referenceCopies.push(text)});});
  await page.locator('[data-tab="mime"]').click();
  assert.ok(await page.locator('.reference-item').count()>0);
  await page.locator('.reference-item.reference-main').first().click();
  const copied=await page.evaluate(()=>window.referenceCopies.at(-1));
  assert.match(copied,/\//);
  const rejected=await page.evaluate(()=>window.clipper.openReference('https://example.com').then(()=>false,()=>true));
  assert.equal(rejected,true);
  await page.locator('[data-page="cheats"]').click();
  await page.waitForSelector('.reference-code-copy',{timeout:20000});
  await page.locator('[data-tab="latex"]').click();await page.locator('#reference-search').fill('希腊和希伯来字母');await page.waitForSelector('.katex');
  await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.evaluate(()=>document.fonts.check('12px KaTeX_Main')));
  await fs.writeFile(path.join(work.output,'result.json'),JSON.stringify({packaged:!!process.env.CLIPPER_PACKAGED_EXE,emojiWorker:true,mathFonts:true,errors},null,2));
  assert.deepEqual(errors,[]);
  console.log('Native file URL module loading and reference navigation passed.');
 }finally{await app.close();await work.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
