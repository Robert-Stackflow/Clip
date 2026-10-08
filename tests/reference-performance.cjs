const {chooseReferenceTab}=require('./reference-helpers.cjs');
const {_electron:electron}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {StorageManager}=require('../work/test-exports.cjs');
(async()=>{const {beginCase}=await import('../scripts/workspace.mjs'),work=await beginCase('reference-performance');let app;try{
 const profile=path.join(work.fixtures,'profile'),storage=new StorageManager(profile),store=await storage.start();store.saveSettings({...store.settings,paused:true});store.close();
 const env={...process.env,CLIP_TEST_MODE:'1',CLIP_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch(process.env.CLIP_PACKAGED_EXE?{executablePath:process.env.CLIP_PACKAGED_EXE,args:[],env}:{args:[path.resolve('.')],env});
 const page=await app.firstWindow();await page.waitForSelector('[data-page=symbols]');const report={packaged:!!process.env.CLIP_PACKAGED_EXE,samples:[]};
 await page.locator('[data-page=symbols]').click();await page.waitForSelector('.reference-item');
 await page.evaluate(()=>document.fonts.ready);
 for(const tab of ['mime','emoji','symbols','entities']){
  await chooseReferenceTab(page,tab);await page.waitForTimeout(150);
  const sample=await page.evaluate(async()=>{
   const scroll=document.querySelector('.reference-scroll'),times=[],movingTimes=[],tasks=[];let last=0,maxNodes=0,n=0,movedFrames=0;
   const observer=new PerformanceObserver(list=>tasks.push(...list.getEntries().map(entry=>entry.duration)));observer.observe({type:'longtask'});
   const start=performance.now();await new Promise(resolve=>{function tick(now){const before=scroll.scrollTop;if(last)times.push(now-last);last=now;scroll.scrollTop=Math.min(scroll.scrollHeight-scroll.clientHeight,(n+1)*180);if(scroll.scrollTop>before){movedFrames++;if(times.length)movingTimes.push(times[times.length-1]);}maxNodes=Math.max(maxNodes,document.querySelectorAll('.reference-item').length);if(++n<140)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});observer.disconnect();times.sort((a,b)=>a-b);movingTimes.sort((a,b)=>a-b);
   return {elapsed:performance.now()-start,p95:times[Math.floor(times.length*.95)],movingP95:movingTimes[Math.floor(movingTimes.length*.95)],movedFrames,max:Math.max(...times),longTasks:tasks,maxNodes,total:Number(document.querySelector('.reference-tabs>.active [data-tab-count]').textContent.replace(/\D/g,'')),height:scroll.scrollHeight,font:document.querySelector('#content').dataset.emojiFont||'none'};
  });
  report.samples.push({tab,...sample});assert(sample.maxNodes<250,'DOM size must stay bounded');assert(sample.movedFrames>0,'Scroll measurement must contain moving frames');
 }
 await fs.writeFile(path.join(work.output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{if(app)await app.close();await work.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
