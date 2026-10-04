// Actual built pages with synthetic IPC, no system input, clipboard, recording or filesystem API.
const {chromium}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup,measure}=require('./renderer-fixture.cjs');
const epoch=Date.UTC(2026,0,2,12,0),raw='保存 <img id="injected-sidebar"> ⟦0⟧';
function setupFormatting({epoch,raw}){
 fixture.formatCalls=[];
 fixture.state.dark=true;fixture.state.settings.theme='dark';fixture.state.clips.forEach(c=>{c.createdAt=epoch;c.updatedAt=epoch;});
 fixture.state.clips[0].title=raw;
 const base=window.clipper;
 window.clipper=new Proxy({settings:async value=>{fixture.formatCalls.push(['settings',value.paused]);fixture.state.settings=value;fixture.refresh();}}, {get:(obj,key)=>key in obj?obj[key]:base[key]});
 const tray=window.clipperTray,trayState=tray.state;window.clipperTray={...tray,state:async()=>({...await trayState(),total:12345,counts:{all:12345,text:1,image:1,files:1,link:0,code:0}})};
 fixture.recording={phase:'recording',dark:true,bytes:0,seconds:65,message:raw,token:'fixture-only'};
 window.clipperRecorder={...window.clipperRecorder,state:async()=>fixture.recording,onChange:fn=>{fixture.recordingRefresh=fn;return()=>{};}};
}
(async()=>{
 await fs.mkdir('work/language-format',{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true}),results=[],failures=[],errors=[];let context;
 try{
  for(const language of ['zh-CN','en']){
   context=await browser.newContext({timezoneId:'Asia/Shanghai'});await context.addInitScript(setup,language);await context.addInitScript(setupFormatting,{epoch,raw});
   await context.route('https://clipper.test/**',async route=>{const file=new URL(route.request().url()).pathname.slice(1);if(!/^[\w.-]+$/.test(file))return route.abort();await route.fulfill({body:await fs.readFile(path.join('dist/renderer',file)),contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript'});});
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
   for(const width of [860,1180])for(const count of [4,1000]){
    await page.setViewportSize({width,height:600});await page.goto('https://clipper.test/index.html');await page.waitForSelector('#copy');
    await page.evaluate(count=>{const base=fixture.state.clips[0];while(fixture.state.clips.length<count)fixture.state.clips.push({...base,id:'f-'+fixture.state.clips.length});fixture.refresh();},count);
    await page.waitForFunction(count=>document.querySelector('#count-history').textContent===new Intl.NumberFormat(document.documentElement.lang==='en'?'en-US':'zh-CN').format(count),count);
    for(const font of ['system','sans','mono'])for(const scale of [100,150])for(const density of ['comfortable','compact']){
     await page.evaluate(value=>fixture.appearance(value),{font,scale,density});await page.evaluate(()=>new Promise(requestAnimationFrame));
     const label={language,width,count,font,scale,density},metrics={};
     for(const selector of ['[data-page="favorites"]','#pause-nav','[data-page="settings"]','#paste','#copy']){await page.locator(selector).scrollIntoViewIfNeeded();Object.assign(metrics,await measure(page,[selector]));}
     const words=await page.evaluate(()=>{
      const results=[];for(const span of document.querySelectorAll('.nav-item[data-page] > span,#pause-nav > span:not(.status-dot)')){
       if(!span.firstChild||span.firstChild.nodeType!==Node.TEXT_NODE)continue;const rect=span.getBoundingClientRect(),text=span.textContent;
       for(const match of text.matchAll(/\S+/g)){const range=document.createRange();range.setStart(span.firstChild,match.index);range.setEnd(span.firstChild,match.index+match[0].length);const boxes=[...range.getClientRects()];results.push({word:match[0],parts:boxes.length,full:boxes.every(r=>r.left>=rect.left-1&&r.right<=rect.right+1&&r.top>=rect.top-1&&r.bottom<=rect.bottom+1)});}
      }return results;
     });
     results.push({...label,surface:'sidebar',metrics,words});
     for(const [key,value]of Object.entries(metrics))if(value===false||typeof value==='object'&&(value.missing||!value.visible||!value.reachable))failures.push({...label,key,value});
     if(language==='en')for(const word of words)if(word.parts!==1||!word.full)failures.push({...label,key:'split or clipped word',word});
     assert.equal(await page.locator('[data-page="favorites"]').getAttribute('title'),language==='en'?'Favorites':'收藏');
     assert.equal(await page.locator('[data-id="text"] .row-title').textContent(),raw);assert.equal(await page.locator('#injected-sidebar').count(),0);
     const expectedDate=await page.evaluate(epoch=>new Date(epoch).toLocaleDateString(document.documentElement.lang==='en'?'en-US':'zh-CN',{month:'short',day:'numeric'}),epoch);
     assert.ok((await page.locator('[data-id="text"] .row-meta').textContent()).includes(expectedDate));
     assert.equal(await page.locator('#result-count,.collection-footer').count(),0);
     if(width===860&&count===1000&&font==='mono'&&scale===150&&density==='compact'){
      await page.screenshot({path:`work/language-format/sidebar-${language}-150.png`});await page.locator('#pause-nav').click();
      await page.waitForFunction(()=>fixture.state.settings.paused);assert.equal(await page.locator('#pause-nav').getAttribute('title'),language==='en'?'Resume capture':'恢复记录');
      const paused=await page.locator('#pause-nav > span:not(.status-dot)').evaluate(span=>{const rect=span.getBoundingClientRect();return {text:span.textContent,overflow:span.scrollWidth>span.clientWidth+1,clipped:span.scrollHeight>span.clientHeight+1};});
      assert.equal(paused.overflow,false);assert.equal(paused.clipped,false);results.at(-1).paused=paused;
      await page.screenshot({path:`work/language-format/sidebar-paused-${language}-150.png`});await page.locator('#pause-nav').click();await page.waitForFunction(()=>!fixture.state.settings.paused);
     }
    }
   }
   await page.setViewportSize({width:740,height:560});
   await page.goto('https://clipper.test/tray.html');await page.waitForSelector('#copy-selected');
   for(const scale of [100,150]){
    await page.evaluate(scale=>fixture.appearance({font:'mono',scale,density:'compact'}),scale);
    const count=await page.locator('#filters [data-kind="all"] small').textContent();assert.ok(count.includes('12,345'));
    const metrics=await measure(page,['#filters [data-kind="all"]','#copy-selected','#paste-selected']);results.push({language,surface:'tray-count',scale,text:count,metrics});
    for(const [key,value]of Object.entries(metrics))if(value===false||typeof value==='object'&&(value.missing||!value.visible||!value.reachable||value.overflow))failures.push({language,scale,key,value});
   }
   await page.setViewportSize({width:680,height:520});await page.goto('https://clipper.test/recorder.html');await page.waitForSelector('#size');
   for(const bytes of [0,1572864,1074266112,2146435072]){
    await page.evaluate(bytes=>{fixture.recording.bytes=bytes;fixture.recordingRefresh();},bytes);
    const expected=await page.evaluate(bytes=>new Intl.NumberFormat(document.documentElement.lang==='en'?'en-US':'zh-CN',{minimumFractionDigits:1,maximumFractionDigits:1}).format(bytes/1048576)+' MB',bytes);
    await page.waitForFunction(expected=>document.querySelector('#size').textContent===expected,expected);
    const metrics=await measure(page,['#size','#pause','#stop']);results.push({language,surface:'recording-size',bytes,expected,metrics});
    for(const [key,value]of Object.entries(metrics))if(value===false||typeof value==='object'&&(value.missing||!value.visible||!value.reachable||value.overflow))failures.push({language,bytes,key,value});
    assert.equal(await page.evaluate(()=>fixture.recording.bytes),bytes);assert.equal(await page.locator('#message').textContent(),raw);
   }
   await page.screenshot({path:`work/language-format/recording-size-${language}.png`});await context.close();context=undefined;
  }
  await fs.writeFile('work/language-format/layout-results.json',JSON.stringify({scope:'Built pages, synthetic IPC; full English words, 4/1000 counts, fonts/scales/densities, legacy date output compatibility and MB precision; no native/clipboard/recording actions.',cases:results.length,failures,errors,results},null,2));
  console.log(JSON.stringify({cases:results.length,failures:failures.length,firstFailures:failures.slice(0,10),errors},null,2));assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
 }finally{await context?.close();await browser.close();console.log('Headless formatting contexts and browser closed.');}
})().catch(error=>{console.error(error);process.exitCode=1;});
