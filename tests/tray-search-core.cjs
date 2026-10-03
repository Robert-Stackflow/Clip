const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {Store,TrayHistory,TraySearch,trayQuery,readTrayRows,setInterfaceLanguage}=require('../work/test-exports.cjs');
const generated=require('./generated-fixtures.cjs');
async function fixture(){const dir=await generated.mkdtemp(path.resolve('work/tray-search-core-')),file=path.join(dir,'history.sqlite'),store=new Store(file,false);const search=new TraySearch(path.resolve('work/tray-query-worker.cjs'));return {dir,file,store,search,async close(){await search.cancel();store.close();}};}
for(const encrypted of [false,true])test('recent worker preserves full Unicode search, categories, exact totals and bounded results: '+(encrypted?'encrypted':'plain'),async()=>{const f=await fixture();let s=f.store,key;if(encrypted){s.close();await fs.unlink(f.file);key=Buffer.alloc(32,17);s=new Store(f.file,false,false,key);}try{for(let i=0;i<93;i++)s.add({text:'prefix '+i+' '+'内容 '.repeat(12000)+' CAFÉ 尾部'},'Editor.exe',undefined,{tags:['标签'],favorite:i%3===0,updatedAt:1700000000000+i},false);const attachment=s.add({attachments:[{name:'资料\\deep\\说明.txt',data:'c2VjcmV0'}]},'Mail.exe');s.saveCategory({name:'邮件',color:'#7b8e9c',kind:'files',contains:'说明',source:'mail',tag:''});const queries=[trayQuery,{...trayQuery,text:'café 标签 editor'},{...trayQuery,text:'deep 说明',kind:'files',category:s.categories[0].id},{...trayQuery,category:'favorites'},{...trayQuery,text:'secret',kind:'files'},{...trayQuery,kind:'image'}];for(const q of queries){const copy=key?Buffer.from(key):undefined,result=await f.search.run(f.file,q,copy,()=>true);assert.deepEqual(result,readTrayRows(s.db,s.categories,q));assert.ok(result.items.length<=80);assert.ok(result.items.every(i=>!('payload'in i)&&!('thumbnail'in i)));if(copy)assert.ok(copy.every(b=>b===0));}const missing={...trayQuery,category:'00000000-0000-0000-0000-000000000000'};for(const language of ['zh-CN','en']){setInterfaceLanguage(language);await assert.rejects(f.search.run(f.file,missing,key?Buffer.from(key):undefined,()=>true),/CLIPPER_TRAY_CATEGORY_MISSING/);}assert.equal(s.get(attachment.id).payload.attachments[0].data,'c2VjcmV0');}finally{setInterfaceLanguage('zh-CN');await f.search.cancel();s.close();key?.fill(0);}});
test('late async rows cannot reauthorize tickets after close, reopen, replacement or store change',async()=>{const f=await fixture();try{const a=f.store.add({text:'original'},'Fixture'),tray=new TrayHistory(()=>f.store);tray.open();const rows=readTrayRows(f.store.db,f.store.categories,trayQuery);for(const action of ['close','reopen','replace','store']){let finish;const token=tray.query(trayQuery).items[0].token,operation=tray.operation(token),waiting=tray.queryAsync(trayQuery,()=>new Promise(resolve=>finish=resolve));waiting.catch(()=>{});assert.equal(operation.valid(),false);assert.throws(()=>tray.resolve(token));if(action==='close')tray.close();if(action==='reopen'){tray.close();tray.open();}if(action==='replace')tray.query(trayQuery);const original=f.store;if(action==='store')f.store=new Store(':memory:',false);finish(rows);await assert.rejects(waiting,/关闭|取消/);if(action==='store'){f.store.close();f.store=original;}tray.open();}const result=await tray.queryAsync(trayQuery,q=>f.search.run(f.file,q,undefined,()=>true));assert.equal(tray.resolve(result.items[0].token).payload.text,'original');assert.equal('hash'in result.items[0],false);assert.equal('payload'in result.items[0],false);f.store.edit(a.id,'changed',[]);assert.throws(()=>tray.resolve(result.items[0].token),/改变/);}finally{await f.close();}});
test('replacement waits for retirement, explicit cancel and invalid session never publish results',async()=>{const f=await fixture();try{f.store.add({text:'match'},'Fixture');const first=f.search.run(f.file,trayQuery,undefined,()=>true);first.catch(()=>{});const second=f.search.run(f.file,trayQuery,undefined,()=>true);await assert.rejects(first,/取消/);assert.equal((await second).total,1);const cancelled=f.search.run(f.file,trayQuery,undefined,()=>true);cancelled.catch(()=>{});await f.search.cancel();await assert.rejects(cancelled,/取消/);const key=Buffer.alloc(32,7);await assert.rejects(f.search.run(f.file,trayQuery,key,()=>false),/取消/);assert.ok(key.every(b=>b===0));assert.equal((await f.search.run(f.file,trayQuery,undefined,()=>true)).total,1);}finally{await f.close();}});
test('read failures and timeouts retire the worker and permit a later successful query',async()=>{const f=await fixture();try{await assert.rejects(f.search.run(path.join(f.dir,'missing.sqlite'),trayQuery,undefined,()=>true));const hang=path.join(f.dir,'hang.cjs');await fs.writeFile(hang,"setInterval(()=>{},1000)");const timed=new TraySearch(hang,20);try{await assert.rejects(timed.run(f.file,trayQuery,undefined,()=>true),/超时/);}finally{await timed.cancel();}f.store.add({text:'after failure'},'Fixture');assert.equal((await f.search.run(f.file,trayQuery,undefined,()=>true)).total,1);}finally{await f.close();}});

// Independent full-record oracle: do not compare the worker only with the
// reader it calls, since that would conceal a shared matching regression.
function expectedRows(records,categories,q){
 const terms=q.text.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean),category=categories.find(c=>c.id===q.category);
 const matching=records.filter(item=>{
  const content=[item.title,item.payload.text,item.payload.files?.join('\n'),item.payload.attachments?.map(a=>a.name).join('\n')].join('\n').toLocaleLowerCase();
  return (q.kind==='all'||item.kind===q.kind)&&(q.category!=='favorites'||item.favorite)&&(!category||
   (category.kind==='all'||item.kind===category.kind)&&(!category.source||item.source.toLocaleLowerCase().includes(category.source.toLocaleLowerCase()))&&(!category.tag||item.tags.some(t=>t.toLocaleLowerCase()===category.tag.toLocaleLowerCase()))&&(!category.contains||content.includes(category.contains.toLocaleLowerCase())))&&
   terms.every(term=>[content,item.source,...item.tags].join('\n').toLocaleLowerCase().includes(term));
 }).sort((a,b)=>b.updatedAt-a.updatedAt||(a.id<b.id?-1:a.id>b.id?1:0));
 return {total:matching.length,items:matching.slice(0,80).map(({payload,thumbnail,...item})=>item),categories:categories.map(({id,name})=>({id,name}))};
}
for(const encrypted of [false,true])test('legacy ordering index upgrades without changing payloads or read-only inspection: '+(encrypted?'encrypted':'plain'),async()=>{
 const f=await fixture();let s=f.store,key;
 if(encrypted){s.close();await fs.unlink(f.file);key=Buffer.alloc(32,23);s=new Store(f.file,false,false,key);}
 try{
  const records=[];for(let i=0;i<93;i++)records.push(s.add({text:'Tie '+i+' '+'preserved '.repeat(4096)+' CAFÉ 尾部'},'Fixture',undefined,{updatedAt:1700000000000,tags:['标签'],favorite:i%3===0},false));
  const queries=[trayQuery,{...trayQuery,text:'café 标签'},{...trayQuery,category:'favorites'}],raw=s.db.prepare('SELECT id,data FROM clips ORDER BY id').all();
  s.db.exec('DROP INDEX clips_recent_order');s.close();s=new Store(f.file,false,true,key);
  assert.equal(s.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='clips_recent_order'").get().n,0);
  for(const q of queries)assert.deepEqual(readTrayRows(s.db,[],q),expectedRows(records,[],q));
  s.close();s=new Store(f.file,false,false,key);
  assert.deepEqual(s.db.prepare('SELECT id,data FROM clips ORDER BY id').all(),raw);assert.equal(s.db.prepare('PRAGMA user_version').get().user_version,7);
  assert.deepEqual(s.all().map(row=>row.id),records.map(row=>row.id));assert.deepEqual(s.list().map(row=>row.id),records.map(row=>row.id));
  for(const q of queries){let querySql;const watched={prepare(sql){if(sql.includes(' AS summary'))querySql=sql;return s.db.prepare(sql);}};
   assert.deepEqual(readTrayRows(watched,[],q),expectedRows(records,[],q));const plan=s.db.prepare('EXPLAIN QUERY PLAN '+querySql).all().map(row=>row.detail);
   assert.ok(plan.some(row=>row.includes('COVERING INDEX clips_recent_order')));assert.ok(plan.every(row=>!row.includes('TEMP B-TREE')));
   assert.deepEqual(await f.search.run(f.file,q,key?Buffer.from(key):undefined,()=>true),expectedRows(records,[],q));
  }
  s.close();s=new Store(f.file,false,false,key);assert.deepEqual(s.db.prepare('SELECT id,data FROM clips ORDER BY id').all(),raw);
 }finally{await f.search.cancel();s.close();key?.fill(0);}
});
for(const encrypted of [false,true])for(const legacy of [false,true])test('recent search agrees with full-record semantics without reading binary bodies: '+(encrypted?'encrypted':'plain')+' '+(legacy?'legacy':'indexed'),async()=>{
 const f=await fixture();let s=f.store,key;
 if(encrypted){s.close();await fs.unlink(f.file);key=Buffer.alloc(32,19);s=new Store(f.file,false,false,key);}
 try{
  const records=[];
  for(let i=0;i<93;i++)records.push(s.add({text:'Body '+i+' '+(i%2?'CAFÉ Σ ΟΣ İ 标签':'different')},i%3?'Editor.exe':'MAIL.EXE',undefined,{title:'Custom '+i,tags:i%4?['标签','UPPER']:['OTHER'],favorite:i%3===0,pinned:i===0,updatedAt:1700000000000+i%6},false));
  const binary=Buffer.from('BINARY_PAYLOAD_MUST_NOT_REACH_READER'.repeat(4096)).toString('base64');
  records.push(s.add({attachments:[{name:'END',data:binary},{name:'资料\\deep\\说明.txt',data:'c2VjcmV0'}]},'MAIL.EXE',undefined,{title:'Attachment title',tags:['UPPER'],updatedAt:1700000000010},false));
  records.push(s.add({files:['D:\\foo\\one.txt','D:\\foo\\two.txt']},'Explorer.exe',undefined,{title:'END',tags:[],updatedAt:1700000000011},false));
  records.push(s.add({text:'visible text',html:'<b>RICH_BODY_MUST_NOT_REACH_READER</b>',rtf:'{\\rtf1 PRIVATE_RTF_CONTENT}'},'Rich.exe',undefined,{updatedAt:1700000000012},false));
  records.push(s.add({png:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='},'Image.exe','PRIVATE_THUMBNAIL', {updatedAt:1700000000013},false));
  for(const [name,contains,source,tag,kind] of [['Unicode','café','editor','upper','text'],['Across fields','END\n\nD:\\foo','','','files'],['Attachment paths','END\n资料','','','files'],['Metadata only','','mail','UPPER','all'],['Empty body','','','','image']])s.saveCategory({name,contains,source,tag,kind,color:'#7b8e9c'});
  const categories=s.categories,queries=[trayQuery,{...trayQuery,text:'  CAFÉ\t标签\nEDITOR  '},{...trayQuery,text:'Σ ΟΣ İ'},{...trayQuery,text:'body upper'},{...trayQuery,text:'bodymail'},{...trayQuery,text:'资料 deep upper'},{...trayQuery,text:'foo one.txt'},{...trayQuery,text:'BINARY_PAYLOAD_MUST_NOT_REACH_READER'},{...trayQuery,text:'RICH_BODY_MUST_NOT_REACH_READER'},{...trayQuery,text:'PRIVATE_RTF_CONTENT'},{...trayQuery,text:'PRIVATE_THUMBNAIL'},{...trayQuery,category:'favorites'},...['text','files','image','code','link'].map(kind=>({...trayQuery,kind})),...categories.flatMap(c=>[{...trayQuery,category:c.id},{...trayQuery,category:c.id,text:'upper'}])];
  if(legacy)s.db.exec('DROP TABLE clip_list_cache');
  let inspected=0;const watched={prepare(sql){const statement=s.db.prepare(sql);return {...statement,get:(...args)=>statement.get(...args),iterate(){const rows=statement.iterate();return (function*(){for(const row of rows){const raw=JSON.stringify(row);assert.ok(!raw.includes(binary));assert.ok(!raw.includes('RICH_BODY_MUST_NOT_REACH_READER'));assert.ok(!raw.includes('PRIVATE_RTF_CONTENT'));assert.ok(!raw.includes('PRIVATE_THUMBNAIL'));assert.ok(!raw.includes('iVBORw0KGgoAAAANSUhEUg'));inspected++;yield row;}})();}};}};
  for(const q of queries)assert.deepEqual(readTrayRows(watched,categories,q),expectedRows(records,categories,q),JSON.stringify(q));
  assert.ok(inspected>0);assert.equal(s.get(records[93].id).payload.attachments[0].data,binary);
 }finally{await f.search.cancel();s.close();key?.fill(0);}
});

for(const encrypted of [false,true])test('metadata matches skip long preview reads while content categories and mixed terms retain exact results: '+(encrypted?'encrypted':'plain'),async()=>{
 const f=await fixture();let s=f.store,key;
 if(encrypted){s.close();await fs.unlink(f.file);key=Buffer.alloc(32,29);s=new Store(f.file,false,false,key);}
 try{
  const records=[];for(let i=0;i<93;i++)records.push(s.add({text:'CAFÉ body '+i+' '+('preserved long content '.repeat(4096))},'Editor.exe',undefined,{title:'Name '+i,tags:['标签'],favorite:i%3===0,updatedAt:1700000000000+i%7},false));
  s.saveCategory({name:'Only content',contains:'editor',source:'editor',tag:'标签',kind:'text',color:'#7b8e9c'});
  const categories=s.categories,raw=s.db.prepare('SELECT id,data FROM clips ORDER BY id').all();let bodyReads=0;
  const watched={prepare(sql){const statement=s.db.prepare(sql);return {get(...args){if(sql==='SELECT payload FROM clip_preview_cache WHERE id=?')bodyReads++;return statement.get(...args);},all:(...args)=>statement.all(...args),iterate:(...args)=>statement.iterate(...args),run:(...args)=>statement.run(...args)};}};
  for(const [query,expectedReads]of[
   [{...trayQuery,text:'editor 标签'},0],
   [{...trayQuery,text:'name'},0],
   [{...trayQuery,text:'café 标签 name'},93],
   [{...trayQuery,text:'editor 标签',category:categories[0].id},93],
   [{...trayQuery,text:'editor 标签',kind:'image'},0],
   [{...trayQuery,text:'editor 标签',category:'favorites'},0],
  ]){
   bodyReads=0;const expected=expectedRows(records,categories,query);
   assert.deepEqual(readTrayRows(watched,categories,query),expected);assert.equal(bodyReads,expectedReads);
   assert.deepEqual(await f.search.run(f.file,query,key?Buffer.from(key):undefined,()=>true),expected);
  }
  // Preserve the old inner join if a rebuildable preview projection is absent.
  s.db.prepare('DELETE FROM clip_preview_cache WHERE id=?').run(records[0].id);
  const query={...trayQuery,text:'editor 标签'};
  assert.deepEqual(readTrayRows(s.db,categories,query),expectedRows(records.slice(1),categories,query));
  assert.deepEqual(s.db.prepare('SELECT id,data FROM clips ORDER BY id').all(),raw);
 }finally{await f.search.cancel();s.close();key?.fill(0);}
});
