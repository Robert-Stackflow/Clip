const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');

async function run(){
 const output=path.resolve('work/integration-queue');await fs.mkdir(output,{recursive:true});
 const profile=await fs.mkdtemp(path.join(output,'profile-'));
 const env={...process.env,CLIP_TEST_MODE:'1',CLIP_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[path.resolve('.')],env});
 try{
  let page=await app.firstWindow();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.waitForSelector('#search');
  const send=(...urls)=>app.evaluate(({app},values)=>{for(const url of values)app.emit('second-instance',{},['Clip.exe',url]);},urls);
  const pending=()=>page.evaluate(()=>window.clip.integrations().then(state=>state.pending));
  const clips=()=>page.evaluate(()=>window.clip.state().then(state=>state.clips.map(item=>item.preview)));

  await send('clip-win://add?text=queued-first','clip-win://add?text=queued-second');
  await expect(page.locator('.external-preview')).toHaveText('queued-first');
  await page.locator('#dialog [type=submit]').click();
  await expect(page.locator('.external-preview')).toHaveText('queued-second');
  assert.ok((await clips()).includes('queued-first'));
  await page.locator('#dialog [type=submit]').click();
  await expect.poll(pending).toBe(null);
  assert.ok((await clips()).includes('queued-second'));

  await send('clip-win://add?text=discarded-first','clip-win://add?text=kept-second');
  await expect(page.locator('.external-preview')).toHaveText('discarded-first');
  await page.locator('#modal-cancel').click();
  await expect(page.locator('.external-preview')).toHaveText('kept-second');
  await page.locator('#dialog [type=submit]').click();
  await expect.poll(pending).toBe(null);
  assert.ok(!(await clips()).includes('discarded-first'));
  assert.ok((await clips()).includes('kept-second'));

  await send('clip-win://open','clip-win://search?q=queued-search','clip-win://add?text=after-navigation');
  await expect(page.locator('#search')).toHaveValue('queued-search');
  await expect(page.locator('.external-preview')).toHaveText('after-navigation');
  await page.locator('#modal-cancel').click();
  await expect.poll(pending).toBe(null);

  const password='external queue test password';
  await page.evaluate(async value=>{const plan=await window.clip.prepareEncryption(value);await window.clip.encryptHistory(plan.token,plan.recoveryKey);},password);
  const locked=app.waitForEvent('window');await page.evaluate(()=>window.clip.lockHistory()).catch(()=>{});
  const unlock=await locked;await expect(unlock.locator('#heading')).toHaveText('历史已锁定');
  await send('clip-win://add?text=locked-first','clip-win://add?text=locked-second');
  await send('clip-win://add?text='+ 'x'.repeat(8200));
  await unlock.locator('#unlock-value').fill(password);
  const reopened=app.waitForEvent('window');await unlock.locator('#unlock-submit').click();
  page=await reopened;page.on('pageerror',error=>errors.push(error.message));await page.waitForSelector('#search');
  await expect(page.locator('.external-preview')).toHaveText('locked-first');
  await page.locator('#dialog [type=submit]').click();
  await expect(page.locator('.external-preview')).toHaveText('locked-second');
  await page.locator('#dialog [type=submit]').click();
  await expect.poll(pending).toBe(null);
  assert.ok((await clips()).includes('locked-first'));
  assert.ok((await clips()).includes('locked-second'));
  assert.match((await page.evaluate(()=>window.clip.state())).status,/外部请求过长/);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',orderedConfirmation:true,cancelAdvancesQueue:true,navigationDrainsQueue:true,lockedRequestsSurviveUnlock:true,profile},null,2));
 }finally{await app.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
