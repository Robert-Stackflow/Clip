const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFile,execFileSync}=require('node:child_process'),{promisify}=require('node:util'),{performance}=require('node:perf_hooks'),{createCipheriv,randomUUID}=require('node:crypto');
const root=path.resolve('.'),records=10000,baselineCommit='8692923';
if(process.argv[2]==='--host'){
 (async()=>{
  const mode=process.argv[4],{Store,framePNG,payloadDigest}=require(path.join(process.argv[3],mode+'.cjs')),store=new Store(':memory:',false);
  try{
   const pixels=createCipheriv('aes-256-ctr',Buffer.alloc(32,37),Buffer.alloc(16)).update(Buffer.alloc(64*64*4)),png=framePNG({width:64,height:64,data:pixels}).toString('base64'),thumbnail='data:image/png;base64,'+png;
   const seed=store.add({text:'Seed'},'Fixture',undefined,undefined,false);store.db.prepare('DELETE FROM clips WHERE id=?').run(seed.id);
   const now=Date.now(),protectedIDs=[];store.db.exec('BEGIN');
   for(let i=0;i<records;i++){
    const payload={text:'Record '+i,...(i%2?{png}:{})},item={...seed,id:randomUUID(),hash:payloadDigest(payload),payload,kind:i%2?'image':'text',title:'Record '+i,preview:i%2?'Image':'Record '+i,source:'App'+(i%32)+'.exe',createdAt:now-i,updatedAt:now-i,favorite:i%131===0,pinned:i%137===0,...(i%139===0?{shared:true}:{}),...(i%2?{thumbnail}:{}),bytes:Buffer.byteLength(JSON.stringify(payload))};
    store.save(item);if(i%197===0)protectedIDs.push(item.id);
   }
   store.db.exec('COMMIT');store.setQueue(protectedIDs.flatMap(id=>[id,id]));store.shelf=protectedIDs.slice(0,10);store.setMeta('shelf',store.shelf);
   store.settings={...store.settings,maxItems:10000,retentionDays:365};store.prune();
   const samples=[];for(let i=0;i<7;i++){
    global.gc();const heapBefore=process.memoryUsage().heapUsed,start=performance.now(),timer=new Promise(resolve=>setTimeout(()=>resolve(performance.now()-start),0));
    store.prune();const responseMs=performance.now()-start,sampledHeapIncrease=Math.max(0,process.memoryUsage().heapUsed-heapBefore),eventLoopMs=await timer;samples.push({responseMs,eventLoopMs,sampledHeapIncrease});
   }
   assert.equal(store.db.prepare('SELECT count(*) AS n FROM clips').get().n,records);
   // Exercise the same automatic cleanup from an immediate settings change.
   const ordered=store.list().filter(item=>!store.protected(item)),protectedSet=new Set(store.list().filter(item=>store.protected(item)).map(item=>item.id)),wanted=new Set([...protectedSet,...ordered.slice(0,50).map(item=>item.id)]);
   global.gc();const start=performance.now();store.saveSettings({...store.settings,maxItems:50});const tighteningMs=performance.now()-start;
   assert.deepEqual(new Set(store.db.prepare('SELECT id FROM clips').all().map(row=>row.id)),wanted);
   const median=key=>samples.map(s=>s[key]).sort((a,b)=>a-b)[3];
   console.log(JSON.stringify({mode,records,images:records/2,samples,medianResponseMs:median('responseMs'),medianEventLoopMs:median('eventLoopMs'),medianSampledHeapIncrease:median('sampledHeapIncrease'),tighteningMs,remaining:wanted.size}));
  }finally{store.close();}
 })().catch(error=>{console.error(error);process.exitCode=1;});
}else(async()=>{
 const {beginCase}=await import('../scripts/workspace.mjs'),work=await beginCase('retention-performance');
 try{
  const build=require('esbuild').build,samples=[],baselines=new Map(['store.ts','store-index.ts'].map(name=>[name,execFileSync('git',['show',baselineCommit+':src/main/'+name],{cwd:root,encoding:'utf8',windowsHide:true})]));
  for(const mode of ['before','after'])await build({stdin:{contents:"export {Store} from './src/main/store';export {framePNG} from './src/main/stitch';export {payloadDigest} from './src/main/payload-digest';",resolveDir:root},outfile:path.join(work.fixtures,mode+'.cjs'),bundle:true,platform:'node',target:'node22',external:['better-sqlite3-multiple-ciphers'],plugins:mode==='before'?[{name:'actual-git-baseline',setup(b){b.onLoad({filter:/[\\/]src[\\/]main[\\/](store|store-index)\.ts$/},args=>({contents:baselines.get(path.basename(args.path)),loader:'ts',resolveDir:path.dirname(args.path)}));}}]:[]});
  for(let round=0;round<3;round++)for(const mode of round%2?['after','before']:['before','after']){
   const {stdout}=await promisify(execFile)(process.execPath,['--expose-gc',__filename,'--host',work.fixtures,mode],{cwd:root,windowsHide:true,timeout:180000,maxBuffer:1024*1024});const sample={...JSON.parse(stdout),round};samples.push(sample);console.log(JSON.stringify({mode,round,pruneMs:sample.medianResponseMs,tighteningMs:sample.tighteningMs}));
  }
  const report={passed:true,baseline:baselineCommit+' actual Store.prune and list index',version:JSON.parse(fs.readFileSync('package.json')).version,samples,scope:'Six isolated Node/SQLite processes in alternating order, identical valid synthetic history of 10000 records including 5000 PNG images. Seven warm no-deletion cleanup calls per process and one immediate settings cleanup with actual deletion. Protected favorites, pins, shared records, duplicate stack entries and shelf records retained. Explicit GC before measurements. Timer delay measures this synchronous call blocking the Node event loop; JS heap is sampled at method return, not continuous peak or full-app memory. Database fixture preloaded through production Store.save, not a clipboard capture throughput test. No daily data, UI input or system clipboard.'};
  fs.writeFileSync(path.join(work.output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true}));
 }finally{await work.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
