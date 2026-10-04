const {expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {fixture}=require('./efficiency-fixture.cjs');
const {Store}=require('../work/test-exports.cjs');

async function run(){
 const rich=process.env.CLIPPER_PASTE_WORD_RICH==='1';
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
  const value='Clipper Word paste check '+randomUUID();
  if(rich){
   const store=new Store(':memory:');
   try{
    const html='<span style="color:#d7263d;font-weight:700;font-size:18pt">'+value+'</span>';
    const rtf='{\\rtf1\\ansi{\\colortbl ;\\red215\\green38\\blue61;}\\cf1\\b\\fs36 '+value+'\\b0\\cf0\\fs24}';
    store.add({text:value,html,rtf},'Word rich paste test');
    const seed=path.join(output,prefix+'-seed.json');await fs.writeFile(seed,JSON.stringify(store.backup()));
    await f.app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),seed);
    await f.page.evaluate(()=>window.clipper.backup('import'));
   }finally{store.close();}
  }else await f.page.evaluate(text=>window.clipper.saveOcr(text),value);
  child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('tests/paste-word-target.ps1'),'-Ready',ready,'-Result',result,'-Stop',stop,'-Failure',failure,...(rich?['-Details']:[])],{stdio:'ignore',windowsHide:true});
  await expect.poll(async()=>{if(await fs.stat(failure).then(()=>true,()=>false))throw Error(await fs.readFile(failure,'utf8'));return fs.readFile(ready,'utf8').catch(()=>'');},{timeout:45000}).toBe('ready');
  const source=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-Process -Name WINWORD | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1 Id,MainWindowHandle | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true}).trim();
  const found=JSON.parse(source);hwnd=found.MainWindowHandle;wordPid=found.Id;
  await f.helper.evaluate(async()=>{await global.focusTarget();global.helperWindow.setAlwaysOnTop(false);});
  await native('activate',hwnd);await native('click',hwnd);
  await expect.poll(()=>native('foreground')).toBe(hwnd);
  const opened=f.app.waitForEvent('window');await f.page.evaluate(()=>window.clipper.showTray());const panel=await opened;
  await panel.waitForSelector('.tray-row');await panel.locator('.tray-row').filter({hasText:value}).click({button:'right'});
  await expect.poll(async()=>{if(await fs.stat(failure).then(()=>true,()=>false))throw Error(await fs.readFile(failure,'utf8'));return fs.readFile(result,'utf8').catch(()=>'');},{timeout:10000}).toContain(value);
  const details=rich?JSON.parse(await fs.readFile(result,'utf8')):undefined;
  if(rich){const clipboard=JSON.parse(execFileSync('powershell.exe',['-Sta','-NoProfile','-NonInteractive','-Command',"Add-Type -AssemblyName System.Windows.Forms; $d=[System.Windows.Forms.Clipboard]::GetDataObject(); $r=$d.GetData('Rich Text Format',$false); $h=$d.GetData('HTML Format',$false); @{formats=@($d.GetFormats($false));rtf=[string]$r;html=[string]$h} | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true}));assert.ok(details.normal.text.includes(value),'Word did not receive the text');assert.ok(details.rtf.text.includes(value),'Word did not receive RTF text');assert.ok(clipboard.rtf.includes(value)&&clipboard.html.includes(value),'Clipboard lost a rich format');assert.equal(details.rtf.bold,-1,'Word did not preserve RTF bold formatting');assert.equal(details.rtf.color,0x3d26d7,'Word did not preserve RTF text color');assert.equal(details.rtf.size,18,'Word did not preserve RTF font size');}
  console.log(JSON.stringify({result:'PASS',wordPaste:true,rich,bold:details?.rtf.bold,color:details?.rtf.color,size:details?.rtf.size,wordPasteOption:details?.pasteOption}));
 }finally{
  await fs.writeFile(stop,'stop');
  if(child)await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(()=>{child.kill();resolve();},5000).unref();});
  if(wordPid)await new Promise(resolve=>setTimeout(resolve,500));
  if(wordPid)try{process.kill(wordPid,0);process.kill(wordPid);}catch{}
  await f.close();
 }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
