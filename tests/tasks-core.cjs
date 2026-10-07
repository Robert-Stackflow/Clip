const {test}=require('node:test'),assert=require('node:assert/strict');
const {Store,TaskCenter,configureImageHost,uploadOptions,uploadKey,resolveImageUpload,imageUploadRecord,imageHostState,testImageHost}=require('../work/test-exports.cjs');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XkAAAAASUVORK5CYII=';
const options=(extra={})=>({enabled:true,endpoint:'https://upload.example.test/images',bodyMode:'binary',fieldName:'file',authMode:'bearer',tokenHeader:'X-API-Key',responsePath:'url',linkFormat:'url',timeoutSeconds:30,token:'fixture-token',...extra});
const response=(link='https://cdn.example.test/a.png')=>new Response(JSON.stringify({url:link}),{status:200});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('retired recognition tasks are removed when loading receipts without deleting saved text',()=>{
 const store=new Store(':memory:');
 try{const item=store.add({text:'Previously recognized text'},'OCR 识别'),at=Date.now();
  store.setMeta('task-center',[{id:'legacy',kind:'ocr',title:'Old task',status:'running',phase:'Working',createdAt:at,updatedAt:at},{id:'upload',kind:'image-upload',title:'Retained receipt',status:'completed',phase:'Done',createdAt:at,updatedAt:at}]);
  const center=new TaskCenter(store,()=>{});assert.deepEqual(center.state().items.map(task=>task.id),['upload']);assert.equal(center.state().active,0);assert.deepEqual(store.meta('task-center',[]).map(task=>task.id),['upload']);assert.equal(store.get(item.id).payload.text,'Previously recognized text');center.stop();
 }finally{store.close();}
});

test('upload links remain reusable after closing and reopening the history database',async()=>{
 const path=require('node:path'),generated=require('./generated-fixtures.cjs'),directory=generated.mkdtempSync('task-upload-restart-'),database=path.join(directory,'history.sqlite');
 let store=new Store(database),id;
 try{configureImageHost(store,options());const item=store.add({png},'fixture');id=item.id;await resolveImageUpload(store,item,uploadOptions(store),false,{},async()=>response());store.close();store=new Store(database);
  assert.equal(imageUploadRecord(store,store.get(id)).link,'https://cdn.example.test/a.png');let uploads=0;const result=await resolveImageUpload(store,store.get(id),uploadOptions(store),false,{},async(_url,init)=>{if(init.method==='POST')uploads++;return new Response(null,{status:200});});assert.equal(result.reused,true);assert.equal(uploads,0);
 }finally{store.close();}
});
test('task center caps upload concurrency, reports phases, and starts queued work in order',async()=>{
 const store=new Store(':memory:'),events=[],center=new TaskCenter(store,state=>events.push(state));let running=0,max=0;const releases=[],started=[];
 try{const jobs=Array.from({length:4},(_,index)=>center.start({kind:'image-upload',title:String(index)},async context=>{running++;max=Math.max(max,running);started.push(index);context.phase('uploading');await new Promise(resolve=>releases.push(resolve));running--;context.result({link:'https://cdn.example.test/'+index,copied:index===0});return index;},true));
  assert.equal(center.state().active,4);assert.equal(center.state().items.filter(item=>item.status==='queued').length,2);assert.deepEqual(started,[0,1]);releases.shift()();await tick();assert.deepEqual(started,[0,1,2]);releases.shift()();await tick();assert.deepEqual(started,[0,1,2,3]);while(releases.length)releases.shift()();assert.deepEqual(await Promise.all(jobs.map(job=>job.promise)),[0,1,2,3]);assert.equal(max,2);assert.equal(center.state().active,0);assert(events.some(value=>value.items.some(item=>item.phase==='uploading')));assert.equal(center.get(jobs[0].id).copied,true);
 }finally{center.stop();store.close();}
});
test('cancelled queued tasks never execute; running cancellation records cancellation rather than failure',async()=>{
 const store=new Store(':memory:'),center=new TaskCenter(store,()=>{});let queuedRan=false;
 const blocked=()=>center.start({kind:'image-upload',title:'blocked'},context=>new Promise((resolve,reject)=>context.signal.addEventListener('abort',()=>reject(context.signal.reason),{once:true})),true);
 try{const a=blocked(),b=blocked(),c=center.start({kind:'image-upload',title:'queued'},async()=>{queuedRan=true;},true);const settled=Promise.allSettled([a.promise,b.promise,c.promise]);center.cancel(c.id);center.cancel(a.id);center.cancel(b.id);await settled;assert.equal(queuedRan,false);assert.equal(center.state().active,0);assert(center.state().items.every(item=>item.status==='cancelled'));assert.equal(center.state().failed,0);
 }finally{center.stop();store.close();}
});
test('failure receipts survive reopening, interrupted tasks are not replayed, and clearing preserves active tasks',async()=>{
 const store=new Store(':memory:');let center=new TaskCenter(store,()=>{});
 try{const failed=center.start({kind:'image-upload',title:'failure',retryable:true},async()=>{throw new Error('fixture error');});await assert.rejects(failed.promise,/fixture error/);assert.equal(center.state().failed,1);center=new TaskCenter(store,()=>{});assert.equal(center.get(failed.id).error,'fixture error');assert.equal(center.get(failed.id).retryable,true);
  const pending=center.start({kind:'ai',title:'pending'},context=>new Promise((resolve,reject)=>context.signal.addEventListener('abort',()=>reject(context.signal.reason))));const rejection=assert.rejects(pending.promise);center.clear();assert.deepEqual(center.state().items.map(item=>item.id),[pending.id]);const reopened=new TaskCenter(store,()=>{});assert.equal(reopened.get(pending.id).status,'cancelled');center.cancelAll();await rejection;const after=center.start({kind:'script',title:'after lock'},async()=>42);assert.equal(await after.promise,42);reopened.stop();
 }finally{center.stop();store.close();}
});
test('persisted upload receipts deduplicate by image bytes and host identity, even after task receipts clear',async()=>{
 const store=new Store(':memory:');
 try{configureImageHost(store,options());const item=store.add({png},'fixture'),saved=uploadOptions(store);let posts=0,heads=0;
  const request=async(url,init)=>{if(init.method==='POST'){posts++;return response();}heads++;assert.equal(init.headers,undefined,'never forward upload token to returned URL');return new Response(null,{status:200});};
  assert.deepEqual(await resolveImageUpload(store,item,saved,false,{},request),{link:'https://cdn.example.test/a.png',reused:false});const center=new TaskCenter(store,()=>{});center.clear();center.stop();const record=imageUploadRecord(store,item);assert.equal(record.link,'https://cdn.example.test/a.png');assert.deepEqual(await resolveImageUpload(store,{...item,id:'other'},saved,false,{},request),{link:record.link,reused:true});assert.equal(posts,1);assert.equal(heads,1);
  assert.equal(uploadKey(saved,png),uploadKey({...saved,linkFormat:'markdown',timeoutSeconds:15},png));assert.notEqual(uploadKey(saved,png),uploadKey({...saved,token:'another-fixture-token'},png));configureImageHost(store,options({endpoint:'https://different.example.test/images'}));assert.equal(imageUploadRecord(store,item),null);configureImageHost(store,options());assert.equal(imageUploadRecord(store,item).link,record.link);
 }finally{store.close();}
});
test('404 and 410 reupload once; access errors and network errors preserve the existing receipt',async()=>{
 for(const status of [404,410,403,500,'network']){const store=new Store(':memory:');try{configureImageHost(store,options());const item=store.add({png},'fixture'),saved=uploadOptions(store);await resolveImageUpload(store,item,saved,false,{},async()=>response());let posts=0;
  const request=async(url,init)=>{if(init.method==='POST'){posts++;return response('https://cdn.example.test/new.png');}if(status==='network')throw new Error('offline');return new Response(null,{status});};
  if(status===404||status===410){const result=await resolveImageUpload(store,item,saved,false,{},request);assert.equal(result.reused,false);assert.equal(result.link,'https://cdn.example.test/new.png');assert.equal(posts,1);}else{await assert.rejects(()=>resolveImageUpload(store,item,saved,false,{},request));assert.equal(posts,0);assert.equal(imageUploadRecord(store,item).link,'https://cdn.example.test/a.png');}
 }finally{store.close();}}
});
test('force upload replaces the cached link; failed force upload retains the previous link',async()=>{
 const store=new Store(':memory:');try{configureImageHost(store,options());const item=store.add({png},'fixture'),saved=uploadOptions(store);await resolveImageUpload(store,item,saved,false,{},async()=>response());await assert.rejects(()=>resolveImageUpload(store,item,saved,true,{},async(url,init)=>{assert.equal(init.method,'POST');return new Response(null,{status:503});}));assert.equal(imageUploadRecord(store,item).link,'https://cdn.example.test/a.png');const result=await resolveImageUpload(store,item,saved,true,{},async(url,init)=>{assert.equal(init.method,'POST');return response('https://cdn.example.test/forced.png');});assert.equal(result.reused,false);assert.equal(imageUploadRecord(store,item).link,result.link);
 }finally{store.close();}
});
test('link validation supports HEAD fallback and HTTPS redirects without downloading images',async()=>{
 const store=new Store(':memory:');try{configureImageHost(store,options());const item=store.add({png},'fixture'),saved=uploadOptions(store);await resolveImageUpload(store,item,saved,false,{},async()=>response());const calls=[];
  const result=await resolveImageUpload(store,item,saved,false,{},async(url,init)=>{calls.push([url,init.method,init.headers]);if(calls.length===1)return new Response(null,{status:405});if(calls.length===2)return new Response(null,{status:302,headers:{location:'https://redirect.example.test/a.png'}});assert.deepEqual(init.headers,{range:'bytes=0-0'});return new Response(null,{status:206});});assert.equal(result.reused,true);assert.equal(calls.length,3);assert.equal(calls[2][0],'https://redirect.example.test/a.png');await assert.rejects(()=>resolveImageUpload(store,item,saved,false,{},async()=>new Response(null,{status:302,headers:{location:'http://insecure.example.test/a.png'}})));assert.equal(imageUploadRecord(store,item).link,result.link);
 }finally{store.close();}
});
test('cancellation and a changed session prevent persisting late upload results',async()=>{
 for(const aborted of [true,false]){const store=new Store(':memory:');try{configureImageHost(store,options());const item=store.add({png},'fixture'),saved=uploadOptions(store),controller=new AbortController();let valid=true;await assert.rejects(()=>resolveImageUpload(store,item,saved,false,{signal:controller.signal,valid:()=>valid},async()=>{if(aborted)controller.abort();else valid=false;return response();}));assert.equal(imageUploadRecord(store,item),null);assert.equal(imageHostState(store).lastResult,undefined);
 }finally{store.close();}}
});
test('test results follow tested configuration, survive saving it, and are independent from upload failures',async()=>{
 const store=new Store(':memory:');try{configureImageHost(store,options());const changed=options({endpoint:'https://next.example.test/images',token:'new-fixture-token'});await testImageHost(store,changed,async()=>response());assert.equal(imageHostState(store).lastTest,undefined);configureImageHost(store,changed);assert.equal(imageHostState(store).lastTest.ok,true);const item=store.add({png},'fixture');await assert.rejects(()=>resolveImageUpload(store,item,uploadOptions(store),false,{},async()=>new Response(null,{status:500})));assert.equal(imageHostState(store).lastTest.ok,true);configureImageHost(store,{...changed,responsePath:'data.url'});assert.equal(imageHostState(store).lastTest,undefined);
 }finally{store.close();}
});
