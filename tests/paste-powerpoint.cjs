const {expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {fixture}=require('./efficiency-fixture.cjs');

async function run(){
 const existing=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@(Get-Process -Name POWERPNT -ErrorAction SilentlyContinue).Count"],{encoding:'utf8',windowsHide:true}).trim();
 assert.equal(Number(existing),0,'Close existing PowerPoint windows before this isolated test');
 const output=path.resolve('work/paste-powerpoint');await fs.mkdir(output,{recursive:true});
 const prefix=randomUUID(),ready=path.join(output,prefix+'-ready.txt'),result=path.join(output,prefix+'-result.txt'),stop=path.join(output,prefix+'-stop.txt'),failure=path.join(output,prefix+'-error.txt');
 const f=await fixture('paste-powerpoint');let child,powerpointPid=0;
 const native=(action,arg)=>f.helper.evaluate(({app},{action,arg})=>{
  const req=process.getBuiltinModule('node:module').createRequire(process.getBuiltinModule('node:path').join(app.getAppPath(),'package.json'));
  const u=req('koffi').load('user32.dll');
  if(action==='foreground')return u.func('uintptr_t __stdcall GetForegroundWindow()')();
  if(action==='activate')return u.func('bool __stdcall SetForegroundWindow(uintptr_t)')(arg);
 },{action,arg});
 try{
  const value='Clipper PowerPoint 中文 ✅ '+randomUUID();
  await f.page.evaluate(text=>window.clipper.saveOcr(text),value);
  child=spawn('powershell.exe',['-Sta','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('tests/paste-powerpoint-target.ps1'),'-Ready',ready,'-Result',result,'-Stop',stop,'-Failure',failure],{stdio:'ignore',windowsHide:true});
  await expect.poll(async()=>{if(await fs.stat(failure).then(()=>true,()=>false))throw Error(await fs.readFile(failure,'utf8'));return fs.readFile(ready,'utf8').catch(()=>'');},{timeout:45000}).toBe('ready');
  const source=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-Process -Name POWERPNT | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1 Id,MainWindowHandle | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true}).trim();
  const found=JSON.parse(source),hwnd=found.MainWindowHandle;powerpointPid=found.Id;
  await f.helper.evaluate(async()=>{await global.focusTarget();global.helperWindow.setAlwaysOnTop(false);});
  await native('activate',hwnd);
  await expect.poll(()=>native('foreground')).toBe(hwnd);
  const opened=f.app.waitForEvent('window');await f.page.evaluate(()=>window.clipper.showTray());const panel=await opened;
  await panel.waitForSelector('.tray-row');await panel.locator('.tray-row').filter({hasText:value}).click({button:'right'});
  await expect.poll(async()=>{if(await fs.stat(failure).then(()=>true,()=>false))throw Error(await fs.readFile(failure,'utf8'));return fs.readFile(result,'utf8').catch(()=>'');},{timeout:10000}).toBe(value);
  console.log(JSON.stringify({result:'PASS',powerpointPaste:true,unicode:true,foregroundRestored:await native('foreground')===hwnd}));
 }finally{
  await fs.writeFile(stop,'stop');
  if(child)await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(()=>{child.kill();resolve();},5000).unref();});
  if(powerpointPid)await new Promise(resolve=>setTimeout(resolve,500));
  if(powerpointPid)try{process.kill(powerpointPid,0);process.kill(powerpointPid);}catch{}
  await f.close();
 }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
