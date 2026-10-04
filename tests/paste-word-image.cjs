const {expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const yauzl=require('yauzl');
const {fixture}=require('./efficiency-fixture.cjs');

function media(file){return new Promise((resolve,reject)=>yauzl.open(file,{lazyEntries:true},(error,zip)=>{
 if(error)return reject(error);
 const images=[];zip.readEntry();zip.on('entry',entry=>{
  if(!entry.fileName.startsWith('word/media/')){zip.readEntry();return;}
  zip.openReadStream(entry,(streamError,stream)=>{
   if(streamError){zip.close();reject(streamError);return;}
   const parts=[];stream.on('data',part=>parts.push(part));stream.on('error',reject);stream.on('end',()=>{images.push({name:entry.fileName,bytes:Buffer.concat(parts)});zip.readEntry();});
  });
 });zip.on('end',()=>resolve(images));zip.on('error',reject);
}));}

async function run(){
 const existing=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@(Get-Process -Name WINWORD -ErrorAction SilentlyContinue).Count"],{encoding:'utf8',windowsHide:true}).trim();
 assert.equal(Number(existing),0,'Close existing Word windows before this isolated test');
 const output=path.resolve('work/paste-word-image');await fs.mkdir(output,{recursive:true});
 const prefix=randomUUID(),ready=path.join(output,prefix+'-ready.txt'),result=path.join(output,prefix+'-result.txt'),stop=path.join(output,prefix+'-stop.txt'),failure=path.join(output,prefix+'-error.txt'),document=path.join(output,prefix+'.docx');
 const f=await fixture('paste-word-image');let child,hwnd=0,wordPid=0;
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
  const png=await f.target.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=160;canvas.height=96;const context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,160,96);context.fillStyle='#d7263d';context.fillRect(0,0,53,96);context.fillStyle='#2266cc';context.fillRect(107,0,53,96);context.fillStyle='#12a05c';context.fillRect(58,24,44,48);return canvas.toDataURL('image/png').split(',')[1];});
  await f.helper.evaluate(async({clipboard,ClipboardItem},value)=>clipboard.write([new ClipboardItem({'image/png':new Blob([Buffer.from(value,'base64')],{type:'image/png'})})]),png);
  await expect.poll(async()=>(await f.page.evaluate(()=>window.clipper.state())).clips.some(item=>item.kind==='image'),{timeout:10000}).toBe(true);
  const image=(await f.page.evaluate(()=>window.clipper.state())).clips.find(item=>item.kind==='image');
  child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('tests/paste-word-image-target.ps1'),'-Ready',ready,'-Result',result,'-Stop',stop,'-Failure',failure,'-Document',document],{stdio:'ignore',windowsHide:true});
  await expect.poll(async()=>{if(await fs.stat(failure).then(()=>true,()=>false))throw Error(await fs.readFile(failure,'utf8'));return fs.readFile(ready,'utf8').catch(()=>'');},{timeout:45000}).toBe('ready');
  const processInfo=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-Process -Name WINWORD | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1 Id,MainWindowHandle | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true}).trim();
  ({MainWindowHandle:hwnd,Id:wordPid}=JSON.parse(processInfo));
  await f.helper.evaluate(async()=>{await global.focusTarget();global.helperWindow.setAlwaysOnTop(false);});
  await native('activate',hwnd);await native('click',hwnd);
  await expect.poll(()=>native('foreground')).toBe(hwnd);
  const opened=f.app.waitForEvent('window');await f.page.evaluate(()=>window.clipper.showTray());const panel=await opened;
  await panel.waitForSelector('.tray-row');await panel.locator('.tray-row').filter({hasText:image.title}).click({button:'right'});
  await expect.poll(async()=>{if(await fs.stat(failure).then(()=>true,()=>false))throw Error(await fs.readFile(failure,'utf8'));return fs.readFile(result,'utf8').catch(()=>'');},{timeout:15000}).toContain('inlineShapes');
  const summary=JSON.parse(await fs.readFile(result,'utf8'));
  assert.equal(summary.inlineShapes,1,'Word did not insert exactly one image');
  assert(summary.width>0&&summary.height>0,'Word inserted an image with no visible size');
  const images=await media(document);
  assert(images.length>0,'Saved Word document has no embedded image');
  const decoded=await f.app.evaluate(({nativeImage},{items,source})=>{const expected=nativeImage.createFromBuffer(Buffer.from(source,'base64')).toBitmap();return items.map(item=>{const image=nativeImage.createFromBuffer(Buffer.from(item.data,'base64'));return {name:item.name,size:image.getSize(),samePixels:image.toBitmap().equals(expected)};});},{source:png,items:images.map(item=>({name:item.name,data:item.bytes.toString('base64')}))});
  assert(decoded.some(item=>item.size.width===160&&item.size.height===96&&item.samePixels),JSON.stringify(decoded));
  console.log(JSON.stringify({result:'PASS',packaged:!!process.env.CLIPPER_PACKAGED_EXE,wordImagePaste:true,inlineShapes:summary.inlineShapes,embeddedImageSize:{width:160,height:96},pixelsPreserved:true}));
 }finally{
  await fs.writeFile(stop,'stop');
  if(child)await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(()=>{child.kill();resolve();},5000).unref();});
  if(wordPid)await new Promise(resolve=>setTimeout(resolve,500));
  if(wordPid)try{process.kill(wordPid,0);process.kill(wordPid);}catch{}
  await f.close();
 }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
