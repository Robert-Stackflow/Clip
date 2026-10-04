const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {setup}=require('./renderer-fixture.cjs');
(async()=>{
 const out=path.resolve('work/unlock-loading');await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
 try{
  const context=await browser.newContext({viewport:{width:550,height:650}});await context.addInitScript(setup);
  await context.route('https://clipper.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!/^[\w.-]+$/.test(name))return route.abort();try{await route.fulfill({body:await fs.readFile(path.join('dist/renderer',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'application/javascript'});}catch{return route.abort();}});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://clipper.test/unlock.html');await expect(page.locator('#unlock-form')).toBeVisible();await expect(page.locator('#hello')).toBeVisible();await page.screenshot({path:path.join(out,'unlock.png')});
  await page.evaluate(()=>{window.unlock.unlock=()=>new Promise(resolve=>window.finishUnlock=resolve);});await page.locator('#unlock-value').fill('fixture password');await page.locator('#unlock-submit').click();await expect(page.locator('#unlock-submit-label')).toHaveText('正在解锁…');assert.equal(await page.locator('.unlock-spinner').evaluate(node=>getComputedStyle(node).display),'block');assert.equal(await page.locator('#hello').isDisabled(),true);await page.screenshot({path:path.join(out,'unlock-busy.png')});await page.evaluate(()=>window.finishUnlock());await expect(page.locator('#unlock-progress')).toBeHidden();await expect(page.locator('#unlock-submit-label')).toHaveText('解锁历史');
  await page.locator('#use-recovery').click();await expect(page.locator('#new-password-fields')).toBeVisible();await expect(page.locator('#unlock-submit-label')).toHaveText('重设密码并解锁');
  await page.locator('#hello').click();await expect(page.locator('#unlock-progress')).toHaveText('正在验证 Windows Hello…');assert.equal(await page.locator('.unlock-spinner').evaluate(node=>getComputedStyle(node).display),'none');await page.evaluate(()=>window.finishUnlock());await expect(page.locator('#unlock-progress')).toBeHidden();
  for(const [width,height] of [[480,570],[550,650]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.locator('#use-recovery').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`recovery-${width}x${height}.png`)});}
  assert.deepEqual(errors,[]);await context.close();console.log(JSON.stringify({result:'PASS',loading:true,recovery:true,hello:true,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
