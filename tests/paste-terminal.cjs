const {expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {fixture}=require('./efficiency-fixture.cjs');

function terminal(title){
 const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-Process -Name WindowsTerminal -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like '*"+title+"*' } | Select-Object -First 1 Id,MainWindowHandle,MainWindowTitle | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true}).trim();
 return output?JSON.parse(output):undefined;
}
async function run(){
 const output=path.resolve('work/paste-terminal');await fs.mkdir(output,{recursive:true});
 const id=randomUUID(),title='ClipperPasteTerminal-'+id,ready=path.join(output,id+'-ready.txt'),result=path.join(output,id+'-result.txt');
 const f=await fixture('paste-terminal');let child,terminalPid=0;
 const native=(action,arg)=>f.helper.evaluate(({app},{action,arg})=>{
  const req=process.getBuiltinModule('node:module').createRequire(process.getBuiltinModule('node:path').join(app.getAppPath(),'package.json'));
  const u=req('koffi').load('user32.dll');
  if(action==='foreground')return u.func('uintptr_t __stdcall GetForegroundWindow()')();
  if(action==='activate')return u.func('bool __stdcall SetForegroundWindow(uintptr_t)')(arg);
  if(action==='enter'){
   const send=u.func('uint32 __stdcall SendInput(uint32,void*,int)'),buffer=Buffer.alloc(80);
   buffer.writeUInt32LE(1,0);buffer.writeUInt16LE(13,8);
   buffer.writeUInt32LE(1,40);buffer.writeUInt16LE(13,48);buffer.writeUInt32LE(2,52);
   if(send(2,buffer,40)!==2)throw Error('Enter key injection failed');
  }
 },{action,arg});
 try{
  const value='Clipper Windows Terminal 终端粘贴 😀 '+id;
  await f.page.evaluate(text=>window.clipper.saveOcr(text),value);
  child=spawn('wt.exe',['-w','new','new-tab','--title',title,'powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('tests/paste-terminal-target.ps1'),'-Ready',ready,'-Result',result],{stdio:'ignore',windowsHide:false});
  await expect.poll(async()=>({ready:await fs.readFile(ready,'utf8').catch(()=>''),window:terminal(title)}),{timeout:20000}).toEqual(expect.objectContaining({ready:'ready',window:expect.objectContaining({MainWindowHandle:expect.any(Number)})}));
  const found=terminal(title);assert.ok(found.MainWindowHandle>0);terminalPid=found.Id;
  await f.helper.evaluate(async()=>{await global.focusTarget();global.helperWindow.setAlwaysOnTop(false);});
  assert.equal(await native('activate',found.MainWindowHandle),true,'Windows Terminal activation rejected');
  await expect.poll(()=>native('foreground')).toBe(found.MainWindowHandle);
  const opened=f.app.waitForEvent('window');await f.page.evaluate(()=>window.clipper.showTray());const panel=await opened;
  await panel.waitForSelector('.tray-row');await panel.locator('.tray-row').filter({hasText:value}).click({button:'right'});
  await expect.poll(()=>native('foreground')).toBe(found.MainWindowHandle);
  assert.equal(await f.helper.evaluate(({clipboard})=>clipboard.readText()),value,'Clipboard text changed before terminal input');
  // Foreground activation happens before the queued Ctrl+V; allow that input to finish.
  await new Promise(resolve=>setTimeout(resolve,350));
  await native('enter');
  await expect.poll(()=>fs.readFile(result,'utf8').catch(()=>''),{timeout:10000}).toBe(value);
  console.log(JSON.stringify({result:'PASS',windowsTerminalPaste:true,foregroundRestored:true,packaged:!!process.env.CLIPPER_PACKAGED_EXE}));
 }finally{
  if(terminalPid)try{process.kill(terminalPid);}catch{}
  if(child?.exitCode===null)child.kill();
  await f.close();
 }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
