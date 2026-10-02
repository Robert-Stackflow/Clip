const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const {Store,HistorySearch}=require(process.argv[2]),file=path.resolve('work/performance-030/history.sqlite');
fs.mkdirSync(path.dirname(file),{recursive:true});
if(process.argv.includes('--prepare')){
 const s=new Store(file,false);s.db.exec('BEGIN');try{for(let i=0;i<96;i++)s.add({text:'工作记录 '+i+'\n'+'x'.repeat(890000)+'\n末尾目标 '+(i%3===0?'验收目标':'普通正文')},'Notepad.exe',undefined,undefined,false);for(let i=0;i<4;i++)s.add({attachments:[{name:'资料'+i+'.bin',data:Buffer.alloc(5*1024*1024,i+1).toString('base64')}]},'Explorer.exe',undefined,undefined,false);s.db.exec('COMMIT');}catch(e){s.db.exec('ROLLBACK');throw e;}s.close();console.log('Private workload prepared');process.exit(0);
}
(async()=>{const start=performance.now(),s=new Store(file,false),openMs=performance.now()-start,results=[],service=HistorySearch?new HistorySearch(path.resolve('dist/main/search-worker.cjs')):undefined;
for(const operation of ['list','bytes','search']){
 global.gc?.();const before=process.memoryUsage(),times=[];let kept;
 for(let i=0;i<7;i++){const t=performance.now();if(operation==='list'){kept=s.list();assert.equal(kept.length,100);assert(kept.every(row=>!('payload'in row)));}else if(operation==='bytes')assert(s.bytes()>100*1024*1024);else{kept=service?await service.run(1,file,'末尾目标 验收目标',undefined,undefined,()=>true):s.all().filter(c=>['末尾目标','验收目标'].every(term=>[c.title,c.payload.text,...(c.payload.files||[]),...(c.payload.attachments?.map(a=>a.name)||[]),...c.tags,c.source].join('\n').toLocaleLowerCase().includes(term))).map(c=>c.id);assert.equal(kept.length,32);}times.push(performance.now()-t);}
 const after=process.memoryUsage();times.sort((a,b)=>a-b);results.push({operation,medianMs:times[3],p95Ms:times[6],rssBefore:before.rss,rssAfter:after.rss,heapAfter:after.heapUsed,heapDelta:after.heapUsed-before.heapUsed});kept=undefined;
}
let responsive;if(service){const delays=[],reads=[];let last=performance.now();const timer=setInterval(()=>{const now=performance.now();delays.push(now-last);last=now;const t=performance.now();assert.equal(s.list().length,100);s.bytes();reads.push(performance.now()-t);},10);await service.run(1,file,'末尾目标 验收目标',undefined,undefined,()=>true);clearInterval(timer);assert(reads.length>0);responsive={heartbeats:reads.length,maxIntervalMs:Math.max(...delays),maxListAndBytesMs:Math.max(...reads)};await service.cancel();}
s.close();console.log(JSON.stringify({version:process.argv[3],node:process.versions.node,electron:process.versions.electron,openMs,rows:100,results,responsive}));})().catch(e=>{console.error(e);process.exitCode=1;});
