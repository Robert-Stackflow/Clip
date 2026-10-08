const {expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {fixture}=require('./efficiency-fixture.cjs');

async function run(){
 const output=path.resolve('work/paste-native');await fs.mkdir(output,{recursive:true});
 const exe=path.join(output,'PasteTarget.exe'),ready=path.join(output,'ready.txt'),result=path.join(output,'result.txt');
 const csc=path.join(process.env.WINDIR,'Microsoft.NET','Framework64','v4.0.30319','csc.exe');
 const build=spawnSync(csc,['/nologo','/target:winexe','/codepage:65001','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/out:'+exe,path.resolve('tests/paste-native-target.cs')],{encoding:'utf8',windowsHide:true});
 assert.equal(build.status,0,build.stdout+build.stderr);
 await fs.rm(ready,{force:true});await fs.rm(result,{force:true});
 const f=await fixture('paste-native');let child,hwnd=0;
 try{
  const value='Clip native target paste check';
  await f.page.evaluate(text=>window.clip.applyText({mode:'save',source:'脚本处理',text:text}),value);
  child=spawn(exe,[ready,result],{stdio:'ignore',windowsHide:false});
  await expect.poll(async()=>{try{return Number(await fs.readFile(ready,'utf8'));}catch{return 0;}},{timeout:10000}).toBeGreaterThan(0);
  hwnd=Number(await fs.readFile(ready,'utf8'));
  await f.helper.evaluate(async({app},handle)=>{
   await global.focusTarget();global.helperWindow.setAlwaysOnTop(false);
   const req=process.getBuiltinModule('node:module').createRequire(process.getBuiltinModule('node:path').join(app.getAppPath(),'package.json'));
   const u=req('koffi').load('user32.dll'),activate=u.func('bool __stdcall SetForegroundWindow(uintptr_t)');
   if(!activate(handle))throw Error('Native target activation rejected');
  },hwnd);
  await expect.poll(()=>f.helper.evaluate(({app})=>{const req=process.getBuiltinModule('node:module').createRequire(process.getBuiltinModule('node:path').join(app.getAppPath(),'package.json'));return req('koffi').load('user32.dll').func('uintptr_t __stdcall GetForegroundWindow()')();})).toBe(hwnd);
  const opened=f.app.waitForEvent('window');await f.page.evaluate(()=>window.clip.showTray());const panel=await opened;
  await panel.waitForSelector('.tray-row');await panel.locator('.tray-row').filter({hasText:value}).click({button:'right'});
  await expect.poll(async()=>{try{return await fs.readFile(result,'utf8');}catch{return '';}}).toBe(value);
  console.log(JSON.stringify({result:'PASS',nativeTargetPaste:true,foregroundRestored:true}));
 }finally{
  if(hwnd)await f.helper.evaluate(({app},handle)=>{const req=process.getBuiltinModule('node:module').createRequire(process.getBuiltinModule('node:path').join(app.getAppPath(),'package.json'));req('koffi').load('user32.dll').func('bool __stdcall PostMessageW(uintptr_t,uint32,uintptr_t,intptr_t)')(handle,0x10,0,0);},hwnd).catch(()=>{});
  if(child)await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(()=>{child.kill();resolve();},3000).unref();});
  await f.close();
 }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
