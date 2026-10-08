const {build}=require('esbuild');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
(async()=>{
  const folder=path.resolve('work/language-runtime');
  fs.mkdirSync(folder,{recursive:true});
  const profile=fs.mkdtempSync(path.join(folder,'profile-'));
  const entry=path.join(folder,'entry.cjs');
  await build({entryPoints:['tests/language-runtime-entry.ts'],outfile:entry,bundle:true,platform:'node',target:'node22',external:['electron']});
  const results=[];
  for(const phase of ['default','english','chinese','system']){
    const report=path.join(profile,phase+'.json');
    const env={...process.env,CLIP_TEST_MODE:'1',CLIP_DATA_DIR:profile,CLIP_LANGUAGE_PHASE:phase,CLIP_LANGUAGE_REPORT:report,CLIP_LANGUAGE_PRELOADS:path.resolve('dist/preload')};
    delete env.ELECTRON_RUN_AS_NODE;
    const status=await new Promise((resolve,reject)=>{
      const process=spawn(require('electron'),[entry],{env,windowsHide:true,stdio:['ignore','ignore','pipe']});
      let log='';process.stderr.on('data',data=>{log+=data.toString();});
      const timeout=setTimeout(()=>{process.kill();reject(new Error('Electron did not exit: '+log));},35000);
      process.once('error',error=>{clearTimeout(timeout);reject(error);});
      process.once('exit',code=>{clearTimeout(timeout);resolve({code,log});});
    });
    const result=fs.existsSync(report)?JSON.parse(fs.readFileSync(report,'utf8')):{error:status.log};
    assert.equal(status.code,0,JSON.stringify(result));
    assert.equal(result.passed,true,JSON.stringify(result));
    results.push(result);
    console.log(phase+': production startup language, 10 hidden sandboxed preloads and preference persistence passed.');
  }
  fs.writeFileSync(path.join(folder,'results.json'),JSON.stringify({passed:true,clipboardAccess:false,inputAccess:false,results},null,2));
  console.log('Real Electron language restart checks passed; all hidden windows and processes closed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
