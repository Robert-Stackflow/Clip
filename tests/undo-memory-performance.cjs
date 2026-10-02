const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{execFile,execFileSync}=require('node:child_process'),{promisify}=require('node:util'),{performance}=require('node:perf_hooks'),{createHash,createCipheriv}=require('node:crypto');
const root=path.resolve('.');
if(process.argv[2]==='--host'){
 const {Store}=require(process.argv[3]),mode=process.argv[4],store=new Store(':memory:',false);
 try{
  for(let i=0;i<100;i++)store.add({text:'Exact '+i+'\n'+'x'.repeat(128*1024)},'Private fixture',undefined,{tags:['Original tag']},false);
  for(let i=0;i<3;i++)store.add({attachments:[{name:'Exact-'+i+'.bin',data:createCipheriv('aes-256-ctr',Buffer.alloc(32,17+i),Buffer.alloc(16)).update(Buffer.alloc(4*1024*1024)).toString('base64')}]},'Private fixture',undefined,undefined,false);
  const checksum=()=>{const hash=createHash('sha256');for(const row of store.db.prepare("SELECT hash,json_extract(data,'$.payload') AS payload FROM clips ORDER BY hash").iterate())hash.update(row.hash).update(row.payload);return hash.digest('hex');};
  const original=checksum();global.gc();const before=process.memoryUsage(),start=performance.now();store.clear();const clearMs=performance.now()-start;assert.equal(store.list().length,0);global.gc();const retained=process.memoryUsage();
  const undoStart=performance.now();store.undo();const undoMs=performance.now()-undoStart;assert.equal(store.list().length,103);assert.equal(checksum(),original);assert(store.list().filter(item=>item.kind==='text').every(item=>item.tags.includes('Original tag')));global.gc();const undone=process.memoryUsage();
  console.log(JSON.stringify({mode,records:103,textBytes:100*128*1024,attachmentBytes:3*4*1024*1024,clearMs,undoMs,before,retained,undone,retainedHeapDelta:retained.heapUsed-before.heapUsed,retainedRssDelta:retained.rss-before.rss,byteExact:true}));
 }finally{store.close();}
}else (async()=>{
 const {beginCase}=await import('../scripts/workspace.mjs'),work=await beginCase('undo-memory');
 try{
  const baseline=execFileSync('git',['show','9d284b0:src/main/store.ts'],{cwd:root,encoding:'utf8',windowsHide:true}),samples=[];
  for(const mode of ['before','after'])await require('esbuild').build({entryPoints:['src/main/store.ts'],outfile:path.join(work.fixtures,mode+'.cjs'),bundle:true,platform:'node',target:'node22',external:['better-sqlite3-multiple-ciphers'],plugins:mode==='before'?[{name:'git-store-baseline',setup(build){build.onLoad({filter:/[\\/]src[\\/]main[\\/]store\.ts$/},()=>({contents:baseline,loader:'ts',resolveDir:path.join(root,'src/main')}));}}]:[]});
  for(let round=0;round<3;round++)for(const mode of round%2?['after','before']:['before','after']){const {stdout}=await promisify(execFile)(process.execPath,['--expose-gc',__filename,'--host',path.join(work.fixtures,mode+'.cjs'),mode],{cwd:root,windowsHide:true,timeout:60000,maxBuffer:1024*1024});samples.push({...JSON.parse(stdout),round});}
  const report={createdAt:new Date().toISOString(),baseline:'Git 9d284b0 Store',version:JSON.parse(await fs.readFile('package.json')).version,samples,scope:'Six isolated Node/SQLite processes in alternating order, explicit GC for retained heap, identical 103-record content. RSS snapshots are not a continuous peak or whole-app benchmark; encrypted behavior is covered separately by undo-memory-core.'};
  await fs.writeFile(path.join(work.output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await work.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
