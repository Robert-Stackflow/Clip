const {expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {fixture}=require('./efficiency-fixture.cjs');
const {png}=require('./png-fixture.cjs');
const {requireEmptyClipboard}=require('./clipboard-guard.cjs');

function readClipboard(){return JSON.parse(execFileSync('powershell.exe',['-Sta','-NoProfile','-NonInteractive','-Command',"Add-Type -AssemblyName System.Windows.Forms; $d=[System.Windows.Forms.Clipboard]::GetDataObject(); @{formats=@($d.GetFormats($false));text=[System.Windows.Forms.Clipboard]::GetText();html=[string]$d.GetData('HTML Format',$false);rtf=[string]$d.GetData('Rich Text Format',$false)} | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true}));}
function powerpointCount(){return Number(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@(Get-Process -Name POWERPNT -ErrorAction SilentlyContinue).Count"],{encoding:'utf8',windowsHide:true}).trim());}

async function run(){
 const imageMode=process.env.CLIP_CAPTURE_POWERPOINT_IMAGE==='1';
 assert.equal(powerpointCount(),0,'Close existing PowerPoint windows before this isolated test');
 const clipboardGuard=requireEmptyClipboard();
 const name=imageMode?'capture-powerpoint-image':'capture-powerpoint-rich';
 const output=path.resolve('work/'+name);await fs.mkdir(output,{recursive:true});
 const prefix=randomUUID(),ready=path.join(output,prefix+'-ready.txt'),stop=path.join(output,prefix+'-stop.txt'),failure=path.join(output,prefix+'-error.txt'),picture=path.join(output,prefix+'.png');
 const value='Clip PowerPoint source '+randomUUID();
 if(imageMode)await fs.writeFile(picture,png(160,96,(x,y)=>[x<54?215:34,y<48?38:102,x>106?204:61,255]));
 const f=await fixture(name);let child,powerpointPid=0;
 const native=(action,arg)=>f.helper.evaluate(({app},{action,arg})=>{
  const req=process.getBuiltinModule('node:module').createRequire(process.getBuiltinModule('node:path').join(app.getAppPath(),'package.json'));
  const u=req('koffi').load('user32.dll');
  if(action==='foreground')return u.func('uintptr_t __stdcall GetForegroundWindow()')();
  if(action==='activate'){u.func('bool __stdcall ShowWindow(uintptr_t,int)')(arg,9);return u.func('bool __stdcall SetForegroundWindow(uintptr_t)')(arg);}
  if(action==='clickTitle'){
   const rect=u.func('bool __stdcall GetWindowRect(uintptr_t,void*)'),send=u.func('uint32 __stdcall SendInput(uint32,void*,int)'),metric=u.func('int __stdcall GetSystemMetrics(int)'),box=Buffer.alloc(16);
   if(!rect(arg,box))throw Error('PowerPoint bounds unavailable');
   const x=box.readInt32LE(0)+300,y=box.readInt32LE(4)+20,buffer=Buffer.alloc(120);
   for(let i=0;i<3;i++){buffer.writeInt32LE(Math.round((x-metric(76))*65535/(metric(78)-1)),i*40+8);buffer.writeInt32LE(Math.round((y-metric(77))*65535/(metric(79)-1)),i*40+12);buffer.writeUInt32LE(0xc001|[0,2,4][i],i*40+20);}
   if(send(3,buffer,40)!==3)throw Error('PowerPoint title click rejected');
  }
 },{action,arg});
 try{
  const initial=(await f.page.evaluate(()=>window.clip.state())).clips.length;
  child=spawn('powershell.exe',['-Sta','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('tests/capture-powerpoint-rich-target.ps1'),'-Value',value,'-Ready',ready,'-Stop',stop,'-Failure',failure,...(imageMode?['-Picture',picture]:[])],{stdio:'ignore',windowsHide:true});
  await expect.poll(async()=>{if(await fs.stat(failure).then(()=>true,()=>false))throw Error(await fs.readFile(failure,'utf8'));return fs.readFile(ready,'utf8').catch(()=>'');},{timeout:45000}).toBe('ready');
  const info=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-Process -Name POWERPNT | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1 Id,MainWindowHandle | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true}).trim();
  const found=JSON.parse(info),hwnd=found.MainWindowHandle;powerpointPid=found.Id;
  for(let attempt=0;attempt<3;attempt++){
   await f.helper.evaluate(async()=>{await global.focusTarget();global.helperWindow.setAlwaysOnTop(false);});
   await native('activate',hwnd);await native('clickTitle',hwnd);
   if(await native('foreground')===hwnd)break;
   await new Promise(resolve=>setTimeout(resolve,200));
  }
  await expect.poll(()=>native('foreground')).toBe(hwnd);
  clipboardGuard.assertUnchanged();
  await f.key('Control+C');
  if(imageMode)await expect.poll(()=>readClipboard().formats.includes('PNG'),{timeout:5000}).toBe(true);
  else await expect.poll(()=>readClipboard().text,{timeout:5000}).toContain(value);
  const source=readClipboard();
  const richHTML=html=>html.includes('Clip PowerPoint source')&&html.includes(value.slice(-36))&&/font-weight:bold/i.test(html)&&/#D7263D/i.test(html);
  if(imageMode)assert(source.formats.includes('PNG'),'PowerPoint did not place an image on the clipboard');
  else{
   assert(source.formats.includes('Art::Text ClipFormat'),'PowerPoint did not place a text selection on the clipboard');
   assert(richHTML(source.html)&&source.rtf.includes(value),'PowerPoint did not provide rich text');
  }
  await expect.poll(async()=>{if(await fs.stat(failure).then(()=>true,()=>false))throw Error(await fs.readFile(failure,'utf8'));return (await f.page.evaluate(()=>window.clip.state())).clips.length;},{timeout:15000}).toBeGreaterThan(initial);
  const clip=(await f.page.evaluate(()=>window.clip.state())).clips[0];
  const detail=await f.page.evaluate(id=>window.clip.detail(id),clip.id);
  if(imageMode){
   assert.equal(clip.kind,'image','PowerPoint selected image was not shown as an image');
   assert(detail.payload.png,'PowerPoint image was not recorded');
  }else{
   assert(detail.payload.text?.includes(value),'PowerPoint text was not recorded');
   assert.equal(clip.kind,'text','PowerPoint selected text was shown as an image');
   assert.equal(clip.title,value,'PowerPoint selected text lost its history title');
   assert(richHTML(detail.payload.html||'')&&detail.payload.rtf?.includes(value),'PowerPoint rich formats were not recorded');
   assert(detail.payload.png&&detail.payload.formats?.some(item=>item.name==='Art::Text ClipFormat'),'PowerPoint fallback image or private text format was lost');
  }
  await fs.writeFile(stop,'stop');
  await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(()=>{child.kill();resolve();},5000).unref();});
  await expect.poll(powerpointCount,{timeout:5000}).toBe(0);
  await f.page.evaluate(id=>window.clip.copy(id,false),clip.id);
  const replay=readClipboard();
  if(imageMode){
   assert(replay.formats.includes('PNG'),'Replayed record lost PowerPoint image');
   console.log(JSON.stringify({result:'PASS',source:'PowerPoint image selection',kind:clip.kind,image:true,replayAfterSourceClosed:true}));
  }else{
   assert.equal(replay.text,source.text,'Replayed record lost PowerPoint text');
   assert(richHTML(replay.html)&&replay.rtf.includes(value),'Replayed record lost PowerPoint rich text');
   assert(replay.formats.includes('Art::Text ClipFormat')&&replay.formats.includes('PNG'),'Replayed record lost PowerPoint companion formats');
   console.log(JSON.stringify({result:'PASS',source:'PowerPoint text selection',kind:clip.kind,title:clip.title,richText:true,companionImage:true,privateFormat:true,replayAfterSourceClosed:true}));
  }
 }finally{
  await fs.writeFile(stop,'stop');
  if(child&&child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);setTimeout(()=>{child.kill();resolve();},5000).unref();});
  if(powerpointPid)await new Promise(resolve=>setTimeout(resolve,500));
  if(powerpointPid)try{process.kill(powerpointPid,0);process.kill(powerpointPid);}catch{}
  await f.close();
 }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
