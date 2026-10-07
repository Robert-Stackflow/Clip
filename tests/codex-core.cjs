const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream'),os=require('node:os');
const fixtureRoot=path.resolve(process.env.CLIPPER_TEST_FIXTURE_DIR||os.tmpdir()),fixtureHome=fs.mkdtempSync(path.join(fixtureRoot,'clipper-codex-fixtures-'));
after(()=>{assert.equal(path.dirname(fixtureHome),fixtureRoot);assert(path.basename(fixtureHome).startsWith('clipper-codex-fixtures-'));fs.rmSync(fixtureHome,{recursive:true,force:true});});
const exportsFile=path.resolve('work/test-language-services.cjs');
function fixture(environment={}){
 const state={spawned:[],messages:[],loggedIn:false,mode:'normal',images:[],directories:[],loginStarts:0};
 const spawn=(executable,args,options)=>{const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{child.killed=true;queueMicrotask(()=>child.emit('exit',0));};state.spawned.push({executable,args,options,child});let buffer='',threadId='thread-'+state.spawned.length;
  const send=value=>child.stdout.write(JSON.stringify(value)+'\n');child.event=(method,params)=>send({method,params});child.stdin.on('data',chunk=>{buffer+=chunk;for(;;){const at=buffer.indexOf('\n');if(at<0)break;const value=JSON.parse(buffer.slice(0,at));buffer=buffer.slice(at+1);state.messages.push(value);if(!value.method||value.id===undefined)continue;queueMicrotask(()=>{
   const {method,params}=value;let result={};if(method==='account/read')result={account:state.loggedIn?{type:'chatgpt',email:'fixture@example.invalid',planType:'plus'}:null};
   if(method==='account/login/start'){state.loginStarts++;result={type:'chatgptDeviceCode',loginId:'fixture-login',verificationUrl:'https://auth.openai.com/codex/device',userCode:'ABCD-1234'};}
   if(method==='account/logout')state.loggedIn=false;
   if(method==='model/list')result=params.cursor?{data:[{model:'vision-fixture'},{model:'default-fixture'}],nextCursor:null}:{data:[{model:'default-fixture'}],nextCursor:'second-page'};
   if(method==='thread/start'){if(params.sandbox!=='read-only'||state.mode==='rpc-invalid'){send({id:value.id,error:{code:-32600,message:'Invalid request: unknown variant secret-sdk-error fixture-token'}});return;}state.directories.push(params.cwd);result={thread:{id:threadId},model:params.model||'default-fixture'};}
   if(method==='turn/start'){for(const input of params.input)if(input.type==='localImage')state.images.push({path:input.path,bytes:fs.readFileSync(input.path)});result={turn:{id:'fixture-turn'}};}
   if(state.mode==='rpc-error'&&method==='thread/start'){send({id:value.id,error:{code:-1,message:'secret-sdk-error fixture-token'}});return;}
   if(state.mode==='handshake-pending'&&method==='initialize')return;
   send({id:value.id,result});if(method==='turn/start'){
    if(state.mode==='pending')return;
    child.event('item/agentMessage/delta',{threadId:'unrelated-thread',itemId:'other',delta:'Ignore'});
    child.event('item/agentMessage/delta',{threadId,turnId:'fixture-turn',itemId:'answer',delta:state.mode==='oversize'?'X'.repeat(1024*1024+1):'Answer'});
    child.event('thread/tokenUsage/updated',{threadId,turnId:'fixture-turn',tokenUsage:{last:{inputTokens:10,outputTokens:5}}});
    send({id:99,method:'item/commandExecution/requestApproval',params:{threadId}});
    child.event('item/completed',{threadId,turnId:'fixture-turn',item:{id:'answer',type:'agentMessage',text:'Final answer',phase:'final_answer'}});
    child.event('turn/completed',{threadId,turn:{id:'fixture-turn',status:state.mode==='failed'?'failed':'completed',error:state.errorInfo?{message:'secret-sdk-error fixture-token',codexErrorInfo:state.errorInfo}:null,items:[{id:'comment',type:'agentMessage',phase:'commentary',text:'Working'},{id:'answer',type:'agentMessage',phase:'final_answer',text:'Final answer'}]}});
   }
  });}});return child;
 };
 const app={getPath:()=>path.join(os.tmpdir(),'fixture-app')},safeStorage={isAsyncEncryptionAvailable:async()=>true};
 const module={exports:{}},context={module,exports:module.exports,__dirname:path.dirname(exportsFile),process:{platform:process.platform,arch:process.arch,env:{OPENAI_API_KEY:'fixture-token',CODEX_API_KEY:'fixture-token',...environment}},Buffer,URL,TextEncoder,TextDecoder,AbortController,TypeError,Response,console,setTimeout,clearTimeout,require:name=>name==='node:child_process'?{spawn}:name==='electron'?{app,safeStorage}:require(name)};
 vm.runInNewContext(fs.readFileSync(exportsFile,'utf8'),context);return {...module.exports,state};
}
const profile={name:'Codex',kind:'codex',baseUrl:'codex://local',model:'',maxTokens:2048,timeoutSeconds:30,temperature:null,tokenField:'max_tokens'};
const messages=[{role:'system',content:'Translate source text.'},{role:'user',content:'Source text {{literal}}'}];
const provider=api=>new api.CodexProvider(()=>fixtureHome,()=>path.resolve('fixture-codex.exe'));
const wait=async predicate=>{for(let i=0;i<100&&!predicate();i++)await new Promise(resolve=>setImmediate(resolve));assert(predicate());};

test('Codex uses independent credentials, device login and paginated model discovery',async()=>{
 const api=fixture(),codex=provider(api);try{
  assert.equal((await codex.status()).loggedIn,false);const [first,second]=await Promise.all([codex.login(),codex.login()]);assert.equal(api.state.loginStarts,1);assert.equal(first.userCode,'ABCD-1234');assert.equal(second.login,'pending');const runtime=api.state.spawned[0];assert.equal(runtime.options.windowsHide,true);assert.equal(runtime.options.shell,false);assert.equal(runtime.options.env.OPENAI_API_KEY,undefined);assert.equal(runtime.options.env.CODEX_API_KEY,undefined);assert.equal(runtime.options.env.CODEX_HOME,fixtureHome);assert(runtime.args.includes('features.shell_tool=false'));await assert.rejects(codex.generate(profile,messages,new AbortController().signal));assert.equal(api.state.spawned.length,1);
  api.state.loggedIn=true;runtime.child.event('account/login/completed',{loginId:'fixture-login',success:true});const loggedIn=await codex.status();assert.equal(loggedIn.loggedIn,true);assert.equal(loggedIn.email,'fixture@example.invalid');assert.equal(loggedIn.login,'complete');assert.deepEqual(Array.from(await codex.models(new AbortController().signal)),['default-fixture','vision-fixture']);await codex.logout();assert.equal((await codex.status()).loggedIn,false);
 }finally{codex.dispose();}await wait(()=>api.state.spawned.every(value=>value.child.killed));
});
test('Codex follows the resolved system proxy and preserves explicit proxy overrides',async()=>{
 for(const [route,environment,expected]of [['PROXY 127.0.0.1:7890; DIRECT',{},'http://127.0.0.1:7890'],['HTTPS proxy.example:8443',{},'https://proxy.example:8443'],['SOCKS5 [::1]:1080',{},'socks5h://[::1]:1080'],['DIRECT; PROXY ignored.example:1234',{},undefined],['PROXY invalid.example:70000',{},undefined],['PROXY localhost:1234',{HTTPS_PROXY:'http://explicit.example:1234'},'http://explicit.example:1234'],['PROXY localhost:1234',{ALL_PROXY:'socks5h://explicit.example:1080'},undefined]]){
  const api=fixture(environment),codex=new api.CodexProvider(()=>fixtureHome,()=>path.resolve('fixture-codex.exe'),async()=>route);try{assert.equal((await codex.status()).available,true);const env=api.state.spawned[0].options.env;assert.equal(env.HTTPS_PROXY,expected);assert.equal(env.ALL_PROXY,environment.ALL_PROXY);assert.equal(env.OPENAI_API_KEY,undefined);}finally{codex.dispose();}
 }
 const api=fixture(),controller=new AbortController(),codex=new api.CodexProvider(()=>fixtureHome,()=>path.resolve('fixture-codex.exe'),async()=>{controller.abort();return 'DIRECT';});await assert.rejects(codex.generate(profile,messages,controller.signal));assert.equal(api.state.spawned.length,0);codex.dispose();
});
test('Codex receives saved prompts and original images in ephemeral read-only threads and cleans files',async()=>{
 const api=fixture(),codex=provider(api);api.state.loggedIn=true;const png=Buffer.from('fixture-image').toString('base64');try{const result=await codex.generate(profile,messages,new AbortController().signal,png);assert.equal(result.text,'Final answer');assert.equal(result.model,'default-fixture');assert.equal(result.inputTokens,10);assert.equal(result.outputTokens,5);const start=api.state.messages.find(value=>value.method==='thread/start').params;assert.equal(start.ephemeral,true);assert.equal(start.sandbox,'read-only');assert.equal(start.approvalPolicy,'never');assert(start.baseInstructions.includes(messages[0].content));assert.equal(start.model,null);const input=api.state.messages.find(value=>value.method==='turn/start').params.input;assert.equal(input[0].text,messages[1].content);assert.deepEqual(api.state.images[0].bytes,Buffer.from(png,'base64'));assert.equal(fs.existsSync(api.state.images[0].path),false);assert.equal(fs.existsSync(start.cwd),false);assert(api.state.messages.some(value=>value.id===99&&value.error?.code===-32601));assert(api.state.spawned.every(value=>value.child.killed));}finally{codex.dispose();}
});
test('Codex blocks missing login, cancellation, startup cancellation, oversized and failed replies',async()=>{
 for(const mode of ['missing-login','pending','handshake-pending','oversize','failed','rpc-error']){const api=fixture(),codex=provider(api),controller=new AbortController();api.state.loggedIn=mode!=='missing-login';api.state.mode=mode;try{
  const request=codex.generate(profile,messages,controller.signal);if(mode==='pending'){await wait(()=>api.state.messages.some(value=>value.method==='turn/start'));controller.abort();}if(mode==='handshake-pending'){await wait(()=>api.state.spawned.length>0);controller.abort();}
  await assert.rejects(request,error=>{assert(!error.message.includes('fixture-token'));assert(!error.message.includes('fixture-codex.exe'));return /Codex|cancelled|1 MiB/.test(error.message);});assert(api.state.spawned.every(value=>value.child.killed));assert(api.state.directories.every(value=>!fs.existsSync(value)));
 }finally{codex.dispose();}}
});
test('AI service routes Codex commands and vision, guards destination and cancels on logout',async()=>{
 const api=fixture(),values=new Map(),db={meta:(key,fallback)=>values.get(key)||fallback,setMeta:(key,value)=>values.set(key,value),get:()=>({hash:'image-hash',payload:{png:'iVBORw0KGgoAAAA='}})},seen=[];let pendingSignal;
 const backend={status:async()=>({available:true,loggedIn:true,login:'idle'}),login:async()=>({available:true,loggedIn:true,login:'complete'}),cancelLogin:async()=>{},logout:async()=>{seen.push(['logout']);},models:async()=>['codex-model'],generate:async(profile,messages,signal,png)=>{seen.push({profile,messages,png});if(pendingSignal===true){pendingSignal=signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));}return {text:'Codex result',model:'codex-model',truncated:false};},dispose:()=>{}};
 const service=new api.AIService(db,backend);try{const id=await service.save(profile),saved=(await service.state()).profiles[0];assert.equal(saved.baseUrl,'codex://local');assert.equal(saved.local,true);assert.equal(saved.hasKey,false);assert.deepEqual(Array.from(await service.models(id,'request-models')),['codex-model']);const command=service.commands.list()[0],request={requestId:'request-codex',profileId:id,revision:saved.revision,input:'Source text',language:'English',instruction:'',action:'translate',approvedDestination:'codex://local',command:{id:command.id,revision:command.revision,values:{}},image:{clipId:'image',hash:'image-hash'}};await service.run(request);assert(seen[0].messages[1].content.includes('Source text'));assert.equal(seen[0].png,'iVBORw0KGgoAAAA=');await assert.rejects(service.run({...request,approvedDestination:'https://example.invalid'}));assert.equal(seen.length,1);pendingSignal=true;const pending=service.run({...request,requestId:'request-pending'});await wait(()=>typeof pendingSignal==='object');await service.codexLogout();await assert.rejects(pending);assert.equal(pendingSignal.aborted,true);
 }finally{service.dispose();}
});
test('Codex exposes protocol, authentication and limit errors without returning raw service details',async()=>{
 for(const [mode,info,pattern]of [['rpc-invalid',null,/thread\/start.*RPC -32600/],['failed','unauthorized',/认证/],['failed','usageLimitExceeded',/额度/],['failed','contextWindowExceeded',/上下文/],['failed',{httpConnectionFailed:{httpStatusCode:503}},/HTTP 503/]]){
  const api=fixture(),codex=provider(api);api.state.loggedIn=true;api.state.mode=mode;api.state.errorInfo=info;
  try{await assert.rejects(codex.generate(profile,messages,new AbortController().signal),error=>{assert.match(error.message,pattern);assert(!error.message.includes('fixture-token'));assert(!error.message.includes('secret-sdk-error'));return true;});}finally{codex.dispose();}
 }
});
test('Bundled Codex binary resolves from the platform dependency and is included outside asar',()=>{const {codexExecutable}=require(exportsFile);const executable=codexExecutable();assert(fs.existsSync(executable));const pkg=require('../package.json');assert.equal(pkg.dependencies['@openai/codex'],'0.160.1');assert(pkg.build.asarUnpack.includes('node_modules/@openai/codex-win32-*/vendor/**/*'));});

test('Codex forwards reasoning effort on the selected model turn',async()=>{
 const api=fixture(),codex=provider(api);api.state.loggedIn=true;try{await codex.generate({...profile,model:'vision-fixture',reasoningEffort:'high'},messages,new AbortController().signal);assert.equal(api.state.messages.find(value=>value.method==='thread/start').params.model,'vision-fixture');assert.equal(api.state.messages.find(value=>value.method==='turn/start').params.effort,'high');}finally{codex.dispose();}
});

test('model discovery merges names and capabilities without changing revision or default model',async()=>{
 const api=fixture(),values=new Map(),db={meta:(key,fallback)=>values.get(key)||fallback,setMeta:(key,value)=>values.set(key,value)},seen=[];
 const backend={catalog:async()=>[{id:'first',name:'Discovered name',reasoningEfforts:['low','high']},{id:'second',name:'Second',reasoningEfforts:['medium','high']}],models:async()=>[],generate:async profile=>{seen.push(profile);return {text:'ok',model:profile.model}},dispose:()=>{}};
 const service=new api.AIService(db,backend);try{const id=await service.save({...profile,model:'first',models:[{id:'first',name:'My model'}]}),before=(await service.state()).profiles[0],models=await service.modelCatalog(id,'request-catalog');assert.equal(models[0].name,'My model');assert.deepEqual(Array.from(models[1].reasoningEfforts),['medium','high']);const after=(await service.state()).profiles[0];assert.equal(after.revision,before.revision);assert.equal(after.model,'first');await service.chat({requestId:'request-model',profileId:id,revision:after.revision,approvedDestination:'codex://local',modelId:'second',reasoningEffort:'high'},messages,()=>{});assert.equal(seen[0].model,'second');assert.equal(seen[0].reasoningEffort,'high');await assert.rejects(service.chat({requestId:'request-bad-model',profileId:id,revision:after.revision,approvedDestination:'codex://local',modelId:'unknown'},messages,()=>{}),/模型已不存在/);assert.equal(seen.length,1);}finally{service.dispose();}
});
