const generated=require('./generated-fixtures.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Store,databaseFingerprint}=require('../work/test-exports.cjs');
const day=86400000;
function use(fn){const store=new Store(':memory:',false);try{fn(store);}finally{store.close();}}
function expected(store,now){let count=0;return new Set(store.list().filter(item=>store.protected(item)||(++count<=store.settings.maxItems&&item.updatedAt>=now-store.settings.retentionDays*day)).map(item=>item.id));}
function freeze(fn){const now=Date.now(),clock=Date.now;Date.now=()=>now;try{fn(now);}finally{Date.now=clock;}}
const ids=store=>new Set(store.db.prepare('SELECT id FROM clips').all().map(item=>item.id));

test('Automatic retention matches existing rules across age, count and all protected collections',()=>freeze(now=>use(store=>{
 const items=[];for(let i=0;i<180;i++){const item=store.add({text:'Record '+i},'Fixture',undefined,{updatedAt:i%7===0?now-60*day:now-i*500,favorite:i%11===0,pinned:i%13===0},false);if(i%17===0)store.save({...item,shared:true});items.push(item);}
 store.setQueue([items[1].id,items[1].id,items[35].id]);store.batch([items[7].id,items[56].id],'shelf');store.settings={...store.settings,maxItems:50,retentionDays:30};
 const wanted=expected(store,now);store.prune();assert.deepEqual(ids(store),wanted);for(const item of store.list())if(store.protected(item))assert(wanted.has(item.id));
})));
test('permanent manual and rule categories survive pruning and clear; disabling protection restores cleanup',()=>freeze(now=>use(store=>{
 const manual=store.saveCategory({name:'重要',color:'#7b8e9c',kind:'all',contains:'',source:'',tag:'',manual:true,permanent:true});
 const dynamic=store.saveCategory({name:'发票',color:'#7b8e9c',kind:'text',contains:'Invoice [0-9]+',containsRegex:true,source:'',tag:'',permanent:true});
 const a=store.add({text:'archive'},'Fixture',undefined,{updatedAt:now-60*day},false),b=store.add({text:'Invoice 42'},'Fixture',undefined,{updatedAt:now-60*day},false),c=store.add({text:'expired'},'Fixture',undefined,{updatedAt:now-60*day},false);
 store.setManualCategory([a.id],manual,true);store.prune();assert(store.has(a.id)&&store.has(b.id)&&!store.has(c.id));store.clear();assert(store.has(a.id)&&store.has(b.id));store.saveCategory({...store.categories.find(x=>x.id===manual),permanent:false});store.saveCategory({...store.categories.find(x=>x.id===dynamic),permanent:false});store.prune();assert(!store.has(a.id)&&!store.has(b.id));
})));

test('Equal timestamps retain the same stable order and protected copies do not consume the ordinary count',()=>freeze(now=>use(store=>{
 const items=Array.from({length:70},(_,i)=>store.add({text:'Tie '+i},'Fixture',undefined,{updatedAt:now},false));store.setQueue([items[5].id,items[5].id]);store.batch([items[6].id],'shelf');store.settings.maxItems=50;
 const wanted=expected(store,now);store.prune();assert.deepEqual(ids(store),wanted);assert.equal(wanted.size,52);assert(store.has(items[51].id));assert(!store.has(items[52].id));
})));

test('Retention index follows duplicate captures, protection edits and removal from the shelf and queue',()=>freeze(now=>use(store=>{
 const a=store.add({text:'Capture again'},'Fixture',undefined,{updatedAt:now-50*day},false),b=store.add({text:'Old protected'},'Fixture',undefined,{updatedAt:now-50*day,favorite:true},false);
 assert.equal(store.add({text:'Capture again'},'Other',undefined,undefined,false).id,a.id);store.prune();assert(store.has(a.id)&&store.has(b.id));store.update(b.id,{favorite:false});store.setQueue([b.id,b.id]);store.batch([b.id],'shelf');store.prune();assert(store.has(b.id));store.setQueue([]);store.batch([b.id],'unshelf');store.prune();assert(!store.has(b.id));
})));

test('Existing v7 data rebuilds retention summaries without altering primary rows and accepts old writer updates',()=>{
 const root=generated.mkdtempSync(path.resolve('work/retention-legacy-')),file=path.join(root,'history.sqlite');let store=new Store(file,false);const item=store.add({text:'Previous release'},'Fixture',undefined,{updatedAt:1},false),fingerprint=databaseFingerprint(store.db);
 store.db.exec('DROP TRIGGER clip_retention_insert;DROP TRIGGER clip_retention_update;DROP TRIGGER clip_retention_delete;DROP TABLE clip_retention_cache');store.close();store=new Store(file,false);try{
  assert.equal(databaseFingerprint(store.db),fingerprint);assert.equal(store.db.prepare('PRAGMA user_version').get().user_version,7);store.db.prepare('UPDATE clips SET data=? WHERE id=?').run(JSON.stringify({...item,favorite:true}),item.id);store.prune();assert(store.has(item.id));store.db.prepare('UPDATE clips SET data=? WHERE id=?').run(JSON.stringify({...item,favorite:false}),item.id);store.prune();assert(!store.has(item.id));
 }finally{store.close();}
});

test('Encrypted histories keep retention information encrypted and permit initialized worker handoff',()=>{
 const root=generated.mkdtempSync(path.resolve('work/retention-cipher-')),file=path.join(root,'history.sqlite'),key=Buffer.alloc(32,61);let store=new Store(file,false,false,key);const item=store.add({text:'Encrypted'},'Private',undefined,{favorite:true,updatedAt:1},false);store.close();assert(!fs.readFileSync(file).includes(Buffer.from(item.id)));
 store=new Store(file,false,false,key,true);try{store.prune();assert(store.has(item.id));store.update(item.id,{favorite:false});store.prune();assert(!store.has(item.id));}finally{store.close();key.fill(0);}
});

test('A failed automatic cleanup rolls back all removals and preserves an enclosing transaction and undo snapshot',()=>use(store=>{
 const previous=store.add({text:'Undo snapshot'},'Fixture');store.delete(previous.id);const a=store.add({text:'Expired a'},'Fixture',undefined,{updatedAt:1},false),b=store.add({text:'Expired b'},'Fixture',undefined,{updatedAt:1},false);
 store.db.exec("CREATE TRIGGER retention_failure BEFORE DELETE ON clips WHEN old.id='"+b.id+"' BEGIN SELECT RAISE(ABORT,'retention failed'); END;SAVEPOINT outer_change;");store.setMeta('unrelated-change','preserved');assert.throws(()=>store.prune(),/retention failed/);assert(store.has(a.id)&&store.has(b.id));assert.equal(store.meta('unrelated-change',''),'preserved');store.db.exec('RELEASE outer_change;DROP TRIGGER retention_failure');assert.equal(store.undoItems[0].id,previous.id);store.prune();assert(!store.has(a.id)&&!store.has(b.id));assert.equal(store.undoItems[0].id,previous.id);
}));

test('Automatic cleanup and clear avoid list materialization while preserving complete undo payloads',()=>use(store=>{
 const a=store.add({attachments:[{name:'original.bin',data:Buffer.alloc(1024*1024,17).toString('base64')}]},'Fixture',undefined,undefined,false),kept=store.add({text:'Protected'},'Fixture',undefined,{favorite:true},false);
 store.list=store.all=()=>{throw Error('Full list must not enter JS during cleanup');};store.prune();assert(store.has(a.id));store.clear();assert(store.has(kept.id)&&!store.has(a.id));store.undo();const restored=store.db.prepare('SELECT id FROM clips WHERE hash=?').get(a.hash);assert.equal(store.get(restored.id).payload.attachments[0].data,a.payload.attachments[0].data);
}));

test('Orphan cache entries cannot consume retention slots or influence record deletion',()=>freeze(now=>use(store=>{
 for(let i=0;i<55;i++)store.add({text:'Valid '+i},'Fixture',undefined,{updatedAt:now},false);store.db.prepare('INSERT INTO clip_list_cache VALUES(?,?,?)').run('orphan',JSON.stringify({updatedAt:now+day}),1);store.settings.maxItems=50;const wanted=expected(store,now);store.prune();assert.deepEqual(ids(store),wanted);assert.equal(wanted.size,50);
})));
