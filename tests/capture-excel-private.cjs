const {expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {fixture}=require('./efficiency-fixture.cjs');
const {requireEmptyClipboard}=require('./clipboard-guard.cjs');

function excelCount(){return Number(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','@(Get-Process -Name EXCEL -ErrorAction SilentlyContinue).Count'],{encoding:'utf8',windowsHide:true}).trim());}
function readClipboard(){return JSON.parse(execFileSync('powershell.exe',['-Sta','-NoProfile','-NonInteractive','-Command',"Add-Type -AssemblyName System.Windows.Forms; $d=[System.Windows.Forms.Clipboard]::GetDataObject(); @{formats=@($d.GetFormats($false));text=[System.Windows.Forms.Clipboard]::GetText();html=[string]$d.GetData('HTML Format',$false)} | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true}));}

async function run(){
 assert.equal(excelCount(),0,'Close existing Excel windows before this isolated test');
 const clipboardGuard=requireEmptyClipboard();
 const output=path.resolve('work/capture-excel-private');await fs.mkdir(output,{recursive:true});
 const prefix=randomUUID(),ready=path.join(output,prefix+'-ready.txt'),stop=path.join(output,prefix+'-stop.txt'),failure=path.join(output,prefix+'-error.txt'),value='Clipper Excel source '+prefix;
 const f=await fixture('capture-excel-private');let child;
 try{
  const initial=(await f.page.evaluate(()=>window.clipper.state())).clips.length;
  clipboardGuard.assertUnchanged();
  child=spawn('powershell.exe',['-Sta','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('tests/capture-excel-private-target.ps1'),'-Value',value,'-Ready',ready,'-Stop',stop,'-Failure',failure,'-ExpectedSequence',String(clipboardGuard.sequence)],{stdio:'ignore',windowsHide:true});
  await expect.poll(async()=>{if(await fs.stat(failure).then(()=>true,()=>false))throw Error(await fs.readFile(failure,'utf8'));return fs.readFile(ready,'utf8').catch(()=>'');},{timeout:45000}).toBe('ready');
  await expect.poll(()=>readClipboard().text,{timeout:10000}).toContain(value);
  const source=readClipboard();
  assert(source.formats.includes('Biff8')&&source.formats.includes('HTML Format'),'Excel cell clipboard formats missing');
  assert(source.formats.includes('ExcludeClipboardContentFromMonitorProcessing'),'Excel did not request private clipboard handling');
  await new Promise(resolve=>setTimeout(resolve,1500));
  const state=await f.page.evaluate(()=>window.clipper.state());
  assert.equal(state.clips.length,initial,'Private Excel cell was added to history');
  await fs.writeFile(stop,'stop');
  await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(()=>{child.kill();resolve();},5000).unref();});
  await expect.poll(excelCount,{timeout:5000}).toBe(0);
  console.log(JSON.stringify({result:'PASS',source:'Excel formatted cell',privateMarker:true,historyUnchanged:true}));
 }finally{
  await fs.writeFile(stop,'stop');
  if(child&&child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);setTimeout(()=>{child.kill();resolve();},5000).unref();});
  await f.close();
 }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
