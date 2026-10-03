// Fresh processes, identical generated histories, only the ordering index differs.
const {Store,readTrayRows,trayQuery}=require('../work/test-exports.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
if(process.argv[2]==='--read'){
 const [file,encrypted]=process.argv.slice(3),key=encrypted==='true'?Buffer.alloc(32,17):undefined;
 const opened=performance.now(),store=new Store(file,false,true,key),openMs=performance.now()-opened;
 try{
  let querySql;const db={prepare(sql){if(sql.includes(' AS summary'))querySql=sql;return store.db.prepare(sql);}};
  const before=process.resourceUsage().maxRSS,start=performance.now(),rows=readTrayRows(db,[],{...trayQuery,text:'café 标签'}),milliseconds=performance.now()-start,peakKiB=process.resourceUsage().maxRSS;
  const expected=store.db.prepare('SELECT id FROM clips ORDER BY updated DESC,id ASC LIMIT 80').all().map(row=>row.id);
  assert.equal(rows.total,1500);assert.deepEqual(rows.items.map(row=>row.id),expected);assert.ok(rows.items.every(row=>!('payload'in row)&&!('thumbnail'in row)));
  console.log(JSON.stringify({openMs,milliseconds,peakMiB:peakKiB/1024,queryPeakIncrementMiB:(peakKiB-before)/1024,plan:store.db.prepare('EXPLAIN QUERY PLAN '+querySql).all().map(row=>row.detail)}));
 }finally{store.close();key?.fill(0);}
}else (async()=>{
 const {beginCase}=await import('../scripts/workspace.mjs'),work=await beginCase('recent-search-order-profile'),report={records:1500,rounds:3,samples:[]};
 try{
  for(const encrypted of [false,true])for(const tied of [false,true]){
   const prefix=(encrypted?'encrypted':'plain')+'-'+(tied?'tied':'distinct'),baseline=path.join(work.fixtures,prefix+'-baseline.sqlite'),candidate=path.join(work.fixtures,prefix+'-candidate.sqlite'),key=encrypted?Buffer.alloc(32,17):undefined;
   const writer=new Store(baseline,false,false,key);try{writer.db.exec('DROP INDEX IF EXISTS clips_recent_order');for(let i=0;i<1500;i++)writer.add({text:'Fixture '+i+'\n'+'searchable long content '.repeat(2048)+'\nCAFÉ 尾部'},'Editor.exe',undefined,{tags:['标签'],updatedAt:1700000000000+(tied?0:i)},false);}finally{writer.close();}
   await fs.copyFile(baseline,candidate);const migrationStart=performance.now(),updated=new Store(candidate,false,false,key);try{updated.db.exec('CREATE INDEX IF NOT EXISTS clips_recent_order ON clips(updated DESC,id ASC)');}finally{updated.close();}
   const migrationMs=performance.now()-migrationStart;const extraDatabaseBytes=(await fs.stat(candidate)).size-(await fs.stat(baseline)).size;
   try{for(let round=0;round<3;round++)for(const mode of (round%2?['candidate','baseline']:['baseline','candidate'])){
    const result=await promisify(execFile)(process.execPath,[__filename,'--read',mode==='baseline'?baseline:candidate,String(encrypted)],{windowsHide:true,maxBuffer:1024*1024}),sample={encrypted,tied,round,mode,migrationMs,extraDatabaseBytes,...JSON.parse(result.stdout)};
    if(mode==='candidate'){assert.ok(sample.plan.some(row=>row.includes('COVERING INDEX clips_recent_order')));assert.ok(sample.plan.every(row=>!row.includes('TEMP B-TREE')));}else assert.ok(sample.plan.some(row=>row.includes('TEMP B-TREE')));
    report.samples.push(sample);console.log(JSON.stringify(sample));
   }}finally{key?.fill(0);}
  }
  const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];report.medians={};
  for(const encrypted of [false,true])for(const tied of [false,true])for(const mode of ['baseline','candidate']){const rows=report.samples.filter(row=>row.encrypted===encrypted&&row.tied===tied&&row.mode===mode);report.medians[(encrypted?'encrypted':'plain')+'-'+(tied?'tied':'distinct')+'-'+mode]=Object.fromEntries(['milliseconds','peakMiB','queryPeakIncrementMiB','migrationMs','extraDatabaseBytes'].map(key=>[key,median(rows.map(row=>row[key]))]));}
  await fs.writeFile(path.join(work.output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.medians));
 }finally{await work.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
