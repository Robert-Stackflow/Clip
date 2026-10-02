const {chromium}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup}=require('./renderer-fixture.cjs'),{extra}=require('./ui-028-fixture.cjs'),{setupData}=require('./language-data-fixture.cjs');
(async()=>{await fs.mkdir('work/search-039',{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true}),results=[];try{
for(const language of ['zh-CN','en'])for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:{width:1240,height:800},reducedMotion:'reduce'});for(const fn of [setup,setupData,extra])await context.addInitScript(fn,language);await context.addInitScript(theme=>{fixture.state.dark=theme==='dark';const base=clipper;window.clipper=new Proxy({efficiencyState:async()=>({options:{historyEnabled:true,repliesShortcut:'Control+Shift+R'},history:['One saved']})},{get:(o,k)=>k in o?o[k]:base[k]});},theme);
 await context.route('https://clipper.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);await route.fulfill({body:await fs.readFile(path.join('dist/renderer',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript'});});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const surface of ['history','tray','web']){
  await page.goto('https://clipper.test/'+(surface==='tray'?'tray':'index')+'.html');await page.waitForSelector(surface==='tray'?'#copy-selected':'#copy');
  if(surface==='web'){await page.evaluate(()=>fixture.web.running=true);await page.locator('[data-page=web]').click();await page.waitForSelector('#web-search');}
  const field=page.locator('.filter-field'),input=field.locator('input'),clear=field.locator('.search-clear');assert.equal(await field.count(),1);assert.equal(await field.locator('.filter-field').count(),0);assert.equal(await field.getAttribute('role'),'search');
  if(language==='en')assert(!/[\u3400-\u9fff]/.test(await input.getAttribute('aria-label')));
  for(const [scale,density]of [[100,'comfortable'],[150,'compact']]){
   await page.evaluate(v=>fixture.appearance({...fixture.value(),...v}),{scale,density});await input.fill('One search');await clear.click();assert.equal(await input.inputValue(),'');assert.equal(await page.evaluate(()=>document.activeElement?.id),surface==='web'?'web-search':'search');assert.equal(await clear.isVisible(),false);
   const geometry=await field.evaluate(field=>{const input=field.querySelector('input'),a=getComputedStyle(field),b=getComputedStyle(input);return {singleEdge:a.borderTopWidth==='1px',inputEdge:b.borderTopWidth==='0px',inputFill:b.backgroundColor==='rgba(0, 0, 0, 0)',noOverflow:field.scrollWidth<=field.clientWidth+1,clearButtons:field.querySelectorAll('.search-clear').length};});assert(geometry.singleEdge&&geometry.inputEdge&&geometry.inputFill&&geometry.noOverflow&&geometry.clearButtons===1,JSON.stringify(geometry));results.push({language,theme,surface,scale,density});
  }
  if(surface==='history'){await page.locator('#search-history').click();await page.waitForSelector('[data-reuse-search]');await page.locator('[data-reuse-search]').click();assert.equal(await input.inputValue(),'One saved');assert.equal(await clear.isVisible(),true);await clear.click();assert.equal(await input.inputValue(),'');}
 }
 assert.deepEqual(errors,[]);await context.close();
}
await fs.writeFile('work/search-039/results.json',JSON.stringify({passed:true,cases:results.length,surfaces:['history','tray','web'],systemClipboard:false,desktopInput:false,results},null,2));console.log(JSON.stringify({passed:true,cases:results.length}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
