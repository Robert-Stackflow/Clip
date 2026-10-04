const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {setup}=require('./renderer-fixture.cjs');

function categoriesFixture(){
 const original=window.clipperTray.state;
 const categories=Array.from({length:12},(_,index)=>({id:`00000000-0000-0000-0000-${String(index+1).padStart(12,'0')}`,name:`分类 ${index+1} 长名称`}));
 window.categoryQueries=[];
 window.clipperTray.state=async query=>{
  window.categoryQueries.push({...query});
  const result=await original(query);
  return {...result,categories,items:query.category&&query.category!=='favorites'?result.items.slice(0,1):result.items};
 };
}

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:740,height:560},reducedMotion:'reduce'});
  await context.addInitScript({content:`(${setup.toString()})();(${categoriesFixture.toString()})();`});
  await context.route('https://clipper.test/**',async route=>{
   const file=new URL(route.request().url()).pathname.slice(1);
   await route.fulfill({body:await fs.readFile(path.join('dist/renderer',file)),contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript'});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('https://clipper.test/tray.html');
  await expect(page.locator('#categories button')).toHaveCount(14);
  await expect(page.locator('#filters [data-kind="all"] small')).toHaveText('3');
  await expect(page.locator('#count')).toHaveCount(0);
  for(const [width,height] of [[740,560],[420,340],[280,240]]){
   await page.setViewportSize({width,height});
   assert.equal(await page.evaluate(()=>document.body.scrollWidth>innerWidth),false,`${width}px body overflow`);
   const last=page.locator('#categories button').last();await last.click();
   await expect(last).toHaveAttribute('aria-pressed','true');
   await expect(page.locator('.tray-row')).toHaveCount(1);
   assert.equal((await page.evaluate(()=>categoryQueries.at(-1))).category,'00000000-0000-0000-0000-000000000012');
   await page.locator('#categories [data-category=""]').click();
   await expect(page.locator('.tray-row')).toHaveCount(3);
  }
  assert.deepEqual(errors,[]);
  await context.close();
  console.log('Recent category segments filter records and remain reachable at compact sizes');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
