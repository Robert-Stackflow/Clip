const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');

async function run(){
 const output=path.resolve('work/integration-queue');await fs.mkdir(output,{recursive:true});
 const profile=await fs.mkdtemp(path.join(output,'profile-'));
 const env={...process.env,CLIPPER_TEST_MODE:'1',CLIPPER_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[path.resolve('.')],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.waitForSelector('#search');
  const send=(...urls)=>app.evaluate(({app},values)=>{for(const url of values)app.emit('second-instance',{},['Clipper.exe',url]);},urls);
  const pending=()=>page.evaluate(()=>window.clipper.integrations().then(state=>state.pending));
  const clips=()=>page.evaluate(()=>window.clipper.state().then(state=>state.clips.map(item=>item.preview)));

  await send('clipper-win://add?text=queued-first','clipper-win://add?text=queued-second');
  await expect(page.locator('.external-preview')).toHaveText('queued-first');
  await page.locator('#dialog [type=submit]').click();
  await expect(page.locator('.external-preview')).toHaveText('queued-second');
  assert.ok((await clips()).includes('queued-first'));
  await page.locator('#dialog [type=submit]').click();
  await expect.poll(pending).toBe(null);
  assert.ok((await clips()).includes('queued-second'));

  await send('clipper-win://add?text=discarded-first','clipper-win://add?text=kept-second');
  await expect(page.locator('.external-preview')).toHaveText('discarded-first');
  await page.locator('#modal-cancel').click();
  await expect(page.locator('.external-preview')).toHaveText('kept-second');
  await page.locator('#dialog [type=submit]').click();
  await expect.poll(pending).toBe(null);
  assert.ok(!(await clips()).includes('discarded-first'));
  assert.ok((await clips()).includes('kept-second'));

  await send('clipper-win://open','clipper-win://search?q=queued-search','clipper-win://add?text=after-navigation');
  await expect(page.locator('#search')).toHaveValue('queued-search');
  await expect(page.locator('.external-preview')).toHaveText('after-navigation');
  await page.locator('#modal-cancel').click();
  await expect.poll(pending).toBe(null);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',orderedConfirmation:true,cancelAdvancesQueue:true,navigationDrainsQueue:true,profile},null,2));
 }finally{await app.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
