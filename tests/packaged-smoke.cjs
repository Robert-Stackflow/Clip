const {_electron}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Store}=require('../work/test-exports.cjs');

(async()=>{
 const version=process.argv[2];
 assert(/^\d+\.\d+\.\d+$/.test(version),'Pass a release version, for example 0.50.2');
 const executable=path.resolve('release',version,'win-unpacked','Clipper.exe');
 assert(fs.existsSync(executable),'Packaged executable is missing');
 const {beginCase}=await import('../scripts/workspace.mjs');
 const work=await beginCase('packaged-smoke-'+version.replaceAll('.','-'));
 const profile=path.join(work.fixtures,'profile');
 fs.mkdirSync(profile,{recursive:true});
 const store=new Store(path.join(profile,'history.sqlite'));
 try{store.saveSettings({...store.settings,paused:true});}finally{store.close();}
 const env={...process.env,CLIPPER_TEST_MODE:'1',CLIPPER_DATA_DIR:profile};
 delete env.ELECTRON_RUN_AS_NODE;
 delete env.CLIPPER_DEVELOPMENT;
 let app;
 try{
  app=await _electron.launch({executablePath:executable,args:[],env,timeout:30000});
  const page=await app.firstWindow();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.waitForSelector('#search',{timeout:30000});
  await page.waitForFunction(async()=>{const state=await window.clipper.state();return state.native&&state.settings.paused;},undefined,{timeout:30000});
  const actual=await app.evaluate(({app,BrowserWindow})=>({version:app.getVersion(),packaged:app.isPackaged,profile:app.getPath('userData'),windows:BrowserWindow.getAllWindows().length}));
  assert.equal(actual.version,version);
  assert.equal(actual.packaged,true);
  assert.equal(path.resolve(actual.profile),profile);
  assert(actual.windows>=1);
  assert.equal(await page.evaluate(()=>document.styleSheets.length>0&&[...document.styleSheets].every(sheet=>sheet.cssRules.length>0)),true);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(work.output,'main.png')});
  const result={passed:true,version,packaged:true,native:true,styles:true,isolatedProfile:true,recordingPaused:true,windows:actual.windows,errors};
  fs.writeFileSync(path.join(work.output,'results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
 }finally{if(app)await app.close();await work.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
