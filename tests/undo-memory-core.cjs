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
