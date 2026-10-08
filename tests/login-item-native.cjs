const {app}=require('electron'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {configureLoginItem,LOGIN_STARTUP_ARGUMENT}=require('../work/test-login-item.cjs');
const name='Clip.Startup.Verification.'+randomUUID();
const profile=require('node:path').resolve('work/current/startup-login-item/profile');require('node:fs').mkdirSync(profile,{recursive:true});app.setPath('userData',profile);app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
const cleanup=()=>{app.setLoginItemSettings({name,openAtLogin:false,enabled:false});try{require('node:child_process').execFileSync('reg.exe',['delete','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run','/v',name,'/f'],{windowsHide:true,stdio:'ignore'});}catch{}};
app.whenReady().then(()=>{
 app.setAppUserModelId(name);
 const shim={setLoginItemSettings:value=>app.setLoginItemSettings({...value,name})};
 try{
  // Model an old entry, then repair the executable and its launch arguments.
  app.setLoginItemSettings({name,path:'D:\\Clip-old-missing\\Clip.exe',openAtLogin:true,enabled:true});
  configureLoginItem(shim,true);
  const state=app.getLoginItemSettings({path:process.execPath,args:[LOGIN_STARTUP_ARGUMENT]});
  assert.equal(state.openAtLogin,true);assert.equal(state.executableWillLaunchAtLogin,true);
  const entry=state.launchItems.find(item=>item.name===name);assert(entry);assert.equal(entry.enabled,true);const run=require('node:child_process').execFileSync('reg.exe',['query','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','/v',name],{windowsHide:true,encoding:'utf8'});assert(run.includes(LOGIN_STARTUP_ARGUMENT));
  configureLoginItem(shim,false);assert(!app.getLoginItemSettings({path:process.execPath,args:[LOGIN_STARTUP_ARGUMENT]}).launchItems.some(item=>item.name===name));
  console.log(JSON.stringify({passed:true,cases:3,scope:'Actual Windows startup registration, obsolete path repair, tray argument and removal; unique verification entry only.'}));
 }finally{cleanup();}
 app.quit();
}).catch(error=>{try{cleanup();}catch{}console.error(error);app.exit(1);});
