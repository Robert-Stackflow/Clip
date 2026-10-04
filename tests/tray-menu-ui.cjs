const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');

const entries=[
 ['open','打开 Clipper','primary','app-window'],['recent','最近记录','primary','history'],
 ['replies','快捷回复','tools','message-square-text'],['shelf','浮动拖放窗口','tools','panel-top'],['record','录屏与录音','tools','circle-play'],
 ['stack','开始自动加入堆栈','header','layers-2'],['pause','暂停记录','header','pause'],['lock','锁定历史','privacy','lock-keyhole'],['startup','开机自启动','system','monitor'],['quit','退出 Clipper','system','power']
].map(([id,label,group,icon])=>({id,label,group,icon,...(id==='quit'?{tone:'danger'}:{})}));
async function run(){
 const output=path.resolve('work/tray-menu-ui');await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{const context=await browser.newContext({viewport:{width:292,height:378},deviceScaleFactor:1});
  await context.addInitScript(initial=>{window.menuFixture={view:initial,actions:[],hidden:false,ready:false,changed:null};window.clipperTrayMenu={state:async()=>window.menuFixture.view,action:async id=>{window.menuFixture.actions.push(id);},hide:async()=>{window.menuFixture.hidden=true;},ready:async()=>{window.menuFixture.ready=true;},onChange:callback=>{window.menuFixture.changed=callback;return()=>{};}};},{entries,dark:false,initializing:false,secured:false,paused:false,stackActive:false});
  await context.route('https://clipper.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1),file=path.join('dist/renderer',name);try{const body=await fs.readFile(file);await route.fulfill({body,contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'application/javascript'});}catch{await route.fulfill({status:404,body:'missing'});}});
  const page=await context.newPage();await page.goto('https://clipper.test/tray-menu.html');await expect(page.locator('.menu-item')).toHaveCount(8);await expect(page.locator('.menu-header-action')).toHaveCount(2);await expect.poll(()=>page.evaluate(()=>window.menuFixture.ready)).toBe(true);
  const normal=await page.evaluate(()=>({overflow:document.querySelector('#menu-items').scrollHeight>document.querySelector('#menu-items').clientHeight,header:document.querySelector('.menu-heading').getBoundingClientRect().height,headerDrag:getComputedStyle(document.querySelector('.menu-heading')).getPropertyValue('-webkit-app-region'),first:document.querySelector('.menu-item').getBoundingClientRect().top,last:[...document.querySelectorAll('.menu-item')].at(-1).getBoundingClientRect().bottom,groupTitles:document.querySelectorAll('.menu-section-label').length}));assert.equal(normal.overflow,false,'all tray actions should fit without scrolling');assert.equal(normal.groupTitles,0);assert.equal(normal.headerDrag,'no-drag');assert(normal.first>=normal.header&&normal.last<=378);
  assert.equal(await page.evaluate(()=>{const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});document.querySelector('.menu-heading').dispatchEvent(event);return event.defaultPrevented;}),true,'tray menu must suppress title-bar context menus');
  await page.screenshot({path:path.join(output,'light.png')});await page.keyboard.press('ArrowDown');await expect(page.locator('[data-action="open"]')).toBeFocused();await page.keyboard.press('End');await expect(page.locator('[data-action="quit"]')).toBeFocused();await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.menuFixture.hidden),true);
  await page.locator('[data-action="shelf"]').click();await expect(page.locator('[data-action="shelf"]')).toBeEnabled();await page.locator('[data-action="shelf"]').click();assert.deepEqual(await page.evaluate(()=>window.menuFixture.actions),['shelf','shelf']);
  await page.evaluate(()=>{window.menuFixture.view={...window.menuFixture.view,entries:window.menuFixture.view.entries.map(entry=>entry.id==='startup'?{...entry,active:true}:entry)};window.menuFixture.changed();});await expect(page.locator('[data-action="startup"] .menu-active-check')).toHaveCount(1);
  await page.evaluate(()=>{window.menuFixture.view={...window.menuFixture.view,dark:true};window.menuFixture.changed();});await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.screenshot({path:path.join(output,'dark.png')});
  await page.evaluate(()=>{window.menuFixture.view={entries:[{id:'open',label:'解锁历史',group:'primary',icon:'lock-open'},{id:'quit',label:'退出 Clipper',group:'system',icon:'power',tone:'danger'}],dark:false,initializing:false,secured:true,paused:false,stackActive:false};window.menuFixture.changed();});await expect(page.locator('.menu-item')).toHaveCount(2);await expect(page.locator('#menu-header-actions')).toBeHidden();await expect(page.locator('#menu-status')).toHaveText('历史已锁定');await page.setViewportSize({width:292,height:152});await page.screenshot({path:path.join(output,'locked.png')});
  await page.evaluate(()=>{window.menuFixture.view={entries:[{id:'quit',label:'退出 Clipper',group:'system',icon:'power',tone:'danger'}],dark:false,initializing:true,secured:true,paused:false,stackActive:false};window.menuFixture.changed();});await expect(page.locator('.menu-item')).toHaveCount(1);await expect(page.locator('#menu-status')).toHaveText('正在启动');await expect(page.locator('[data-action="open"]')).toHaveCount(0);await page.setViewportSize({width:292,height:114});await page.screenshot({path:path.join(output,'starting.png')});
  console.log(JSON.stringify({result:'PASS',normal,keyboard:true,action:true,theme:true,locked:true,starting:true,output}));await context.close();
 }finally{await browser.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1});
