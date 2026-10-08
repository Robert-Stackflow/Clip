import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {beginCase,repository} from './workspace.mjs';

const execute=promisify(execFile);
// These checks use isolated browser/Electron fixtures and never operate the daily clipboard.
const supported=new Set(['foundation-044','options-044','chrome-044','collection-042','auxiliary-043','application-segments-ui','collection-polish-ui','utility-pages-ui','recent-loading-ui','task-center-ui','feedback-motion-ui','commands-ui','codex-ui','category-form-ui','category-counts-electron','file-quick-preview-ui','quick-preview-electron','quick-record-motion-ui','quick-replies-ui','quick-move-electron','browser-image-drop','collection-view-ui']);
supported.add('settings-shortcuts-ui');
supported.add('settings-layout-ui');
supported.add('quick-dismiss-electron');
supported.add('reply-batch-electron');
const names=process.argv.slice(2);
if(!names.length)throw Error('Specify a verification name, for example: npm run verify -- foundation-044');
for(const name of names) {
 if(!supported.has(name))throw Error('This verification is not supported by the isolated runner: '+name);
 await stat(join(repository,'tests',name+'.cjs'));
 const work=await beginCase(name),started=Date.now();
 try{
  const result=await execute(process.execPath,['tests/'+name+'.cjs'],{
   cwd:repository,windowsHide:true,timeout:600000,maxBuffer:4*1024*1024,
   env:{...process.env,TEMP:work.temp,TMP:work.temp,CLIP_TEST_OUTPUT_DIR:work.output,CLIP_TEST_FIXTURE_DIR:work.fixtures}
  });
  await writeFile(join(work.output,'run.log'),result.stdout+result.stderr);
  console.log(JSON.stringify({test:name,result:'PASS',elapsedMs:Date.now()-started,output:work.output}));
 }catch(error){
  await writeFile(join(work.output,'run.log'),(error.stdout||'')+(error.stderr||'')+'\n'+String(error));
  console.error('Verification failed: '+name+'; see '+join(work.output,'run.log'));process.exitCode=1;
 }finally{await work.close();}
 if(process.exitCode)break;
}
