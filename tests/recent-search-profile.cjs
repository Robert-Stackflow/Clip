// Same generated disk history, fresh readers, alternating query algorithms.
const {Store,trayQuery}=require('../work/test-exports.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{build}=require('esbuild');
const baselineRevision='f4b18f0';
(async()=>{const {beginCase}=await import('../scripts/workspace.mjs'),work=await beginCase('recent-search-profile');const report={baselineRevision,fixture:{records:1500,characters:0},samples:[]};
try{
 const baseline=path.join(work.fixtures,'baseline.cjs'),candidate=path.join(work.fixtures,'candidate.cjs');
 await build({stdin:{contents:execFileSync('git',['show',baselineRevision+':src/main/tray-query.ts'],{encoding:'utf8'}),resolveDir:path.resolve('src/main'),sourcefile:'baseline.ts',loader:'ts'},outfile:baseline,bundle:true,platform:'node',target:'node22'});
 await build({entryPoints:['src/main/tray-query.ts'],outfile:candidate,bundle:true,platform:'node',target:'node22'});
 const readers={baseline:require(baseline).readTrayRows,candidate:require(candidate).readTrayRows};
 for(const encrypted of [false,true]){
  const file=path.join(work.fixtures,encrypted?'encrypted.sqlite':'plain.sqlite'),key=encrypted?Buffer.alloc(32,17):undefined;
  const writer=new Store(file,false,false,key);try{for(let i=0;i<1500;i++){const text='Fixture '+i+'\n'+'searchable long content '.repeat(2048)+'\nCAFÉ 尾部';if(!encrypted)report.fixture.characters+=text.length;writer.add({text},'Editor.exe',undefined,{tags:['标签'],updatedAt:1700000000000+i},false);}}finally{writer.close();}
  try{for(let round=0;round<5;round++)for(const mode of (round%2?['candidate','baseline']:['baseline','candidate'])){
   const opening=performance.now(),reader=new Store(file,false,true,key),openMs=performance.now()-opening;
   try{let sqlMs=0;const db={prepare(sql){let start=performance.now();const statement=reader.db.prepare(sql);sqlMs+=performance.now()-start;return {get(...args){const start=performance.now();try{return statement.get(...args);}finally{sqlMs+=performance.now()-start;}},iterate(){const start=performance.now(),iterator=statement.iterate();sqlMs+=performance.now()-start;return {[Symbol.iterator](){return this;},next(){const start=performance.now();try{return iterator.next();}finally{sqlMs+=performance.now()-start;}}};}};}};
    const start=performance.now(),result=readers[mode](db,[],{...trayQuery,text:'café 标签'}),totalMs=performance.now()-start;
    assert.equal(result.total,1500);assert.equal(result.items.length,80);assert.equal(result.items[0].title,'Fixture 1499');assert.equal(result.items[79].title,'Fixture 1420');assert.ok(result.items.every(i=>!('payload'in i)&&!('thumbnail'in i)));
    const sample={encrypted,round,mode,openMs,totalMs,sqlMs,matchingMs:totalMs-sqlMs};report.samples.push(sample);console.log(JSON.stringify(sample));
   }finally{reader.close();}
  }}finally{key?.fill(0);}
 }
 const median=list=>[...list].sort((a,b)=>a-b)[Math.floor(list.length/2)];report.medians={};
 for(const encrypted of [false,true])for(const mode of ['baseline','candidate']){const rows=report.samples.filter(s=>s.encrypted===encrypted&&s.mode===mode);report.medians[(encrypted?'encrypted':'plain')+'-'+mode]=Object.fromEntries(['openMs','totalMs','sqlMs','matchingMs'].map(k=>[k,median(rows.map(s=>s[k]))]));}
 console.log(JSON.stringify(report.medians));
}finally{await fs.writeFile(path.join(work.output,'result.json'),JSON.stringify(report,null,2));await work.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
