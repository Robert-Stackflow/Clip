const {chromium,expect}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup}=require('./renderer-fixture.cjs'),{extra}=require('./ui-028-fixture.cjs');
function prepare(){
 fixture.state.settings.maxHistoryMiB=1024;
 fixture.state.clips[0].pinned=true;fixture.state.clips[1].favorite=false;fixture.state.clips[2].favorite=false;
 localStorage.setItem('clip-sidebar-layout-v1',JSON.stringify({order:{clipboard:['favorites','history','replies']},hidden:[],categoriesVisible:true}));
 clip.imageHostState=async()=>({enabled:false,endpoint:'',hasToken:false,bodyMode:'binary',fieldName:'file',authMode:'bearer',tokenHeader:'X-API-Key',responsePath:'url',linkFormat:'url',timeoutSeconds:30});
 const save=clip.settings;clip.settings=async value=>{if(fixture.failSettings){fixture.failSettings=false;throw Error('Fixture save failed');}await save(value);};
}
(async()=>{
 const output=path.resolve('work/Clip/development/settings-collection');await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
 try{for(const [language,width,scale,dark]of [['zh-CN',1476,100,false],['en',860,125,true]]){
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.addInitScript({content:`(${setup.toString()})(${JSON.stringify(language)});(${extra.toString()})();(${prepare.toString()})();fixture.state.dark=${dark};fixture.state.settings.theme=${JSON.stringify(dark?'dark':'light')};fixture.appearance({...fixture.value(),scale:${scale}});`});
  await context.route('https://clip.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);await route.fulfill({body:await fs.readFile(path.join('dist/renderer',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript'});});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto('https://clip.test/index.html');await expect(page.locator('.clip-row')).toHaveCount(3);
  await expect(page.locator('[data-page=favorites],#count-favorites')).toHaveCount(0);
  for(const entry of ['history','stack','shelf','replies']){
   await page.locator('[data-page='+entry+']').click();
   for(const segment of await page.locator('.collection-controls .filterbar>.tabs:visible').all())assert.equal(await segment.evaluate(node=>node.getBoundingClientRect().height),32,'Collection segments should share the compact height');
   if(entry==='shelf')await expect(page.locator('.clip-row')).toHaveCount(0);else await expect(page.locator(entry==='replies'?'.reply-card':'.clip-row')).not.toHaveCount(0);
  }
  await page.locator('[data-page=history]').click();
  const chips=page.locator('.collection-controls>#filter-chips'),favorite=chips.locator('[data-toggle-filter=favorite]'),pinned=chips.locator('[data-toggle-filter=pinned]');await expect(favorite).toBeVisible();await expect(pinned).toBeVisible();
  const detailTop=await page.locator('#detail').evaluate(node=>node.getBoundingClientRect().top);assert(await chips.evaluate(node=>{const r=node.getBoundingClientRect(),detail=document.querySelector('#detail').getBoundingClientRect(),list=document.querySelector('.collection-rail').getBoundingClientRect();return Math.abs(r.left-list.left)<1&&Math.abs(r.right-detail.right)<1&&r.bottom<=detail.top;}),'Filter tags should span the list and detail above both columns');
  await favorite.evaluate(node=>window.savedFavoriteToggle=node);await favorite.click();await expect(favorite).toHaveAttribute('aria-pressed','true');await expect(page.locator('.clip-row')).toHaveCount(1);
  assert(await favorite.evaluate(node=>node===window.savedFavoriteToggle),'A filter change should preserve the toggle element');
  await pinned.click();await expect(pinned).toHaveAttribute('aria-pressed','true');await expect(page.locator('.clip-row')).toHaveCount(1);
  assert.equal(await page.locator('#detail').evaluate(node=>node.getBoundingClientRect().top),detailTop,'A filter toggle should preserve the shared tag row height');
  await page.waitForTimeout(200);
  for(const [toggle,button]of [[favorite,'#favorite'],[pinned,'#pin']]){
   const style=selector=>page.locator(selector).evaluate(node=>{const s=getComputedStyle(node);return {color:s.color,fill:s.fill};});
   const toggleStyle=await toggle.locator('svg').evaluate(node=>{const s=getComputedStyle(node);return {color:s.color,fill:s.fill};});assert.deepEqual(toggleStyle,await style(button+' svg'));
   assert.equal(await toggle.evaluate(node=>getComputedStyle(node).backgroundColor),await page.locator(button).evaluate(node=>getComputedStyle(node).backgroundColor));
  }
  await page.screenshot({path:path.join(output,language+'-filters.png')});await favorite.click();await pinned.click();await expect(page.locator('.clip-row')).toHaveCount(3);await expect(chips.locator('[data-remove-filter=favorite],[data-remove-filter=pinned]')).toHaveCount(0);
  await page.locator('[data-page=settings]').click();await expect(page.locator('#interface-language-trigger')).toBeVisible();
  await expect(page.locator('.settings-nav button')).toHaveCount(10);await expect(page.locator('.settings-nav button').filter({hasText:/记录与隐私|History & privacy/})).toHaveCount(0);await expect(page.locator('#paused')).toHaveCount(0);
  for(const id of ['max-items','retention','excluded-apps']){await expect(page.locator('.basic-history-card #'+id)).toBeVisible();assert(await page.locator('#'+id).evaluate(node=>node.closest('.section-panel').hidden===false));}
  await page.locator('#max-items').fill('901');await page.locator('#retention').fill('47');await page.locator('#excluded-apps').fill('bitwarden.exe\nkeepass.exe');
  await expect.poll(()=>page.evaluate(()=>{const s=fixture.state.settings;return [s.maxItems,s.retentionDays,s.excludedApps];})).toEqual([901,47,['bitwarden.exe','keepass.exe']]);assert.equal(await page.evaluate(()=>fixture.state.settings.paused),false);
  await page.screenshot({path:path.join(output,language+'-basic-settings.png')});
  await page.locator('.settings-nav button').filter({hasText:language==='en'?'Current storage':'当前存储'}).click();await expect(page.locator('#adjust-history-cap')).toBeVisible();
  await page.locator('#history-cap').fill('512');await expect.poll(()=>page.evaluate(()=>fixture.state.settings.maxHistoryMiB)).toBe(512);
  assert.equal(await page.locator('.storage-meter').evaluate(node=>getComputedStyle(node).borderBottomWidth),'0px');assert.equal(await page.locator('.storage-distribution').evaluate(node=>getComputedStyle(node).borderTopWidth),'1px');
  assert(await page.evaluate(()=>document.querySelector('.storage-distribution-heading').getBoundingClientRect().top-document.querySelector('.storage-meter-note').getBoundingClientRect().bottom<=24),'Storage summary and breakdown should have a compact vertical gap');
  await page.screenshot({path:path.join(output,language+'-storage.png')});await page.locator('#adjust-history-cap').click();await expect(page.locator('#history-cap')).toBeFocused();await expect(page.locator('#history-cap')).toBeInViewport();assert.equal(await page.locator('.settings-nav [aria-current=page]').innerText(),language==='en'?'Current storage':'当前存储');
  await page.locator('#history-cap').fill('0');await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>fixture.state.settings.maxHistoryMiB),512);
  await page.evaluate(()=>fixture.failSettings=true);await page.locator('#history-cap').fill('513');await expect(page.locator('#history-cap')).toHaveValue('512');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await page.locator('.basic-history-card').evaluate(node=>node.scrollWidth<=node.clientWidth+1));
  if(language==='en')assert(!/[\u4e00-\u9fff]/.test(await page.locator('.basic-history-card').innerText()));
  await context.close();
 }assert.deepEqual(errors,[]);console.log('PASS: persistent colored status toggles, list-only filters, legacy sidebar migration, grouped Basic settings, automatic save/rollback and capacity navigation in Chinese/light and English/dark/125%');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
