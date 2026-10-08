const {_electron:electron}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {StorageManager}=require('../work/test-exports.cjs'),memory=require('./process-tree-memory.cjs');
const baseline=process.env.CLIP_EMOJI_BASELINE;
async function frames(page,count){return page.evaluate(async count=>{
 const scroll=document.querySelector('.reference-scroll'),times=[],tasks=[];let last=0,n=0,maxNodes=0;scroll.scrollTop=0;
 const observer=new PerformanceObserver(list=>tasks.push(...list.getEntries().map(e=>e.duration)));observer.observe({type:'longtask'});
 await new Promise(resolve=>{function tick(now){if(last)times.push(now-last);last=now;scroll.scrollTop=Math.min(scroll.scrollHeight-scroll.clientHeight,n*180);maxNodes=Math.max(maxNodes,document.querySelectorAll('.reference-item').length);if(++n<count)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});observer.disconnect();times.sort((a,b)=>a-b);
 return {p95:times[Math.floor(times.length*.95)],max:times.at(-1),longTasks:tasks.length,maxNodes};
},count);}
(async()=>{const {beginCase}=await import('../scripts/workspace.mjs'),work=await beginCase('emoji-performance'),report={baseline:baseline||null,current:process.env.CLIP_PACKAGED_EXE||'development',samples:[]};
try{for(let round=0;round<5;round++)for(const mode of (round%2?['current','baseline']:['baseline','current'])){
 if(mode==='baseline'&&!baseline)continue;
 const profile=path.join(work.fixtures,mode+'-'+round),storage=new StorageManager(profile),store=await storage.start();store.saveSettings({...store.settings,paused:true});store.close();const env={...process.env,CLIP_TEST_MODE:'1',CLIP_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const executable=mode==='baseline'?baseline:process.env.CLIP_PACKAGED_EXE,app=await electron.launch(executable?{executablePath:executable,args:[],env}:{args:[path.resolve('.')],env});let timer;
 try{const page=await app.firstWindow(),pid=app.process().pid;await page.waitForSelector('[data-page=symbols]');await page.waitForTimeout(1000);const before=memory(pid).totalMiB;let peak=before;timer=setInterval(()=>{peak=Math.max(peak,memory(pid).totalMiB);},250);
 const started=Date.now();await page.locator('[data-page=symbols]').click();await page.waitForSelector('.reference-item');const firstItemsMs=Date.now()-started;await page.waitForSelector('#content[data-emoji-font=loaded]');const fontReadyMs=Date.now()-started;
 const cold=await frames(page,140),warm=await frames(page,70),active=memory(pid).totalMiB;assert.ok(cold.maxNodes<250&&warm.maxNodes<250);
 const session=await page.context().newCDPSession(page),box=await page.locator('.reference-scroll').boundingBox();await page.locator('.reference-scroll').evaluate(node=>node.scrollTop=0);const wheel=[];
 for(let step=0;step<12;step++){const start=Date.now();await session.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:box.x+box.width/2,y:box.y+box.height/2,deltaX:0,deltaY:540});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));wheel.push(Date.now()-start);}
 assert.ok(await page.locator('.reference-scroll').evaluate(node=>node.scrollTop>0));await session.detach();
 const inputStart=Date.now();await page.locator('#reference-search').fill('thumbs up');await page.waitForSelector('.reference-item[aria-label="thumbs up"]');const searchMs=Date.now()-inputStart;
 await page.evaluate(()=>{window.exitLongTasks=[];window.exitTaskObserver=new PerformanceObserver(list=>window.exitLongTasks.push(...list.getEntries().map(e=>e.duration)));window.exitTaskObserver.observe({type:'longtask'});});await page.locator('[data-page=history]').click();const afterExit=memory(pid).totalMiB;await page.waitForTimeout(10000);const idle10s=memory(pid).totalMiB;const exitTasks=await page.evaluate(()=>{window.exitTaskObserver.disconnect();return window.exitLongTasks;});
 const sample={mode,round,firstItemsMs,fontReadyMs,cold,warm,wheelMaxMs:Math.max(...wheel),searchMs,exitLongTasks:{count:exitTasks.length,maxMs:Math.max(0,...exitTasks)},memoryMiB:{before,peak,active,afterExit,idle10s}};report.samples.push(sample);console.log(JSON.stringify(sample));
 }finally{clearInterval(timer);await app.close();}
}await fs.writeFile(path.join(work.output,'result.json'),JSON.stringify(report,null,2));}finally{await work.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
