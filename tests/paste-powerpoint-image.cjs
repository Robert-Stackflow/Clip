const {expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const yauzl=require('yauzl');
const {fixture}=require('./efficiency-fixture.cjs');

function embeddedImages(file){return new Promise((resolve,reject)=>yauzl.open(file,{lazyEntries:true},(error,zip)=>{
 if(error)return reject(error);
 const images=[];zip.readEntry();zip.on('entry',entry=>{
  if(!entry.fileName.startsWith('ppt/media/')){zip.readEntry();return;}
  zip.openReadStream(entry,(streamError,stream)=>{
   if(streamError){zip.close();reject(streamError);return;}
   const parts=[];stream.on('data',part=>parts.push(part));stream.on('error',reject);stream.on('end',()=>{images.push({name:entry.fileName,bytes:Buffer.concat(parts)});zip.readEntry();});
  });
 });zip.on('end',()=>resolve(images));zip.on('error',reject);
}));}

async function run(){
 const existing=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@(Get-Process -Name POWERPNT -ErrorAction SilentlyContinue).Count"],{encoding:'utf8',windowsHide:true}).trim();
 assert.equal(Number(existing),0,'Close existing PowerPoint windows before this isolated test');
 const output=path.resolve('work/paste-powerpoint-image');await fs.mkdir(output,{recursive:true});
 const prefix=randomUUID(),ready=path.join(output,prefix+'-ready.txt'),result=path.join(output,prefix+'-result.txt'),stop=path.join(output,prefix+'-stop.txt'),failure=path.join(output,prefix+'-error.txt'),presentation=path.join(output,prefix+'.pptx');
 const f=await fixture('paste-powerpoint-image');let child,powerpointPid=0;
 const native=(action,arg)=>f.helper.evaluate(({app},{action,arg})=>{
  const req=process.getBuiltinModule('node:module').createRequire(process.getBuiltinModule('node:path').join(app.getAppPath(),'package.json'));
  const u=req('koffi').load('user32.dll');
  if(action==='foreground')return u.func('uintptr_t __stdcall GetForegroundWindow()')();
  if(action==='activate')return u.func('bool __stdcall SetForegroundWindow(uintptr_t)')(arg);
 },{action,arg});
 try{
  const png=await f.target.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=160;canvas.height=96;const context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,160,96);context.fillStyle='#d7263d';context.fillRect(0,0,53,96);context.fillStyle='#2266cc';context.fillRect(107,0,53,96);context.fillStyle='#12a05c';context.fillRect(58,24,44,48);return canvas.toDataURL('image/png').split(',')[1];});
  await f.helper.evaluate(async({clipboard,ClipboardItem},value)=>clipboard.write([new ClipboardItem({'image/png':new Blob([Buffer.from(value,'base64')],{type:'image/png'})})]),png);
  await expect.poll(async()=>(await f.page.evaluate(()=>window.clip.state())).clips.some(item=>item.kind==='image'),{timeout:10000}).toBe(true);
  const image=(await f.page.evaluate(()=>window.clip.state())).clips.find(item=>item.kind==='image');
  child=spawn('powershell.exe',['-Sta','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('tests/paste-powerpoint-image-target.ps1'),'-Ready',ready,'-Result',result,'-Stop',stop,'-Failure',failure,'-Presentation',presentation],{stdio:'ignore',windowsHide:true});
  await expect.poll(async()=>{if(await fs.stat(failure).then(()=>true,()=>false))throw Error(await fs.readFile(failure,'utf8'));return fs.readFile(ready,'utf8').catch(()=>'');},{timeout:45000}).toBe('ready');
  const info=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-Process -Name POWERPNT | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1 Id,MainWindowHandle | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true}).trim();
  const found=JSON.parse(info),hwnd=found.MainWindowHandle;powerpointPid=found.Id;
  await f.helper.evaluate(async()=>{await global.focusTarget();global.helperWindow.setAlwaysOnTop(false);});
  await native('activate',hwnd);
  await expect.poll(()=>native('foreground')).toBe(hwnd);
  const opened=f.app.waitForEvent('window');await f.page.evaluate(()=>window.clip.showTray());const panel=await opened;
  await panel.waitForSelector('.tray-row');await panel.locator('.tray-row').filter({hasText:image.title}).click({button:'right'});
  await expect.poll(async()=>{if(await fs.stat(failure).then(()=>true,()=>false))throw Error(await fs.readFile(failure,'utf8'));return fs.readFile(result,'utf8').catch(()=>'');},{timeout:15000}).toContain('shapes');
  const summary=JSON.parse(await fs.readFile(result,'utf8'));
  assert.equal(summary.shapes,1,'PowerPoint did not insert exactly one image');
  assert(summary.width>0&&summary.height>0,'PowerPoint inserted an image with no visible size');
  const images=await embeddedImages(presentation);
  assert(images.length>0,'Saved PowerPoint presentation has no embedded image');
  const decoded=await f.app.evaluate(({nativeImage},{items,source})=>{const expected=nativeImage.createFromBuffer(Buffer.from(source,'base64')).toBitmap();return items.map(item=>{const image=nativeImage.createFromBuffer(Buffer.from(item.data,'base64'));return {name:item.name,size:image.getSize(),samePixels:image.toBitmap().equals(expected)};});},{source:png,items:images.map(item=>({name:item.name,data:item.bytes.toString('base64')}))});
  assert(decoded.some(item=>item.size.width===160&&item.size.height===96&&item.samePixels),JSON.stringify(decoded));
  console.log(JSON.stringify({result:'PASS',packaged:!!process.env.CLIP_PACKAGED_EXE,powerpointImagePaste:true,shapes:summary.shapes,embeddedImageSize:{width:160,height:96},pixelsPreserved:true}));
 }finally{
  await fs.writeFile(stop,'stop');
  if(child)await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(()=>{child.kill();resolve();},5000).unref();});
  if(powerpointPid)await new Promise(resolve=>setTimeout(resolve,500));
  if(powerpointPid)try{process.kill(powerpointPid,0);process.kill(powerpointPid);}catch{}
  await f.close();
 }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
