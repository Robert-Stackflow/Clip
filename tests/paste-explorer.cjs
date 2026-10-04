const {expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const {build}=require('esbuild');
const {fixture}=require('./efficiency-fixture.cjs');

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
 const f=await fixture('paste-explorer');let hwnd=0;
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
 try{
  await f.helper.evaluate(({app},nativePath)=>{const req=process.getBuiltinModule('node:module').createRequire(process.getBuiltinModule('node:path').join(app.getAppPath(),'package.json'));global.native=req(nativePath);global.native.initNative();},path.join(root,'native-test.cjs'));
  await f.helper.evaluate((_event,file)=>global.native.writeFiles([file],Number(global.helperWindow.getNativeWindowHandle().readBigUInt64LE())),source);
  await expect.poll(async()=>(await f.page.evaluate(()=>window.clipper.state())).clips.some(item=>item.kind==='files'),{timeout:10000}).toBe(true);
  hwnd=openExplorer(targetDir);
  await f.helper.evaluate(async()=>{await global.focusTarget();global.helperWindow.setAlwaysOnTop(false);});
  assert.equal(await native('activate',hwnd),true,'Explorer activation rejected');
  await native('click',hwnd);
  await expect.poll(()=>native('foreground')).toBe(hwnd);
  const opened=f.app.waitForEvent('window');await f.page.evaluate(()=>window.clipper.showTray());const panel=await opened;
  await panel.waitForSelector('.tray-row');await panel.locator('.tray-row').filter({hasText:fileName}).click({button:'right'});
  await expect.poll(async()=>{try{return await fs.readFile(destination,'utf8');}catch{return ''; }},{timeout:10000}).toBe(bytes.toString('utf8'));
  assert.deepEqual(await fs.readFile(destination),bytes);
  assert.deepEqual(await fs.readFile(source),bytes);
  assert.equal(await native('foreground'),hwnd,'Explorer should regain foreground after paste');
  console.log(JSON.stringify({result:'PASS',explorerFilePaste:true,sourceUnchanged:true,foregroundRestored:true}));
 }finally{
  if(hwnd)try{closeExplorer(targetDir,hwnd);}catch(error){console.error('Could not close isolated Explorer window:',error);}
  await f.close();
 }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
