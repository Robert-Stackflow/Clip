const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{execFile,execFileSync}=require('node:child_process'),{promisify}=require('node:util'),{performance}=require('node:perf_hooks'),{createCipheriv}=require('node:crypto');
const root=path.resolve('.'),records=10000;
if(process.argv[2]==='--host'){
 (async()=>{
  const {Store,framePNG}=require(path.join(process.argv[3],'store.cjs')),mode=process.argv[4],module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(process.argv[3],mode+'.cjs'),'utf8'),{module,exports:module.exports,Buffer,console,process:{platform:'linux'},require:name=>name==='electron'?{app:{getFileIcon:async()=>({toPNG:()=>Buffer.from('private icon'),resize:()=>({toPNG:()=>Buffer.from('private icon')})})}}:name==='./native'?{runningApplications:()=>[]}:require(name)});
  const store=new Store(':memory:',false);try{
   const pixels=createCipheriv('aes-256-ctr',Buffer.alloc(32,37),Buffer.alloc(16)).update(Buffer.alloc(64*64*4)),png=framePNG({width:64,height:64,data:pixels}).toString('base64'),thumbnail='data:image/png;base64,'+png;
   store.db.exec('BEGIN');for(let i=0;i<records;i++)store.add({text:'Record '+i,...(i%2?{png}:{})},'App'+(i%32)+'.exe',i%2?thumbnail:undefined,undefined,false);store.db.exec('COMMIT');
   store.setMeta('source-applications',Array.from({length:32},(_,i)=>['app'+i+'.exe','C:\\PrivateFixture\\App'+i+'.exe']));
   const service=new module.exports.AppIcons(()=>store);await service.get(['App1.exe']);
   let listReads=0,sourceReads=0,sampledHeapIncrease=0,heapBefore=0;
   const list=store.list.bind(store),sources=store.sourceApplications.bind(store);
   store.list=()=>{listReads++;const result=list();sampledHeapIncrease=Math.max(sampledHeapIncrease,process.memoryUsage().heapUsed-heapBefore);return result;};
   store.sourceApplications=()=>{sourceReads++;const result=sources();sampledHeapIncrease=Math.max(sampledHeapIncrease,process.memoryUsage().heapUsed-heapBefore);return result;};
   const samples=[];for(let i=0;i<7;i++){
    global.gc();heapBefore=process.memoryUsage().heapUsed;const start=performance.now(),timer=new Promise(resolve=>setTimeout(()=>resolve(performance.now()-start),0));
    const icons=await service.get(['App1.exe','unrelated.exe']);assert(icons['app1.exe'].startsWith('data:image/png;base64,'));assert(!('unrelated.exe'in icons));
    const responseMs=performance.now()-start,eventLoopMs=await timer;samples.push({responseMs,eventLoopMs});
   }
   assert.equal(mode==='before'?listReads:sourceReads,7);assert.equal(mode==='before'?sourceReads:listReads,0);
   console.log(JSON.stringify({mode,records,images:records/2,primaryBytes:store.bytes(),sourceNames:store.sourceApplications().length,listReads,sourceReads:sourceReads-1,sampledHeapIncrease,samples,medianResponseMs:samples.map(s=>s.responseMs).sort((a,b)=>a-b)[3],medianEventLoopMs:samples.map(s=>s.eventLoopMs).sort((a,b)=>a-b)[3]}));
  }finally{store.close();}
 })().catch(e=>{console.error(e);process.exitCode=1;});
}else (async()=>{
 const {beginCase}=await import('../scripts/workspace.mjs'),work=await beginCase('source-lookup');
 try{
  const baseline=execFileSync('git',['show','97d4ac3:src/main/app-icons.ts'],{cwd:root,encoding:'utf8',windowsHide:true}),build=require('esbuild').build,samples=[];
  await build({entryPoints:['tests/exports.ts'],outfile:path.join(work.fixtures,'store.cjs'),bundle:true,platform:'node',target:'node22',external:['better-sqlite3-multiple-ciphers','koffi','quickjs-emscripten']});
  for(const mode of ['before','after'])await build({entryPoints:['src/main/app-icons.ts'],outfile:path.join(work.fixtures,mode+'.cjs'),bundle:true,platform:'node',target:'node22',external:['electron','./native'],plugins:mode==='before'?[{name:'actual-git-baseline',setup(b){b.onLoad({filter:/[\\/]src[\\/]main[\\/]app-icons\.ts$/},()=>({contents:baseline,loader:'ts',resolveDir:path.join(root,'src/main')}));}}]:[]});
  for(let round=0;round<3;round++)for(const mode of round%2?['after','before']:['before','after']){
   const {stdout}=await promisify(execFile)(process.execPath,['--expose-gc',__filename,'--host',work.fixtures,mode],{cwd:root,windowsHide:true,timeout:90000,maxBuffer:1024*1024});samples.push({...JSON.parse(stdout),round});
  }
  const report={passed:true,baseline:'97d4ac3 actual AppIcons',version:JSON.parse(fs.readFileSync('package.json')).version,samples,scope:'Six isolated Node/SQLite processes in alternating order, identical valid synthetic history of 10000 records including 5000 PNG images, explicit GC before each request. AppIcons and database methods are production code; native icon reading is replaced by a fixed immediate result to isolate source validation. Timer delay measures this request blocking the Node event loop. Heap is sampled at the SQL method return, not continuous peak or full-application memory. No daily data or system clipboard.'};
  fs.writeFileSync(path.join(work.output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,samples:samples.map(s=>({mode:s.mode,round:s.round,responseMs:s.medianResponseMs,eventLoopMs:s.medianEventLoopMs,sampledHeapMiB:s.sampledHeapIncrease/1048576}))}));
 }finally{await work.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
