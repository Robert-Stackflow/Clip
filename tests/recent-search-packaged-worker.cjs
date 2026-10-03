// Actual packaged Electron workers. This does not claim foreground/UI acceptance.
const {_electron:electron}=require('@playwright/test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {Store,trayQuery}=require('../work/test-exports.cjs'),memory=require('./process-tree-memory.cjs');
(async()=>{
 const {beginCase}=await import('../scripts/workspace.mjs'),work=await beginCase('recent-search-packaged-worker-0497');
 const baseline=path.resolve('release/0.49.6/win-unpacked/Clipper.exe'),candidate=path.resolve('release/0.49.7/win-unpacked/Clipper.exe');
 const report={baseline,candidate,records:1500,rounds:3,foregroundUI:false,samples:[]};let app;
 try{
  const fixtures={};
  for(const encrypted of[false,true]){
   const file=path.join(work.fixtures,(encrypted?'encrypted':'plain')+'.sqlite'),key=encrypted?Buffer.alloc(32,17):undefined,writer=new Store(file,false,false,key);
   try{for(let i=0;i<1500;i++)writer.add({text:'Fixture '+i+'\n'+'searchable long content '.repeat(2048)+'\nCAFÉ 尾部'},'Editor.exe',undefined,{tags:['标签'],updatedAt:1700000000000},false);
    fixtures[String(encrypted)]={file,expected:writer.db.prepare('SELECT id FROM clips ORDER BY updated DESC,id ASC LIMIT 80').all().map(row=>row.id)};
   }finally{writer.close();key?.fill(0);}
   fixtures[String(encrypted)].hash=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
  }
  for(let round=0;round<3;round++)for(const mode of(round%2?['candidate','baseline']:['baseline','candidate'])){
   const profile=path.join(work.fixtures,mode+'-'+round);await fs.mkdir(profile);const writer=new Store(path.join(profile,'history.sqlite'),false);try{writer.saveSettings({...writer.settings,paused:true});}finally{writer.close();}
   const env={...process.env,CLIPPER_TEST_MODE:'1',CLIPPER_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
   app=await electron.launch({executablePath:mode==='candidate'?candidate:baseline,args:[],env});
   try{
    const page=await app.firstWindow();await page.waitForSelector('[data-page=history]');
    const version=await app.evaluate(({app,BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.hide();return app.getVersion();});
    assert.equal(version,mode==='candidate'?'0.49.7':'0.49.6');
    for(const encrypted of[false,true])for(const queryName of(round%2?['metadata','body']:['body','metadata'])){
     const fixture=fixtures[String(encrypted)],before=memory(app.process().pid).totalMiB;let peak=before,finished=false;
     const sampling=setInterval(()=>{peak=Math.max(peak,memory(app.process().pid).totalMiB);},250);
     const task=app.evaluate(async({app},args)=>{
      const {Worker}=process.getBuiltinModule('node:worker_threads'),workerFile=process.getBuiltinModule('node:path').join(app.getAppPath(),'dist/main/tray-query-worker.cjs');
      const key=args.encrypted?new Uint8Array(32).fill(17):undefined;let previous=performance.now();const gaps=[];
      const clock=setInterval(()=>{const now=performance.now();gaps.push(now-previous);previous=now;},5),start=performance.now();
      try{return await new Promise((resolve,reject)=>{
       const worker=new Worker(workerFile,{workerData:{source:args.file,key,query:args.query,language:'zh-CN'},resourceLimits:{maxOldGenerationSizeMb:96}});key?.fill(0);let settled=false;
       const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);worker.terminate().then(()=>error?reject(error):resolve({milliseconds:performance.now()-start,result,mainGapMaxMs:Math.max(0,...gaps)}),reject);};
       const timer=setTimeout(()=>finish(Error('Packaged reader timed out')),20000);timer.unref();
       worker.once('message',message=>finish(message.ok?undefined:Error(message.error),message.result));worker.once('error',finish);worker.once('exit',()=>finish(Error('Reader exited before returning rows')));
      });}finally{key?.fill(0);clearInterval(clock);}
     },{file:fixture.file,encrypted,query:{...trayQuery,text:queryName==='metadata'?'editor 标签':'café 标签'}}).finally(()=>finished=true);
     task.catch(()=>{});const ipc=[];let measured;
     try{while(!finished){const start=performance.now();await app.evaluate(({app})=>app.getVersion());ipc.push(performance.now()-start);await new Promise(resolve=>setTimeout(resolve,20));}measured=await task;}
     finally{clearInterval(sampling);await task.catch(()=>{});}
     assert.equal(measured.result.total,1500);assert.deepEqual(measured.result.items.map(row=>row.id),fixture.expected);assert.ok(measured.result.items.every(row=>!('payload'in row)&&!('thumbnail'in row)));
     const sample={round,mode,version,encrypted,queryName,milliseconds:measured.milliseconds,ipcMaxMs:Math.max(0,...ipc),mainGapMaxMs:measured.mainGapMaxMs,peakDeltaMiB:peak-before};report.samples.push(sample);console.log(JSON.stringify(sample));
    }
   }finally{await app.close();app=undefined;}
  }
  for(const fixture of Object.values(fixtures))assert.equal(crypto.createHash('sha256').update(await fs.readFile(fixture.file)).digest('hex'),fixture.hash);
  const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];report.medians={};
  for(const encrypted of[false,true])for(const queryName of['body','metadata'])for(const mode of['baseline','candidate']){
   const samples=report.samples.filter(row=>row.encrypted===encrypted&&row.queryName===queryName&&row.mode===mode);assert.equal(samples.length,3);
   report.medians[(encrypted?'encrypted':'plain')+'-'+queryName+'-'+mode]=Object.fromEntries(['milliseconds','ipcMaxMs','mainGapMaxMs','peakDeltaMiB'].map(key=>[key,median(samples.map(row=>row[key]))]));
  }
  report.preservedDatabaseBytes=true;await fs.writeFile(path.join(work.output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.medians));
 }finally{if(app)await app.close();await work.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
