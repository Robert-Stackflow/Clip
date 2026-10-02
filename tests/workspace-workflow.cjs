const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const api=import('../scripts/workspace.mjs');
const marker='Clipper generated verification case\n';
async function fixture(run){
 const root=await fs.mkdtemp(path.resolve('work/workspace-unit-'));
 try{await run(root);}finally{await fs.rm(root,{recursive:true,force:true});}
}
test('verification workspace refuses unmarked output and a concurrent active case',async()=>{
 const work=await api,name='workflow-lock-'+process.pid,session=await work.beginCase(name);
 try{
  await fs.writeFile(path.join(session.fixtures,'only-this-run.txt'),'private fixture');
  await assert.rejects(()=>work.beginCase(name),/already running/);
  await session.close();
  assert.equal(await fs.stat(session.fixtures).catch(()=>null),null);
  const next=await work.beginCase(name);assert.deepEqual(await fs.readdir(next.fixtures),[]);await next.close();
 }finally{
  if(await fs.stat(path.join(session.output,'.active')).catch(()=>null))await session.close();
  await work.removeGenerated(session.current,session.output);
 }
});
test('record retention excludes unmarked and active cases and enforces a count and byte limit',async()=>fixture(async root=>{
 const work=await api;await fs.writeFile(path.join(root,'.clipper-generated-workspace'),'Clipper generated verification workspace\n');
 for(const name of ['older','newer','active','unmarked']){
  const dir=path.join(root,name);await fs.mkdir(dir);await fs.writeFile(path.join(dir,'report.txt'),'record');
  if(name!=='unmarked')await fs.writeFile(path.join(dir,'.clipper-generated-case'),marker);
  if(name==='active')await fs.writeFile(path.join(dir,'.active'),String(process.pid));
  await fs.utimes(dir,Date.now()/1000,name==='older'?1:Date.now()/1000);
 }
 let kept=await work.pruneWorkspace(root,{cases:1,records:16384});assert.equal(kept.retained,1);
 assert.equal(await fs.stat(path.join(root,'older')).catch(()=>null),null);assert(await fs.stat(path.join(root,'active')));assert(await fs.stat(path.join(root,'unmarked')));
 kept=await work.pruneWorkspace(root,{cases:1,records:0});assert.equal(kept.retained,0);assert.equal(await fs.stat(path.join(root,'newer')).catch(()=>null),null);assert(await fs.stat(path.join(root,'active')));
}));
test('generated cleanup rejects parent paths and directory links without touching their target',async()=>fixture(async root=>{
 const work=await api,target=path.join(root,'target'),nested=path.join(root,'owned');await fs.mkdir(target);await fs.writeFile(path.join(target,'keep.txt'),'keep');await fs.mkdir(nested);
 await assert.rejects(()=>work.removeGenerated(root,path.dirname(root)),/boundary/);
 const link=path.join(nested,'linked');await fs.symlink(target,link,'junction');
 await assert.rejects(()=>work.removeGenerated(root,nested),/Linked/);assert.equal(await fs.readFile(path.join(target,'keep.txt'),'utf8'),'keep');await fs.unlink(link);
 await fs.symlink(target,link,'junction');await work.removeGenerated(root,nested,{unlinkLinks:true});assert.equal(await fs.readFile(path.join(target,'keep.txt'),'utf8'),'keep');
}));
