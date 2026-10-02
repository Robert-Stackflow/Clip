const generated=require('./generated-fixtures.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{Store,databaseFingerprint}=require('../work/test-exports.cjs');
const primary=s=>[...new Set(s.db.prepare("SELECT json_extract(data,'$.source') AS source FROM clips").all().map(r=>r.source))].sort();
const equal=s=>assert.deepEqual(s.sourceApplications().sort(),primary(s));

test('Source index follows edits, duplicate captures, deletion, undo and failed writes',()=>{
 const s=new Store(':memory:',false);try{
  const a=s.add({text:'Original'},'Editor.exe'),b=s.add({text:'Other'},'编辑器.exe');equal(s);
  assert.equal(s.add({text:'Original'},'Browser.exe').id,a.id);equal(s);
  s.update(b.id,{favorite:true});equal(s);s.delete(a.id);equal(s);assert(!s.sourceApplications().includes('Browser.exe'));s.undo();equal(s);
  const before=s.sourceApplications().sort();s.onChange=()=>{throw Error('Rejected write');};const item=s.get(b.id);item.source='Rejected.exe';assert.throws(()=>s.save(item),/Rejected write/);assert.deepEqual(s.sourceApplications().sort(),before);equal(s);
 }finally{s.close();}
});

test('Existing version 7 histories rebuild source names without changing authoritative data',()=>{
 const root=generated.mkdtempSync(path.resolve('work/source-index-')),file=path.join(root,'history.sqlite');let s=new Store(file,false);
 s.add({text:'Existing data'},'Old.exe');const fingerprint=databaseFingerprint(s.db);
 s.db.exec('DROP TRIGGER clip_source_insert;DROP TRIGGER clip_source_update;DROP TRIGGER clip_source_delete;DROP TABLE clip_source_cache');s.close();
 s=new Store(file,false);try{
  equal(s);assert.equal(databaseFingerprint(s.db),fingerprint);assert.equal(s.db.prepare('PRAGMA user_version').get().user_version,7);
  const clip=s.all()[0];s.db.prepare('UPDATE clips SET data=? WHERE id=?').run(JSON.stringify({...clip,source:'OlderWriter.exe'}),clip.id);equal(s);
  s.db.prepare('INSERT INTO clip_list_cache VALUES(?,?,?)').run('orphan',JSON.stringify({source:'Orphan.exe'}),1);assert(!s.sourceApplications().includes('Orphan.exe'));
 }finally{s.close();}
});

test('Read-only legacy inspection queries source names without creating caches or loading full records',()=>{
 const root=generated.mkdtempSync(path.resolve('work/source-readonly-')),file=path.join(root,'history.sqlite');let s=new Store(file,false);
 try{s.add({text:'Large private text '+ 'x'.repeat(900000)},'Legacy.exe');s.db.exec('DROP TRIGGER clip_source_insert;DROP TRIGGER clip_source_update;DROP TRIGGER clip_source_delete;DROP TABLE clip_source_cache');}finally{s.close();}
 s=new Store(file,false,true);try{const prepare=s.db.prepare.bind(s.db),queries=[];s.db.prepare=sql=>{queries.push(sql);return prepare(sql);};s.list=s.all=()=>{throw Error('Full records must not be read');};assert.deepEqual(s.sourceApplications(),['Legacy.exe']);assert(queries.every(sql=>sql.includes("json_extract(data,'$.source')")));assert.equal(prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='clip_source_cache'").get().n,0);}finally{s.close();}
});

test('Source names remain encrypted and work with initialized database handoff',()=>{
 const root=generated.mkdtempSync(path.resolve('work/source-cipher-')),file=path.join(root,'history.sqlite'),key=Buffer.alloc(32,53);let s=new Store(file,false,false,key);
 s.add({text:'Encrypted record'},'PrivateApplication.exe');equal(s);s.close();assert(!fs.readFileSync(file).includes(Buffer.from('PrivateApplication.exe')));
 s=new Store(file,false,false,key,true);try{assert.deepEqual(s.sourceApplications(),['PrivateApplication.exe']);s.delete(s.all()[0].id);assert.deepEqual(s.sourceApplications(),[]);s.undo();equal(s);}finally{s.close();key.fill(0);}
});

test('Indexed source lookup returns distinct names from a covering index without thumbnail projection',()=>{
 const s=new Store(':memory:',false);try{
  for(let i=0;i<40;i++)s.add({text:'Item '+i},'Application'+(i%4)+'.exe','data:image/png;base64,'+'A'.repeat(32768),undefined,false);
  const prepare=s.db.prepare.bind(s.db),queries=[];s.db.prepare=sql=>{queries.push(sql);return prepare(sql);};s.list=s.all=()=>{throw Error('Full records must not be read');};assert.equal(s.sourceApplications().length,4);
  assert.equal(queries.length,1);assert(!queries[0].includes('data')&&!queries[0].includes('json_'));const plan=prepare('EXPLAIN QUERY PLAN '+queries[0]).all().map(r=>r.detail).join('\n');assert(plan.includes('clip_source_names'));assert(!plan.includes('TEMP B-TREE'));
 }finally{s.close();}
});
