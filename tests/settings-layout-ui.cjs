const {chromium,expect}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup}=require('./renderer-fixture.cjs'),{extra}=require('./ui-028-fixture.cjs');
function settingsFixture(encrypted){
 fixture.state.settings.maxHistoryMiB=512;
 fixture.desktop={displayId:null,dwellMs:450,shelfTop:false,shelfAutoDrag:true,shelfAutoHide:true,shelfAutoHideSeconds:6,shelfLocked:false,shelfPosition:'top-right',shelfShortcut:'Control+Shift+D',cardDirection:'grid',shelfOnTop:true};
 fixture.data={directory:'D:\\Fixture\\资料',databaseBytes:1024,previousDirectory:'D:\\Previous',backup:{enabled:true,directory:'D:\\Fixture\\Backups',intervalHours:24,keep:10,encrypted:false,hasPassword:false,lastSuccess:Date.now(),nextAt:Date.now()+86400000},entries:[{name:'backup-fixture.json',createdAt:Date.now(),encrypted:false,bytes:2048}]};
 fixture.host={enabled:false,endpoint:'https://example.test/upload',hasToken:true,bodyMode:'multipart',fieldName:'file',authMode:'bearer',tokenHeader:'X-API-Key',responsePath:'data.url',linkFormat:'url',timeoutSeconds:30};
 fixture.updates={phase:'idle',current:'0.50.15',automatic:false,installed:true,downloaded:0,error:'',checkedAt:0};
 clipper.onShortcutInput=()=>()=>{};
 clipper.desktopState=async()=>({options:{...fixture.desktop},displays:[{id:1,name:'Display 1'}]});clipper.configureDesktop=async value=>fixture.desktop={...value};
 clipper.dataState=async()=>structuredClone(fixture.data);clipper.configureBackup=async value=>{fixture.savedBackup=value;Object.assign(fixture.data.backup,value);};
 clipper.imageHostState=async()=>({...fixture.host});clipper.configureImageHost=async value=>{fixture.savedHost=value;Object.assign(fixture.host,value);};clipper.testImageHost=async()=> 'https://example.test/image.png';
 clipper.vaultState=async()=>({encrypted,unlocked:true,hello:false,helloAvailable:true,idleMinutes:15,plaintextDirectory:''});clipper.configureVault=async(hello,idle)=>fixture.savedVault={hello,idle};
 clipper.updateState=async()=>({...fixture.updates});clipper.configureUpdates=async automatic=>Object.assign(fixture.updates,{automatic});clipper.checkUpdate=async()=>Object.assign(fixture.updates,{phase:'available',release:{version:'0.50.16',bytes:1024,notes:'A fixture release with a concise description.'}});
 clipper.checkpoints=async()=>[{id:'fixture-point',createdAt:Date.now(),reason:'manual',sourceVersion:'0.50.14',targetVersion:'0.50.15',encrypted,compatible:true,bytes:2048}];
 clipper.programVersions=async()=>[{id:'fixture-program',version:'0.50.14',createdAt:Date.now(),bytes:4096}];
}
(async()=>{
 const output=path.resolve(process.env.CLIPPER_TEST_OUTPUT_DIR||'work/settings-layout-ui');await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[],results=[];
 try{for(const [language,width,scale,dark,encrypted]of [['zh-CN',1476,100,false,false],['en',860,125,true,true],['zh-CN',700,150,false,true]]){
  const context=await browser.newContext({viewport:{width,height:976}});await context.addInitScript({content:`(${setup.toString()})(${JSON.stringify(language)});(${extra.toString()})();(${settingsFixture.toString()})(${encrypted});fixture.state.dark=${dark};fixture.appearance({...fixture.value(),scale:${scale},density:${JSON.stringify(width===700?'compact':'comfortable')}});`});
  await context.route('https://clipper.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);await route.fulfill({body:await fs.readFile(path.join('dist/renderer',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript'});});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto('https://clipper.test/index.html');await page.locator('[data-page=settings]').click();await expect(page.locator('.settings-nav')).toBeVisible();
  await expect(page.locator('#tray-click-action')).toHaveValue('open');await expect(page.locator('#tray-click-action option')).toHaveCount(5);const sections=page.locator('.settings-nav button');await expect(sections).toHaveCount(10);
  for(const id of ['interface-language','max-items','retention','history-cap','excluded-apps','backup-interval','backup-keep','backup-password','backup-password-repeat'])await expect(page.locator('#'+id)).toHaveCount(1);
  const inspect=async()=>page.locator('.section-panel:not([hidden])').evaluate(panel=>{
   const textScale=Number(getComputedStyle(panel).getPropertyValue('--text-scale'))||1;
   const badTitles=[...panel.querySelectorAll('.settings-item-title,.settings-item-title strong,.archive-entry-copy strong')].filter(el=>{const style=getComputedStyle(el);return Number(style.fontWeight)!==400||style.fontSize!==`${13*textScale}px`;}).map(el=>el.textContent);
   const badDescriptions=[...panel.querySelectorAll('.settings-item-desc')].filter(el=>getComputedStyle(el).fontSize!==`${12*textScale}px`).map(el=>el.textContent);
   const cards=[...panel.querySelectorAll('.settings-card')].map(el=>{const s=getComputedStyle(el),heading=el.querySelector(':scope > .settings-card-heading h3');return {border:s.borderTopWidth,padding:s.paddingLeft,radius:s.borderTopLeftRadius,background:s.backgroundColor,heading:heading?.textContent,headingSize:heading&&getComputedStyle(heading).fontSize};});
   const outside=[...panel.querySelectorAll('input:not([hidden]),textarea,select')].filter(el=>!el.closest('.settings-card')).map(el=>el.id);
   const badRows=[...panel.querySelectorAll('.settings-item')].filter(el=>el.getClientRects().length&&el.scrollWidth>el.clientWidth+1).map(el=>el.textContent.trim());
   return {label:panel.querySelector('h2')?.textContent,cards,badTitles,badDescriptions,outside,badRows,overflow:panel.scrollWidth>panel.clientWidth+1,bodyOverflow:document.documentElement.scrollWidth>innerWidth+1};
  });
  for(let index=0;index<10;index++){
   await sections.nth(index).click();await expect(page.locator('.section-panel:not([hidden]) .settings-card-heading h3').first()).toHaveCSS('font-size',`${14*scale/100}px`);const value=await inspect();results.push({language,width,scale,index,...value});
   assert.deepEqual(value.badTitles,[],`${value.label}: setting titles must use normal weight and a shared size`);assert.deepEqual(value.badDescriptions,[],`${value.label}: descriptions share one size`);assert.deepEqual(value.outside,[],`${value.label}: all controls belong to a settings card`);assert.deepEqual(value.badRows,[],`${value.label}: rows should fit`);assert(!value.overflow&&!value.bodyOverflow,`${value.label}: no horizontal overflow`);
   assert(value.cards.length>0,`${value.label}: card grouping`);for(const card of value.cards){assert(card.heading,`${value.label}: every card has a heading`);assert.equal(card.border,'1px');assert.equal(card.padding,width===700?'16px':'20px');assert.equal(card.headingSize,`${14*scale/100}px`,`${value.label} / ${card.heading}: shared heading size`);}
   if(width===1476||index===7){await page.locator('.settings-panels').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(output,`${language}-${width}-${index}.png`)});}
  }
  const nav=index=>sections.nth(index).click();await nav(0);await page.selectOption('#tray-click-action','recent');await expect.poll(()=>page.evaluate(()=>fixture.state.settings.trayClickAction)).toBe('recent');await page.selectOption('#tray-click-action','open');await expect.poll(()=>page.evaluate(()=>fixture.state.settings.trayClickAction)).toBe('open');await page.locator('#max-items').fill('900');await expect.poll(()=>page.evaluate(()=>fixture.state.settings.maxItems)).toBe(900);
  // Moved language controls retain their original save listener.
  await page.selectOption('#interface-language',language==='en'?'zh-CN':'en');await expect.poll(()=>page.evaluate(()=>fixture.calls.filter(c=>c[0]==='language').length)).toBe(1);
  await nav(1);await page.selectOption('#appearance-density','compact');await expect.poll(()=>page.evaluate(()=>fixture.value().density)).toBe('compact');
  await nav(3);await page.locator('#desktop-shelfLocked').check();await expect.poll(()=>page.evaluate(()=>fixture.desktop.shelfLocked)).toBe(true);
  await nav(4);await page.selectOption('#image-host-auth-mode','header');await expect(page.locator('#image-host-token-header')).toBeVisible();await page.locator('#image-host-token-header').fill('X-Fixture');await page.locator('#image-host-save').click();await expect.poll(()=>page.evaluate(()=>fixture.savedHost?.tokenHeader)).toBe('X-Fixture');assert.deepEqual((await inspect()).badTitles,[]);
  await nav(2);await page.locator('#update-automatic').check();await expect.poll(()=>page.evaluate(()=>fixture.updates.automatic)).toBe(true);await page.locator('#update-check').click();await expect(page.locator('#update-download')).toBeVisible();assert.deepEqual((await inspect()).badTitles,[]);
  await nav(7);await page.locator('#backup-encrypted').check();await expect(page.locator('#backup-password-fields')).toBeVisible();await page.locator('#backup-interval').fill('48');await page.locator('#backup-password').fill('fixture-backup-password');await page.locator('#backup-password-repeat').fill('fixture-backup-password');await page.locator('#save-backup-settings').click();await expect.poll(()=>page.evaluate(()=>fixture.savedBackup?.intervalHours)).toBe(48);await expect(page.locator('.settings-nav')).toBeVisible();
  if(encrypted){await nav(6);await page.locator('#vault-hello').check();await page.locator('#vault-save').click();await expect.poll(()=>page.evaluate(()=>fixture.savedVault?.hello)).toBe(true);}
  await context.close();
 }assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,'result.json'),JSON.stringify({passed:true,errors,results},null,2));console.log('PASS: all ten settings sections share card/field styles, normal title weight and responsive layouts; moved fields and dynamic image host/update/backup/vault controls retain save behavior');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
