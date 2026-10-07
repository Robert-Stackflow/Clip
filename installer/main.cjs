const {app, BrowserWindow, dialog, ipcMain} = require('electron');
// Electron's regular fs treats app.asar as a virtual directory. Installer
// integrity checks and backup must handle the archive as an ordinary file.
const fs = require('original-fs');
const fsp = fs.promises;
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const os = require('node:os');
const crypto = require('node:crypto');
const {spawn, execFile} = require('node:child_process');
const {promisify} = require('node:util');

const execute = promisify(execFile);
const root = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '.dev-resources');
const info = JSON.parse(fs.readFileSync((!app.isPackaged && process.env.CLIPPER_INSTALLER_BUILD_INFO) || path.join(root, 'build-info.json'), 'utf8'));
const payload = (!app.isPackaged && process.env.CLIPPER_INSTALLER_PAYLOAD) || path.join(root, 'engine', 'Clipper-Setup-Engine.exe');
if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(info.guid)
  || !/^(?:Clipper|ClipperVerification-[0-9a-f-]{36})$/.test(info.product)
  || !/^\d+\.\d+\.\d+$/.test(info.version)
  || !/^[0-9a-f]{64}$/i.test(info.engineHash)
  || !/^[0-9a-f]{64}$/i.test(info.asarHash)
  || !Number.isSafeInteger(info.engineBytes) || info.engineBytes<=0
  || (app.isPackaged && info.product!=='Clipper')) throw Error('Invalid installer build information');
const uninstallKey = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${info.guid}`;
const appKey = `HKCU\\Software\\${info.guid}`;
let window;
let installing = false;
let installedDirectory = '';

function send(value) {if (window && !window.isDestroyed()) window.webContents.send('setup:progress', value);}
async function registry() {
  const script = `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; if(Test-Path -LiteralPath 'Registry::${uninstallKey}'){ $v=Get-ItemProperty -LiteralPath 'Registry::${uninstallKey}'; [pscustomobject]@{version=$v.DisplayVersion;icon=$v.DisplayIcon}|ConvertTo-Json -Compress }`;
  const {stdout} = await execute('powershell.exe', ['-NoProfile','-NonInteractive','-EncodedCommand', Buffer.from(script,'utf16le').toString('base64')], {windowsHide:true,timeout:10000});
  return stdout.trim() ? JSON.parse(stdout.trim()) : null;
}
function registeredDirectory(value) {
  if (!value?.icon) return '';
  const icon = value.icon.replace(/,\d+$/, '').replace(/^"|"$/g, '');
  return path.dirname(icon);
}
async function hash(file) {
  const digest = crypto.createHash('sha256');
  await new Promise((resolve,reject) => {const stream=fs.createReadStream(file);stream.on('data',chunk=>digest.update(chunk));stream.once('end',resolve);stream.once('error',reject);});
  return digest.digest('hex');
}
async function runningApplication(){
  const name=info.product.replace(/'/g,"''");
  const script=`@(Get-Process -Name '${name}' -ErrorAction SilentlyContinue).Count`;
  const {stdout}=await execute('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:10000});
  return Number(stdout.trim())>0;
}
async function safeInstallationDirectory(directory,old){
  const canonical=path.win32.resolve(directory);
  for(let current=path.win32.parse(canonical).root;current.length<=canonical.length;){
    if(fs.existsSync(current)){
      const actual=await fsp.realpath(current);
      if(actual.toLowerCase()!==current.toLowerCase()) throw Object.assign(Error('安装位置包含目录链接'),{reason:'invalidPath'});
    }
    if(current.toLowerCase()===canonical.toLowerCase())break;
    const next=canonical.slice(current.length).split('\\').filter(Boolean)[0];
    if(!next)break;
    current=path.win32.join(current,next);
  }
  if(fs.existsSync(canonical)&&canonical.toLowerCase()!==old.toLowerCase()){
    const entries=await fsp.readdir(canonical);
    if(entries.length)throw Object.assign(Error('请选择空目录，避免覆盖已有文件'),{reason:'occupied'});
  }
}
async function checkedCopy(source, destination, expectedHash, expectedSize) {
  const input=fs.createReadStream(source,{highWaterMark:256*1024});
  const output=fs.createWriteStream(destination,{flags:'wx'});
  const digest=crypto.createHash('sha256'); let size=0;
  await new Promise((resolve,reject) => {
    input.on('data',chunk=>{size+=chunk.length;digest.update(chunk);send({stage:'extracting',detail:'正在准备安装文件',percent:Math.min(92,Math.round(size/expectedSize*92)),caption:`${Math.round(size/1048576)} / ${Math.round(expectedSize/1048576)} MB`});if(!output.write(chunk))input.pause();});
    output.on('drain',()=>input.resume());input.once('end',()=>output.end());output.once('finish',resolve);input.once('error',reject);output.once('error',reject);
  });
  if(size!==expectedSize || digest.digest('hex')!==expectedHash) throw Object.assign(Error('安装包校验失败'),{reason:'integrity'});
}
async function run(file,args,env=process.env) {
  return new Promise((resolve,reject)=>{const child=spawn(file,args,{windowsHide:true,stdio:'ignore',env});child.once('error',reject);child.once('exit',code=>resolve(code));});
}
async function backupPrevious(previous,scratch) {
  const exe=path.join(previous,`${info.product}.exe`);
  if(!fs.existsSync(exe)) return null;
  const backup=path.join(scratch,'previous-app');
  await fsp.cp(previous,backup,{recursive:true,errorOnExist:true,force:false,filter:source=>{if(fs.lstatSync(source).isSymbolicLink())throw Error('原有安装包含链接文件，无法安全备份');return true;}});
  const records=[];
  for(const [name,key] of [['uninstall',uninstallKey],['app',appKey]]) {
    const file=path.join(scratch,`${name}.reg`);
    const code=await run('reg.exe',['export',key,file,'/y']);
    if(code!==0&&name==='uninstall') throw Error('无法保存原有安装记录');
    if(code===0)records.push(file);
  }
  const shortcut=path.join(app.getPath('appData'),'Microsoft','Windows','Start Menu','Programs',`${info.product}.lnk`);
  if(fs.existsSync(shortcut)) await fsp.copyFile(shortcut,path.join(scratch,'shortcut.lnk'));
  return {previous,backup,records,shortcut};
}
async function removePrevious(saved,scratch) {
  const original=path.join(saved.previous,`Uninstall ${info.product}.exe`);
  if(!fs.existsSync(original)) throw Error('找不到原有版本的卸载程序');
  const copy=path.join(scratch,'Previous-Uninstall.exe');
  await fsp.copyFile(original,copy);
  const code=await run(copy,['/S','/KEEP_APP_DATA','/currentuser',`_?=${saved.previous}`],{...process.env,TEMP:scratch,TMP:scratch});
  if(code!==0) throw Object.assign(Error(`无法移除旧版：${code}`),{reason:code===1602?'running':'engine'});
  // NSIS can hand off its final cleanup to a temporary process after its
  // original executable exits. Wait for both files and registration.
  for(let attempt=0;attempt<100;attempt++) {
    if(!fs.existsSync(path.join(saved.previous,`${info.product}.exe`)) && !(await registry())) break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(fs.existsSync(path.join(saved.previous,`${info.product}.exe`)) || (await registry())) throw Error('旧版移除后仍有残留');
}
async function restorePrevious(saved) {
  if(!saved) return;
  await fsp.mkdir(saved.previous,{recursive:true});
  await fsp.cp(saved.backup,saved.previous,{recursive:true,force:true});
  for(const file of saved.records)if(await run('reg.exe',['import',file])!==0)throw Error('无法恢复原有安装记录');
  const shortcut=path.join(path.dirname(saved.backup),'shortcut.lnk');
  if(fs.existsSync(shortcut)){await fsp.mkdir(path.dirname(saved.shortcut),{recursive:true});await fsp.copyFile(shortcut,saved.shortcut);}
}
function normalizeVersion(value) {return String(value||'0').split('.').map(part=>Number(part)||0);}
function newerThan(left,right) {const a=normalizeVersion(left),b=normalizeVersion(right);for(let i=0;i<Math.max(a.length,b.length);i++){if((a[i]||0)!==(b[i]||0))return (a[i]||0)>(b[i]||0);}return false;}
function validDirectory(input) {
  if(typeof input!=='string'||! /^[a-z]:\\[^<>"|?*]+$/i.test(input)||input.length>220) return false;
  const parts=input.slice(3).split('\\');
  if(parts.some(part=>!part||part==='.'||part==='..'||/[.: ]$/.test(part)||part.includes(':')))return false;
  const resolved=path.win32.resolve(input);
  return resolved.toLowerCase()!==path.win32.parse(resolved).root.toLowerCase();
}
async function install(directory) {
  if(installing) return;
  if(!validDirectory(directory)) {send({stage:'failed',reason:'invalidPath'});return;}
  installing=true;let scratch='',saved=null,changed=false,keepScratch=false,result=null,targetExisted=false;
  try {
    send({stage:'checking',detail:'正在验证安装位置',caption:'准备中'});
    if(os.arch()!=='x64'&&os.arch()!=='arm64') throw Object.assign(Error('当前系统不受支持'),{reason:'unsupported'});
    const existing=await registry();
    if(newerThan(existing?.version,info.version)) throw Object.assign(Error('已有更新版本'),{reason:'newer'});
    const old=registeredDirectory(existing);
    if(await runningApplication()) throw Object.assign(Error('Clipper 正在运行'),{reason:'running'});
    await safeInstallationDirectory(directory,old);
    targetExisted=fs.existsSync(directory);
    if(old&&!fs.existsSync(path.join(old,`${info.product}.exe`)))throw Object.assign(Error('旧版安装记录存在，但程序文件缺失'),{reason:'engine'});
    if(old && old.toLowerCase()!==directory.toLowerCase()) {
      const inside=(child,parent)=>{const relative=path.relative(parent,child);return relative!==''&&!relative.startsWith('..')&&!path.isAbsolute(relative);};
      if(inside(directory,old)||inside(old,directory)) throw Object.assign(Error('安装位置不能包含原有目录'),{reason:'invalidPath'});
    }
    const parent=path.dirname(directory);
    await fsp.mkdir(parent,{recursive:true});
    const drive=path.parse(directory).root;
    const {stdout}=await execute('powershell.exe',['-NoProfile','-NonInteractive','-Command',`(Get-PSDrive -Name '${drive[0]}').Free`],{windowsHide:true,timeout:10000});
    if(Number(stdout.trim())<1024**3) throw Object.assign(Error('磁盘空间不足'),{reason:'space'});
    scratch=path.join(parent,`cs-${crypto.randomBytes(8).toString('hex')}`);
    await fsp.mkdir(scratch);
    const copied=path.join(scratch,'Clipper-Install-Engine.exe');
    await checkedCopy(payload,copied,info.engineHash,info.engineBytes);
    if(old && fs.existsSync(path.join(old,`${info.product}.exe`))) {
      send({stage:'checking',detail:'正在保留当前安装',caption:'准备升级'});
      saved=await backupPrevious(old,scratch);
    }
    send({stage:'installing',detail:'正在写入程序文件',caption:'安装中',percent:null});
    changed=true;
    if(saved) await removePrevious(saved,scratch);
    if(saved && !app.isPackaged && process.env.CLIPPER_INSTALLER_TEST_FAIL_AFTER_REMOVE==='1') throw Object.assign(Error('模拟安装核心失败'),{reason:'engine'});
    const code=await run(copied,['/S','/currentuser',`/D=${directory}`],{...process.env,TEMP:scratch,TMP:scratch});
    if(code!==0) throw Object.assign(Error(`安装核心返回 ${code}`),{reason:code===1602?'running':'engine'});
    send({stage:'verifying',detail:'正在确认文件完整性',caption:'即将完成',percent:null});
    const asar=path.join(directory,'resources','app.asar');
    if(!fs.existsSync(path.join(directory,`${info.product}.exe`))||!fs.existsSync(asar)||await hash(asar)!==info.asarHash) throw Object.assign(Error('安装文件校验失败'),{reason:'installed-integrity'});
    installedDirectory=directory;
    result={stage:'done',directory};
  } catch(error) {
    console.error('Clipper installer failed:',error);
    if(changed) {
      try {
        if(fs.existsSync(directory)){await safeInstallationDirectory(directory,directory);await fsp.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
        if(saved)await restorePrevious(saved);
        else if(targetExisted)await fsp.mkdir(directory,{recursive:true});
      } catch(restoreError) {keepScratch=true;error=Object.assign(Error(`无法恢复旧版，备份位置：${scratch}；${restoreError.message}`),{reason:'restore'});}
    }
    result={stage:'failed',reason:error.reason||'engine',message:error.message};
  } finally {
    if(scratch&&!keepScratch) await fsp.rm(scratch,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
    installing=false;
    if(result) send(result);
  }
  return result;
}

app.whenReady().then(async()=>{
  app.setAppUserModelId('local.clipper.desktop.setup');
  if(process.argv.some(argument=>/^\/S$/i.test(argument))){
    try{
      const existing=await registry();
      const directory=registeredDirectory(existing)||path.join(process.env.LOCALAPPDATA,'Programs',info.product);
      const result=await install(directory);
      app.exit(result?.stage==='done'?0:1);
    }catch(error){console.error('Clipper silent installer failed:',error);app.exit(1);}
    return;
  }
  const hiddenTest=process.env.CLIPPER_INSTALLER_TEST_HEADLESS==='1';
  window=new BrowserWindow({width:620,height:420,minWidth:620,minHeight:420,maxWidth:620,maxHeight:420,frame:true,titleBarStyle:'hidden',titleBarOverlay:false,thickFrame:true,hasShadow:true,backgroundColor:'#ffffff',resizable:false,show:false,roundedCorners:true,icon:path.join(__dirname,'icon.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  window.on('close',event=>{if(installing)event.preventDefault();});
  const pageURL=pathToFileURL(path.join(__dirname,'index.html')).href;
  const trusted=event=>event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame&&event.senderFrame.url===pageURL;
  const handle=(name,fn)=>ipcMain.handle('setup:'+name,(event,...args)=>{if(!trusted(event))throw Error('Installer request denied');return fn(...args);});
  handle('state',async()=>{const existing=await registry();return {version:info.version,directory:registeredDirectory(existing)||path.join(process.env.LOCALAPPDATA,'Programs',info.product),installed:!!existing};});
  handle('choose-directory',async()=>{const result=await dialog.showOpenDialog(window,{title:'选择安装位置',properties:['openDirectory','createDirectory']});if(result.canceled)return '';const selected=result.filePaths[0];return path.basename(selected).toLowerCase()===info.product.toLowerCase()?selected:path.join(selected,info.product);});
  handle('install',directory=>install(directory));
  handle('launch',()=>{if(installedDirectory){const child=spawn(path.join(installedDirectory,`${info.product}.exe`),[],{detached:true,stdio:'ignore'});child.unref();}window.close();});
  handle('minimize',()=>window.minimize());
  handle('close',()=>{if(!installing)window.close();});
  await window.loadFile(path.join(__dirname,'index.html'));
  if(!hiddenTest)window.show();
});
app.on('window-all-closed',()=>app.quit());
