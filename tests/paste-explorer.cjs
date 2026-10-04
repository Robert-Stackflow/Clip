const {expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const {build}=require('esbuild');
const {fixture}=require('./efficiency-fixture.cjs');
const {fixture:virtualFixture}=require('./virtual-fixture.cjs');

const ps=script=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true}).trim();
const quote=value=>"'"+value.replaceAll("'","''")+"'";

function openExplorer(folder){
 const target=quote(folder);
 const result=ps(`$shell=New-Object -ComObject Shell.Application; $before=@($shell.Windows() | ForEach-Object { [long]$_.HWND }); $shell.Open(${target}); $window=$null; for($i=0;$i -lt 50;$i++){ Start-Sleep -Milliseconds 200; $window=@($shell.Windows() | Where-Object { try { $_.Document.Folder.Self.Path -eq ${target} } catch { $false } }) | Select-Object -First 1; if($window){ break } }; if(-not $window){ throw 'Test Explorer window did not open' }; if($before -contains [long]$window.HWND){ throw 'Explorer reused an existing window; refusing to close it' }; [long]$window.HWND`);
 const hwnd=Number(result);
 assert(Number.isSafeInteger(hwnd)&&hwnd>0,'Explorer returned an invalid window handle');
 return hwnd;
}

function closeExplorer(folder,hwnd){
 ps(`$shell=New-Object -ComObject Shell.Application; @($shell.Windows() | Where-Object { try { [long]$_.HWND -eq ${hwnd} -and $_.Document.Folder.Self.Path -eq ${quote(folder)} } catch { $false } }) | ForEach-Object { $_.Quit() }`);
}

async function run(){
 const root=path.resolve('work/paste-explorer');
 const sourceDir=path.join(root,'source-'+randomUUID()),targetDir=path.join(root,'target-'+randomUUID());
 await fs.mkdir(sourceDir,{recursive:true});await fs.mkdir(targetDir,{recursive:true});
 const fileName='Clipper Explorer 文件 '+randomUUID()+'.txt';
 const source=path.join(sourceDir,fileName),destination=path.join(targetDir,fileName);
 const bytes=Buffer.from('Clipper file paste check '+randomUUID()+'\r\n第二行：文件内容必须完全一致。\r\n','utf8');
 await fs.writeFile(source,bytes);
 await build({entryPoints:['src/main/native.ts'],outfile:path.join(root,'native-test.cjs'),bundle:true,platform:'node',external:['koffi']});
 const f=await fixture('paste-explorer');let hwnd=0,ole;
 const native=(action,arg)=>f.helper.evaluate(({app},{action,arg})=>{
  const req=process.getBuiltinModule('node:module').createRequire(process.getBuiltinModule('node:path').join(app.getAppPath(),'package.json'));
  const u=req('koffi').load('user32.dll');
  if(action==='foreground')return u.func('uintptr_t __stdcall GetForegroundWindow()')();
  if(action==='activate')return u.func('bool __stdcall SetForegroundWindow(uintptr_t)')(arg);
  if(action==='click'){
   const rect=u.func('bool __stdcall GetWindowRect(uintptr_t,void*)'),metric=u.func('int __stdcall GetSystemMetrics(int)'),box=Buffer.alloc(16);
   if(!rect(arg,box))throw Error('Explorer bounds unavailable');
   const x=box.readInt32LE(0)+Math.min(350,Math.max(100,box.readInt32LE(8)-box.readInt32LE(0)-60));
   const y=box.readInt32LE(4)+Math.min(300,Math.max(160,box.readInt32LE(12)-box.readInt32LE(4)-60));
   const buffer=Buffer.alloc(120),send=u.func('uint32 __stdcall SendInput(uint32,void*,int)');
   for(let i=0;i<3;i++){buffer.writeInt32LE(Math.round((x-metric(76))*65535/(metric(78)-1)),i*40+8);buffer.writeInt32LE(Math.round((y-metric(77))*65535/(metric(79)-1)),i*40+12);buffer.writeUInt32LE(0xc001|[0,2,4][i],i*40+20);}
   if(send(3,buffer,40)!==3)throw Error('Explorer click rejected');
  }
 },{action,arg});
 const focusExplorer=async()=>{await native('activate',hwnd);await native('click',hwnd);await expect.poll(()=>native('foreground'),{timeout:5000}).toBe(hwnd);};
 const openTray=async()=>{
  await f.page.evaluate(()=>window.clipper.showTray());
  for(let attempt=0;attempt<50;attempt++){
   const visible=await f.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(window=>window.isVisible()&&window.webContents.getURL().endsWith('/tray.html')));
   if(visible){const pages=await f.app.windows(),panel=pages.find(page=>!page.isClosed()&&page.url().endsWith('/tray.html'));if(panel){await panel.waitForSelector('.tray-row');return panel;}}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error('Recent records panel did not open');
 };
 try{
  await f.helper.evaluate(({app},nativePath)=>{const req=process.getBuiltinModule('node:module').createRequire(process.getBuiltinModule('node:path').join(app.getAppPath(),'package.json'));global.native=req(nativePath);global.native.initNative();},path.join(root,'native-test.cjs'));
  await f.helper.evaluate((_event,file)=>global.native.writeFiles([file],Number(global.helperWindow.getNativeWindowHandle().readBigUInt64LE())),source);
  await expect.poll(async()=>(await f.page.evaluate(()=>window.clipper.state())).clips.some(item=>item.kind==='files'),{timeout:10000}).toBe(true);
  hwnd=openExplorer(targetDir);
  await f.helper.evaluate(async()=>{await global.focusTarget();global.helperWindow.setAlwaysOnTop(false);});
  await focusExplorer();
  let panel=await openTray();
  await panel.locator('.tray-row').filter({hasText:fileName}).click({button:'right'});
  await expect.poll(async()=>{try{return await fs.readFile(destination,'utf8');}catch{return ''; }},{timeout:10000}).toBe(bytes.toString('utf8'));
  assert.deepEqual(await fs.readFile(destination),bytes);
  assert.deepEqual(await fs.readFile(source),bytes);
  assert.equal(await native('foreground'),hwnd,'Explorer should regain foreground after paste');

  const secondName='Clipper Explorer 多文件 '+randomUUID()+'.bin';
  const secondSource=path.join(sourceDir,secondName),secondDestination=path.join(targetDir,secondName);
  const folderName='Clipper Explorer 文件夹 '+randomUUID();
  const folderSource=path.join(sourceDir,folderName),folderDestination=path.join(targetDir,folderName);
  const nestedName='内层文件.txt',nestedBytes=Buffer.from('Nested file '+randomUUID()+'\r\n','utf8');
  const secondBytes=Buffer.from(Array.from({length:4096},(_,index)=>index%251));
  await fs.mkdir(path.join(folderSource,'子目录'),{recursive:true});
  await fs.mkdir(path.join(folderSource,'空目录'));
  await fs.writeFile(path.join(folderSource,'子目录',nestedName),nestedBytes);
  await fs.writeFile(secondSource,secondBytes);
  await f.helper.evaluate((_event,files)=>global.native.writeFiles(files,Number(global.helperWindow.getNativeWindowHandle().readBigUInt64LE())),[secondSource,folderSource]);
  await expect.poll(async()=>(await f.page.evaluate(()=>window.clipper.state())).clips.some(item=>item.kind==='files'&&item.title.includes(secondName)&&item.title.startsWith('2 ')),{timeout:10000}).toBe(true);
  await focusExplorer();
  panel=await openTray();
  const secondRow=panel.locator('.tray-row').filter({hasText:secondName});
  await expect(secondRow).toBeVisible();
  await secondRow.click({button:'right'});
  await expect.poll(async()=>{try{return await fs.readFile(secondDestination);}catch{return null;}},{timeout:10000}).toEqual(secondBytes);
  await expect.poll(async()=>{try{return await fs.readFile(path.join(folderDestination,'子目录',nestedName),'utf8');}catch{return ''; }},{timeout:10000}).toBe(nestedBytes.toString('utf8'));
  assert.equal((await fs.stat(path.join(folderDestination,'空目录'))).isDirectory(),true);
  assert.deepEqual(await fs.readFile(secondSource),secondBytes);
  assert.deepEqual(await fs.readFile(path.join(folderSource,'子目录',nestedName)),nestedBytes);
  assert.equal(await native('foreground'),hwnd,'Explorer should regain foreground after multi-item paste');

  const virtualName='虚拟附件 '+randomUUID()+'.txt';
  const virtualBytes=Buffer.from('OLE attachment '+randomUUID()+'\r\n中文内容\r\n','utf8');
  ole=await virtualFixture();
  await ole.request({action:'set',entries:[{name:virtualName,data:virtualBytes.toString('base64'),type:'stream'}]});
  await expect.poll(async()=>(await f.page.evaluate(()=>window.clipper.state())).clips.some(item=>item.kind==='files'&&item.title.includes(virtualName)),{timeout:12000}).toBe(true);
  const virtualId=(await f.page.evaluate(()=>window.clipper.state())).clips.find(item=>item.kind==='files'&&item.title.includes(virtualName)).id;
  const virtualDetail=await f.page.evaluate(id=>window.clipper.detail(id),virtualId);
  assert.deepEqual(Buffer.from(virtualDetail.payload.attachments[0].data,'base64'),virtualBytes);
  await ole.close();ole=undefined;
  await focusExplorer();
  panel=await openTray();
  const virtualRow=panel.locator('.tray-row').filter({hasText:virtualName});
  await expect(virtualRow).toBeVisible();
  await virtualRow.click({button:'right'});
  await expect.poll(async()=>{try{return await fs.readFile(path.join(targetDir,virtualName));}catch{return null;}},{timeout:10000}).toEqual(virtualBytes);
  assert.equal(await native('foreground'),hwnd,'Explorer should regain foreground after virtual attachment paste');
  console.log(JSON.stringify({result:'PASS',explorerFilePaste:true,multipleFilesAndFolder:true,nestedAndEmptyFolders:true,virtualOleAttachmentAfterSourceExit:true,sourceUnchanged:true,foregroundRestored:true}));
 }finally{
  if(ole)await ole.close().catch(()=>{});
  if(hwnd)try{closeExplorer(targetDir,hwnd);}catch(error){console.error('Could not close isolated Explorer window:',error);}
  await f.close();
 }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
