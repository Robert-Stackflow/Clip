const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomBytes,randomUUID}=require('node:crypto');
const generated=require('./generated-fixtures.cjs');
const {Store,SyncLedger,SyncItemReader,SyncService,syncRequestBytes}=require('../work/test-exports.cjs');
const worker=path.resolve('work/sync-item-worker.cjs'),folder=()=>generated.mkdtemp('sync-item-'),code=value=>error=>error.code===value;
const vault={available:async()=>true,encrypt:async s=>'unit:'+Buffer.from(s).toString('base64'),decrypt:async s=>Buffer.from(s.slice(5),'base64').toString()};
async function fixture(key){const root=await folder(),source=path.join(root,'history.sqlite'),store=new Store(source,false,false,key),ledger=new SyncLedger(()=>store,()=>randomUUID());return {root,source,store,ledger};}
const publish=(f,payload)=>{const clip=f.store.add(payload,'Isolated sync fixture',undefined,undefined,false);f.ledger.publish(clip.id);return {clip,record:f.ledger.manifest().find(r=>r.hash===clip.hash)};};
test('read-only worker preserves exact wire bytes and original formats in plaintext and encrypted history',async()=>{
 for(const encrypted of [false,true]){const key=encrypted?randomBytes(32):undefined,f=await fixture(key),reader=new SyncItemReader(worker);try{
  for(const payload of [{text:'Unicode café 世界',formats:[{name:'Rich Text Format',data:Buffer.alloc(1024*1024,117).toString('base64')}]},{attachments:[{name:'folder',data:'',directory:true},{name:'folder\\exact.bin',data:Buffer.alloc(4*1024*1024,53).toString('base64'),modified:1700000000000}]}]){
   const {record}=publish(f,payload),expected=Buffer.from(JSON.stringify(f.ledger.item(record.id))),copy=key?Buffer.from(key):undefined,before=await fs.readdir(f.root),old=f.store.get;f.store.get=()=>{throw Error('Main isolate must not read the payload');};
   let encoded;try{encoded=await reader.run({source:f.source,key:copy},record.id,5,()=>true);}finally{f.store.get=old;}
   assert.deepEqual(Buffer.from(encoded.bytes),expected);assert.deepEqual(JSON.parse(Buffer.from(encoded.bytes)).payload,payload);assert.deepEqual(encoded.record,record);assert.equal(reader.stats().workers,0);if(copy)assert(copy.every(n=>n===0));encoded.bytes.fill(0);assert.deepEqual(await fs.readdir(f.root),before);
  }
 }finally{await reader.stop();f.store.close();key?.fill(0);}}
});
test('worker fails closed for private, withdrawn, incompatible, missing and incorrectly keyed history',async()=>{
 const key=randomBytes(32),f=await fixture(key),reader=new SyncItemReader(worker);try{const {clip,record}=publish(f,{attachments:[{name:'original.bin',data:'AQID'}]});
  await assert.rejects(reader.run({source:f.source,key:Buffer.from(key)},record.id,4,()=>true),code('SYNC_ATTACHMENT_UPGRADE'));
  const wrong=randomBytes(32);await assert.rejects(reader.run({source:f.source,key:wrong},record.id,5,()=>true),/无法解密/);assert(wrong.every(n=>n===0));
  await assert.rejects(reader.run({source:f.source},record.id,5,()=>true));
  await assert.rejects(reader.run({source:path.join(f.root,'missing.sqlite')},record.id,5,()=>true));assert.equal((await fs.readdir(f.root)).includes('missing.sqlite'),false);
  f.ledger.local(clip.id,true);assert.equal(f.ledger.canSend(record),false);await assert.rejects(reader.run({source:f.source,key:Buffer.from(key)},record.id,5,()=>true),code('SYNC_ITEM_WITHDRAWN'));assert.equal(reader.stats().workers,0);
 }finally{await reader.stop();f.store.close();key.fill(0);}
});
test('legacy manifests use compact format metadata, preserve protocol versions and reject changed records',async()=>{
 const f=await fixture();try{const items=[publish(f,{text:'plain'}),publish(f,{text:'rich',formats:[{name:'Rich Text Format',data:'AQID'}]}),publish(f,{text:'custom',formats:[{name:'com.fixture.original',data:'AQID'}]}),publish(f,{text:'omitted',omittedFormats:['com.fixture.omitted']})];
  f.store.setMeta('lan-index',f.ledger.entries().map(({minimumVersion,...entry})=>entry));const old=f.store.get;f.store.get=()=>{throw Error('Legacy manifest must not read binary payloads');};
  try{assert.deepEqual(items.map(i=>f.ledger.minimumVersion(i.record.id)),[3,4,5,5]);assert.deepEqual(f.ledger.manifest(3).map(r=>r.hash),[items[0].clip.hash]);assert.deepEqual(f.ledger.manifest(4).map(r=>r.hash),items.slice(0,2).map(i=>i.clip.hash));assert.equal(f.ledger.manifest(5).length,4);assert(f.ledger.canSend(items[0].record));assert.equal(f.ledger.canSend({...items[0].record,hash:'0'.repeat(64)}),false);assert.equal(f.ledger.canSend({...items[0].record,createdAt:0}),false);}finally{f.store.get=old;}
 }finally{f.store.close();}
});
test('reader bounds concurrent workers, wipes copied keys and waits for retirement on stop or timeout',async()=>{
 const root=await folder(),file=path.join(root,'waiting.cjs');await fs.writeFile(file,"setInterval(()=>{},1000);");const reader=new SyncItemReader(file,5000),source={source:'unused'},a=reader.run(source,'a',5,()=>true),b=reader.run(source,'b',5,()=>true),settled=Promise.allSettled([a,b]);
 assert.equal(reader.stats().workers,2);const key=randomBytes(32);await assert.rejects(reader.run({...source,key},'c',5,()=>true),code('SYNC_ITEM_BUSY'));assert(key.every(n=>n===0));await reader.stop();assert.equal(reader.stats().workers,0);for(const result of await settled){assert.equal(result.status,'rejected');assert.equal(result.reason.code,'SYNC_STOPPED');}
 const timeout=new SyncItemReader(file,25);await assert.rejects(timeout.run(source,'a',5,()=>true),/超时/);assert.equal(timeout.stats().workers,0);
 const invalid=randomBytes(32);await assert.rejects(reader.run({...source,key:invalid},'a',5,()=>false),code('SYNC_STOPPED'));assert(invalid.every(n=>n===0));
});
async function device(name,encrypted=false){const key=encrypted?randomBytes(32):undefined,f=await fixture(key);
 const service=new SyncService(()=>f.store,vault,()=>{},fn=>Promise.resolve().then(fn),undefined,{bindHost:'127.0.0.1',discovery:false,history:()=>({source:f.source,key:key?Buffer.from(key):undefined})});await service.configure({name,enabled:true,autoNew:false});clearInterval(service.timer);return {...f,service,key,close:async()=>{await service.stop();f.store.close();key?.fill(0);}};}
const peer=d=>{const s=d.service.state();return {id:s.id,name:s.name,host:'127.0.0.1',port:s.port,fingerprint:s.fingerprint};};
const identity=async d=>{const s=d.store.meta('lan-config',{});return {id:s.id,cert:s.cert,fingerprint:s.fingerprint,key:await vault.decrypt(s.secret)};};
const pair=async(a,b)=>{await b.service.join(a.service.invite('127.0.0.1'));a.service.approve(a.service.state().pending[0].id,true);await b.service.tick();assert.equal(b.service.state().peers.length,1);};
test('file-backed TLS service pulls and pushes 10 MiB originals through workers and clears prepared bytes',async()=>{
 const a=await device('worker A',true),b=await device('worker B'),buffers=[],run=a.service.itemReader.run.bind(a.service.itemReader);a.service.itemReader.run=async(...args)=>{const result=await run(...args);buffers.push(result.bytes);return result;};
 try{await pair(a,b);const payload={attachments:[{name:'large-original.bin',data:Buffer.alloc(10*1024*1024,37).toString('base64')}]},clip=a.store.add(payload,'fixture');await a.service.share(clip.id);const get=a.store.get,receiveGet=b.store.get;a.store.get=()=>{throw Error('Pull response must not read original on main');};b.store.get=()=>{throw Error('Incoming content must not read originals on main');};try{await b.service.tick();}finally{a.store.get=get;b.store.get=receiveGet;}
  assert.equal(b.service.state().peers[0].error,'');assert.deepEqual(b.store.all().find(c=>c.hash===clip.hash)?.payload,payload);assert.equal(buffers.length,1);assert(buffers[0].every(n=>n===0));
  const nextPayload={attachments:[{name:'push-original.bin',data:Buffer.alloc(2*1024*1024,11).toString('base64')}]},next=a.store.add(nextPayload,'fixture');await a.service.share(next.id);a.store.get=()=>{throw Error('Push request must not read original on main');};b.store.get=()=>{throw Error('Incoming content must not read originals on main');};try{await a.service.tick();}finally{a.store.get=get;b.store.get=receiveGet;}
  assert.equal(a.service.state().peers[0].error,'');assert.deepEqual(b.store.all().find(c=>c.hash===next.hash)?.payload,nextPayload);assert.equal(buffers.length,2);assert(buffers[1].every(n=>n===0));assert.equal(a.service.itemReader.stats().workers,0);assert.equal(a.service.payloadSlots,0);assert.equal(b.service.receiver.stats().workers,0);assert.equal(b.service.receiveSlots,0);
  let requests=0;b.service.server.on('request',()=>requests++);const ai=await identity(a),bytes=Buffer.from('{"record":"not released"}');await assert.rejects(syncRequestBytes(ai,{...peer(b),fingerprint:'0'.repeat(64)},'/v1/apply',bytes),/证书已改变/);await assert.rejects(syncRequestBytes(ai,peer(b),'/v1/apply',bytes,undefined,5,()=>false),code('SYNC_SEND_DENIED'));assert.equal(requests,0);
 }finally{await a.close();await b.close();}
});
test('withdrawal after a snapshot and revocation during preparation never release encoded content',async()=>{
 const a=await device('cancel worker');try{const clip=a.store.add({text:'must remain local '.repeat(6000)},'fixture');await a.service.share(clip.id);const record=a.service.ledger.manifest()[0],original=a.service.itemReader.run.bind(a.service.itemReader);let ready,release,encoded;const prepared=new Promise(r=>ready=r),gate=new Promise(r=>release=r);a.service.itemReader.run=async(...args)=>{encoded=await original(...args);ready();await gate;return encoded;};const pending=a.service.encodedItem(record.id,5,a.service.generation),rejection=assert.rejects(pending,code('SYNC_SEND_DENIED'));await prepared;a.service.local(clip.id,true);release();await rejection;assert(encoded.bytes.every(n=>n===0));
  a.service.local(clip.id,false);await a.service.share(clip.id);const current=a.service.ledger.manifest().find(r=>!r.deleted),file=path.join(a.root,'waiting.cjs');await fs.writeFile(file,"setInterval(()=>{},1000);");a.service.itemReader=new SyncItemReader(file);const blocked=a.service.encodedItem(current.id,5,a.service.generation),cancelled=assert.rejects(blocked,code('SYNC_STOPPED'));a.service.revoke(randomUUID());await cancelled;assert.equal(a.service.itemReader.stats().workers,0);
 }finally{await a.close();}
});
test('small text uses the immediate path and large text uses the background path with identical version checks',async()=>{
 const a=await device('size routing');try{let workers=0;const run=a.service.itemReader.run.bind(a.service.itemReader);a.service.itemReader.run=(...args)=>{workers++;return run(...args);};
  for(const [text,count] of [['ordinary Unicode 世界',0],['x'.repeat(64*1024),1]]){const clip=a.store.add({text},'fixture');await a.service.share(clip.id);const record=a.service.ledger.manifest().find(r=>r.hash===clip.hash),encoded=await a.service.encodedItem(record.id,5,a.service.generation);assert.equal(workers,count);assert.equal(JSON.parse(Buffer.from(encoded.bytes)).payload.text,text);encoded.release();}
  const clip=a.store.add({text:'short rich',formats:[{name:'Rich Text Format',data:'AQID'}]},'fixture');await a.service.share(clip.id);const record=a.service.ledger.manifest().find(r=>r.hash===clip.hash);await assert.rejects(a.service.encodedItem(record.id,3,a.service.generation),code('SYNC_FORMAT_UPGRADE'));assert.equal(workers,1);
 }finally{await a.close();}
});
test('prepared transfer slots stay bounded until completion, release once and recover after errors',async()=>{
 const a=await device('bounded bodies');try{const clip=a.store.add({text:'small shared message'},'fixture');await a.service.share(clip.id);const record=a.service.ledger.manifest()[0],read=()=>a.service.encodedItem(record.id,5,a.service.generation),first=await read(),second=await read();assert.equal(a.service.payloadSlots,2);assert.equal(a.service.itemReader.stats().workers,0);await assert.rejects(read(),code('SYNC_ITEM_BUSY'));first.release();first.release();assert(first.bytes.every(n=>n===0));assert.equal(a.service.payloadSlots,1);const next=await read();second.release();next.release();assert.equal(a.service.payloadSlots,0);await assert.rejects(a.service.encodedItem('missing',5,a.service.generation),code('SYNC_ITEM_WITHDRAWN'));assert.equal(a.service.payloadSlots,0);
 }finally{await a.close();}
});
