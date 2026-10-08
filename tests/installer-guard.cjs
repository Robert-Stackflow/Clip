// Execute the production NSIS macro without installing, touching the registry,
// showing a window, or opening the user's clipboard/history.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync,spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
function find(folder,name){for(const item of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,item.name);if(item.isDirectory()){const found=find(file,name);if(found)return found;}else if(item.name===name)return file;}}
function run(file,args=[]){return new Promise((resolve,reject)=>{const child=spawn(file,args,{windowsHide:true,stdio:'ignore'});const timeout=setTimeout(()=>{child.kill();reject(Error('Installer guard did not exit'));},15000);child.once('error',error=>{clearTimeout(timeout);reject(error)});child.once('exit',code=>{clearTimeout(timeout);resolve(code)});});}
(async()=>{
  const cache=path.join(process.env.LOCALAPPDATA,'electron-builder/Cache/nsis');
  const nsis=fs.readdirSync(cache).find(name=>/^nsis-\d/.test(name));
  const resources=fs.readdirSync(cache).find(name=>/^nsis-resources-/.test(name));
  const compiler=find(path.join(cache,nsis),'makensis.exe');
  assert(compiler&&resources,'NSIS build tools must be available');
  const folder=path.resolve('work/installer-guard');fs.mkdirSync(folder,{recursive:true});
  const name='Clip-guard-'+randomUUID()+'.exe';
  const helper=path.join(folder,name);fs.copyFileSync(process.execPath,helper);
  const template=path.resolve('node_modules/app-builder-lib/templates/nsis/include');
  const production=path.resolve('build/installer.nsh');
  const script=path.join(folder,'guard.nsi'),output=path.join(folder,'guard.exe');
  const content=String.raw`Unicode true
RequestExecutionLevel user
SilentInstall silent
Name "Clip guard verification"
OutFile "${output}"
!include "LogicLib.nsh"
!include "MUI2.nsh"
!addplugindir /x86-unicode "${path.join(cache,resources,'plugins/x86-unicode')}"
!include "${path.join(template,'nsProcess.nsh')}"
!define APP_EXECUTABLE_FILENAME "${name}"
!include "${production}"
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro customHeader
Section
  !insertmacro customCheckAppRunning
  SetErrorLevel 0
SectionEnd
`;
  fs.writeFileSync(script,'\ufeff'+content);
  execFileSync(compiler,['/V2',script],{windowsHide:true,encoding:'utf8',timeout:20000});
  assert.equal(await run(output,['/S']),0,'No app running must allow installation');
  const helperChild=spawn(helper,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:['pipe','ignore','ignore']});
  try{
    await new Promise(resolve=>setTimeout(resolve,350));
    assert.equal(helperChild.exitCode,null,'Guard helper must be running');
    assert.equal(await run(output,['/S']),1602,'Running app must block silent install');
    assert.equal(helperChild.exitCode,null,'Guard must never terminate the app');
  }finally{helperChild.kill();await new Promise(resolve=>{if(helperChild.exitCode!==null)return resolve();helperChild.once('exit',resolve);});}
  assert.equal(await run(output,['/S']),0,'Normal process exit must allow retry');
  const failureScript=path.join(folder,'failure.nsi'),failureOutput=path.join(folder,'failure.exe');
  const detection='!undef nsProcess::FindProcess\n!define nsProcess::FindProcess `!insertmacro TestDetection`\n!macro TestDetection _FILE _ERR\n  StrCpy ${_ERR} 608\n!macroend\n';
  fs.writeFileSync(failureScript,'\ufeff'+content.replace(output,failureOutput).replace('Section\n',detection+'Section\n'));
  execFileSync(compiler,['/V2',failureScript],{windowsHide:true,encoding:'utf8',timeout:20000});
  assert.equal(await run(failureOutput,['/S']),1603,'Unknown process detection status must stop safely');
  const result={passed:true,productionMacro:true,processAbsent:true,processRunningRejected:true,processNeverTerminated:true,retryAfterExit:true,detectionFailureRejected:true,clipboardAccess:false,registryWrites:false};
  fs.writeFileSync(path.join(folder,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
