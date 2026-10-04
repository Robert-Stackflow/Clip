const {expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {fixture}=require('./efficiency-fixture.cjs');

async function run(){
 const existing=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@(Get-Process -Name WINWORD -ErrorAction SilentlyContinue).Count"],{encoding:'utf8',windowsHide:true}).trim();
 assert.equal(Number(existing),0,'Close existing Word windows before this isolated test');
 const output=path.resolve('work/paste-word');await fs.mkdir(output,{recursive:true});
 const prefix=randomUUID(),ready=path.join(output,prefix+'-ready.txt'),result=path.join(output,prefix+'-result.txt'),stop=path.join(output,prefix+'-stop.txt'),failure=path.join(output,prefix+'-error.txt');
 const f=await fixture('paste-word');let child,hwnd=0,wordPid=0;
 const native=(action,arg)=>f.helper.evaluate(({app},{action,arg})=>{
  const req=process.getBuiltinModule('node:module').createRequire(process.getBuiltinModule('node:path').join(app.getAppPath(),'package.json'));
  const u=req('koffi').load('user32.dll');
  if(action==='foreground')return u.func('uintptr_t __stdcall GetForegroundWindow()')();
  if(action==='activate')return u.func('bool __stdcall SetForegroundWindow(uintptr_t)')(arg);
  if(action==='click'){
   const rect=u.func('bool __stdcall GetWindowRect(uintptr_t,void*)'),send=u.func('uint32 __stdcall SendInput(uint32,void*,int)'),metric=u.func('int __stdcall GetSystemMetrics(int)'),box=Buffer.alloc(16);
   if(!rect(arg,box))throw Error('Word bounds unavailable');
   const x=box.readInt32LE(0)+300,y=box.readInt32LE(4)+240,buffer=Buffer.alloc(120);
   for(let i=0;i<3;i++){buffer.writeInt32LE(Math.round((x-metric(76))*65535/(metric(78)-1)),i*40+8);buffer.writeInt32LE(Math.round((y-metric(77))*65535/(metric(79)-1)),i*40+12);buffer.writeUInt32LE(0xc001|[0,2,4][i],i*40+20);}
   if(send(3,buffer,40)!==3)throw Error('Word click rejected');
  }
 },{action,arg});
 try{
  const value='Clipper Word paste check '+randomUUID();await f.page.evaluate(text=>window.clipper.saveOcr(text),value);
  child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('tests/paste-word-target.ps1'),'-Ready',ready,'-Result',result,'-Stop',stop,'-Failure',failure],{stdio:'ignore',windowsHide:true});
  await expect.poll(async()=>{if(await fs.stat(failure).then(()=>true,()=>false))throw Error(await fs.readFile(failure,'utf8'));return fs.readFile(ready,'utf8').catch(()=>'');},{timeout:45000}).toBe('ready');
  const source=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-Process -Name WINWORD | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1 Id,MainWindowHandle | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true}).trim();
  const found=JSON.parse(source);hwnd=found.MainWindowHandle;wordPid=found.Id;
  await f.helper.evaluate(async()=>{await global.focusTarget();global.helperWindow.setAlwaysOnTop(false);});
  await native('activate',hwnd);await native('click',hwnd);
  await expect.poll(()=>native('foreground')).toBe(hwnd);
  const opened=f.app.waitForEvent('window');await f.page.evaluate(()=>window.clipper.showTray());const panel=await opened;
  await panel.waitForSelector('.tray-row');await panel.locator('.tray-row').filter({hasText:value}).click({button:'right'});
  await expect.poll(async()=>{if(await fs.stat(failure).then(()=>true,()=>false))throw Error(await fs.readFile(failure,'utf8'));return fs.readFile(result,'utf8').catch(()=>'');},{timeout:10000}).toContain(value);
  console.log(JSON.stringify({result:'PASS',wordPaste:true,foregroundRestored:await native('foreground')===hwnd}));
 }finally{
  await fs.writeFile(stop,'stop');
  if(child)await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(()=>{child.kill();resolve();},5000).unref();});
  if(wordPid)await new Promise(resolve=>setTimeout(resolve,500));
  if(wordPid)try{process.kill(wordPid,0);process.kill(wordPid);}catch{}
  await f.close();
 }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
