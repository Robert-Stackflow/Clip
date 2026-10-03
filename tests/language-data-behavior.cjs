const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup}=require('./renderer-fixture.cjs'),{setupData,openDataView}=require('./language-data-fixture.cjs');
// All operations below terminate at synthetic IPC. Never use Electron or system input here.
(async()=>{
 await fs.mkdir('work/language-data',{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true}),results=[];let context;
 try{for(const language of ['zh-CN','en']){
  context=await browser.newContext({viewport:{width:860,height:600}});
  await context.addInitScript(setup,language);await context.addInitScript(setupData);
  await context.route('https://clipper.test/**',async route=>{
   const name=new URL(route.request().url()).pathname.slice(1);if(!/^[\w.-]+$/.test(name))return route.abort();
   try{await route.fulfill({body:await fs.readFile(path.join('dist/renderer',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'application/javascript'});}catch{return route.abort();}
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const start=async name=>{await page.goto('https://clipper.test/index.html');await page.waitForSelector('#copy');await openDataView(page,name);};
  const calls=async name=>page.evaluate(name=>fixture.calls.filter(c=>c[0]===name),name);
  const called=async(name,count=1)=>page.waitForFunction(({name,count})=>fixture.calls.filter(c=>c[0]===name).length>=count,{name,count});
  const closed=async()=>page.waitForFunction(()=>!document.querySelector('dialog').open);
  const submit=async()=>{await page.locator('dialog [type=submit]').click();await closed();};
  const cancel=async()=>{await page.locator('#modal-cancel').click();await closed();};
  const remember=async selector=>page.locator(selector).elementHandle();
  const cleared=async handle=>{await page.waitForFunction(node=>node.value==='',handle);await handle.dispose();};
  const fillPassword=async()=>{await page.locator('#vault-new-password').fill('Fixture-only-2026!');await page.locator('#vault-repeat-password').fill('Fixture-only-2026!');};
  const busy=async name=>{
   await page.evaluate(name=>fixture.block=name,name);await page.locator('dialog [type=submit]').click();await called(name);
   assert.equal(await page.locator('#modal-close').isDisabled(),true);assert.equal(await page.locator('#modal-cancel').isDisabled(),true);
   await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').evaluate(node=>node.open),true);
   await page.evaluate(()=>fixture.release());await closed();
  };

  await start('data');assert.equal(await page.locator('#storage-directory').textContent(),'D:\\历史资料\\保存 设置');
  assert.ok((await page.locator('#backup-status').textContent()).includes('外部错误：保存 设置'));
  await page.locator('.section-nav button').nth(1).click();await page.locator('#backup-choose-folder').click();await called('backup-folder');
  await page.locator('#backup-interval').fill('12');await page.locator('#backup-keep').fill('7');
  await page.locator('#backup-password').fill('Fixture-only-2026!');await page.locator('#backup-password-repeat').fill('mismatch');
  await page.locator('#save-backup-settings').click();
  await page.waitForFunction(text=>document.body.textContent.includes(text),language==='en'?'The passwords do not match':'两次填写的密码不一致');
  assert.deepEqual(await calls('backup-save'),[]);
  await page.locator('#backup-password-repeat').fill('Fixture-only-2026!');await page.locator('#save-backup-settings').click();await called('backup-save');
  await page.waitForFunction(()=>document.getElementById('backup-password').value==='');
  assert.deepEqual((await calls('backup-save'))[0][1],{enabled:true,directory:'D:\\备份\\新 保存',intervalHours:12,keep:7,encrypted:true,password:'Fixture-only-2026!'});
  assert.equal(await page.locator('#backup-password-repeat').inputValue(),'');await page.locator('#backup-now').click();await called('backup-now');
  await page.locator('.section-nav button').first().click();await page.locator('#vault-idle').selectOption('30');await page.locator('#vault-hello').uncheck();await page.locator('#vault-save').click();await called('vault-save');
  assert.deepEqual((await calls('vault-save'))[0],['vault-save',false,30]);await page.locator('#vault-lock').click();await called('vault-lock');

  await start('migration');await cancel();assert.deepEqual(await calls('storage-migrate'),[]);
  await openDataView(page,'migration');await busy('storage-migrate');assert.deepEqual((await calls('storage-migrate'))[0],['storage-migrate','migration-token']);
  assert.equal(await page.locator('#storage-directory').textContent(),'D:\\迁移\\保存');
  await start('export');await page.locator('#export-password').fill('Fixture-only-2026!');let password=await remember('#export-password');await cancel();await cleared(password);assert.deepEqual(await calls('backup-export'),[]);
  await openDataView(page,'export');await page.locator('#export-password').fill('Fixture-only-2026!');await page.locator('#export-repeat').fill('Fixture-only-2026!');password=await remember('#export-password');
  await busy('backup-export');await cleared(password);assert.deepEqual((await calls('backup-export'))[0],['backup-export','Fixture-only-2026!']);

  await start('restore');await page.locator('#restore-password').fill('Fixture-only-2026!');password=await remember('#restore-password');await cancel();await cleared(password);await called('restore-cancel');assert.deepEqual((await calls('restore-cancel'))[0],['restore-cancel','restore-file-token']);
  await start('restore-preview');assert.equal(await page.locator('.restore-summary strong').first().textContent(),'12,345');
  assert.deepEqual((await calls('restore-preview'))[0],['restore-preview','restore-file-token','Fixture-only-2026!']);await cancel();await called('restore-cancel');assert.deepEqual((await calls('restore-cancel'))[0],['restore-cancel','restore-preview-token']);
  await start('restore-preview');await page.evaluate(()=>fixture.block='restore-commit');await page.locator('dialog [type=submit]').click();await called('restore-commit');
  assert.equal(await page.locator('#restore-merge-progress').isVisible(),true);assert.equal(await page.locator('#modal-close').isDisabled(),false);assert.equal(await page.locator('#modal-cancel').isDisabled(),false);
  await page.evaluate(()=>fixture.release());await closed();assert.deepEqual((await calls('restore-commit'))[0],['restore-commit','restore-preview-token']);assert.deepEqual(await calls('restore-cancel'),[]);
  await start('restore-preview');await page.evaluate(()=>{fixture.block='restore-commit';fixture.rejectRestore=true;fixture.restoreFinished=false;});await page.locator('dialog [type=submit]').click();await called('restore-commit');
  await page.keyboard.press('Escape');await closed();await called('restore-cancel');assert.deepEqual((await calls('restore-cancel'))[0],['restore-cancel','restore-preview-token']);
  await openDataView(page,'export');await page.evaluate(()=>fixture.release());await page.waitForFunction(()=>fixture.restoreFinished);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.locator('dialog').evaluate(node=>node.open),true);assert.equal(await page.locator('#export-password').isVisible(),true);assert.equal(await page.locator('#modal-error').isVisible(),false);await cancel();
  await start('data');await page.locator('.section-nav button').nth(2).click();await page.locator('[data-restore-name="保存.json"]').click();await page.waitForSelector('.restore-summary');
  assert.deepEqual((await calls('restore-file'))[0],['restore-file','保存.json']);assert.deepEqual((await calls('restore-preview'))[0],['restore-preview','restore-file-token',undefined]);await cancel();

  await start('vault-enable');await fillPassword();password=await remember('#vault-new-password');await cancel();await cleared(password);assert.deepEqual(await calls('encryption-prepare'),[]);
  await start('vault-enable');await fillPassword();password=await remember('#vault-new-password');await page.locator('dialog [type=submit]').click();await page.waitForSelector('#vault-recovery-proof');await cleared(password);
  assert.deepEqual((await calls('encryption-prepare'))[0],['encryption-prepare','Fixture-only-2026!']);
  let key=await page.evaluate(()=>fixture.recoveryKey);assert.equal(await page.locator('#vault-recovery-key').textContent(),key);
  await page.locator('#vault-recovery-proof').fill(key);password=await remember('#vault-recovery-proof');await cancel();await cleared(password);await called('encryption-cancel');assert.equal(await page.locator('#vault-recovery-key').textContent(),'');assert.deepEqual(await calls('encryption-commit'),[]);
  await start('vault-recovery');key=await page.evaluate(()=>fixture.recoveryKey);await page.locator('#vault-recovery-proof').fill(key);password=await remember('#vault-recovery-proof');await busy('encryption-commit');await cleared(password);
  assert.deepEqual((await calls('encryption-commit'))[0],['encryption-commit','encryption-token',key]);assert.deepEqual(await calls('encryption-cancel'),[]);assert.equal(await page.locator('#vault-recovery-key').textContent(),'');
  await start('vault-password');await fillPassword();password=await remember('#vault-new-password');await submit();await cleared(password);assert.deepEqual((await calls('vault-password'))[0],['vault-password','Fixture-only-2026!']);
  await start('vault-cleanup');assert.ok((await page.locator('.external-preview').textContent()).includes('明文资料'));await cancel();assert.deepEqual(await calls('vault-cleanup'),[]);await openDataView(page,'vault-cleanup');await submit();await called('vault-cleanup');

  await start('sync');assert.equal(await page.locator('#sync-name').inputValue(),'保存 设置电脑');assert.equal(await page.locator('#injected-peer').count(),0);
  assert.equal(await page.locator('#sync-invitation').inputValue(),'clipper-pair:FIXTURE-ONLY-保存');assert.ok((await page.locator('#sync-live').textContent()).includes('外部同步错误：设置'));
  await page.locator('#sync-name').fill('新 中文电脑');await page.locator('#sync-auto').check();await page.locator('#sync-save').click();await called('sync-save');
  assert.deepEqual((await calls('sync-save'))[0][1],{name:'新 中文电脑',enabled:true,autoNew:true,autoFiles:false});
  await page.locator('.section-nav button').nth(1).click();await page.locator('#sync-address').selectOption('192.168.10.3');await page.locator('#sync-create').click();await called('sync-invite');assert.deepEqual((await calls('sync-invite'))[0],['sync-invite','192.168.10.3']);
  await page.locator('#sync-join-code').fill('  clipper-pair:保存 原值  ');await page.locator('#sync-join').click();await called('sync-join');assert.deepEqual((await calls('sync-join'))[0],['sync-join','clipper-pair:保存 原值']);await page.waitForFunction(()=>document.getElementById('sync-join-code').value==='');
  await page.locator('.section-nav button').nth(0).click();await page.locator('[data-approve="pair-allow"]').click();await page.locator('[data-deny="pair-deny"]').click();await called('sync-approve',2);assert.deepEqual(await calls('sync-approve'),[['sync-approve','pair-allow',true],['sync-approve','pair-deny',false]]);
  await page.locator('#sync-refresh').click();await called('sync-now');await page.locator('.section-nav button').nth(1).click();await page.locator('#sync-cancel-code').click();await page.locator('.section-nav button').nth(0).click();await called('sync-cancel');
  await page.locator('[data-revoke="peer-known"]').click();await cancel();assert.deepEqual(await calls('sync-revoke'),[]);await page.locator('[data-revoke="peer-known"]').click();await submit();assert.deepEqual((await calls('sync-revoke'))[0],['sync-revoke','peer-known']);
  await page.locator('.section-nav button').nth(2).click();assert.equal(await page.locator('[data-share="private"]').count(),0);assert.equal(await page.locator('[data-share="files"]').count(),1);
  await page.locator('[data-share="text"]').click();await called('sync-share');assert.deepEqual((await calls('sync-share'))[0],['sync-share','text']);
  await page.locator('[data-local="text"]').click();await cancel();assert.deepEqual(await calls('sync-local'),[]);await page.locator('[data-local="text"]').click();await submit();await called('sync-local');
  await page.locator('[data-allow="private"]').click();await called('sync-local',2);assert.deepEqual(await calls('sync-local'),[['sync-local','text',true],['sync-local','private',false]]);

  await start('web-off');await page.locator('#web-host').selectOption('192.168.10.3');await page.locator('#web-duration').selectOption('60');await page.locator('#web-start').click();await page.waitForSelector('#web-stop');
  assert.deepEqual((await calls('web-start'))[0][1],{host:'192.168.10.3',minutes:60,follow:false});
  assert.equal(await page.locator('#web-link').inputValue(),'https://192.168.10.1:43102/#clipper-web=FIXTURE-ONLY-保存');assert.equal(await page.locator('#web-link').getAttribute('readonly'),'');
  assert.equal(await page.locator('#web-fingerprint').textContent(),Array(32).fill('ab').join(':'));assert.equal(await page.locator('#injected-browser').count(),0);assert.equal(await page.locator('#web-error').textContent(),'外部网页错误：保存');
  await page.locator('[data-web-approve="browser-pending"]').click();assert.equal(await page.locator('#web-allow-send').isChecked(),false);assert.equal(await page.locator('.web-code').textContent(),'123456');await cancel();assert.deepEqual(await calls('web-approve'),[]);
  await page.locator('[data-web-approve="browser-pending"]').click();await submit();assert.deepEqual((await calls('web-approve'))[0],['web-approve','browser-pending',true,false]);
  await page.locator('[data-web-deny="browser-deny"]').click();await called('web-approve',2);assert.deepEqual((await calls('web-approve'))[1],['web-approve','browser-deny',false,false]);
  await page.locator('[data-web-revoke="browser-approved"]').click();await called('web-revoke');assert.deepEqual((await calls('web-revoke'))[0],['web-revoke','browser-approved']);
  assert.equal(await page.locator('[data-web-clip="private"]').isDisabled(),true);assert.equal(await page.locator('[data-web-clip="files"]').count(),0);
  await page.locator('[data-web-clip="text"]').click();await called('web-publish');assert.deepEqual((await calls('web-publish'))[0],['web-publish','text']);
  await page.waitForFunction(()=>document.querySelector('[data-web-clip="text"]').dataset.webRemove==='new-publication');await page.locator('[data-web-clip="text"]').click();await called('web-remove');assert.deepEqual((await calls('web-remove'))[0],['web-remove','new-publication']);
  await page.locator('#web-follow').check();await called('web-follow');assert.deepEqual((await calls('web-follow'))[0],['web-follow',true]);
  await page.locator('#web-search').fill('仅本机');await page.waitForFunction(()=>document.querySelectorAll('[data-web-clip]').length===1);assert.equal(await page.locator('[data-web-clip]').getAttribute('data-web-clip'),'private');
  await page.locator('#web-renew').click();await called('web-invite');await page.locator('#web-stop').click();await page.waitForSelector('#web-start');await called('web-stop');
  await start('web-approve');await page.locator('#web-allow-send').check();await submit();assert.deepEqual((await calls('web-approve'))[0],['web-approve','browser-pending',true,true]);
  assert.deepEqual(errors,[]);results.push({language,passed:true,checks:['backup values, password mismatch and cleared fields','migration cancel, token and operation lock','export cancel, password wipe and operation lock','restore file/preview tokens, cancel and commit','vault password/recovery wipe and encryption confirmation','vault settings/password/cleanup actions','sync names, opaque invitation, approvals and local-only rules','web start options, invitation and fingerprint integrity','web approval defaults and explicit send permission','web publication IDs, local-only exclusion, search and stop','literal external errors and escaped user names']});
  await context.close();context=undefined;
 }
 await fs.writeFile('work/language-data/behavior-results.json',JSON.stringify({scope:'Headless production renderer with synthetic IPC; no real backup, encryption, network, native input or clipboard access',results},null,2));console.log(JSON.stringify(results,null,2));
 }finally{await context?.close();await browser.close();console.log('Headless context and browser closed.');}
})().catch(error=>{console.error(error);process.exitCode=1;});
