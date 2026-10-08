const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {fileURLToPath}=require('node:url'),{spawn}=require('node:child_process'),{fixture}=require('./virtual-fixture.cjs');

async function run(){
 const output=path.resolve('work/folders-boundaries');await fs.mkdir(output,{recursive:true});
 const env={...process.env,CLIP_TEST_MODE:'1',CLIP_DATA_DIR:await fs.mkdtemp(path.join(output,'profile-')),CLIP_HELPER_PROFILE:await fs.mkdtemp(path.join(output,'helper-'))};delete env.ELECTRON_RUN_AS_NODE;
 const helper=await electron.launch({args:[path.resolve('tests/clipboard-helper.cjs')],env});let app,main,ole;
 const launch=async()=>{app=await electron.launch(process.env.CLIP_PACKAGED_EXE?{executablePath:process.env.CLIP_PACKAGED_EXE,args:[],env}:{args:[path.resolve('.')],env});main=await app.firstWindow();await main.waitForSelector('#search');assert.equal((await main.evaluate(()=>window.clip.state())).hotkeyError,'','Exit the daily Clip instance before testing');};
 const file=(name,data='eA==')=>({name,data,type:'stream'}),dir=name=>({name,data:'',attributes:16,type:'hglobal'});
 try{
  await helper.firstWindow();ole=await fixture();
  const nativeRead=async(entries,wide=true)=>{
   const {sequence}=await ole.request({action:'set',entries,wide});
   const executable=process.env.CLIP_PACKAGED_EXE?path.join(path.dirname(process.env.CLIP_PACKAGED_EXE),'resources','app.asar.unpacked','dist','native','AttachmentHost.exe'):path.resolve('dist/native/AttachmentHost.exe');
   return new Promise((resolve,reject)=>{const child=spawn(executable,[],{windowsHide:true,stdio:'pipe'});let output='';const timer=setTimeout(()=>{child.kill();reject(Error('Native folder probe timed out'));},10000);child.stdout.setEncoding('utf8');child.stdout.on('data',s=>output+=s);child.stderr.resume();child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',()=>{clearTimeout(timer);try{const v=JSON.parse(output);if(v.error)throw Error(v.error);resolve(v.attachments);}catch(e){reject(e);}});child.stdin.end(JSON.stringify({sequence})+'\n');});
  };
  console.log('Native Unicode and ANSI folders preserve descriptor indices and skip directory content');
  for(const wide of [true,false]){const before=ole.reads,items=await nativeRead([file('root\\nested\\first.txt','YQ=='),dir('empty'),dir('root'),file('root\\last.txt','Yg==')],wide);assert.equal(ole.reads-before,2);assert.equal(items[0].data,'YQ==');assert.equal(items[3].data,'Yg==');assert.equal(items[1].directory,true);}
  let before=ole.reads;assert.equal((await nativeRead(Array.from({length:256},(_,i)=>dir('empty'+i)))).length,256);assert.equal(ole.reads,before);
  assert.equal((await nativeRead(Array.from({length:128},(_,i)=>file('r'+i+'\\empty','')))).length,128);
  const invalid=[
   [[file('safe.txt'),file('..\\escape')],/文件名/],
   [[file('safe.txt'),file('a\\b:stream')],/文件名/],
   [[file('safe.txt'),file('root'),file('root\\child')],/父目录/],
   [[file('safe.txt'),dir('Root'),file('root\\child')],/父目录/],
   [[file('safe.txt'),dir('root'),dir('ROOT')],/重复/],
   [[file('safe.txt'),{...dir('root'),declared:1}],/文件夹/],
   [[file('safe.txt'),{...dir('root'),attributes:0x410}],/链接|设备/],
   [[file('safe.txt'),{...file('device'),attributes:64}],/链接|设备/],
   [[file('safe.txt'),file(Array(17).fill('a').join('\\'))],/16 层/],
   [Array.from({length:129},(_,i)=>file('r'+i+'\\empty','')),/256/],
  ];
  console.log('Every malformed tree is rejected before reading even its first valid file');
  for(const [entries,error]of invalid){before=ole.reads;await assert.rejects(nativeRead(entries),error);assert.equal(ole.reads,before);}
  await helper.evaluate(({clipboard})=>clipboard.writeText(''));
  await launch();let count=0;const state=()=>main.evaluate(()=>window.clip.state()),total=async value=>expect.poll(async()=>(await state()).clips.length,{timeout:12000}).toBe(value);
  const data=Buffer.from('saved nested folder contents café 中文').toString('base64'),entries=[file('root\\nested\\child.txt',data),dir('empty'),dir('root'),file('root\\zero.txt','')];
  await ole.request({action:'set',entries,wide:false});await total(++count);const first=(await state()).clips[0],original=await main.evaluate(id=>window.clip.detail(id),first.id);assert.equal(original.payload.attachments.length,5);
  console.log('Invalid native trees and a late content failure never add a partial history record');
  for(const [values,error]of [...invalid.slice(0,9),[[file('other\\first.txt'),{...file('other\\last.txt'),declared:2}],/声明长度/]]){
   await helper.evaluate(({clipboard},v)=>clipboard.writeText(v),'folder recovery '+count);await total(++count);
   await ole.request({action:'set',entries:values});await expect.poll(async()=>(await state()).status,{timeout:12000}).toMatch(error);assert.equal((await state()).clips.length,count);
  }
  const copied=async()=>{const uris=await helper.evaluate(async({clipboard})=>{const item=(await clipboard.read()).find(i=>i.types.includes('text/uri-list'));return (await item.getType('text/uri-list')).text();});return uris.split(/\r?\n/).filter(s=>s.startsWith('file:')).map(fileURLToPath);};
  const child=async()=>{await main.evaluate(id=>window.clip.copy(id,false),first.id);return path.join((await copied()).find(p=>path.basename(p)==='root'),'nested','child.txt');};
  console.log('A nested file held by another process is retried after lock and after app restart');
  let held=await child();await ole.request({action:'hold',path:held});await app.evaluate(({powerMonitor})=>powerMonitor.emit('lock-screen'));assert.ok(await fs.stat(held));await ole.request({action:'release'});await expect.poll(()=>fs.stat(held).then(()=>true,()=>false),{timeout:5000}).toBe(false);await app.evaluate(({powerMonitor})=>powerMonitor.emit('unlock-screen'));
  held=await child();await ole.request({action:'hold',path:held});await app.close();app=undefined;await launch();assert.ok(await fs.stat(held));await ole.request({action:'release'});await expect.poll(()=>fs.stat(held).then(()=>true,()=>false),{timeout:5000}).toBe(false);
  const defer=async id=>{await app.evaluate(({dialog})=>{global.releaseFolderSave=undefined;dialog.showSaveDialog=()=>new Promise(r=>global.releaseFolderSave=r);});const pending=main.evaluate(id=>window.clip.exportAttachment(id,2),id).then(v=>({value:v}),e=>({error:e.message}));await expect.poll(()=>app.evaluate(()=>typeof global.releaseFolderSave)).toBe('function');return {pending};};
  console.log('Deleting the source or suspending then resuming revokes an already open folder export');
  let pending=(await defer(first.id)).pending,target=path.join(output,'deleted-'+Date.now());await main.evaluate(id=>window.clip.action(id,'delete'),first.id);await app.evaluate((_,file)=>global.releaseFolderSave({canceled:false,filePath:file}),target);assert.match((await pending).error,/改变|删除/);await assert.rejects(fs.stat(target),{code:'ENOENT'});await main.evaluate(()=>window.clip.undo());
  const saved=(await state()).clips.find(c=>c.hash===first.hash);
  pending=(await defer(saved.id)).pending;target=path.join(output,'suspended-'+Date.now());await app.evaluate(({powerMonitor})=>{powerMonitor.emit('suspend');powerMonitor.emit('resume');});await app.evaluate((_,file)=>global.releaseFolderSave({canceled:false,filePath:file}),target);assert.match((await pending).error,/改变|锁定/);await assert.rejects(fs.stat(target),{code:'ENOENT'});
  console.log('Encrypted backups restore the exact tree, empty folders and templates into a fresh profile');
  await main.evaluate(id=>window.clip.snippet({title:'Folder backup template',clipId:id}),saved.id);const backup=path.join(output,'protected-'+Date.now()+'.clip'),password='folder backup password';await app.evaluate(({dialog},file)=>dialog.showSaveDialog=async()=>({canceled:false,filePath:file}),backup);await main.evaluate(p=>window.clip.exportProtected(p),password);assert.equal((await fs.readFile(backup)).includes(Buffer.from(data)),false);await app.close();app=undefined;env.CLIP_DATA_DIR=await fs.mkdtemp(path.join(output,'restored-'));await launch();await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),backup);const choice=await main.evaluate(()=>window.clip.chooseRestore()),preview=await main.evaluate(({token,password})=>window.clip.previewRestore(token,password),{token:choice.token,password});await main.evaluate(token=>window.clip.restoreBackup(token),preview.token);const restored=(await state()).clips.find(c=>c.hash===saved.hash);assert.deepEqual((await main.evaluate(id=>window.clip.detail(id),restored.id)).payload,original.payload);assert.deepEqual((await main.evaluate(async()=>window.clip.snippetDetail((await window.clip.state()).snippets[0].id))).payload,original.payload);
  console.log('History lock cancels a slow native folder read, removes the cache tree and revokes export');
  await main.evaluate(async p=>{const plan=await window.clip.prepareEncryption(p);await window.clip.encryptHistory(plan.token,plan.recoveryKey);},password);await main.evaluate(id=>window.clip.copy(id,false),restored.id);const cache=path.join(env.CLIP_DATA_DIR,'work','attachments');assert.ok((await fs.readdir(cache)).length);
  pending=(await defer(restored.id)).pending;target=path.join(output,'locked-'+Date.now());before=ole.reads;await ole.request({action:'set',entries:[dir('slow'),file('slow\\child.txt')],delay:3500});await expect.poll(()=>ole.reads).toBeGreaterThan(before);
  const windowEvent=app.waitForEvent('window'),started=Date.now();await main.evaluate(()=>window.clip.lockHistory()).catch(()=>{});const unlock=await windowEvent;assert.ok(Date.now()-started<2500,'Lock waited for the blocked native source');await app.evaluate((_,file)=>global.releaseFolderSave({canceled:false,filePath:file}),target);await pending;await expect(unlock.locator('#heading')).toHaveText('历史已锁定');await expect.poll(()=>fs.readdir(cache)).toEqual([]);await assert.rejects(fs.stat(target),{code:'ENOENT'});assert.equal((await fs.readdir(output)).some(n=>n.startsWith('.Clip-folder-')),false);
  await unlock.locator('#unlock-value').fill(password);const opened=app.waitForEvent('window');await unlock.locator('#unlock-submit').click();main=await opened;await main.waitForSelector('#search');await total(count);await ole.request({action:'set',entries:[dir('after'),file('after\\unlock.txt')]});await total(++count);
  console.log(JSON.stringify({result:'PASS',packaged:!!process.env.CLIP_PACKAGED_EXE,unicodeANSI:true,originalIndices:true,implicitParentCapacity:true,invalidTreesBeforeReads:true,noPartialRecords:true,nestedFileLockCleanup:true,startupRetry:true,deletedExportCanceled:true,suspendResumeRevokesExport:true,encryptedBackupAndTemplate:true,lockCancelsNativeReadAndExport:true,recursiveCacheCleanup:true,unlockResumes:true},null,2));
 }finally{if(app){await app.evaluate(()=>global.releaseFolderSave?.({canceled:true})).catch(()=>{});await app.close();}if(ole)await ole.close();await helper.evaluate(()=>global.restoreClipboard());await helper.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
