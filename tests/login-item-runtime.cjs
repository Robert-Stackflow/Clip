const {build}=require('esbuild'),{spawnSync}=require('node:child_process');
(async()=>{
 await build({entryPoints:['src/main/login-item.ts'],outfile:'work/test-login-item.cjs',bundle:true,platform:'node',target:'node22'});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const result=spawnSync(require('electron'),['tests/login-item-native.cjs'],{env,windowsHide:true,encoding:'utf8',timeout:30000});
 process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.error)throw result.error;process.exitCode=result.status??1;
})().catch(error=>{console.error(error);process.exitCode=1;});
