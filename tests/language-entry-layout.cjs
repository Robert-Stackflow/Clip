// Built pages with synthetic data and simulated IPC; no OS input or system clipboard.
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
require('esbuild').buildSync({entryPoints:['tests/language-entry-layout-exports.ts'],outfile:'work/test-language-entry-layout.cjs',bundle:true,platform:'node',target:'node22'});
const {setup,measure}=require('./renderer-fixture.cjs'),{setupData,openDataView}=require('./language-data-fixture.cjs'),api=require('../work/test-language-entry-layout.cjs');
const raw='保存 <img id="injected-entry"> ⟦0⟧';
const device='保存电脑_'+('OriginalDevice'.repeat(2))+' <img id="injected-peer">';
const external='外部服务错误 '+raw+' D:\\资料\\'+('OriginalPathSegment_'.repeat(12))+'中文附件.bin';
function setupEntry(value){
 fixture.state.dark=value.theme==='dark';fixture.state.settings.theme=value.theme;
 fixture.sync.error=value.syncMessage;fixture.sync.peers[0].name=value.device;
 fixture.sync.peers[0].error=value.external;fixture.sync.nearby[0].name=value.device;
 fixture.sync.pending[0].name=value.device;fixture.entryCalls=[];
 const base=window.clipper,overrides={
  onNotice:fn=>{fixture.entryNotice=fn;return()=>{};},
  syncNow:async()=>{fixture.entryCalls.push(['sync-now']);throw Error(value.syncMessage);},
  copy:async(...args)=>{fixture.entryCalls.push(['copy',...args]);throw Error(value.attachmentMessage);}
 };
 window.clipper=new Proxy(overrides,{get:(object,key)=>key in object?object[key]:base[key]});
}
(async()=>{
 await fs.mkdir('work/language-entry',{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true}),results=[],failures=[],errors=[];
 let context;
 try{
  for(const language of ['zh-CN','en'])for(const theme of ['light','dark']){
   api.setInterfaceLanguage(language);
   const syncMessage=new api.SyncError('SYNC_INDEX_LIMIT').message;
   const attachmentMessage=api.t(api.attachmentErrorSource('ATTACHMENT_PARENT_INVALID'));
   const entryMessage=api.t`Windows 接口不可用：${external}`;
   for(const surface of ['sync-status','sync-error','attachment-toast','entry-toast']){
    context=await browser.newContext({viewport:{width:860,height:600},colorScheme:theme});
    await context.addInitScript(setup,language);await context.addInitScript(setupData);
    await context.addInitScript(setupEntry,{theme,syncMessage,attachmentMessage,device,external});
    await context.route('https://clipper.test/**',async route=>{
     const name=new URL(route.request().url()).pathname.slice(1);
     if(!/^[\w.-]+$/.test(name))return route.abort();
     await route.fulfill({body:await fs.readFile(path.join('dist/renderer',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript'});
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto('https://clipper.test/index.html');await page.waitForSelector('#copy');
    if(surface.startsWith('sync'))await openDataView(page,'sync');
    for(const scale of [100,150]){
     await page.evaluate(scale=>fixture.appearance({font:'mono',scale,density:'compact'}),scale);
     await page.evaluate(()=>new Promise(requestAnimationFrame));
     if(surface==='sync-error')await page.locator('#sync-refresh').click();
     else if(surface==='attachment-toast')await page.locator('#copy').click();
     else if(surface==='entry-toast')await page.evaluate(message=>fixture.entryNotice(message),entryMessage);
     const expected=surface==='attachment-toast'?attachmentMessage:surface==='entry-toast'?entryMessage:syncMessage;
     const feedback=surface==='sync-status'?'#sync-live > .sync-error':'#toast > span';
     await page.waitForFunction(({feedback,expected})=>document.querySelector(feedback)?.textContent===expected,{feedback,expected});
     const selectors=surface==='sync-status'?['#sync-name','#sync-save','#sync-refresh','#sync-live > .sync-error','.sync-device .sync-error','[data-revoke="peer-known"]','[data-approve="pair-allow"]','.sync-nearby','#sync-create','#sync-join']:[feedback];
     const metrics={};
     for(const selector of selectors){await page.locator(selector).first().scrollIntoViewIfNeeded();Object.assign(metrics,await measure(page,[selector]));}
     const container=surface==='sync-status'?'.tools-scroll':'#toast';
     const overflow=await page.locator(container).evaluate(element=>element.scrollWidth>element.clientWidth+1);
     const label={language,theme,scale,surface};
     const text=await page.locator(feedback).textContent();assert.equal(text,expected);
     const readability=await page.locator(feedback).evaluate(element=>({fullHeight:element.scrollHeight<=element.clientHeight+1,scrollable:getComputedStyle(element).overflowY==='auto',width:element.clientWidth,lines:element.scrollHeight/parseFloat(getComputedStyle(element).lineHeight)}));
     results.push({...label,metrics,overflow,text,readability});
     for(const [key,value]of Object.entries(metrics))if(value===false||typeof value==='object'&&(value.missing||!value.visible||!value.reachable))failures.push({...label,key,value});
     if(overflow)failures.push({...label,key:'horizontal overflow'});
     if(!readability.fullHeight&&!readability.scrollable)failures.push({...label,key:'feedback vertically clipped',readability});
     assert.equal(await page.locator('#injected-entry,#injected-peer').count(),0);
     if(surface.startsWith('sync')){
      assert.equal(await page.locator('#sync-name').inputValue(),'保存 设置电脑');
      assert.equal(await page.locator('.sync-device strong').first().textContent(),device);
      assert.equal(await page.locator('.sync-device strong').first().getAttribute('title'),device);
      assert.equal(await page.locator('.sync-nearby strong').getAttribute('title'),device);
      assert.equal(await page.locator('.sync-device .sync-error').textContent(),external);
      assert.equal(await page.locator('#sync-invitation').inputValue(),'clipper-pair:FIXTURE-ONLY-保存');
     }
     if(scale===150&&theme==='dark'){
      await page.locator(feedback).scrollIntoViewIfNeeded();
      await page.screenshot({path:`work/language-entry/${surface}-${language}-150.png`});
     }
    }
    if(surface==='sync-error')assert.deepEqual(await page.evaluate(()=>fixture.entryCalls),[['sync-now'],['sync-now']]);
    if(surface==='attachment-toast')assert.equal((await page.evaluate(()=>fixture.entryCalls)).length,2);
    await context.close();context=undefined;
   }
  }
  await fs.writeFile('work/language-entry/layout-results.json',JSON.stringify({scope:'Built main renderer with actual catalog messages and simulated IPC; 2 languages, 2 themes, 2 scales, 4 sync/main/native feedback surfaces. No system input or clipboard.',cases:results.length,failures,errors,results},null,2));
  console.log(JSON.stringify({cases:results.length,failures:failures.length,firstFailures:failures.slice(0,8),errors},null,2));
  assert.deepEqual(errors,[]);assert.deepEqual(failures,[],'See work/language-entry/layout-results.json');
 }finally{await context?.close();await browser.close();api.setInterfaceLanguage('zh-CN');console.log('Headless entry contexts and browser closed.');}
})().catch(error=>{console.error(error);process.exitCode=1;});
