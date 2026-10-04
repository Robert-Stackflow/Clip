const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomBytes}=require('node:crypto'),{execFileSync}=require('node:child_process');
if(!process.versions.electron){
 const exportsFile=path.resolve('work/search-030-native/exports.cjs');fs.mkdirSync(path.dirname(exportsFile),{recursive:true});
 require('esbuild').buildSync({entryPoints:['tests/performance-030-exports.ts'],outfile:exportsFile,bundle:true,platform:'node',external:['better-sqlite3-multiple-ciphers']});
 const result=execFileSync(require('electron'),[__filename,'--host',exportsFile],{encoding:'utf8',env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,timeout:60000});process.stdout.write(result);
}
else (async()=>{
 const {Store,HistorySearch}=require(process.argv[3]),root=fs.mkdtempSync(path.resolve('work/search-030-native-')),service=new HistorySearch(path.resolve('dist/main/search-worker.cjs')),results=[];
 const legacy=(s,q,category)=>s.all().filter(c=>q.toLocaleLowerCase().trim().split(/\s+/).every(term=>[c.title,c.payload.text,...(c.payload.files||[]),...(c.payload.attachments?.map(a=>a.name)||[]),...c.tags,c.source].join('\n').toLocaleLowerCase().includes(term))&&(!category||(category.kind==='all'||category.kind===c.kind)&&(!category.source||c.source.toLocaleLowerCase().includes(category.source.toLocaleLowerCase()))&&(!category.tag||c.tags.some(t=>t.toLocaleLowerCase()===category.tag.toLocaleLowerCase()))&&(!category.contains||[c.title,c.payload.text,...(c.payload.files||[]),...(c.payload.attachments?.map(a=>a.name)||[])].join('\n').toLocaleLowerCase().includes(category.contains.toLocaleLowerCase())))).map(c=>c.id);
 for(const encrypted of [false,true]){
  const key=encrypted?randomBytes(32):undefined,file=path.join(root,encrypted?'cipher.sqlite':'plain.sqlite'),s=new Store(file,false,false,key);
  try{
   const text=s.add({text:'多语言 Alpha\n'+'中'.repeat(210000)+'\n末尾目标 ΩMEGA',html:'<b>html-only-token</b>'},'Notepad.exe');s.update(text.id,{tags:['设计']});
   s.add({attachments:[{name:'说明 Report.bin',data:Buffer.from('binary-only-token').toString('base64')}]},'Explorer.exe');s.add({files:['D:\\中文目录\\目标.docx']},'FileManager.exe');s.add({text:'第二份 ALPHA'},'Other.exe');
   const category={id:'test',name:'筛选',color:'#888888',kind:'text',contains:'Ωmega',source:'note',tag:'设计'};
   for(const query of ['', '末尾目标 Ωmega','alpha','设计 NOTE','说明 report','中文目录','html-only-token',Buffer.from('binary-only-token').toString('base64'),'不存在']){const copy=key&&Buffer.from(key);const found=await service.run(1,file,query,undefined,copy,()=>true);assert.deepEqual(found,legacy(s,query));if(copy)assert(copy.every(n=>n===0));}
   assert.deepEqual(await service.run(1,file,'',category,key&&Buffer.from(key),()=>true),legacy(s,'',category));results.push({encrypted,searchAndCategoryParity:true,payloadExcluded:true,keyCopyWiped:true});
   const both=await Promise.all([service.run(1,file,'alpha',undefined,key&&Buffer.from(key),()=>true),service.run(2,file,'report',undefined,key&&Buffer.from(key),()=>true)]);assert.deepEqual(both,[legacy(s,'alpha'),legacy(s,'report')]);results.push({encrypted,independentWindows:true});
   const rapid=Array.from({length:12},(_,i)=>service.run(1,file,i===11?'alpha':'末尾目标',undefined,key&&Buffer.from(key),()=>true)),answers=await Promise.all(rapid);assert(answers.slice(0,-1).every(a=>a.length===0));assert.deepEqual(answers.at(-1),legacy(s,'alpha'));
   const pending=service.run(1,file,'alpha',undefined,key&&Buffer.from(key),()=>true);await service.cancel(1);assert.deepEqual(await pending,[]);const invalid=key&&Buffer.from(key);assert.deepEqual(await service.run(1,file,'alpha',undefined,invalid,()=>false),[]);if(invalid)assert(invalid.every(n=>n===0));results.push({encrypted,replacementAndCancel:true,invalidCallerIgnored:true});
   let unlocked=true;const lock=service.run(1,file,'alpha',undefined,key&&Buffer.from(key),()=>unlocked);unlocked=false;await service.cancel();assert.deepEqual(await lock,[]);
   s.edit(text.id,'更新后的唯一目标',['新标签']);assert.deepEqual(await service.run(1,file,'唯一目标',undefined,key&&Buffer.from(key),()=>true),[text.id]);results.push({encrypted,lockCancels:true,freshWritesVisible:true});
  }finally{await service.cancel();s.close();key?.fill(0);}
 }
 const hanging=path.join(root,'hanging.cjs');fs.writeFileSync(hanging,"setInterval(()=>{},1000)");const timeout=new HistorySearch(hanging,30);await assert.rejects(()=>timeout.run(1,'unused','',undefined,undefined,()=>true),/搜索超时/);await timeout.cancel();
 const failed=new HistorySearch(path.join(root,'missing.cjs'));await assert.rejects(()=>failed.run(1,'unused','',undefined,undefined,()=>true));await failed.cancel();results.push({timeoutReleased:true,workerErrorReleased:true});
 fs.mkdirSync('work/search-030-native',{recursive:true});const report={passed:true,cases:results.length,node:process.versions.node,electron:process.versions.electron,scope:'Production search worker and SQLite cipher in isolated Electron Node runtime. No user history or system clipboard.',results};fs.writeFileSync('work/search-030-native/results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});
