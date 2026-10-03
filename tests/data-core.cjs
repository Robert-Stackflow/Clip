const generated=require('./generated-fixtures.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {Store,StorageManager,BackupManager,encodeBackup,decodeBackup,isEncryptedBackup,validateBackupOptions,validateBackup,defaults}=require('../work/test-exports.cjs');
const folder=()=>generated.mkdtemp(path.resolve('work/data-'));
const fakeVault={available:async()=>true,encrypt:async v=>'unit-fixture:'+Buffer.from(v).toString('base64'),decrypt:async v=>Buffer.from(v.slice(13),'base64').toString()};
const script={id:'old',name:'script',description:'fixture',code:'return input;',timeoutMs:100,permission:'selected-text',updatedAt:1};
test('migration preserves every table and identity, old files, later writes and restart location',async()=>{
 const root=await folder(),target=await folder(),manager=new StorageManager(root);let store=await manager.start();const clip=store.add({text:'persistent'},'fixture');store.setQueue([clip.id]);store.saveSnippet({title:'template',text:'saved'});store.saveSettings({...defaults,theme:'dark'});store.setMeta('text-scripts',[script]);store.setMeta('ai-profiles',{keys:{test:'ciphertext-fixture'}});const before=store.backup(),id=manager.profileId;
 const plan=await manager.prepare(target);store=await manager.migrate(plan.token);assert.equal(manager.directory,target);assert.equal(store.get(clip.id).payload.text,'persistent');assert.deepEqual(store.queue,[clip.id]);assert.equal(store.settings.theme,'dark');assert.deepEqual(store.meta('ai-profiles',{}).keys,{test:'ciphertext-fixture'});assert.equal(store.meta('profile-id',''),id);assert.deepEqual(store.backup().scripts,before.scripts);store.add({text:'after migration'},'fixture');store.close();
 const source=new Store(path.join(root,'history.sqlite'));assert.equal(source.list().length,1);source.close();const reopened=new StorageManager(root);const current=await reopened.start();assert.equal(current.list().length,2);assert.equal(reopened.directory,target);current.close();
});
test('migration rejects occupied folders, changed previews and pointer write failure without loss',async()=>{
 const root=await folder(),target=await folder(),manager=new StorageManager(root),store=await manager.start();store.add({text:'keep'},'fixture');await fs.writeFile(path.join(target,'user-file.txt'),'untouched');await assert.rejects(()=>manager.prepare(target),/空文件夹/);await fs.unlink(path.join(target,'user-file.txt'));
 let plan=await manager.prepare(target);await fs.writeFile(path.join(target,'arrived.txt'),'do not touch');await assert.rejects(()=>manager.migrate(plan.token),/改变/);assert.equal(await fs.readFile(path.join(target,'arrived.txt'),'utf8'),'do not touch');await fs.unlink(path.join(target,'arrived.txt'));
 plan=await manager.prepare(target);const pointer=path.join(root,'storage-location.json');await fs.rename(pointer,pointer+'.saved');await fs.mkdir(pointer);
 await assert.rejects(()=>manager.migrate(plan.token));assert.equal(manager.directory,root);assert.equal(store.list()[0].preview,'keep');assert.deepEqual(await fs.readdir(target),[]);await fs.rmdir(pointer);await fs.rename(pointer+'.saved',pointer);store.close();
});
test('missing or foreign custom storage and malformed pointers do not silently create new history',async()=>{
 const root=await folder(),target=await folder(),manager=new StorageManager(root);await manager.start();await manager.migrate((await manager.prepare(target)).token);manager.store.close();await fs.rename(target,target+'-offline');await assert.rejects(()=>new StorageManager(root).start(),/未创建空历史/);await fs.rename(target+'-offline',target);
 const foreign=new Store(path.join(target,'history.sqlite'));foreign.setMeta('profile-id','foreign');foreign.close();await assert.rejects(()=>new StorageManager(root).start(),/不属于/);
 await fs.writeFile(path.join(root,'storage-location.json'),'null');await assert.rejects(()=>new StorageManager(root).start(),/配置无效/);
});
test('encrypted backup authenticates content and header, randomizes ciphertext, rejects wrong passwords',async()=>{
 const value={format:'fixture',text:'private backup fixture'},password='correct fixture password';const a=await encodeBackup(value,password),b=await encodeBackup(value,password);assert.ok(isEncryptedBackup(a));assert.notDeepEqual(a,b);assert.equal(a.includes(Buffer.from(value.text)),false);assert.deepEqual(await decodeBackup(a,password),value);await assert.rejects(()=>decodeBackup(a,'incorrect fixture password'),/密码不正确/);
 for(const index of [15,40,a.length-1]){const corrupt=Buffer.from(a);corrupt[index]^=1;await assert.rejects(()=>decodeBackup(corrupt,password),/损坏/);}await assert.rejects(()=>encodeBackup(value,'short'),/12/);assert.deepEqual(await decodeBackup(await encodeBackup(value)),value);
});
test('v3 backups merge scripts transactionally without secrets, v1/v2 remain accepted',()=>{
 const source=new Store(':memory:'),target=new Store(':memory:');try{source.add({text:'content'},'fixture');source.setMeta('text-scripts',[script]);source.setMeta('ai-profiles',{key:'must not export'});const value=source.backup();assert.equal(value.version,7);assert.equal(JSON.stringify(value).includes('must not export'),false);target.import(value);target.import(value);assert.equal(target.meta('text-scripts',[]).length,1);
 target.setMeta('text-scripts',Array.from({length:100},(_,i)=>({...script,name:'existing'+i})));const bad={...value,clips:[{...value.clips[0],payload:{text:'do not partially import'}}]};
 assert.throws(()=>target.import(bad),/脚本超过/);assert.equal(target.list().length,1);assert.equal(target.meta('text-scripts',[]).length,100);
 for(const version of [1,2])assert.deepEqual(validateBackup({...value,version,scripts:undefined}).scripts,[]);
 }finally{source.close();target.close();}
});
test('large import keeps the live capacity exact across new and duplicate records',()=>{
 const source=new Store(':memory:'),target=new Store(':memory:');try{
  const duplicate=source.add({text:'shared payload'},'backup');source.save({...duplicate,title:'Longer restored title',favorite:true,tags:['restored']});
  for(let i=0;i<120;i++)source.add({text:'Imported '+i+' '+('x'.repeat(400))},'backup',undefined,undefined,false);
  source.saveSnippet({title:'imported template',text:'template value'});
  target.add({text:'shared payload'},'local');target.saveSnippet({title:'existing template',text:'local value'});
  const backup=source.backup(),original=backup.clips.find(c=>c.payload.text==='shared payload');backup.clips=[original,...backup.clips.filter(c=>c!==original)];
  const actual=()=>Number(target.db.prepare('SELECT (SELECT coalesce(sum(length(CAST(data AS BLOB))),0) FROM clips)+(SELECT coalesce(sum(length(CAST(data AS BLOB))),0) FROM snippets) AS n').get().n);
  const checked=payload=>{assert.equal(target.bytes(),actual());return undefined;};
  const initialBytes=target.bytes();let calls=0;assert.throws(()=>target.import(backup,payload=>{checked(payload);if(++calls===4)throw Error('thumbnail failed');return undefined;}),/thumbnail failed/);
  assert.equal(target.bytes(),initialBytes);assert.equal(target.list().length,1);
  target.import(backup,checked);assert.equal(target.bytes(),actual());assert.equal(target.list().length,121);
  target.import(backup,checked);assert.equal(target.bytes(),actual());assert.equal(target.list().length,121);
 }finally{source.close();target.close();}
});
test('maximum-size template list merges unique entries once and skips existing content',()=>{
 const target=new Store(':memory:');try{
  target.saveSnippet({title:'already here',text:'shared'});
  const backup={format:'clipper-backup',version:7,clips:[],snippets:[...Array.from({length:1998},(_,i)=>({title:'template '+i,payload:{text:'value '+i}})),{title:'already here',payload:{text:'shared'}},{title:'template 0',payload:{text:'value 0'}}],categories:[],scripts:[]};
  let rendered=0;target.import(backup,()=>{rendered++;return undefined;});
  assert.equal(target.snippets().length,1999);assert.equal(rendered,1998);
  target.import(backup,()=>{rendered++;return undefined;});
  assert.equal(target.snippets().length,1999);assert.equal(rendered,1998);
 }finally{target.close();}
});
test('scheduled backup handles due time, retains only owned files, verifies restore and backs off on errors',async()=>{
 const directory=await folder(),store=new Store(':memory:');store.add({text:'scheduled'},'fixture');const manager=new BackupManager(()=>store,'00000000-0000-4000-8000-000000000001',directory,fakeVault,()=>{});
 try{assert.equal(await manager.run(),null);await manager.configure({enabled:true,directory,intervalHours:1,keep:2,encrypted:true,password:'scheduled fixture password'});const start=Date.now()+1000;await fs.writeFile(path.join(directory,'manual.json'),'manual backup');await manager.run(start);assert.equal((await manager.entries()).length,1);assert.equal(await manager.run(start+100),null);await manager.run(start+3600001);await manager.run(start+7200002);assert.equal((await manager.entries()).length,2);assert.equal(await fs.readFile(path.join(directory,'manual.json'),'utf8'),'manual backup');
 const entry=(await manager.entries())[0];await assert.rejects(()=>manager.export(path.join(directory,entry.name)),/保留给自动备份/);const chosen=await manager.chooseOwn(entry.name);await assert.rejects(()=>manager.preview(chosen.token,'wrong'),/密码不正确/);assert.equal(store.list().length,1);const preview=await manager.preview(chosen.token,'scheduled fixture password');assert.equal(preview.clips,1);store.clear();assert.equal(store.list().length,0);manager.restore(preview.token);assert.equal(store.list().length,1);
 await fs.rename(directory,directory+'-offline');assert.equal(await manager.run(start+10800003),null);assert.ok(manager.status().lastError);assert.equal(manager.status().nextAt,start+10800003+900000);assert.equal(manager.status().lastSuccess,start+7200002);await fs.rename(directory+'-offline',directory);
 }finally{store.close();}
});
test('restore preview never mutates history and commit preserves a newer local edit',async()=>{
 const directory=await folder(),source=new Store(':memory:'),target=new Store(':memory:');try{const item=source.add({text:'old saved text'},'fixture');const manager=new BackupManager(()=>source,'00000000-0000-4000-8000-000000000002',directory,fakeVault,()=>{});const file=path.join(directory,'manual.clipper');await manager.export(file,'fixture recovery password');const restore=new BackupManager(()=>target,'00000000-0000-4000-8000-000000000003',directory,fakeVault,()=>{});const chosen=await restore.chooseRestore(file);await assert.rejects(async()=>restore.restore(chosen.token),/先校验/);const preview=await restore.preview(chosen.token,'fixture recovery password');assert.equal(target.list().length,0);target.add({text:'new local text'},'fixture');restore.restore(preview.token);assert.equal(target.list().length,2);assert.ok(target.list().some(c=>c.preview==='new local text'));}finally{source.close();target.close();}
});
test('backup settings and password availability reject invalid schedules and insecure credential persistence',async()=>{
 for(const patch of [{intervalHours:0},{keep:101},{enabled:'yes'}])assert.throws(()=>validateBackupOptions({enabled:true,directory:'D:\\backup',intervalHours:24,keep:7,encrypted:true,...patch}));const store=new Store(':memory:'),directory=await folder(),manager=new BackupManager(()=>store,'id',directory,{...fakeVault,available:async()=>false},()=>{});try{await assert.rejects(()=>manager.configure({enabled:true,directory,intervalHours:24,keep:7,encrypted:true,password:'fixture secret password'}),/安全存储/);assert.equal(manager.status().enabled,false);}finally{store.close();}
});
test('changed restore files and failed repeated previews invalidate an earlier approval',async()=>{
 const directory=await folder(),store=new Store(':memory:');store.add({text:'preserve'},'fixture');const manager=new BackupManager(()=>store,'id',directory,fakeVault,()=>{}),file=path.join(directory,'checked.clipper');try{await manager.export(file,'fixture restore password');const chosen=await manager.chooseRestore(file);await manager.preview(chosen.token,'fixture restore password');await assert.rejects(()=>manager.preview(chosen.token,'wrong password'));assert.throws(()=>manager.restore(chosen.token),/先校验/);await fs.appendFile(file,'tampered');await assert.rejects(()=>manager.preview(chosen.token,'fixture restore password'),/已改变/);assert.equal(store.list().length,1);}finally{store.close();}
});
test('cancelled restore releases its preview and cannot be committed later',async()=>{
 const directory=await folder(),store=new Store(':memory:'),manager=new BackupManager(()=>store,'id',directory,fakeVault,()=>{});try{store.add({text:'keep'},'fixture');const file=path.join(directory,'backup.json');await manager.export(file);const request=await manager.chooseRestore(file);await manager.preview(request.token);manager.cancelRestore(request.token);assert.throws(()=>manager.restore(request.token),/过期/);assert.equal(store.list().length,1);}finally{store.close();}
});
