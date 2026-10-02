const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http'),{randomUUID}=require('node:crypto');
async function run(){
 const output=path.resolve('work/text-tools-boundaries');await fs.mkdir(output,{recursive:true});
 const profile=await fs.mkdtemp(path.join(output,'profile-')),helperProfile=await fs.mkdtemp(path.join(output,'helper-'));
 const env={...process.env,CLIPPER_TEST_MODE:'1',CLIPPER_DATA_DIR:profile,CLIPPER_HELPER_PROFILE:helperProfile};delete env.ELECTRON_RUN_AS_NODE;
 let slow=false,requests=[];
 const server=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;requests.push({url:req.url,auth:req.headers.authorization,body:raw?JSON.parse(raw):null});if(slow&&req.method==='POST')return;res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url.endsWith('/tags')?{models:[{name:'fixture-model'}]}:req.url.endsWith('/models')?{data:[{id:'fixture-model'}]}:req.url==='/api/chat'?{message:{content:'fixture result'},done:true}:{choices:[{message:{content:'fixture result'}}]}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const helper=await electron.launch({args:[path.resolve('tests/clipboard-helper.cjs')],env});let app,cleanupProtocol=false;
 const options=process.env.CLIPPER_PACKAGED_EXE?{executablePath:process.env.CLIPPER_PACKAGED_EXE,args:['clipper-win://add?text=cold-fixture'],env}:{args:[path.resolve('.'),'clipper-win://add?text=cold-fixture'],env};
 try{
  await helper.firstWindow();app=await electron.launch(options);const page=await app.firstWindow();await page.waitForSelector('#search');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await expect(page.locator('.external-preview')).toHaveText('cold-fixture');assert.equal((await page.evaluate(()=>window.clipper.state())).clips.length,0);await page.locator('#modal-cancel').click();await expect.poll(async()=>(await page.evaluate(()=>window.clipper.integrations())).pending).toBe(null);
  const common={name:'fixture',model:'fixture-model',maxTokens:128,timeoutSeconds:5,temperature:null,tokenField:'max_tokens'};
  const profileById=id=>page.evaluate(async id=>(await window.clipper.aiState()).profiles.find(p=>p.id===id),id);
  const submit=(p,extra={})=>page.evaluate(value=>window.clipper.aiRun(value),{requestId:randomUUID(),profileId:p.id,revision:p.revision,input:'only selected text',action:'summarize',language:'简体中文',instruction:'',approvedDestination:p.baseUrl+(p.kind==='ollama'?'/api/chat':'/chat/completions'),...extra});
  const profiles=[];
  for(const kind of ['ollama','lmstudio','openai']){
   const id=await page.evaluate(p=>window.clipper.aiProfile(p),{...common,kind,baseUrl:base+(kind==='ollama'?'':'/v1'),apiKey:kind==='openai'?'boundary-test-key':undefined});
   const p=await profileById(id);profiles.push(p);
   assert.deepEqual(await page.evaluate(id=>window.clipper.aiModels(id,crypto.randomUUID()),id),['fixture-model']);
   assert.equal((await submit(p)).text,'fixture result');assert.equal(requests.at(-1).body.messages[1].content,'only selected text');
   assert.equal(requests.at(-1).auth,kind==='openai'?'Bearer boundary-test-key':undefined);
  }
  console.log('AI: three protocols, destination binding, revisions, timeout and concurrency');
  const online=profiles[2],sent=requests.length;
  await assert.rejects(()=>submit(online,{approvedDestination:'https://unapproved.invalid/v1/chat/completions'}),/确认/);
  await assert.rejects(()=>page.evaluate(p=>window.clipper.aiProfile({...p,baseUrl:p.baseUrl+'/changed'}),online),/重新填写密钥/);
  await page.evaluate(p=>window.clipper.aiProfile({...p,name:'updated fixture'}),online);await assert.rejects(()=>submit(online),/配置已改变/);assert.equal(requests.length,sent);
  const updated=await profileById(online.id);slow=true;await assert.rejects(()=>submit(updated),/超时/);
  const concurrent=await page.evaluate(async p=>{
   const make=()=>({requestId:crypto.randomUUID(),profileId:p.id,revision:p.revision,input:'fixture',action:'summarize',language:'简体中文',instruction:'',approvedDestination:p.baseUrl+'/chat/completions'});
   const one=make(),two=make(),first=window.clipper.aiRun(one).catch(e=>e.message);await new Promise(r=>setTimeout(r,100));
   const duplicate=await window.clipper.aiRun(one).catch(e=>e.message),second=window.clipper.aiRun(two).catch(e=>e.message);await new Promise(r=>setTimeout(r,100));
   const third=await window.clipper.aiRun(make()).catch(e=>e.message);await window.clipper.aiCancel(one.requestId);await window.clipper.aiCancel(two.requestId);return {duplicate,third,first:await first,second:await second};
  },updated);assert.match(concurrent.duplicate,/编号/);assert.match(concurrent.third,/两个/);assert.match(concurrent.first,/取消/);assert.match(concurrent.second,/取消/);slow=false;
  const historyFile=path.join(profile,'history-export.json');await app.evaluate(({dialog},p)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:p});},historyFile);await page.evaluate(()=>window.clipper.backup('export'));
  const historyRaw=await fs.readFile(historyFile,'utf8');assert.equal(historyRaw.includes('boundary-test-key'),false);assert.equal(historyRaw.includes(updated.id),false);
  await page.evaluate(p=>window.clipper.aiProfile({...p,clearKey:true}),updated);assert.equal((await profileById(updated.id)).hasKey,false);await submit(await profileById(updated.id));assert.equal(requests.at(-1).auth,undefined);
  console.log('Scripts: revision, memory/output limits, cancellation recovery, backup transaction');
  const addScript=code=>page.evaluate(code=>window.clipper.saveScript({name:'fixture '+crypto.randomUUID(),description:'Boundary test',code,timeoutMs:1000,permission:'selected-text'}),code);
  const scriptById=id=>page.evaluate(async id=>(await window.clipper.scripts()).find(s=>s.id===id),id);
  const execute=s=>page.evaluate(s=>window.clipper.runScript({requestId:crypto.randomUUID(),scriptId:s.id,input:'fixture',permission:'selected-text',updatedAt:s.updatedAt}),s);
  const normal=await scriptById(await addScript('return input.toUpperCase();'));
  await page.evaluate(s=>window.clipper.saveScript({...s,code:'return input+" updated";'}),normal);await assert.rejects(()=>execute(normal),/已改变/);
  for(const code of ['const a=[];for(;;)a.push(new Array(10000).fill("memory"));','return "x".repeat(1048577);']){
   const s=await scriptById(await addScript(code));await assert.rejects(()=>execute(s),/memory|内存|长度|字节|超过|上限/);assert.equal(await execute(await scriptById(normal.id)),'fixture updated');
  }
  await app.evaluate(({utilityProcess})=>{const fork=utilityProcess.fork;utilityProcess.fork=(...args)=>{utilityProcess.fork=fork;const child=fork(...args);child.once('spawn',()=>child.kill());return child;};});
  await assert.rejects(()=>execute({...normal,updatedAt:0}),/已改变/); // Rejected previews never spawn a worker.
  const latestNormal=await scriptById(normal.id);await assert.rejects(()=>execute(latestNormal),/工作进程退出/);assert.equal(await execute(latestNormal),'fixture updated');
  for(let attempt=0;attempt<3;attempt++){
   const immediate=await page.evaluate(async s=>{const requestId=crypto.randomUUID(),pending=window.clipper.runScript({requestId,scriptId:s.id,input:'fixture',permission:'selected-text',updatedAt:s.updatedAt}).catch(e=>e.message);await window.clipper.cancelScript(requestId);return pending;},latestNormal);assert.match(immediate,/取消/);
  }
  assert.equal(await execute(latestNormal),'fixture updated');
  const scriptFile=path.join(profile,'scripts.json');await app.evaluate(({dialog},p)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:p});},scriptFile);await page.evaluate(()=>window.clipper.scriptBackup('export'));
  const exported=JSON.parse(await fs.readFile(scriptFile,'utf8'));assert.equal(exported.format,'clipper-scripts');
  await page.evaluate(id=>window.clipper.removeScript(id),normal.id);
  await app.evaluate(({dialog},p)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},scriptFile);await page.evaluate(()=>window.clipper.scriptBackup('import'));
  const restored=await page.evaluate(()=>window.clipper.scripts());assert.equal(restored.length,exported.scripts.length);assert.ok(restored.some(s=>s.code==='return input+" updated";'));await page.evaluate(()=>window.clipper.scriptBackup('import'));assert.equal((await page.evaluate(()=>window.clipper.scripts())).length,restored.length);
  await fs.writeFile(scriptFile,JSON.stringify({...exported,scripts:[{...exported.scripts[0],name:'new valid entry'}, {...exported.scripts[0],permission:'network'}]}));await assert.rejects(()=>page.evaluate(()=>window.clipper.scriptBackup('import')),/权限/);assert.deepEqual(await page.evaluate(()=>window.clipper.scripts()),restored);
  assert.equal((await page.evaluate(()=>window.clipper.state())).clips.length,0);
  console.log('URL: copy confirmation and rejection; OCR to translation');
  const existing=await helper.evaluate(({clipboard})=>clipboard.readText());
  const intent=()=>app.evaluate(({app})=>app.emit('second-instance',{},['Clipper.exe','clipper-win://copy?text=external-copy-fixture']));
  await intent();await expect(page.locator('.external-preview')).toHaveText('external-copy-fixture');assert.equal(await helper.evaluate(({clipboard})=>clipboard.readText()),existing);await page.locator('#modal-cancel').click();assert.equal(await helper.evaluate(({clipboard})=>clipboard.readText()),existing);
  await intent();await expect(page.locator('.external-preview')).toBeVisible();await page.locator('#dialog [type=submit]').click();assert.equal(await helper.evaluate(({clipboard})=>clipboard.readText()),'external-copy-fixture');
  await app.evaluate(({app})=>app.emit('second-instance',{},['Clipper.exe','clipper-win://execute?text=must-not-run']));assert.equal((await page.evaluate(()=>window.clipper.integrations())).pending,null);
  const target=await helper.firstWindow(),png=await target.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=180;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,800,180);x.fillStyle='black';x.font='50px Arial';x.fillText('CLIPPER TRANSLATION',30,100);return c.toDataURL().split(',')[1];});
  await helper.evaluate(async({clipboard,ClipboardItem},png)=>clipboard.write([new ClipboardItem({'image/png':new Blob([Buffer.from(png,'base64')],{type:'image/png'})})]),png);
  await expect.poll(async()=>(await page.evaluate(()=>window.clipper.state())).clips.some(c=>c.kind==='image')).toBe(true);await page.locator('[data-kind=image]').click();await page.locator('#ocr').click();await expect(page.locator('#ocr-run')).toBeEnabled({timeout:30000});const english=page.locator('[data-ocr-language^=en]');if(await english.count())await english.first().click();await page.locator('#ocr-run').click();await expect(page.locator('#ocr-progress')).toContainText('识别完成',{timeout:40000});const recognized=await page.locator('#ocr-output').inputValue();assert.match(recognized,/TRANSLATION/);await page.locator('#ocr-translate').click();await expect(page.locator('#tool-input')).toHaveValue(recognized);await expect(page.locator('#result-replace')).toHaveCount(0);await page.locator('#run-tool').click();await expect(page.locator('#tool-progress')).toContainText('处理完成');assert.equal(requests.at(-1).body.messages[1].content,recognized);await page.locator('#modal-cancel').click();
  if(process.env.CLIPPER_PACKAGED_EXE){
   console.log('Windows: actual registration, ShellExecute and removal using a unique test scheme');
   const scheme='clipper-fixture-'+randomUUID().replaceAll('-',''),receipt=path.join(profile,'protocol-receipt.json'),exe=require('electron'),args=[path.resolve('tests/protocol-helper.cjs'),receipt];
   // Route only the scheme to a throwaway handler; execute the production registration logic.
   await app.evaluate(({app},v)=>{const methods=['isDefaultProtocolClient','setAsDefaultProtocolClient','removeAsDefaultProtocolClient','getApplicationNameForProtocol'];global.protocolOriginal={};for(const name of methods)global.protocolOriginal[name]=app[name].bind(app);global.protocolFixture=v;for(const name of methods)app[name]=()=>name==='getApplicationNameForProtocol'?global.protocolOriginal[name](v.scheme+':'):global.protocolOriginal[name](v.scheme,v.exe,v.args);}, {scheme,exe,args});cleanupProtocol=true;
   await page.evaluate(()=>window.clipper.registerIntegration(true));assert.equal((await page.evaluate(()=>window.clipper.integrations())).registered,true);
   await app.evaluate(({shell},url)=>shell.openExternal(url),scheme+'://open?fixture=verified');
   await expect.poll(async()=>fs.readFile(receipt,'utf8').then(raw=>JSON.parse(raw).at(-1)).catch(()=>''),{timeout:20000}).toMatch(new RegExp('^'+scheme+'://open/?[?]fixture=verified$'));
   await page.evaluate(()=>window.clipper.registerIntegration(false));assert.equal((await page.evaluate(()=>window.clipper.integrations())).registered,false);
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',packaged:!!process.env.CLIPPER_PACKAGED_EXE,threeProtocols:true,staleRequestsRejected:true,keyDestinationBinding:true,timeoutAndConcurrency:true,keyExcludedFromBackup:true,scriptResourceLimits:true,scriptImportTransaction:true,coldURLConfirmation:true,externalCopyConfirmation:true,realOCRToTranslation:true,windowsProtocolRegistration:!!process.env.CLIPPER_PACKAGED_EXE,realModelInference:false},null,2));
 }finally{
  if(app){if(cleanupProtocol)await app.evaluate(()=>{const v=global.protocolFixture;global.protocolOriginal.removeAsDefaultProtocolClient(v.scheme,v.exe,v.args);}).catch(()=>{});await app.close();}
  await helper.evaluate(async({clipboard})=>global.restoreClipboard());await helper.close();server.closeAllConnections();await new Promise(r=>server.close(r));
 }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
