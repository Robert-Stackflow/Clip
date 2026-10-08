const {expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {fixture}=require('./efficiency-fixture.cjs');
const {requireEmptyClipboard}=require('./clipboard-guard.cjs');

function wordCount(){return Number(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','@(Get-Process -Name WINWORD -ErrorAction SilentlyContinue).Count'],{encoding:'utf8',windowsHide:true}).trim());}
function readClipboard(){return JSON.parse(execFileSync('powershell.exe',['-Sta','-NoProfile','-NonInteractive','-Command',"Add-Type -AssemblyName System.Windows.Forms; $d=[System.Windows.Forms.Clipboard]::GetDataObject(); @{formats=@($d.GetFormats($false));text=[System.Windows.Forms.Clipboard]::GetText();html=[string]$d.GetData('HTML Format',$false);rtf=[string]$d.GetData('Rich Text Format',$false)} | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true}));}
const containsText=(html,value)=>html.replace(/\s+/g,' ').includes(value);
const retainsStyle=html=>/<b\b/i.test(html)&&/color:#D7263D/i.test(html)&&/font-size:18\.0pt/i.test(html);

async function run(){
 assert.equal(wordCount(),0,'Close existing Word windows before this isolated test');
 const clipboardGuard=requireEmptyClipboard();
 const output=path.resolve('work/capture-word-rich');await fs.mkdir(output,{recursive:true});
 const prefix=randomUUID(),ready=path.join(output,prefix+'-ready.txt'),stop=path.join(output,prefix+'-stop.txt'),failure=path.join(output,prefix+'-error.txt'),value='Clip Word source '+prefix;
 const f=await fixture('capture-word-rich');let child;
 try{
  const initial=(await f.page.evaluate(()=>window.clip.state())).clips.length;
  clipboardGuard.assertUnchanged();
  child=spawn('powershell.exe',['-Sta','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('tests/capture-word-rich-target.ps1'),'-Value',value,'-Ready',ready,'-Stop',stop,'-Failure',failure,'-ExpectedSequence',String(clipboardGuard.sequence)],{stdio:'ignore',windowsHide:true});
  await expect.poll(async()=>{if(await fs.stat(failure).then(()=>true,()=>false))throw Error(await fs.readFile(failure,'utf8'));return fs.readFile(ready,'utf8').catch(()=>'');},{timeout:45000}).toBe('ready');
  await expect.poll(()=>readClipboard().text,{timeout:10000}).toContain(value);
  const source=readClipboard();
  assert(source.formats.includes('HTML Format')&&source.formats.includes('Rich Text Format'),'Word did not provide rich formats');
  assert(retainsStyle(source.html),'Word source did not provide expected rich style');
  assert(!source.formats.includes('ExcludeClipboardContentFromMonitorProcessing'),'Word requested private clipboard handling');
  await expect.poll(async()=>{if(await fs.stat(failure).then(()=>true,()=>false))throw Error(await fs.readFile(failure,'utf8'));return (await f.page.evaluate(()=>window.clip.state())).clips.length;},{timeout:15000}).toBeGreaterThan(initial);
  const clip=(await f.page.evaluate(()=>window.clip.state())).clips[0],detail=await f.page.evaluate(id=>window.clip.detail(id),clip.id);
  console.log(JSON.stringify({stage:'captured',kind:clip.kind,title:clip.title,png:!!detail.payload.png,formats:detail.payload.formats?.map(f=>f.name),text:detail.payload.text?.trim(),htmlContains:containsText(detail.payload.html||'',value),rtfContains:detail.payload.rtf?.includes(value)}));
  assert.equal(clip.kind,'text','Word text selection was not shown as text');
  assert(detail.payload.text?.includes(value)&&containsText(detail.payload.html||'',value)&&retainsStyle(detail.payload.html||'')&&detail.payload.rtf?.includes(value),'Word rich text was not recorded');
  await fs.writeFile(stop,'stop');
  await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(()=>{child.kill();resolve();},5000).unref();});
  await expect.poll(wordCount,{timeout:5000}).toBe(0);
  await f.page.evaluate(id=>window.clip.copy(id,false),clip.id);
  const replay=readClipboard();
  assert.equal(replay.text,source.text,'Replayed record lost Word text');
  assert(containsText(replay.html,value)&&retainsStyle(replay.html)&&replay.rtf.includes(value),'Replayed record lost Word rich formats');
  console.log(JSON.stringify({result:'PASS',source:'Word formatted text',kind:clip.kind,replayAfterSourceClosed:true}));
 }finally{
  await fs.writeFile(stop,'stop');
  if(child&&child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);setTimeout(()=>{child.kill();resolve();},5000).unref();});
  await f.close();
 }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
