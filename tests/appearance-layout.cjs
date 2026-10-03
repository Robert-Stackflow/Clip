// Headless renderer geometry only: no Electron, native input or system clipboard.
const {chromium}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.resolve('work/appearance-layout');
const {setup,measure}=require('./renderer-fixture.cjs');
(async()=>{await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true});const failures=[],results=[],errors=[];let context;try{
 context=await browser.newContext();await context.addInitScript(setup);await context.route('https://clipper.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!/^[\w.-]+$/.test(name))return route.abort();try{await route.fulfill({body:await fs.readFile(path.join('dist/renderer',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'application/javascript'});}catch{return route.abort();}});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 for(const [file,sizes,selectors] of [['index.html',[[1180,780],[860,600]],['#paste','#copy','.preview-body','[data-page="settings"]','#filters','#filters [data-kind="code"]']],['tray.html',[[740,560],[460,460]],['#copy-selected','#paste-selected','#preview','#search']],['shelf.html',[[420,440],[280,220]],['#main','#choose','#items']]]){
  await page.goto('https://clipper.test/'+file);await page.waitForSelector(file.startsWith('index')?'.clip-row':file.startsWith('tray')?'.tray-row':'.shelf-row');
  for(const [width,height] of sizes){await page.setViewportSize({width,height});for(const font of ['system','sans','mono'])for(const scale of [100,110,125,150])for(const density of ['comfortable','compact']){
   await page.evaluate(v=>fixture.appearance(v),{font,scale,density});await page.evaluate(()=>new Promise(requestAnimationFrame));const metrics=await measure(page,selectors),label=`${file} ${width}x${height} ${font} ${scale} ${density}`;results.push({label,metrics});
   for(const [key,value] of Object.entries(metrics)){if(value===false||typeof value==='object'&&(value.missing||!value.visible||!value.reachable||key==='.preview-body'&&value.h<80||key==='#filters'&&value.overflow))failures.push({label,key,value});}
  }
  await page.screenshot({path:path.join(out,file.split('.')[0]+(file.includes('?')?'-quick':'')+`-${width}x${height}.png`)});
  }
 }
 for(const [file,size,selectors,scrollable] of [['unlock',[480,570],['#unlock-submit','#use-recovery','#recover','#quit'],true],['recovery',[700,600],['#retry','#choose-database','#choose-backup','#quit'],true],['recorder',[680,520],['#start','#refresh','#resolution','#microphone'],true],['scroll',[680,540],['#start','#display'],true],['image-editor',[760,620],['#viewport','#rotate','#flip','#undo','#redo','#copy','#save','#zoom'],false],['capture',[860,600],['#capture-hint'],false]]){
  await page.setViewportSize({width:size[0],height:size[1]});await page.goto('https://clipper.test/'+file+'.html');await page.waitForSelector(selectors[0]);
  for(const font of ['system','sans','mono'])for(const scale of [100,110,125,150])for(const density of ['comfortable','compact']){
   await page.evaluate(v=>fixture.appearance(v),{font,scale,density});await page.evaluate(()=>new Promise(requestAnimationFrame));const label=`${file} ${size.join('x')} ${font} ${scale} ${density}`;let metrics={};
   for(const selector of selectors){if(scrollable)await page.locator(selector).scrollIntoViewIfNeeded();const m=await measure(page,[selector]);metrics={...metrics,...m};}
   results.push({label,metrics});for(const [key,value] of Object.entries(metrics)){if(value===false||typeof value==='object'&&(value.missing||!value.visible||key!=='#capture-hint'&&!value.reachable))failures.push({label,key,value});}
   if(file==='image-editor')assert.deepEqual(await page.locator('#image').evaluate(c=>[c.width,c.height]),[640,360],'font scaling must not resample image canvas');
  }
  await page.screenshot({path:path.join(out,file+'-minimum.png')});
 }
 for(const theme of ['light','dark'])for(const view of ['text','image','files','stack','shelf','replies','batch','grid'])for(const scale of [100,150])for(const density of ['comfortable','compact']){
  await page.setViewportSize({width:860,height:600});await page.goto('https://clipper.test/index.html');await page.waitForSelector('#copy');await page.evaluate(({theme,scale,density})=>{fixture.state.dark=theme==='dark';fixture.appearance({font:'system',scale,density});fixture.refresh();},{theme,scale,density});
  if(['stack','shelf','replies'].includes(view))await page.locator(`[data-page="${view}"]`).click();else if(['image','files'].includes(view))await page.locator(`[data-id="${view}"]`).click();else if(view==='batch')await page.locator('#batch-mode').click();else if(view==='grid')await page.evaluate(()=>{fixture.state.settings.view='grid';fixture.refresh();});
  await page.waitForSelector('#copy');await page.evaluate(()=>new Promise(requestAnimationFrame));const metrics=await measure(page,['#paste','#copy','.preview-body','.heading-actions','.workspace']),label=`main ${view} ${theme} ${scale} ${density}`;results.push({label,metrics});for(const [key,value] of Object.entries(metrics)){if(value===false||typeof value==='object'&&(value.missing||!value.visible||!value.reachable||key==='.preview-body'&&value.h<80))failures.push({label,key,value});}
  if(theme==='dark'&&scale===150&&density==='compact')await page.screenshot({path:path.join(out,'main-'+view+'-dark.png')});
 }
 await page.setViewportSize({width:860,height:600});await page.goto('https://clipper.test/index.html');await page.waitForSelector('#copy');
 await page.locator('#record-info-toggle').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#record-info').isVisible(),true);assert.equal(await page.evaluate(()=>fixture.copies),0);await page.keyboard.press('Enter');assert.equal(await page.locator('#record-info').isVisible(),false);
 await page.locator('[data-page="settings"]').click();await page.locator('.section-nav button').nth(1).click();await page.locator('#appearance-scale').selectOption('150');await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--text-scale')==='1.5');assert.equal(await page.evaluate(()=>fixture.value().scale),150);
 await page.locator('#appearance-density').selectOption('compact');await page.waitForFunction(()=>document.documentElement.dataset.density==='compact');assert.equal(await page.locator('#appearance-scale').inputValue(),'150');await page.locator('#appearance-reset').click();await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--text-scale')==='1');assert.equal(await page.evaluate(()=>fixture.value().scale),100);
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify({scope:'Headless Edge, actual renderer bundles with mocked IPC; no native or clipboard validation',cases:results.length,failures,errors,results},null,2));console.log(JSON.stringify({cases:results.length,failures:failures.length,firstFailures:failures.slice(0,12),errors},null,2));assert.equal(errors.length,0);assert.equal(failures.length,0,'layout failures; see work/appearance-layout/results.json');
 }finally{await context?.close();await browser.close();console.log('Headless context and browser closed.');}})().catch(e=>{console.error(e);process.exitCode=1;});
