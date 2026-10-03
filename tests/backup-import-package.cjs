const {_electron:electron}=require('@playwright/test');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');

async function run(){
 const executable=process.env.CLIPPER_PACKAGED_EXE;
 if(!executable)throw Error('Set CLIPPER_PACKAGED_EXE to the packaged Clipper.exe');
 const root=path.resolve('work/backup-import-package');await fs.mkdir(root,{recursive:true});
 const profile=await fs.mkdtemp(path.join(root,'profile-'));
 const file=path.join(root,'templates-'+path.basename(profile)+'.json');
 const backup={format:'clipper-backup',version:7,clips:[],snippets:Array.from({length:2000},(_,i)=>({title:'template '+i,payload:{text:'value '+i+' '+('x'.repeat(80))}})),categories:[],scripts:[]};
 await fs.writeFile(file,JSON.stringify(backup));
 const env={...process.env,CLIPPER_TEST_MODE:'1',CLIPPER_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:executable,args:[],env});
 try{
  const page=await app.firstWindow();await page.waitForSelector('#search');
  await app.evaluate(({dialog},selected)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[selected]});},file);
  for(let round=1;round<=2;round++){
   const choice=await page.evaluate(()=>window.clipper.chooseRestore());
   const preview=await page.evaluate(token=>window.clipper.previewRestore(token),choice.token);
   assert.equal(preview.snippets,2000);
   assert.equal(await page.evaluate(token=>window.clipper.restoreBackup(token),preview.token),0);
   const state=await page.evaluate(()=>window.clipper.state());assert.equal(state.snippets.length,2000);
  }
  console.log(JSON.stringify({result:'PASS',packaged:true,snippets:2000,duplicateRestore:true,profile}));
 }finally{await app.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
