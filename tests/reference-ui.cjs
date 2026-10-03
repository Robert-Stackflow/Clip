const {chromium}=require('@playwright/test');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {setup}=require('./renderer-fixture.cjs');

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const errors=[];let context;
 try{
  context=await browser.newContext({viewport:{width:1280,height:820}});
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:'https://clipper.test'});
  await context.addInitScript(setup);
  await context.route('https://clipper.test/**',async route=>{
   const name=new URL(route.request().url()).pathname.slice(1);
   if(!/^[\w.-]+$/.test(name))return route.abort();
   try{await route.fulfill({body:await fs.readFile(path.join('dist/renderer',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'application/javascript'});}catch{return route.abort();}
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('https://clipper.test/index.html');await page.waitForSelector('.clip-row');
  assert.equal(await page.locator('.sidebar').evaluate(node=>Math.round(node.getBoundingClientRect().width)),208);
  assert.equal(await page.locator('.sidebar-group').count(),4);
  assert.equal(await page.locator('#main').evaluate(node=>getComputedStyle(node).borderLeftWidth),'1px');
  await page.locator('[data-page="symbols"]').click();
  await page.waitForSelector('.reference-item');
  await fs.mkdir('work/reference-ui',{recursive:true});
  await page.screenshot({path:'work/reference-ui/emoji.png'});
  assert.ok((await page.locator('#reference-count').textContent()).includes('3,963'));
  await page.locator('#reference-search').fill('grinning face');
  assert.ok(await page.locator('.reference-item').count()>0);
  await page.locator('.reference-item .reference-main').first().click();
  assert.ok((await page.evaluate(()=>navigator.clipboard.readText())).length>0);
  await page.locator('[data-tab="entities"]').click();
  assert.ok((await page.locator('#reference-count').textContent()).includes('2,125')||Number((await page.locator('#reference-count').textContent()).replace(/\D/g,''))>2000);
  for(const [tab,minimum] of [['symbols',2300],['colors',149],['mime',2300],['ascii',128],['kaomoji',70]]){
   await page.locator(`[data-tab="${tab}"]`).click();
   assert.ok(Number((await page.locator('#reference-count').textContent()).replace(/\D/g,''))>=minimum,tab);
  }
  await page.locator('[data-page="cheats"]').click();
  await page.waitForSelector('.reference-cheat-row');
  await page.screenshot({path:'work/reference-ui/git.png'});
  for(const topic of ['git','latex','bash','linux','regex']){await page.locator(`[data-tab="${topic}"]`).click();assert.ok(await page.locator('.reference-cheat-row').count()>=20,topic);}
  await page.locator('#sidebar-toggle').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.sidebar').evaluate(node=>Math.round(node.getBoundingClientRect().width)),56);
  assert.equal(await page.locator('.sidebar-group-caption').first().evaluate(node=>getComputedStyle(node).opacity),'0');
  await page.screenshot({path:'work/reference-ui/cheats.png'});
  assert.deepEqual(errors,[]);
  console.log('Reference catalogs, search, copy, topic navigation and One-sized sidebar passed.');
 }finally{await context?.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
