const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const {Store,BackupManager,encodeBackup,previewBackupJob,cancelBackupPreviews}=require('../work/test-exports.cjs'),{png}=require('./png-fixture.cjs');
const root=process.env.CLIPPER_TEST_FIXTURE_DIR||path.resolve('work/current/backup-preview/fixtures'),options={workerFile:path.resolve('work/backup-preview-worker.cjs'),imageHost:path.resolve('dist/native/ImageHost.exe')};
const vault={available:async()=>true,encrypt:async v=>v,decrypt:async v=>v},sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fixture(){await fs.mkdir(root,{recursive:true});const directory=await fs.mkdtemp(path.join(root,'preview-')),store=new Store(':memory:'),manager=new BackupManager(()=>store,'id',directory,vault,()=>{},()=>undefined,undefined,options);return {directory,store,manager,close:()=>{manager.dispose();store.close();}};}
const document=text=>({format:'clipper-backup',version:7,exportedAt:'2026-10-03T00:00:00Z',clips:[],snippets:[{title:'template',payload:{text}}],categories:[],scripts:[]});

test('worker rehearses rich plaintext/encrypted backups and commits the inspected snapshot exactly',async()=>{
 for(const encrypted of [false,true]){const f=await fixture(),source=new Store(':memory:');try{
  const payload={text:'Exact\r\n世界',html:'<b>Exact</b>',rtf:'{\\rtf1 Exact}',formats:[{name:'CSV',data:Buffer.from('a,b\r\n').toString('base64')}]};
  source.add(payload,'Fixture',undefined,{favorite:true,tags:['kept']},false);source.add({png:png(20,10,()=>[10,80,240,128]).toString('base64')},'Fixture',undefined,undefined,false);
  source.add({attachments:[{name:'exact.bin',data:'AAECAw=='}]},'Fixture',undefined,undefined,false);source.saveSnippet({title:'Rich template',payload});source.saveCategory({name:'Saved',color:'#7b8e9c',kind:'all',contains:'Exact',source:'',tag:''});
  const value=source.backup(),file=path.join(f.directory,'backup'),password=encrypted?'preview fixture password':undefined;await fs.writeFile(file,await encodeBackup(value,password));
  const choice=await f.manager.chooseRestore(file);assert.equal(choice.encrypted,encrypted);if(encrypted)await assert.rejects(f.manager.preview(choice.token,'wrong'),/密码不正确/);
  const preview=await f.manager.preview(choice.token,password);assert.deepEqual([preview.clips,preview.snippets,preview.categories],[3,1,1]);assert.equal(f.store.list().length,0);
  // The selected file is allowed to change after a successful inspection; the inspected bytes are authoritative.
  await fs.writeFile(file,JSON.stringify(document('changed on disk')));f.store.add({text:'new local edit'},'Local');assert.equal(f.manager.restore(choice.token),3);
  for(const original of value.clips){const saved=f.store.all().find(c=>c.hash===original.hash);assert.deepEqual(saved.payload,original.payload);assert.deepEqual(saved.tags,original.tags);}
  assert.deepEqual(f.store.snippets()[0].payload,payload);assert.equal(f.store.list().length,4);assert.throws(()=>f.manager.restore(choice.token),/过期/);
 }finally{source.close();f.close();}}
});

test('cancel, repeated previews and changed files cannot retain an earlier inspected snapshot',async()=>{
 const f=await fixture();try{const file=path.join(f.directory,'backup.json');await fs.writeFile(file,JSON.stringify(document('checked')));const choice=await f.manager.chooseRestore(file);await f.manager.preview(choice.token);const bytes=f.manager.restoring.snapshot;assert(bytes.some(v=>v));await fs.appendFile(file,'changed');await assert.rejects(f.manager.preview(choice.token),/已改变/);assert(bytes.every(v=>v===0));assert.throws(()=>f.manager.restore(choice.token),/先校验/);
  await fs.writeFile(file,JSON.stringify(document('new selection')));const next=await f.manager.chooseRestore(file),pending=f.manager.preview(next.token);pending.catch(()=>{});f.manager.cancelRestore(next.token);await assert.rejects(pending,/取消|过期/);assert.throws(()=>f.manager.restore(next.token),/过期/);assert.equal(f.store.list().length,0);
 }finally{f.close();}
});

test('replacement preview waits for retirement and only the latest result can authorize restore',async()=>{
 const f=await fixture();try{const file=path.join(f.directory,'backup.clipper');await fs.writeFile(file,await encodeBackup(document('replace'), 'preview fixture password'));const choice=await f.manager.chooseRestore(file),first=f.manager.preview(choice.token,'preview fixture password');first.catch(()=>{});const second=f.manager.preview(choice.token,'wrong');second.catch(()=>{});await assert.rejects(first,/取消|过期/);await assert.rejects(second,/密码不正确/);assert.throws(()=>f.manager.restore(choice.token),/先校验/);await f.manager.preview(choice.token,'preview fixture password');f.manager.restore(choice.token);assert.equal(f.store.snippets()[0].payload.text,'replace');
 }finally{f.close();}
});

test('streaming decryption preserves UTF-8 and original JSON across ciphertext block boundaries',async()=>{
 const f=await fixture();try{const value=document(('世界\r\n"\\'+String.fromCharCode(1)).repeat(50000));for(const encrypted of [false,true]){const password=encrypted?'stream fixture password':undefined,file=path.join(f.directory,'stream');const expected=JSON.stringify(value);await fs.writeFile(file,await encodeBackup(value,password));const choice=await f.manager.chooseRestore(file);await f.manager.preview(choice.token,password);assert.equal(Buffer.from(f.manager.restoring.snapshot).toString('utf8'),expected);f.manager.restore(choice.token);assert.equal(f.store.snippets()[0].payload.text,value.snippets[0].payload.text);}}
 finally{f.close();}
});

test('initial selection streams bounded bytes and disposal invalidates in-flight selection',async()=>{
 const f=await fixture();try{const file=path.join(f.directory,'large.json');await fs.writeFile(file,JSON.stringify(document('x'.repeat(1024*1024))));const pending=f.manager.chooseRestore(file);pending.catch(()=>{});f.manager.dispose();await assert.rejects(pending,/过期/);assert.equal(f.manager.restoring,undefined);const handle=await fs.open(path.join(f.directory,'over-limit'),'w');try{await handle.truncate(385*1024*1024);}finally{await handle.close();}await assert.rejects(f.manager.chooseRestore(path.join(f.directory,'over-limit')),/384 MiB|过期/);
 }finally{f.close();}
});

test('cancelling PNG rehearsal retires the native decoder before settling the job',async()=>{
 const f=await fixture(),tree=require('./process-tree-memory.cjs');try{const value=document('image');value.snippets=Array.from({length:2},(_,i)=>({title:'image '+i,payload:{png:png(6000,5000,()=>[i*10,30,80,255]).toString('base64')}}));const file=path.join(f.directory,'images.json'),bytes=Buffer.from(JSON.stringify(value));await fs.writeFile(file,bytes);const job=previewBackupJob(file,createHash('sha256').update(bytes).digest('hex'),undefined,options);job.promise.catch(()=>{});
  let settled=false;void job.promise.then(()=>settled=true,()=>settled=true);const until=Date.now()+15000;while(!job.stats().decoding&&!settled&&Date.now()<until)await sleep(1);assert.equal(job.stats().decoding,true);job.cancel();await assert.rejects(job.promise,/取消/);assert.equal(job.stats().workers,0);assert.equal(tree(process.pid).processes.filter(p=>p.pid!==process.pid).length,0);
 }finally{f.close();}
});

test('worker startup failure, timeout, corruption and global cancellation never authorize restore',async()=>{
 const f=await fixture();try{const file=path.join(f.directory,'broken');await fs.writeFile(file,'{broken');let bytes=await fs.readFile(file),hash=createHash('sha256').update(bytes).digest('hex');await assert.rejects(previewBackupJob(file,hash,undefined,options).promise,/无法解析/);await assert.rejects(previewBackupJob(file,hash,undefined,{workerFile:path.join(f.directory,'missing.cjs')}).promise);await assert.rejects(previewBackupJob(file,hash,undefined,{...options,timeoutMs:1}).promise,/超时/);
  const job=previewBackupJob(file,hash,undefined,options);job.promise.catch(()=>{});cancelBackupPreviews();await assert.rejects(job.promise,/取消/);assert.equal(job.stats().workers,0);assert.equal(f.store.list().length,0);
 }finally{f.close();}
});
