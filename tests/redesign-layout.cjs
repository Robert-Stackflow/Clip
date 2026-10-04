// Layout and behavior of shipped renderer bundles. Browser input is isolated and headless.
const {chromium}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup,measure}=require('./renderer-fixture.cjs'),{setupText}=require('./language-text-fixture.cjs'),{setupData}=require('./language-data-fixture.cjs');
function extra(){const base=window.clipper;fixture.calls=[];fixture.state.categories=[{id:'work',name:'工作',color:'#7893b4'}];fixture.state.clips[0].title='项目需求与开发计划';fixture.state.clips[0].preview='需求确认、界面重构与发布安排';fixture.state.clips[0].source='Notepad.exe';
 const sync={name:'工作电脑',enabled:true,autoNew:false,shared:2,addresses:['192.168.1.2'],peers:[{id:'peer',name:'笔记本',host:'192.168.1.3',port:3344,lastSync:Date.now(),busy:false,error:''}],pending:[],nearby:[],error:''};const web={running:true,addresses:['192.168.1.2'],invitation:'https://192.168.1.2:4433/#clipper-web=synthetic',fingerprint:'a'.repeat(64),inviteExpires:Date.now()+300000,expires:Date.now()+1800000,items:[],clients:[],follow:false,error:''};
 const overrides={syncState:async()=>sync,webState:async()=>web,rememberSearch:async()=>{},search:async()=>fixture.state.clips.map(c=>c.id),settings:async value=>{fixture.state.settings=value;fixture.calls.push(['settings',value]);fixture.refresh();},onChange:base.onChange};window.clipper=new Proxy(overrides,{get:(obj,key)=>key in obj?obj[key]:base[key]});
}
const deviceScaleFactor=Number(process.env.CLIPPER_TEST_DEVICE_SCALE||1);
if(!Number.isFinite(deviceScaleFactor)||deviceScaleFactor<1||deviceScaleFactor>3)throw Error('CLIPPER_TEST_DEVICE_SCALE must be between 1 and 3');
const output=deviceScaleFactor===1?'work/redesign':`work/redesign-dpi-${deviceScaleFactor}`;
(async()=>{await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true}),results=[],failures=[],errors=[];try{
 for(const language of ['zh-CN','en'])for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:{width:1240,height:780},deviceScaleFactor,colorScheme:theme});await context.addInitScript(setup,language);await context.addInitScript(setupText);await context.addInitScript(setupData);await context.addInitScript(extra);await context.addInitScript(theme=>{fixture.state.dark=theme==='dark';},theme);
 await context.route('https://clipper.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!/^[\w.-]+$/.test(name))return route.abort();try{await route.fulfill({body:await fs.readFile(path.join('dist/renderer',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'application/javascript'});}catch{return route.abort();}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://clipper.test/index.html');await page.waitForSelector('#copy');
 for(const id of ['history','favorites','stack','shelf','replies','ai','scripts','uri','sync','web','settings']){
  await page.locator(`[data-page="${id}"]`).click();await page.waitForFunction(()=>document.querySelector('#content h1'));await page.waitForTimeout(80);
  const nav=page.locator('#content .section-nav button, #content .settings-nav button');const count=await nav.count();const sections=count||1;
  for(let i=0;i<sections;i++){
   if(count)await nav.nth(i).click();
   for(const [width,height,scale]of [[1240,780,100],[840,780,100],[840,600,150]]){
    await page.setViewportSize({width,height});await page.evaluate(v=>fixture.appearance({font:'system',scale:v,density:'comfortable'}),scale);await page.evaluate(()=>new Promise(requestAnimationFrame));
    const geometry=await page.evaluate(()=>{const content=document.getElementById('content');const visible=e=>e.getClientRects().length>0;const headings=[...content.querySelectorAll('h1')].filter(visible);const scrollers=[...content.querySelectorAll('.section-panels,.tools-scroll,.results,.preview-body')].filter(visible);return {oneTitle:headings.length===1,noBodyOverflow:document.body.scrollWidth<=innerWidth+1,scrollers:scrollers.map(e=>({class:e.className,width:e.clientWidth,height:e.clientHeight,overflow:e.scrollWidth>e.clientWidth+1})),buttons:[...content.querySelectorAll('button,input,select')].filter(e=>visible(e)&&!e.closest('.section-nav')).map(e=>{const r=e.getBoundingClientRect();return {id:e.id,x:r.x,right:r.right,w:r.width}}).filter(r=>r.right>innerWidth+1||r.x<0)};});
    const record={language,theme,id,section:i,width,height,scale,geometry};results.push(record);if(!geometry.oneTitle||!geometry.noBodyOverflow||geometry.scrollers.some(s=>s.overflow)||geometry.buttons.length)failures.push(record);
    if(width===1240&&theme==='light'&&language==='zh-CN')await page.screenshot({path:`${output}/${id}-${i}.png`});
   }
  }
  await page.setViewportSize({width:1240,height:780});await page.evaluate(()=>fixture.appearance({font:'system',scale:100,density:'comfortable'}));
 }
 // Category rail preserves unsaved values across switching and saves the original data.
 await page.locator('[data-page="settings"]').click();const settingsNav=page.locator('.settings-nav button'),privacy=()=>settingsNav.filter({hasText:language==='en'?'History & privacy':'记录与隐私'});await privacy().click();await page.locator('#max-items').fill('650');await settingsNav.first().click();await page.waitForFunction(()=>fixture.calls.some(c=>c[0]==='settings'&&c[1].maxItems===650));await privacy().click();assert.equal(await page.locator('#max-items').inputValue(),'650');assert.equal(await page.locator('#save-settings').count(),0);assert.equal(await page.evaluate(()=>fixture.state.settings.maxItems),650);
 await page.locator('#sidebar-toggle').click();
 assert.equal(await page.locator('#sidebar-toggle').getAttribute('aria-expanded'),'false');
 const category=page.locator('#categories [data-category="work"]');
 assert.equal(await category.isVisible(),true);
 assert.equal(await category.getAttribute('aria-label'),'工作');
 assert.equal(await category.getAttribute('data-tooltip'),'工作');
 const collapsedCategory=await category.evaluate(node=>{
  const button=node.getBoundingClientRect(),dot=node.querySelector('.category-dot').getBoundingClientRect();
  return {width:button.width,height:button.height,dotWidth:dot.width,dotHeight:dot.height};
 });
 assert.equal(collapsedCategory.width,44);
 assert.equal(collapsedCategory.height,40);
 assert.equal(collapsedCategory.dotWidth,16);
 assert.equal(collapsedCategory.dotHeight,16);
 await category.click();
 assert.equal(await category.getAttribute('aria-current'),'page');
 assert.equal(await page.locator('#content h1').textContent(),'工作');
 if(language==='zh-CN'&&theme==='light')await page.screenshot({path:`${output}/sidebar-collapsed-category.png`});
 await page.reload();await page.waitForSelector('#sidebar-toggle');
 assert.equal(await page.locator('#sidebar-toggle').getAttribute('aria-expanded'),'false');
 assert.equal(await page.locator('#categories [data-category="work"]').isVisible(),true);
 await page.locator('#sidebar-toggle').click();
 for(const [name,size,selectors]of [['tray',[740,560],['#search','#copy-selected']],['shelf',[420,440],['#items','#choose']],['recorder',[960,780],['#sources','#start']],['scroll',[840,780],['#start']],['image-editor',[960,780],['#viewport','#save']],['unlock',[680,760],['#unlock-submit']],['recovery',[840,780],['#retry']],['capture',[1000,700],['#capture-hint']]]){
  await page.setViewportSize({width:size[0],height:size[1]});await page.goto(`https://clipper.test/${name}.html`);await page.waitForTimeout(150);const geometry=await measure(page,selectors);results.push({language,theme,name,geometry});if(Object.values(geometry).some(v=>v===false||typeof v==='object'&&(v.missing||!v.visible||(name!=='capture'&&!v.reachable))))failures.push({language,theme,name,geometry});if(language==='zh-CN'&&theme==='light')await page.screenshot({path:`${output}/${name}.png`});
 }
 await context.close();
 }
 await fs.writeFile(path.join(output,'layout-results.json'),JSON.stringify({scope:'Built production renderers, headless isolated input and synthetic IPC; no system input or clipboard',deviceScaleFactor,cases:results.length,errors,failures,results},null,2));console.log(JSON.stringify({deviceScaleFactor,cases:results.length,errors,failures:failures.length,first:failures.slice(0,3)}));assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
