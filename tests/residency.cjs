const {chromium}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),net=require('node:net'),{spawn,execFile}=require('node:child_process'),{promisify}=require('node:util');
const root=path.resolve('.'),output=path.join(root,'work/development/residency'),profile=path.join(output,'profile'),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let launcher,connection,ended=false,exitCode,log='';
async function poll(fn,message,timeout=90000){const start=Date.now();while(Date.now()-start<timeout){if(ended)throw Error('Private launcher ended '+exitCode+' '+log.slice(-3000));try{const value=await fn();if(value)return value;}catch{}await wait(100);}throw Error(message);}
async function privateRootPid(){const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command','Get-CimInstance Win32_Process -Filter "ParentProcessId='+launcher.pid+'" | Where-Object { $_.Name -eq "electron.exe" } | Select-Object -ExpandProperty ProcessId'],{windowsHide:true,timeout:10000});const pids=stdout.match(/\d+/g)||[];assert.equal(pids.length,1,'The private launcher must own exactly one Electron root');return Number(pids[0]);}
async function sample(pid){const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/measure-residency.ps1'),'-Samples','3','-RootPid',String(pid)],{windowsHide:true,timeout:60000,maxBuffer:2*1024*1024});const result=JSON.parse(stdout.replace(/^\uFEFF/,''));assert.equal(result.Samples.length,3);for(const value of result.Samples){assert.equal(value.RootPid,pid);assert.equal(value.Complete,true);}return result;}
(async()=>{
 await fs.mkdir(output,{recursive:true});const marker=path.join(output,'.clipper-residency-fixture'),owned='Clipper isolated residency fixture\n';
 const previous=await fs.readFile(marker,'utf8').catch(()=>undefined);if(previous!==undefined)assert.equal(previous,owned);else{assert.equal((await fs.readdir(output)).length,0);await fs.writeFile(marker,owned);}
 const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
 const env={...process.env,CLIPPER_DEV_DEBUG_PORT:String(port),CLIPPER_DEV_HIDDEN:'1',CLIPPER_DEV_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 launcher=spawn(process.execPath,['scripts/dev.mjs'],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});for(const stream of [launcher.stdout,launcher.stderr])stream.on('data',data=>{log=(log+data).slice(-1024*1024);});launcher.once('exit',code=>{ended=true;exitCode=code;});
 connection=await poll(async()=>{const browser=await chromium.connectOverCDP('http://127.0.0.1:'+port),page=browser.contexts().flatMap(context=>context.pages()).find(page=>page.url()==='clipper://app/index.html');if(!page)return false;await page.waitForSelector('#search',{timeout:1500});return {browser,page};},'Private hidden window not ready');
 const page=connection.page,electronPid=await poll(privateRootPid,'Private Electron root missing');
 await page.evaluate(async()=>{const state=await clipper.state();if(!state.settings.paused)await clipper.settings({...state.settings,paused:true});});
 const state=await page.evaluate(async()=>({state:await clipper.state(),data:await clipper.dataState(),chrome:await clipperChrome.state()}));assert(state.state.settings.paused);assert.equal(path.resolve(state.data.defaultDirectory),profile);assert.equal(state.chrome.visible,false);
 await page.evaluate(()=>clipper.clear());await wait(1500);const idle=await sample(electronPid);
 const workload=await page.evaluate(async()=>{
  const saves=[];for(let i=0;i<100;i++){const start=performance.now();await clipper.applyText({mode:'save',source:'脚本处理',text:'Isolated residency '+i+'\n'+'x'.repeat(128*1024)+'\nneedle-'+i});saves.push(performance.now()-start);}
  const searches=[];for(let i=0;i<12;i++){const start=performance.now(),ids=await clipper.search('needle-99');if(ids.length!==1)throw Error('Search result differs');searches.push(performance.now()-start);}
  return {records:100,textBytesPerRecord:128*1024,savesMs:saves,searchesMs:searches};
 });
 const loaded=await sample(electronPid);const clearMs=await page.evaluate(async()=>{const start=performance.now();await clipper.clear();return performance.now()-start;});await wait(2000);const cleared=await sample(electronPid);
 const report={createdAt:new Date().toISOString(),version:JSON.parse(await fs.readFile('package.json')).version,profileIsolated:true,hidden:true,clipboardUntouched:true,electronPid,idle,loaded,cleared,clearMs,workload,scope:'One isolated hidden Electron development app with native database and sandboxed renderer, 100 x 128 KiB synthetic text saves and 12 searches. No physical clipboard, display or continuous peak sampling.'};
 await fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2));
 const summary=phase=>report[phase].Samples.map(value=>({application:value.Application,sample:value.Sample,privateWorkingMiB:value.PrivateWorkingBytes/1024**2,privateCommittedMiB:value.PrivateCommittedBytes/1024**2,processes:value.Processes.length}));
 console.log(JSON.stringify({idle:summary('idle'),loaded:summary('loaded'),cleared:summary('cleared'),clearMs,searchesMs:workload.searchesMs}));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
 if(launcher?.connected)launcher.send({type:'clipper:dev-stop'});if(launcher){const until=Date.now()+20000;while(!ended&&Date.now()<until)await wait(100);if(!ended){console.error('Private launcher did not exit; kept for inspection');process.exitCode=1;}else if(exitCode!==0)process.exitCode=1;}
 await connection?.browser.close().catch(()=>{});
});
