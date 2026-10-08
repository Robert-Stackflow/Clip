const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises'),{build}=require('esbuild');
(async()=>{
 const {beginCase}=await import('../scripts/workspace.mjs'),work=await beginCase('codex-runtime');
 try{
  await build({entryPoints:['src/main/codex-provider.ts'],outfile:path.join(work.output,'provider.cjs'),bundle:true,platform:'node',target:'node22'});
  const {CodexProvider,CodexConnection,codexExecutables}=require(path.join(work.output,'provider.cjs')),executables=codexExecutables();assert(executables.length>0);
  for(const [index,executable]of executables.entries()){
   const home=path.join(work.fixtures,'codex-home-'+index),provider=new CodexProvider(()=>home,()=>executable);let connection;
   try{
    const state=await provider.status();assert.equal(state.available,true);assert((await fs.stat(state.executablePath)).isFile());assert(!state.executablePath.startsWith(path.resolve('node_modules')+path.sep));assert.equal(state.loggedIn,false);assert.equal(state.login,'idle');assert.equal(state.email,undefined);
    await provider.catalog(new AbortController().signal);connection=new CodexConnection(state.executablePath,home,work.fixtures);await connection.initialize();
    const thread=await connection.request('thread/start',{model:null,cwd:work.fixtures,ephemeral:true,sandbox:'read-only',approvalPolicy:'never',baseInstructions:'Only transform provided content. Do not use tools.'});assert.equal(typeof thread.thread?.id,'string');
   }finally{connection?.close();provider.dispose();}
  }
  const npm=path.join(process.env.APPDATA,'npm'),entries=[path.join(npm,'codex.ps1'),path.join(npm,'codex.cmd'),path.join(npm,'node_modules','@openai','codex','bin','codex.js')];
  for(const [index,entry]of entries.entries())if(await fs.stat(entry).then(value=>value.isFile(),()=>false)){
   const provider=new CodexProvider(()=>path.join(work.fixtures,'selected-entry-'+index),()=>codexExecutables({executable:entry}));try{const state=await provider.status();assert.equal(state.available,true);assert.equal(state.loggedIn,false);assert.equal(path.extname(state.executablePath),'.exe');assert((await provider.catalog(new AbortController().signal)).length>0);}finally{provider.dispose();}
  }
  console.log(`Local Codex detection, handshake, model discovery, isolated account and read-only thread creation passed for ${executables.length} local installations; no login or AI request made.`);
 }finally{await work.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
