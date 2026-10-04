const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {setup}=require('./renderer-fixture.cjs');

function trackSnapshots(){
 const base=window.clipper;fixture.stateRequests=0;
 window.clipper=new Proxy({
  state:async()=>{fixture.stateRequests++;return base.state();},
  batch:async(ids,action)=>{if(action==='favorite')for(const item of fixture.state.clips)if(ids.includes(item.id))item.favorite=true;fixture.refresh();}
 },{get:(own,key)=>key in own?own[key]:base[key]});
}

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1200,height:800}});
  await context.addInitScript(setup);await context.addInitScript(trackSnapshots);
  await context.route('https://clipper.test/**',async route=>{const file=path.join('dist/renderer',new URL(route.request().url()).pathname.slice(1));await route.fulfill({body:await fs.readFile(file),contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/javascript'});});
  const page=await context.newPage();await page.goto('https://clipper.test/index.html');await page.waitForSelector('#batch-mode');
  await page.locator('#batch-mode').click();await page.locator('[data-check=text]').check();const before=await page.evaluate(()=>fixture.stateRequests);
  await page.locator('#batch-favorite').click();await page.waitForFunction(value=>fixture.stateRequests===value+1,before);await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>fixture.stateRequests),before+1,'An explicit batch refresh should absorb its change notification');
  assert.equal(await page.evaluate(()=>fixture.state.clips.find(item=>item.id==='text').favorite),true);
  const external=await page.evaluate(()=>fixture.stateRequests);await page.evaluate(()=>fixture.refresh());await page.waitForFunction(value=>fixture.stateRequests===value+1,external);
  console.log(JSON.stringify({passed:true,batchSnapshots:1,externalNotificationSnapshots:1}));await context.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
