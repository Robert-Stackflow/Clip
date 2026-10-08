const {chooseReferenceTab}=require('./reference-helpers.cjs');
const {_electron:electron}=require('@playwright/test');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');

(async()=>{
 const {beginCase}=await import('../scripts/workspace.mjs'),work=await beginCase('reference-native');
 const profile=path.join(work.fixtures,'profile'),{StorageManager}=require('../work/test-exports.cjs'),storage=new StorageManager(profile),store=await storage.start();
 store.saveSettings({...store.settings,paused:true,shortcut:'Control+Shift+F18',nextShortcut:'Control+Alt+F20'});
 store.setMeta('desktop-options',{shelfShortcut:'Control+Alt+F21'});
 store.setMeta('efficiency',{historyEnabled:false,repliesShortcut:'Control+Alt+F23',bindings:[]});
 store.close();
 const env={...process.env,CLIP_TEST_MODE:'1',CLIP_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.CLIP_PACKAGED_EXE?{executablePath:process.env.CLIP_PACKAGED_EXE,args:[],env}:{args:[path.resolve('.')],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.waitForSelector('[data-page="symbols"]');
  await page.locator('[data-page="symbols"]').click();
  await page.waitForSelector('.reference-item',{timeout:8000}).catch(async error=>{console.error('Renderer errors:',errors,'Toast:',await page.locator('#toast').textContent(),'Content:',(await page.locator('#content').textContent()).slice(0,300));throw error;});
  await page.waitForSelector('.reference-emoji-glyph');
  assert.equal(await page.locator('.reference-page canvas,.reference-page img').count(),0);
  await page.evaluate(()=>{window.referenceCopies=[];Object.defineProperty(navigator.clipboard,'writeText',{value:async text=>window.referenceCopies.push(text)});});
  const {createHash}=require('node:crypto');const toneImages=[];
  for(const [name,base] of [['thumbs up','👍'],['person','🧑']]){
   await page.locator('#reference-search').fill(name);await page.waitForSelector(`.reference-item[aria-label="${name}"]`);
   const images=new Set();
   for(let tone=0;tone<6;tone++){
    await page.locator(`[data-tone="${tone}"]`).click();const glyph=base+(tone?String.fromCodePoint(0x1F3FA+tone):'');
    const span=page.locator(`.reference-item[aria-label="${name}"] .reference-emoji-glyph`);assert.equal(await span.textContent(),glyph);
    images.add(createHash('sha256').update(await span.screenshot()).digest('hex'));
    await page.locator(`.reference-item[aria-label="${name}"]`).click();assert.equal(await page.evaluate(()=>window.referenceCopies.at(-1)),glyph);
   }
   assert.equal(images.size,6,`${name}: native font must show six visibly different skin tones`);toneImages.push({name,distinct:images.size});
  }
  await page.screenshot({path:path.join(work.output,'native-person-dark-tone.png')});
  await chooseReferenceTab(page,'mime');
  assert.ok(await page.locator('.reference-item').count()>0);
  await page.locator('.reference-item.reference-main').first().click();
  const copied=await page.evaluate(()=>window.referenceCopies.at(-1));
  assert.match(copied,/\//);
  const rejected=await page.evaluate(()=>window.clip.openReference('https://example.com').then(()=>false,()=>true));
  assert.equal(rejected,true);
  await page.locator('[data-page="cheats"]').click();
  await page.waitForSelector('.reference-code-copy',{timeout:20000});
  const topics=JSON.parse(await fs.readFile('src/renderer/reference-data/cheatsheets.json','utf8')).topics,git=topics.find(topic=>topic.id==='git');
  for(const index of [70,25]){
   const id=git.sections[index].id,button=page.locator(`[data-category="${id}"]`);await button.scrollIntoViewIfNeeded();await button.click();
   const position=await page.locator('#reference-categories').evaluate(nav=>nav.scrollTop);
   for(let step=0;step<7;step++){
    await page.waitForTimeout(100);
    const stable=await button.evaluate((node,position)=>{const nav=node.parentElement,r=node.getBoundingClientRect(),v=nav.getBoundingClientRect();return node.getAttribute('aria-current')==='location'&&r.top>=v.top-1&&r.bottom<=v.bottom+1&&Math.abs(nav.scrollTop-position)<=1;},position);assert.ok(stable,'Native category selection must remain visible throughout scrolling');
   }
  }
  for(const topic of topics){
   await chooseReferenceTab(page,topic.id);
   const example=topic.sections.find(section=>section.blocks.some(block=>block.type==='code'))||topic.sections.find(section=>section.markdown.includes('`'));
   await page.locator(`[data-category="${example.id}"]`).click();
   const body=page.locator(`[data-section="${example.id}"] [data-body]`);await body.locator('[class^="reference-syntax-"]').first().waitFor();
   const copy=body.locator('.reference-code-copy,.reference-inline-code').first(),raw=await copy.getAttribute('data-code');await copy.click();assert.equal((await page.evaluate(()=>window.referenceCopies.at(-1))).replaceAll('\r\n','\n'),raw.replaceAll('\r\n','\n'));
   const font=await body.locator('.reference-code-block pre>code,.reference-inline-code code').first().evaluate(node=>({size:parseFloat(getComputedStyle(node).fontSize),family:getComputedStyle(node).fontFamily,block:!!node.closest('pre')}));assert.ok(font.size>=(font.block?14:13)&&font.family.includes('Cascadia Code'));
   assert.equal(await page.locator('.reference-scroll').evaluate(node=>getComputedStyle(node).paddingRight),'14px');
   await page.waitForTimeout(500);await page.screenshot({path:path.join(work.output,topic.id+'-highlight.png')});
  }
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   const contrasts=await page.locator('.reference-code-block').first().evaluate(block=>{
    const luminance=color=>{const values=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return values[0]*.2126+values[1]*.7152+values[2]*.0722;};
    const background=luminance(getComputedStyle(block).backgroundColor);return [...block.querySelectorAll('[class^="reference-syntax-"]')].map(node=>{const color=luminance(getComputedStyle(node).color);return (Math.max(background,color)+.05)/(Math.min(background,color)+.05);});
   });assert.ok(contrasts.length>0&&contrasts.every(value=>value>=4.5),theme+': '+contrasts.join(','));
   await page.screenshot({path:path.join(work.output,'code-'+theme+'.png')});
  }
  await page.evaluate(()=>document.documentElement.dataset.theme='light');
  await chooseReferenceTab(page,'latex');await page.locator('#reference-search').fill('希腊和希伯来字母');await page.waitForSelector('.katex');
  await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.evaluate(()=>document.fonts.check('12px KaTeX_Main')));
  await fs.writeFile(path.join(work.output,'result.json'),JSON.stringify({packaged:!!process.env.CLIP_PACKAGED_EXE,unicodeEmoji:true,toneImages,stableGitNavigation:true,syntaxTopics:topics.map(topic=>topic.id),codeFontSize:14,rightGutter:14,mathFonts:true,errors},null,2));
  assert.deepEqual(errors,[]);
  console.log('Native file URL module loading and reference navigation passed.');
 }finally{await app.close();await work.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
