const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const {beginCase}=await import('../scripts/workspace.mjs'),work=await beginCase('recent-search-idle-summary');
try{const sources=[],samples=[];
 for(const encrypted of [false,true])for(let round=0;round<(encrypted?3:5);round++)for(const mode of (encrypted?['baseline','current']:['pair'])){
  const source=path.join('work/current','recent-search-idle-'+(encrypted?'encrypted':'plain')+'-'+round+(encrypted?'-'+mode:''),'result.json'),data=JSON.parse(await fs.readFile(source,'utf8'));sources.push(source);
  assert.ok(data.baseline.endsWith('release\\0.49.4\\win-unpacked\\Clipper.exe'));assert.ok(data.current.endsWith('release\\0.49.5\\win-unpacked\\Clipper.exe'));assert.deepEqual(data.errors,[]);assert.equal(!!data.encrypted,encrypted);assert.equal(data.samples.length,encrypted?1:2);
  assert.equal(data.versions.length,data.samples.length);for(const version of data.versions){assert.equal(version.round,round);assert.equal(version.packageVersion,version.mode==='current'?'0.49.5':'0.49.4');assert.equal(version.displayedVersion,version.mode==='current'?'v0.49.5':'v0.49.3');}
  for(const sample of data.samples){assert.equal(sample.round,round);assert.equal(sample.retiredWhileHidden,sample.mode==='current');assert.ok(sample.idleReopenMs>0&&sample.idleReopenMs<1500);assert.deepEqual(sample.errors,[]);assert.equal(sample.preservedOriginals,true);if(encrypted){assert.equal(sample.mode,mode);assert.ok(sample.lockMilliseconds>0&&sample.lockMilliseconds<3000);}samples.push({...sample,encrypted,peakDeltaMiB:sample.memoryMiB.peak-sample.memoryMiB.before,idleDeltaMiB:sample.memoryMiB.idle10s-sample.memoryMiB.before});}
 }
 const median=list=>[...list].sort((a,b)=>a-b)[Math.floor(list.length/2)],medians={},ranges={};
 for(const encrypted of [false,true])for(const mode of ['baseline','current']){
  const rows=samples.filter(s=>s.encrypted===encrypted&&s.mode===mode),name=(encrypted?'encrypted':'plain')+'-'+mode;
  assert.equal(rows.length,encrypted?3:5);const keys=['openMs','searchMs','reopenMs','idleReopenMs','ipcMaxMs','mainGapMaxMs','mainGapP95Ms','peakDeltaMiB','idleDeltaMiB',...(encrypted?['lockMilliseconds']:[])];
  medians[name]=Object.fromEntries(keys.map(k=>[k,median(rows.map(s=>s[k]))]));ranges[name]=Object.fromEntries(keys.map(k=>[k,{min:Math.min(...rows.map(s=>s[k])),max:Math.max(...rows.map(s=>s[k]))}]));
 }
 await fs.writeFile(path.join(work.output,'result.json'),JSON.stringify({sources,samples,medians,ranges},null,2));console.log(JSON.stringify({medians,ranges},null,2));
}finally{await work.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
