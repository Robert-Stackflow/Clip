// Compare an isolated prototype with the current reader before changing production.
const {Store,trayQuery}=require('../work/test-exports.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
if(process.argv[2]==='--read'){
 const [file,encrypted,moduleFile,queryName='body']=process.argv.slice(3),key=encrypted==='true'?Buffer.alloc(32,17):undefined;
 const store=new Store(file,false,true,key),{readTrayRows}=require(moduleFile);
 try{
  let querySql;const watched={prepare(sql){if(sql.includes(' AS summary'))querySql=sql;return store.db.prepare(sql);}};
  const before=process.resourceUsage().maxRSS,start=performance.now(),rows=readTrayRows(watched,[],{...trayQuery,text:queryName==='metadata'?'editor 标签':'café 标签'}),milliseconds=performance.now()-start,peakKiB=process.resourceUsage().maxRSS;
  const expected=store.db.prepare('SELECT id FROM clips ORDER BY updated DESC,id ASC LIMIT 80').all().map(row=>row.id);
  assert.equal(rows.total,1500);assert.deepEqual(rows.items.map(row=>row.id),expected);assert.ok(rows.items.every(row=>!('payload'in row)&&!('thumbnail'in row)));
  console.log(JSON.stringify({milliseconds,peakMiB:peakKiB/1024,queryPeakIncrementMiB:(peakKiB-before)/1024,plan:store.db.prepare('EXPLAIN QUERY PLAN '+querySql).all().map(row=>row.detail)}));
 }finally{store.close();key?.fill(0);}
}else (async()=>{
 const implementation=process.env.CLIPPER_RECENT_SCAN_IMPLEMENTATION==='1',tableScan=process.env.CLIPPER_RECENT_SCAN_TABLE==='1',lazy=implementation||process.env.CLIPPER_RECENT_SCAN_LAZY==='1';
 const {beginCase}=await import('../scripts/workspace.mjs'),work=await beginCase('recent-search-scan-profile'+(implementation?'-implementation':lazy?'-lazy':tableScan?'-table':''));
 const baselineRevision='4c3644f';const report={prototype:!implementation,baselineRevision,tableScan,lazy,records:1500,rounds:3,samples:[]};
 try{
  const original=(await promisify(execFile)('git',['show',baselineRevision+':src/main/tray-query.ts'],{windowsHide:true,maxBuffer:1024*1024})).stdout;let candidate=original;
  const replace=(before,after)=>{assert.equal(candidate.split(before).length,2,'Prototype source anchor changed');candidate=candidate.replace(before,after);};
  if(implementation)candidate=await fs.readFile('src/main/tray-query.ts','utf8');
  else if(lazy){
   replace('SELECT ${summary} AS summary','SELECT c.id AS lookupId,${summary} AS summary');
   replace("indexed?',p.payload AS payload'","indexed?''");
   replace('Iterable<{summary:string;','Iterable<{lookupId:string;summary:string;');
   replace('const items:Clip[]=[];let total=0;',"const items:Clip[]=[];let total=0;const bodyReader=indexed&&needsText?db.prepare('SELECT payload FROM clip_preview_cache WHERE id=?'):undefined;");
   const begin=candidate.indexOf('   if(needsText){'),end=candidate.indexOf('   total++;',begin);assert.ok(begin>0&&end>begin);
   candidate=candidate.slice(0,begin)+`   if(needsText){
    const metadata=[item.title,item.source,...item.tags].join('\\n').toLocaleLowerCase(),remaining=terms.filter(t=>!metadata.includes(t));
    if(categoryContains||remaining.length){
     const payload=bodyReader?bodyReader.get(row.lookupId)?.payload:undefined;
     const projected=payload?JSON.parse(payload) as {text?:string;files?:string[];attachments?:{name:string}[]}:undefined;
     const content=[item.title,projected?.text??row.body,projected?.files?.join('\\n')??row.paths,projected?.attachments?.map(a=>a.name).join('\\n')??row.attachments].join('\\n').toLocaleLowerCase();
     if(categoryContains&&!content.includes(categoryContains)||!remaining.every(t=>content.includes(t)))continue;
    }
   }
`+candidate.slice(end);
  }else{
  replace('SELECT ${summary} AS summary','SELECT c.updated AS orderedAt,c.id AS orderedId,${summary} AS summary');
  if(tableScan)replace('FROM clips c ${indexed?',"FROM clips c ${unfiltered?'':'NOT INDEXED'} ${indexed?");
  replace("ORDER BY c.updated DESC,c.id ASC ${unfiltered?'LIMIT '+TRAY_LIMIT:''}","${unfiltered?'ORDER BY c.updated DESC,c.id ASC LIMIT '+TRAY_LIMIT:''}");
  replace('Iterable<{summary:string;','Iterable<{orderedAt:number;orderedId:string;summary:string;');
  replace('const items:Clip[]=[];let total=0;',`const items:Clip[]=[],chosen:{item:Clip;updated:number;id:Buffer}[]=[];let total=0;
  const insert=(item:Clip,updated:number,id:string)=>{const key=Buffer.from(id),entry={item,updated,id:key};let lo=0,hi=chosen.length;while(lo<hi){const mid=(lo+hi)>>>1,current=chosen[mid],before=updated>current.updated||updated===current.updated&&Buffer.compare(key,current.id)<0;if(before)hi=mid;else lo=mid+1;}if(lo<TRAY_LIMIT){chosen.splice(lo,0,entry);if(chosen.length>TRAY_LIMIT)chosen.pop();}};`);
  replace('total++;if(items.length<TRAY_LIMIT)items.push(item);','total++;if(unfiltered)items.push(item);else insert(item,row.orderedAt,row.orderedId);');
  replace('return {items,total,categories:','return {items:unfiltered?items:chosen.map(row=>row.item),total,categories:');
  }
  const {build}=require('esbuild'),modules={};
  for(const [mode,contents]of[['baseline',original],['candidate',candidate]]){
   modules[mode]=path.join(work.fixtures,mode+'.cjs');
   await build({stdin:{contents,sourcefile:'tray-query.ts',resolveDir:path.resolve('src/main'),loader:'ts'},outfile:modules[mode],bundle:true,platform:'node',target:'node22'});
  }
  for(const encrypted of[false,true])for(const tied of[false,true]){
   const file=path.join(work.fixtures,(encrypted?'encrypted':'plain')+'-'+(tied?'tied':'distinct')+'.sqlite'),key=encrypted?Buffer.alloc(32,17):undefined;
   const writer=new Store(file,false,false,key);
   try{for(let i=0;i<1500;i++)writer.add({text:'Fixture '+i+'\n'+'searchable long content '.repeat(2048)+'\nCAFÉ 尾部'},'Editor.exe',undefined,{tags:['标签'],updatedAt:1700000000000+(tied?0:i)},false);}finally{writer.close();}
   try{for(const queryName of(lazy?['body','metadata']:['body']))for(let round=0;round<3;round++)for(const mode of(round%2?['candidate','baseline']:['baseline','candidate'])){
    const result=await promisify(execFile)(process.execPath,[__filename,'--read',file,String(encrypted),modules[mode],queryName],{windowsHide:true,maxBuffer:1024*1024}),sample={encrypted,tied,round,mode,queryName,...JSON.parse(result.stdout)};
    report.samples.push(sample);console.log(JSON.stringify(sample));
   }}finally{key?.fill(0);}
  }
  const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];report.medians={};
  for(const queryName of(lazy?['body','metadata']:['body']))for(const encrypted of[false,true])for(const tied of[false,true])for(const mode of['baseline','candidate']){
   const samples=report.samples.filter(row=>row.encrypted===encrypted&&row.tied===tied&&row.mode===mode&&row.queryName===queryName);
   report.medians[queryName+'-'+(encrypted?'encrypted':'plain')+'-'+(tied?'tied':'distinct')+'-'+mode]=Object.fromEntries(['milliseconds','peakMiB','queryPeakIncrementMiB'].map(key=>[key,median(samples.map(row=>row[key]))]));
  }
  await fs.writeFile(path.join(work.output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.medians));
 }finally{await work.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
