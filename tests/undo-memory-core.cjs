const generated=require('./generated-fixtures.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{Store}=require('../work/test-exports.cjs');
const payload=index=>({text:'Exact '+index+'\r\n'+'x'.repeat(256*1024),formats:[{name:'Private undo bytes',data:'AAECAwQ='}]});

test('clear and batch membership copy undo in SQLite without materializing full history or unrelated binary records',()=>{
 const store=new Store(':memory:');try{
  const a=store.add(payload(1),'Private fixture'),b=store.add({attachments:[{name:'exact.bin',data:Buffer.alloc(1024*1024,17).toString('base64')}]},'Private fixture'),kept=store.add(payload(2),'Protected fixture',undefined,{favorite:true});
  const all=store.all,get=store.get;store.all=()=>{throw Error('Full history read forbidden');};store.get=()=>{throw Error('Full body membership read forbidden');};
  store.batch([a.id,b.id],'enqueue');store.batch([a.id,b.id],'unshelf');store.setQueue([]);store.clear();assert.deepEqual(store.list().map(item=>item.id),[kept.id]);assert.equal(store.db.prepare('PRAGMA temp_store').get().temp_store,2);
  store.get=get;store.all=all;store.undo();assert.deepEqual(store.all().find(item=>item.hash===a.hash).payload,a.payload);assert.deepEqual(store.all().find(item=>item.hash===b.hash).payload,b.payload);
  store.get=()=>{throw Error('Delete without observers should not decode full body');};store.batch(store.list().filter(item=>item.hash!==kept.hash).map(item=>item.id),'delete');store.get=get;store.undo();assert.equal(store.list().length,3);assert.throws(()=>store.undo(),/可撤销/);
 }finally{store.close();}
});

test('failed deletion or undo preserves the previous undo snapshot and rolls back content and queue references',()=>{
 const store=new Store(':memory:');try{
  const previous=store.add({text:'Previous undo'},'Private'),a=store.add(payload(1),'Private'),b=store.add(payload(2),'Private');store.delete(previous.id);store.setQueue([a.id,b.id]);
  let calls=0;store.onChange=()=>{if(++calls===2)throw Error('Deletion observer failed');};assert.throws(()=>store.batch([a.id,b.id],'delete'),/observer failed/);assert.deepEqual(store.queue,[a.id,b.id]);assert(store.has(a.id)&&store.has(b.id));
  store.onChange=undefined;store.undo();assert(store.all().some(item=>item.payload.text==='Previous undo'));
  store.batch([a.id,b.id],'delete');store.onChange=()=>{throw Error('Restore observer failed');};assert.throws(()=>store.undo(),/observer failed/);assert.equal(store.list().length,1);store.onChange=undefined;store.undo();assert.equal(store.list().length,3);
 }finally{store.close();}
});

test('encrypted undo remains memory-only, retains labels and original bytes, and is discarded when the store closes',()=>{
 const dir=generated.mkdtempSync(path.resolve('work/undo-memory-')),file=path.join(dir,'history.sqlite'),key=Buffer.alloc(32,41);let store=new Store(file,false,false,key);
 try{const original=store.add(payload(1),'Private',undefined,{title:'Original label',preview:'Original preview',tags:['Saved tag']});store.delete(original.id);assert.equal(store.db.prepare('PRAGMA temp_store').get().temp_store,2);assert.equal(store.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE '%undo%'").get().n,0);assert.equal(store.backup().clips.length,0);store.undo();const restored=store.all()[0];assert.deepEqual(restored.payload,original.payload);assert.equal(restored.title,'Original label');assert.equal(restored.preview,'Original preview');assert.deepEqual(restored.tags,['Saved tag']);store.delete(restored.id);store.close();store=new Store(file,false,false,key);assert.throws(()=>store.undo(),/可撤销/);assert.equal(store.list().length,0);assert.equal(fs.readFileSync(file).includes(Buffer.from('Exact 1')),false);
 }finally{store.close();key.fill(0);}
});

test('clear protects every retained collection and rolls back a failed snapshot transaction',()=>{const store=new Store(':memory:');try{const previous=store.add({text:'Previous'},'Fixture');store.delete(previous.id);const a=store.add(payload(3),'Fixture'),b=store.add(payload(4),'Fixture'),kept=['Favorite','Pinned','Shared','Queued','Shelved'].map(text=>store.add({text},'Fixture'));const favorite=store.get(kept[0].id);favorite.favorite=true;store.save(favorite);const pin=store.get(kept[1].id);pin.pinned=true;store.save(pin);const shared=store.get(kept[2].id);shared.shared=true;store.save(shared);store.setQueue([kept[3].id]);store.batch([kept[4].id],'shelf');store.db.exec("CREATE TRIGGER undo_fail BEFORE DELETE ON clips WHEN old.id='"+b.id+"' BEGIN SELECT RAISE(ABORT,'snapshot failed'); END");assert.throws(()=>store.clear(),/snapshot failed/);assert(store.has(a.id)&&store.has(b.id));store.db.exec('DROP TRIGGER undo_fail');store.undo();assert(store.list().some(row=>row.title==='Previous'));store.clear();assert.deepEqual(new Set(store.list().map(row=>row.id)),new Set(kept.map(row=>row.id)));store.undo();assert.equal(store.list().length,8);}finally{store.close();}});

test('asynchronous snapshots keep the event loop responsive, protect retained records and restore complete payloads with fresh identities',async()=>{
 const store=new Store(':memory:');try{
  const items=Array.from({length:12},(_,i)=>store.add({text:'Async '+i+' '+ 'x'.repeat(512*1024)},'Fixture',undefined,undefined,false)),kept=store.add({text:'Kept'},'Fixture',undefined,{pinned:true,favorite:true});let ticks=0;const timer=setInterval(()=>ticks++,1);
  try{await store.clearAsync();}finally{clearInterval(timer);}assert(ticks>0);assert.deepEqual(store.list().map(item=>item.id),[kept.id]);
  store.add=()=>{throw Error('Undo must not revalidate and rehash original payloads');};store.undo();for(const item of items){assert.equal(store.has(item.id),false);const row=store.db.prepare('SELECT id FROM clips WHERE hash=?').get(item.hash);assert.deepEqual(store.get(row.id).payload,item.payload);}
  assert.equal(store.db.prepare("SELECT count(*) AS n FROM sqlite_temp_master WHERE name='clipper_pending_delete'").get().n,0);
 }finally{store.close();}
});
test('single deletion and clear undo preserve original timestamps, cached metadata and chronology',async()=>{
 const store=new Store(':memory:');try{
  const base=Date.now()-86400000,old=store.add({text:'Original time'},'Fixture',undefined,{createdAt:base-1000,updatedAt:base},false),newer=store.add({text:'Newer record'},'Fixture',undefined,{createdAt:base+1000,updatedAt:base+2000},false);let restoredNotice;
  store.delete(old.id);store.onChange=(_before,next)=>{if(next?.hash===old.hash)restoredNotice=next;};store.undo();const restored=store.all().find(row=>row.hash===old.hash);assert.equal(restored.createdAt,old.createdAt);assert.equal(restored.updatedAt,old.updatedAt);assert.equal(store.db.prepare('SELECT updated FROM clips WHERE id=?').get(restored.id).updated,old.updatedAt);assert.equal(store.preview(restored.id).updatedAt,old.updatedAt);assert.equal(restoredNotice.updatedAt,old.updatedAt);assert.deepEqual(store.list().map(row=>row.hash),[newer.hash,old.hash]);
  const times=new Map(store.all().map(row=>[row.hash,[row.createdAt,row.updatedAt]]));await store.clearAsync();await store.undoAsync();for(const row of store.all())assert.deepEqual([row.createdAt,row.updatedAt],times.get(row.hash));assert.deepEqual(store.list().map(row=>row.hash),[newer.hash,old.hash]);
  const original=store.all().find(row=>row.hash===old.hash);store.delete(original.id);const recaptured=store.add(original.payload,'Fixture',undefined,{createdAt:base+3000,updatedAt:base+4000},false);store.undo();assert.equal(store.get(recaptured.id).createdAt,recaptured.createdAt);assert.equal(store.get(recaptured.id).updatedAt,recaptured.updatedAt);
 }finally{store.close();}
});
test('failed and canceled async deletions preserve the previous undo snapshot and collection references',async()=>{
 const store=new Store(':memory:');try{
  const previous=store.add({text:'Previous undo'},'Fixture');store.delete(previous.id);const a=store.add(payload(1),'Fixture'),b=store.add(payload(2),'Fixture');store.setQueue([a.id,b.id]);store.batch([b.id],'shelf');
  store.db.exec("CREATE TRIGGER async_fail BEFORE DELETE ON clips WHEN old.id='"+b.id+"' BEGIN SELECT RAISE(ABORT,'atomic failure'); END");await assert.rejects(store.deleteAsync([a.id,b.id]),/atomic failure/);assert.deepEqual(store.queue,[a.id,b.id]);assert.deepEqual(store.shelf,[b.id]);assert.equal(store.undoItems[0].id,previous.id);assert(store.has(a.id)&&store.has(b.id));store.db.exec('DROP TRIGGER async_fail');
  let checks=0;await assert.rejects(store.deleteAsync([a.id],()=>++checks<3),/失效/);assert(store.has(a.id));assert.equal(store.undoItems[0].id,previous.id);
  await store.deleteAsync([a.id,a.id,b.id]);assert.deepEqual(store.queue,[]);assert.deepEqual(store.shelf,[]);store.undo();assert(store.list().some(item=>item.hash===a.hash)&&store.list().some(item=>item.hash===b.hash));
 }finally{store.close();}
});
test('async deletion detects changes during snapshot preparation rather than deleting a newly protected record',async()=>{
 const store=new Store(':memory:');try{
  const item=store.add({text:'Before '+ 'x'.repeat(768*1024)},'Fixture'),pending=store.clearAsync();store.update(item.id,{pinned:true});await assert.rejects(pending,/失效/);assert(store.get(item.id).pinned);assert.equal(store.undoItems.length,0);
 }finally{store.close();}
});
test('undo merges a recaptured duplicate and atomically rejects capacity and observer failures',()=>{
 const store=new Store(':memory:');try{
  const item=store.add({text:'Recapture'},'Fixture',undefined,{favorite:true,tags:['saved']});store.delete(item.id);const duplicate=store.add({text:'Recapture'},'Other',undefined,{pinned:true,tags:['new']});store.undo();assert.equal(store.list().length,1);const merged=store.get(duplicate.id);assert(merged.favorite&&merged.pinned);assert.deepEqual(merged.tags,['new','saved']);
  const big=store.add({text:'Big '+ 'x'.repeat(512*1024)},'Fixture');store.delete(big.id);store.settings={...store.settings,maxHistoryMiB:0};assert.throws(()=>store.undo(),/容量/);assert(!store.has(big.id));assert.equal(store.undoItems[0].id,big.id);store.settings={...store.settings,maxHistoryMiB:256};store.undo();assert(store.list().some(item=>item.hash===big.hash));
 }finally{store.close();}
});
test('async undo yields between restores, waits before exposing the finished state and rolls back cancellation',async()=>{
 const store=new Store(':memory:');try{
  const items=Array.from({length:24},(_,i)=>store.add({text:'Undo '+i+' '+ 'x'.repeat(512*1024)},'Fixture',undefined,undefined,false));await store.clearAsync();
  let ticks=0;const timer=setInterval(()=>ticks++,1);try{await store.undoAsync();}finally{clearInterval(timer);}assert(ticks>0);assert.equal(store.list().length,24);assert.equal(store.waitForUndo(),undefined);
  await store.clearAsync();let valid=true;const pending=store.undoAsync(()=>valid);valid=false;const wait=store.waitForUndo();await assert.rejects(pending,/失效/);await wait;assert.equal(store.list().length,0);assert.equal(store.undoItems.length,items.length);await store.undoAsync();assert.equal(store.list().length,24);
 }finally{store.close();}
});

test('encrypted snapshot swaps roll back failed commits and remain compatible with later synchronous deletions',async()=>{
 const dir=generated.mkdtempSync(path.resolve('work/undo-swap-')),key=Buffer.alloc(32,39),store=new Store(path.join(dir,'history.sqlite'),false,false,key);
 try{
  const previous=store.add({text:'Previous snapshot'},'Fixture');store.delete(previous.id);const a=store.add(payload(5),'Fixture'),b=store.add(payload(6),'Fixture'),kept=store.add({text:'Pinned'},'Fixture',undefined,{pinned:true});
  const exec=store.db.exec.bind(store.db);let fail=true;store.db.exec=sql=>{if(fail&&sql.includes('RENAME TO clipper_delete_undo;COMMIT')){fail=false;exec(sql.replace(/;COMMIT$/,''));throw Error('Commit interrupted');}return exec(sql);};
  await assert.rejects(store.clearAsync(),/Commit interrupted/);assert(store.has(a.id)&&store.has(b.id));assert.equal(store.undoItems[0].id,previous.id);assert.equal(store.db.prepare("SELECT count(*) n FROM sqlite_temp_master WHERE name IN ('clipper_pending_delete','clipper_previous_delete')").get().n,0);
  await store.clearAsync();assert.deepEqual(store.list().map(row=>row.id),[kept.id]);await store.undoAsync();assert.equal(store.list().length,3);
  const restored=store.list().find(row=>row.hash===a.hash);store.delete(restored.id);store.undo();assert.deepEqual(store.get(store.list().find(row=>row.hash===a.hash).id).payload,a.payload);
  await store.clearAsync();await store.clearAsync();assert.throws(()=>store.undo(),/可撤销/);assert.equal(store.db.prepare('PRAGMA temp_store').get().temp_store,2);assert.equal(fs.readFileSync(path.join(dir,'history.sqlite')).includes(Buffer.from('Exact 5')),false);
 }finally{store.close();key.fill(0);}
});
