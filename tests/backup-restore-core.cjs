const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomBytes}=require('node:crypto');
const {Store,BackupManager,SyncLedger,encodeBackup,restoreBackupJob}=require('../work/test-exports.cjs'),{png}=require('./png-fixture.cjs');
const root=process.env.CLIPPER_TEST_FIXTURE_DIR||path.resolve('work/current/backup-restore/fixtures'),workerFile=path.resolve('work/backup-restore-worker.cjs'),imageHost=path.resolve('dist/native/ImageHost.exe'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const vault={available:async()=>true,encrypt:async v=>v,decrypt:async v=>v};
async function until(check){const end=Date.now()+20000;while(!check()&&Date.now()<end)await sleep(1);assert.ok(check(),'Expected worker phase was not reached');}
async function fixture(encrypted=false){
 await fs.mkdir(root,{recursive:true});const directory=await fs.mkdtemp(path.join(root,'merge-')),file=path.join(directory,'history.sqlite'),key=encrypted?randomBytes(32):undefined,store=new Store(file,false,false,key);store.setMeta('lan-config',{id:'fixture'});
 let serial=Promise.resolve(),job,live=true,notified=0;const mutations=[];
 const enqueue=operation=>{const next=serial.catch(()=>{}).then(operation);serial=next;return next;};
 const manager=new BackupManager(()=>store,'fixture',directory,vault,()=>notified++,()=>{throw Error('Main-thread thumbnail must not be used');},undefined,{workerFile:path.resolve('work/backup-preview-worker.cjs'),imageHost},(bytes,valid,previous)=>job=restoreBackupJob(bytes,{source:file,workerFile,imageHost,valid:()=>live&&valid(),key:()=>key&&Buffer.from(key),enqueue,committed:r=>{store.categories=r.categories;mutations.push(...r.mutations);}},previous));
 return {directory,file,key,store,manager,enqueue,mutations,get job(){return job;},get notified(){return notified;},invalidate:()=>live=false,close:async()=>{manager.dispose();await job?.promise.catch(()=>{});await serial.catch(()=>{});store.close();key?.fill(0);}};
}
const backup=text=>({format:'clipper-backup',version:7,exportedAt:'2026-10-03',clips:[],snippets:[{title:'fixture',payload:{text}}],categories:[],scripts:[]});

test('worker merges the inspected snapshot into plain/encrypted histories without changing local privacy or newer data',async()=>{
 for(const encrypted of [false,true]){const f=await fixture(encrypted),source=new Store(':memory:');try{
  const duplicate=f.store.add({text:'existing local'},'Local',undefined,{updatedAt:Date.now()+60000,tags:['local']},false);duplicate.localOnly=true;f.store.save(duplicate);
  const shared=f.store.add({text:'already published'},'Local',undefined,undefined,false),ledger=new SyncLedger(()=>f.store,()=> 'fixture');ledger.publish(shared.id);const beforeLedger=ledger.entries();
  f.store.setQueue([duplicate.id]);f.store.shelf=[shared.id];f.store.setMeta('shelf',f.store.shelf);
  const deleted=f.store.add({text:'undo survives'},'Local');f.store.delete(deleted.id);
  source.add(duplicate.payload,'Backup',undefined,{favorite:true,tags:['backup'],updatedAt:100},false);source.add(shared.payload,'Backup',undefined,undefined,false);
  const rich={text:'Exact\r\n世界',html:'<b>Exact</b>',rtf:'{\\rtf1 Exact}',formats:[{name:'CSV',data:Buffer.from('a,b\r\n').toString('base64')}]};source.add(rich,'Fixture',undefined,undefined,false);source.add({png:png(40,20,()=>[14,80,230,128]).toString('base64')},'Fixture',undefined,undefined,false);source.add({attachments:[{name:'exact.bin',data:'AAECAw=='}]},'Fixture',undefined,undefined,false);
  source.saveSnippet({title:'Rich template',payload:rich});source.saveCategory({name:'Imported',color:'#7b8e9c',kind:'all',contains:'Exact',source:'',tag:''});source.setMeta('text-scripts',[{id:'source',name:'script',description:'Fixture script',permission:'selected-text',timeoutMs:1000,code:'input.toUpperCase()',updatedAt:1}]);
  const value=source.backup(),file=path.join(f.directory,'selected.backup'),password=encrypted?'merge fixture password':undefined;await fs.writeFile(file,await encodeBackup(value,password));const request=await f.manager.chooseRestore(file);await f.manager.preview(request.token,password);
  f.store.saveSnippet({title:'New local template',text:'Keep after preview'});await fs.writeFile(file,JSON.stringify(backup('changed on disk')));
  assert.equal(await f.manager.restore(request.token),5);assert.equal(f.notified,1);assert.equal(f.job.stats().workers,0);
  const saved=f.store.get(duplicate.id);assert.equal(saved.updatedAt,duplicate.updatedAt);assert.equal(saved.localOnly,true);assert.equal(saved.favorite,true);assert.deepEqual(saved.tags,['local','backup']);assert.equal(f.store.get(shared.id).shared,true);assert.deepEqual(ledger.entries(),beforeLedger);
  for(const original of value.clips)assert.deepEqual(f.store.all().find(item=>item.hash===original.hash).payload,original.payload);
  const image=f.store.list().find(item=>item.kind==='image');assert.match(image.thumbnail,/^data:image\/png;base64,/);assert.equal(f.store.snippetList().length,2);assert.equal(f.store.categories[0].name,'Imported');assert.equal(f.store.meta('text-scripts',[])[0].name,'script');assert.deepEqual(f.store.queue,[duplicate.id]);assert.deepEqual(f.store.shelf,[shared.id]);assert.equal(f.store.undoItems[0].id,deleted.id);f.store.undo();assert.ok(f.store.list().some(item=>item.preview==='undo survives'));
  assert.ok(f.mutations.length>=5&&f.mutations.every(m=>Object.keys(m.next||{}).every(key=>['id','localOnly'].includes(key))));assert.throws(()=>f.manager.restore(request.token),/过期/);
  if(encrypted)assert.notEqual((await fs.readFile(f.file)).subarray(0,16).toString(),'SQLite format 3\0');
 }finally{source.close();await f.close();}}
});

test('a merge failure rolls back records, categories, indexes and synchronization ledger atomically',async()=>{
 const f=await fixture(),source=new Store(':memory:');try{
  for(let i=0;i<50;i++)f.store.saveCategory({name:'Local '+i,color:'#7b8e9c',kind:'text',contains:'',source:'',tag:''});
  source.add({text:'must roll back'},'Backup');source.saveCategory({name:'Over limit',color:'#7b8e9c',kind:'text',contains:'',source:'',tag:''});const file=path.join(f.directory,'invalid-merge.json');await fs.writeFile(file,JSON.stringify(source.backup()));const request=await f.manager.chooseRestore(file);await f.manager.preview(request.token);
  await assert.rejects(f.manager.restore(request.token),/50 个/);assert.equal(f.store.list().length,0);assert.equal(f.store.categories.length,50);assert.equal(f.store.meta('categories',[]).length,50);assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM clip_list_cache').get().n,0);assert.deepEqual(f.store.meta('lan-index',[]),[]);assert.equal(f.mutations.length,0);assert.equal(f.notified,0);assert.equal(f.job.stats().workers,0);f.store.add({text:'database remains writable'},'Local');
 }finally{source.close();await f.close();}
});

test('cancelling a prepared job while the write queue is occupied does not acquire a key or write data',async()=>{
 const f=await fixture();let release;try{
  const hold=new Promise(r=>release=r);await f.enqueue(()=>1);void f.enqueue(()=>hold);let keys=0,queued;
  const job=restoreBackupJob(Buffer.from(JSON.stringify(backup('cancel queued'))),{source:f.file,workerFile,imageHost:path.join(f.directory,'missing.exe'),valid:()=>true,key:()=>{keys++;return undefined;},enqueue:op=>queued=f.enqueue(op),committed:()=>assert.fail('Cancelled merge cannot notify')});job.promise.catch(()=>{});await until(()=>job.stats().phase==='prepared');job.cancel();await assert.rejects(job.promise,/取消/);assert.equal(job.stats().workers,0);assert.equal(keys,0);assert.equal(f.store.snippetList().length,0);release();await queued?.catch(()=>{});assert.equal(keys,0);
 }finally{release?.();await f.close();}
});

test('cancelling inside the protected database phase rolls back before the job retires',async()=>{
 const f=await fixture(),source=new Store(':memory:');try{
  for(let i=0;i<48;i++)source.add({text:'Rollback '+i+'\n'+'x'.repeat(900000)},'Fixture',undefined,undefined,false);
  const file=path.join(f.directory,'large.json');await fs.writeFile(file,JSON.stringify(source.backup()));const request=await f.manager.chooseRestore(file);await f.manager.preview(request.token);const pending=f.manager.restore(request.token);pending.catch(()=>{});await until(()=>f.job.stats().phase==='restoring');f.manager.cancelRestore(request.token);await assert.rejects(pending,/取消/);assert.equal(f.job.stats().workers,0);assert.equal(f.store.list().length,0);assert.equal(f.notified,0);f.store.add({text:'Write after cancelled transaction'},'Local');
 }finally{source.close();await f.close();}
});

test('a selected backup is consumed once, exclusive operations cannot race it, and invalidated sessions cannot commit',async()=>{
 const f=await fixture();try{
  const file=path.join(f.directory,'fixture.json');await fs.writeFile(file,JSON.stringify(backup('keep local')));const request=await f.manager.chooseRestore(file);await f.manager.preview(request.token);const pending=f.manager.restore(request.token);pending.catch(()=>{});assert.throws(()=>f.manager.restore(request.token),/先校验/);await assert.rejects(f.manager.configure({}),/正在备份/);await assert.rejects(f.manager.preview(request.token),/正在备份/);f.invalidate();await assert.rejects(pending,/取消/);assert.equal(f.store.snippetList().length,0);assert.equal(f.notified,0);
 }finally{await f.close();}
});

test('startup failure, deadline, absent database and wrong encryption key cannot create or partially change history',async()=>{
 const f=await fixture(true);try{
  for(const change of [{workerFile:path.join(f.directory,'missing.cjs')},{timeoutMs:1},{source:path.join(f.directory,'absent.sqlite')},{key:()=>randomBytes(32)}]){
   const snapshot=Uint8Array.from(Buffer.from(JSON.stringify(backup('invalid job')))),job=restoreBackupJob(snapshot,{source:f.file,workerFile,imageHost,valid:()=>true,key:()=>Buffer.from(f.key),enqueue:f.enqueue,committed:()=>assert.fail('Invalid merge cannot notify'),...change});await assert.rejects(job.promise);assert.equal(job.stats().workers,0);assert.equal(f.store.snippetList().length,0);assert.ok(snapshot.byteLength===0||snapshot.every(v=>v===0));
  }await assert.rejects(fs.stat(path.join(f.directory,'absent.sqlite')),/ENOENT/);
 }finally{await f.close();}
});

test('cancelling native thumbnail preparation waits for the decoder to close',async()=>{
 const f=await fixture(),tree=require('./process-tree-memory.cjs');try{
  const value=backup('PNG');value.snippets=[{title:'Image',payload:{png:png(6000,5000,()=>[14,120,230,128]).toString('base64')}}];const job=restoreBackupJob(Buffer.from(JSON.stringify(value)),{source:f.file,workerFile,imageHost,valid:()=>true,key:()=>undefined,enqueue:f.enqueue,committed:()=>assert.fail('Cancelled decoder cannot commit')});job.promise.catch(()=>{});await until(()=>job.stats().decoding);job.cancel();await assert.rejects(job.promise,/取消/);assert.equal(job.stats().workers,0);assert.equal(tree(process.pid).processes.filter(p=>p.pid!==process.pid).length,0);assert.equal(f.store.snippetList().length,0);
 }finally{await f.close();}
});

test('the irrevocable commit decision wins over cancellation and session invalidation',async()=>{
 const f=await fixture();try{
  const fake=path.join(f.directory,'commit-boundary.cjs');await fs.writeFile(fake,`const {parentPort,workerData}=require('node:worker_threads'),flags=new Int32Array(workerData.flags);workerData.snapshot.fill(0);parentPort.once('message',message=>{message.key?.fill(0);Atomics.store(flags,0,2);setTimeout(()=>{Atomics.store(flags,0,3);parentPort.postMessage({ok:true,count:1,categories:[],mutations:[]});},80);});parentPort.postMessage({prepared:true});`);
  let live=true,notifications=0;const job=restoreBackupJob(Buffer.from(JSON.stringify(backup('boundary'))),{source:f.file,workerFile:fake,valid:()=>live,key:()=>undefined,enqueue:f.enqueue,committed:()=>notifications++});await until(()=>job.stats().phase==='committing');live=false;job.cancel();assert.equal((await job.promise).count,1);assert.equal(notifications,1);assert.equal(job.stats().workers,0);
 }finally{await f.close();}
});

test('read snapshots see complete committed history while another connection holds a merge transaction',async()=>{
 const f=await fixture(),other=new Store(f.file,false,false,undefined,true);try{
  f.store.add({text:'Before'},'Local');other.db.exec('BEGIN');other.add({text:'Pending'},'Worker',undefined,undefined,false);
  assert.deepEqual(f.store.readSnapshot(()=>[f.store.list().length,f.store.bytes(),f.store.meta('categories',[]).length]),[1,f.store.bytes(),0]);other.db.exec('COMMIT');assert.equal(f.store.readSnapshot(()=>f.store.list().length),2);assert.throws(()=>f.store.readSnapshot(()=>{throw Error('read failure');}),/read failure/);f.store.add({text:'Still usable'},'Local');
 }finally{other.db.close();await f.close();}
});
