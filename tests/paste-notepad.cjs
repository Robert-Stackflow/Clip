const {expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {fixture}=require('./efficiency-fixture.cjs');

function notepads(){
 let source='';try{source=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-Process -Name notepad -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object Id,MainWindowHandle,MainWindowTitle | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true}).trim();}catch(error){if(error.status!==1||error.stdout||error.stderr)throw error;}
 return source?[].concat(JSON.parse(source)):[];
}
async function run(){
 const existing=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@(Get-Process -Name notepad -ErrorAction SilentlyContinue).Count"],{encoding:'utf8',windowsHide:true}).trim();
 assert.equal(Number(existing),0,'Close existing Notepad windows before this isolated test');
 const output=path.resolve('work/notepad-paste');await fs.mkdir(output,{recursive:true});
 const file=path.join(output,'clipper-focus-'+randomUUID()+'.txt');await fs.writeFile(file,'');
 const f=await fixture('notepad-paste');let child,hwnd=0,pid=0;
 const native=(action,arg)=>f.helper.evaluate(({app},{action,arg})=>{
  const req=process.getBuiltinModule('node:module').createRequire(process.getBuiltinModule('node:path').join(app.getAppPath(),'package.json'));
  const u=req('koffi').load('user32.dll');
  if(action==='foreground')return u.func('uintptr_t __stdcall GetForegroundWindow()')();
  if(action==='activate')return u.func('bool __stdcall SetForegroundWindow(uintptr_t)')(arg);
  if(action==='close')return u.func('bool __stdcall PostMessageW(uintptr_t,uint32,uintptr_t,intptr_t)')(arg,0x10,0,0);
  const send=u.func('uint32 __stdcall SendInput(uint32,void*,int)');
  if(action==='keys'){
   const buffer=Buffer.alloc(40*arg.length);
   arg.forEach(([key,flags],i)=>{buffer.writeUInt32LE(1,i*40);buffer.writeUInt16LE(key,i*40+8);buffer.writeUInt32LE(flags,i*40+12);});
   if(send(arg.length,buffer,40)!==arg.length)throw Error('Key injection failed');
   return;
  }
  if(action==='click'){
   const rect=u.func('bool __stdcall GetWindowRect(uintptr_t,void*)'),metric=u.func('int __stdcall GetSystemMetrics(int)'),box=Buffer.alloc(16);
   if(!rect(arg,box))throw Error('Notepad bounds unavailable');
   const x=box.readInt32LE(0)+150,y=box.readInt32LE(4)+160,buffer=Buffer.alloc(120);
   for(let i=0;i<3;i++){buffer.writeInt32LE(Math.round((x-metric(76))*65535/(metric(78)-1)),i*40+8);buffer.writeInt32LE(Math.round((y-metric(77))*65535/(metric(79)-1)),i*40+12);buffer.writeUInt32LE(0xc001|[0,2,4][i],i*40+20);}
   if(send(3,buffer,40)!==3)throw Error('Notepad click rejected');
  }
 },{action,arg});
 const keys=codes=>native('keys',codes);
 try{
  const value='Clipper Notepad paste check '+randomUUID();await f.page.evaluate(text=>window.clipper.applyText({mode:'save',source:'脚本处理',text:text}),value);
  child=spawn('notepad.exe',[file],{stdio:'ignore',windowsHide:false});
  await expect.poll(()=>notepads().find(item=>item.MainWindowTitle.includes(path.basename(file))),{timeout:15000}).not.toBeUndefined();
  const found=notepads().find(item=>item.MainWindowTitle.includes(path.basename(file)));hwnd=found.MainWindowHandle;pid=found.Id;
  await f.helper.evaluate(async()=>{await global.focusTarget();global.helperWindow.setAlwaysOnTop(false);});
  assert.equal(await native('activate',hwnd),true,'Notepad activation rejected before the Clipper test');
  await native('click',hwnd);
  await expect.poll(()=>native('foreground')).toBe(hwnd);
  const opened=f.app.waitForEvent('window');await f.page.evaluate(()=>window.clipper.showTray());const panel=await opened;
  await panel.waitForSelector('.tray-row');await panel.locator('.tray-row').filter({hasText:value}).click({button:'right'});
  await expect.poll(()=>native('foreground')).toBe(hwnd);
  await keys([[17,0],[65,0],[65,2],[17,2],[17,0],[67,0],[67,2],[17,2]]);
  await expect.poll(()=>f.helper.evaluate(({clipboard})=>clipboard.readText())).toBe(value);
  await keys([[17,0],[65,0],[65,2],[17,2],[8,0],[8,2],[17,0],[83,0],[83,2],[17,2]]);
  console.log(JSON.stringify({result:'PASS',notepadPaste:true,foregroundRestored:true}));
 }finally{
  if(hwnd)await native('close',hwnd).catch(()=>{});
  if(pid)await new Promise(resolve=>setTimeout(resolve,1200));
  if(pid&&notepads().some(item=>item.Id===pid))try{process.kill(pid);}catch{}
  if(child?.exitCode===null)child.kill();
  await f.close();
 }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
