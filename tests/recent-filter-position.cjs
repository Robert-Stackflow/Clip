const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {setup}=require('./renderer-fixture.cjs');

function installFixture(){
 const rows=Array.from({length:90},(_,index)=>({id:String(index),token:String(index),kind:'text',title:`Record ${index}`,preview:`Preview ${index}`,source:'Fixture.exe',updatedAt:Date.now()-index*1000,bytes:100,draggable:false,favorite:false,pinned:false}));
 window.recentFixtureCalls=0;
 window.clipperTray.state=async query=>{window.recentFixtureCalls++;return {items:query.text?rows.slice(0,60):rows,total:query.text?60:90,categories:[],dark:false,canPaste:true};};
 window.clipperTray.preview=async token=>({token,title:`Record ${token}`,kind:'text',text:`Preview ${token}`,image:'',files:[],source:'Fixture.exe',updatedAt:Date.now(),bytes:100,truncated:false});
 window.clipperTray.onSession=callback=>{setTimeout(()=>callback(true),0);return()=>{};};
 window.clipperTray.onChange=callback=>{window.recentFixtureChanged=callback;return()=>{};};
}

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const language of ['zh-CN','en']){
   const context=await browser.newContext({viewport:{width:740,height:520},reducedMotion:'reduce'});
   await context.addInitScript({content:`(${setup.toString()})(${JSON.stringify(language)});(${installFixture.toString()})();`});
   await context.route('https://clipper.test/**',async route=>{const file=new URL(route.request().url()).pathname.slice(1);await route.fulfill({body:await fs.readFile(path.join('dist/renderer',file)),contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript'});});
   const page=await context.newPage();await page.goto('https://clipper.test/tray.html');
   await expect(page.locator('.tray-row')).toHaveCount(90);
   await page.locator('#items').evaluate(node=>node.scrollTop=1800);
   assert((await page.locator('#items').evaluate(node=>node.scrollTop))>1000);
   await page.locator('#search').fill('match');
   await expect(page.locator('.tray-row')).toHaveCount(60);
   await expect.poll(()=>page.locator('#items').evaluate(node=>node.scrollTop)).toBe(0);
   await page.locator('#items').evaluate(node=>node.scrollTop=500);
   const calls=await page.evaluate(()=>window.recentFixtureCalls);
   await page.evaluate(()=>window.recentFixtureChanged());
   await expect.poll(()=>page.evaluate(()=>window.recentFixtureCalls)).toBeGreaterThan(calls);
   await expect(page.locator('.tray-row')).toHaveCount(60);
   await expect.poll(()=>page.locator('#items').evaluate(node=>node.scrollTop)).toBeGreaterThan(400);
   const refreshed=await page.evaluate(()=>window.recentFixtureCalls);
   await page.locator('#filters [data-kind="image"]').click();
   await expect.poll(()=>page.evaluate(()=>window.recentFixtureCalls)).toBeGreaterThan(refreshed);
   await expect.poll(()=>page.locator('#items').evaluate(node=>node.scrollTop)).toBe(0);
   await context.close();
  }
  console.log(JSON.stringify({result:'PASS',scope:'Recent history search resets scroll; unchanged-query refresh preserves it, Chinese and English.'}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
