const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{build}=require('esbuild'),{performance}=require('node:perf_hooks');
(async()=>{const {beginCase}=await import('../scripts/workspace.mjs'),work=await beginCase('recent-performance');let store;
 try{
  const baseline=execFileSync('git',['show','e0f1b81:src/main/tray-history.ts'],{encoding:'utf8'});const beforeFile=path.join(work.fixtures,'before.cjs'),afterFile=path.join(work.fixtures,'after.cjs');
  await build({stdin:{contents:baseline,resolveDir:path.resolve('src/main'),loader:'ts'},outfile:beforeFile,bundle:true,platform:'node'});await build({entryPoints:['src/main/tray-history.ts'],outfile:afterFile,bundle:true,platform:'node'});
  const {Store,framePNG,trayQuery}=require('../work/test-exports.cjs');store=new Store(path.join(work.fixtures,'history.sqlite'),false);const now=Date.now();
  for(let i=0;i<1500;i++)store.add({text:'Fixture recent '+i+'\n'+('searchable café long body '+i+'\n').repeat(4)},'Editor.exe',undefined,{updatedAt:now+i,favorite:i%5===0,tags:['demo']},false);
  const image={width:256,height:256,data:Buffer.alloc(256*256*4)};let random=17;for(let i=0;i<image.data.length;i++){random=(Math.imul(random,1664525)+1013904223)>>>0;image.data[i]=i%4===3?255:random>>>24;}
  for(let i=0;i<40;i++){image.data[0]=i;store.add({png:framePNG(image).toString('base64')},'Image.exe',undefined,{updatedAt:now+1500+i},false);}
  store.saveCategory({name:'Image category',color:'#7b8e9c',kind:'image',contains:'',source:'image',tag:''});
  const before=new (require(beforeFile).TrayHistory)(()=>store),after=new (require(afterFile).TrayHistory)(()=>store);before.open();after.open();
  const clean=state=>({total:state.total,items:state.items.map(({token,previewKey,...item})=>item),categories:state.categories});
  const queries=[trayQuery,{...trayQuery,kind:'image'},{...trayQuery,text:'café demo editor',kind:'text'},{...trayQuery,category:'favorites'},{...trayQuery,category:store.categories[0].id}];for(const q of queries)assert.deepEqual(clean(after.query(q)),clean(before.query(q)));
  const measures=[];for(let round=0;round<7;round++){const measure=tray=>{const start=performance.now(),state=tray.query(trayQuery);return {ms:performance.now()-start,total:state.total,rows:state.items.length};};let a,b;if(round%2){b=measure(after);a=measure(before);}else{a=measure(before);b=measure(after);}measures.push({before:a,after:b});}
  const median=key=>measures.map(m=>m[key].ms).sort((a,b)=>a-b)[3],report={result:'PASS',scope:'Isolated SQLite history: 1500 text records and 40 256×256 PNGs; default recent query only, not end-to-end window rendering',baseline:'e0f1b81',metadataSearchComparisons:queries.length,records:1540,bytes:store.bytes(),beforeMedianMs:median('before'),afterMedianMs:median('after'),measures};assert(report.afterMedianMs<report.beforeMedianMs,'No measured improvement');await fs.writeFile(path.join(work.output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{store?.close();await work.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
