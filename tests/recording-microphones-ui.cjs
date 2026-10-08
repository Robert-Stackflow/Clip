const {chromium,expect}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup}=require('./renderer-fixture.cjs');
function fixture(){
 window.microphoneRequests=[];window.microphoneGrants=[];
 navigator.mediaDevices.enumerateDevices=()=>new Promise((resolve,reject)=>window.microphoneRequests.push({resolve,reject}));
 window.clipRecorder.beginMicrophoneList=async()=>{const token=String(microphoneGrants.length);microphoneGrants.push({token,ended:0});return token;};
 window.clipRecorder.endMicrophoneList=async token=>{microphoneGrants.find(g=>g.token===token).ended++;};
 window.resolveMicrophones=()=>microphoneRequests.at(-1).resolve([{kind:'audioinput',deviceId:'default',label:'Default'},{kind:'audioinput',deviceId:'known',label:'Owned microphone'},{kind:'audioinput',deviceId:'anonymous',label:''},{kind:'videoinput',deviceId:'camera',label:'No camera'},{kind:'audiooutput',deviceId:'speaker',label:'No speaker'}]);
}
(async()=>{
 const {beginCase}=await import('../scripts/workspace.mjs'),work=await beginCase('recording-microphones-ui'),browser=await chromium.launch({channel:'msedge',headless:true}),errors=[],results=[];
 try{
  for(const language of ['zh-CN','en']){
   const context=await browser.newContext({viewport:{width:940,height:760}});
   await context.addInitScript({content:'('+setup.toString()+')('+JSON.stringify(language)+');('+fixture.toString()+')();'});
   await context.route('https://clip.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);await route.fulfill({body:await fs.readFile(path.join('dist/renderer',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript'});});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   const ready=async()=>{await page.goto('https://clip.test/recorder.html');await page.waitForSelector('#sources button');await page.locator('#record-audio').click();await page.locator('#microphone').check();await expect(page.locator('#microphone-device-trigger')).toBeEnabled();};
   await ready();const trigger=page.locator('#microphone-device-trigger');
   await page.locator('#system-audio').check();assert.equal(await page.evaluate(()=>microphoneRequests.length),0);assert.equal(await page.locator('#microphone-device').inputValue(),'');
   await trigger.click();await expect(trigger).toHaveAttribute('aria-busy','true');assert.equal(await page.evaluate(()=>microphoneRequests.length),1);
   await trigger.click();await trigger.click();assert.equal(await page.evaluate(()=>microphoneRequests.length),1);
   await trigger.press('Escape');await page.evaluate(()=>microphoneRequests[0].reject(Error('Owned device enumeration failure')));
   await expect.poll(()=>page.evaluate(()=>microphoneGrants[0].ended)).toBe(1);assert.equal(await page.locator('.select-popup').count(),0);
   await trigger.press('Enter');await expect.poll(()=>page.evaluate(()=>microphoneRequests.length)).toBe(2);
   await page.evaluate(()=>resolveMicrophones());await expect(page.locator('.select-popup [role=option]')).toHaveCount(3);await expect(trigger).not.toHaveAttribute('aria-busy','true');
   await page.getByRole('option',{name:'Owned microphone',exact:true}).click();await page.locator('#microphone').uncheck();await page.locator('#microphone').check();assert.equal(await page.locator('#microphone-device').inputValue(),'known');
   await trigger.press(' ');await expect(page.locator('.select-popup')).toBeVisible();await trigger.press('End');await trigger.press('Enter');assert.equal(await page.locator('#microphone-device').inputValue(),'anonymous');
   await trigger.press('o');await trigger.press('Enter');assert.equal(await page.locator('#microphone-device').inputValue(),'known');assert.equal(await page.evaluate(()=>microphoneRequests.length),2);
   assert.equal(await page.locator('#microphone-device option').last().textContent(),language==='zh-CN'?'麦克风 1':'Microphone 1');assert(await page.evaluate(()=>microphoneGrants.every(g=>g.ended===1)));
   results.push({language,defaultWithoutEnumeration:true,onePendingRequest:true,retryAfterFailure:true,cachedChoices:true,onlyMicrophones:true,keyboardSelection:true});
   for(const cancel of ['escape','outside','disable','hide','remove','resize','tab']){
    await ready();await trigger.click();await expect(trigger).toHaveAttribute('aria-busy','true');
    if(cancel==='escape')await trigger.press('Escape');
    if(cancel==='outside')await page.locator('#audio-settings h2').click();
    if(cancel==='disable')await page.locator('#microphone').uncheck();
    if(cancel==='hide')await page.locator('#microphone-device').evaluate(n=>n.hidden=true);
    if(cancel==='remove')await page.locator('#microphone-device').evaluate(n=>n.closest('.custom-select-wrap').remove());
    if(cancel==='resize'){await page.setViewportSize({width:960,height:760});await page.waitForTimeout(30);}
    if(cancel==='tab')await trigger.press('Tab');
    await page.evaluate(()=>resolveMicrophones());await expect.poll(()=>page.evaluate(()=>microphoneGrants[0].ended)).toBe(1);await page.waitForTimeout(30);
    assert.equal(await page.locator('.select-popup').count(),0);assert.equal(await page.locator('.custom-select[aria-busy=true]').count(),0);
    results.push({language,cancel,noLatePopup:true,grantReleased:true});
   }
   await ready();await page.evaluate(()=>{const native=window.setTimeout;window.setTimeout=(fn,delay,...args)=>native(fn,delay===5000?30:delay,...args);});await trigger.click();
   await expect.poll(()=>page.evaluate(()=>microphoneGrants[0].ended)).toBe(1);await expect(page.locator('.select-popup [role=option]')).toHaveCount(1);
   await page.evaluate(()=>resolveMicrophones());await page.waitForTimeout(30);assert.equal(await page.locator('#microphone-device option').count(),1);await trigger.press('Escape');await trigger.click();await expect.poll(()=>page.evaluate(()=>microphoneRequests.length)).toBe(2);await page.evaluate(()=>resolveMicrophones());await expect(page.locator('.select-popup [role=option]')).toHaveCount(3);
   results.push({language,timeoutFallsBackToDefault:true,lateResultIgnored:true,timeoutRetry:true});await context.close();
  }
  assert.deepEqual(errors,[]);const result={result:'PASS',scope:'Production renderer and shared async select with controlled device promises; no physical microphone or media capture.',results};await fs.writeFile(path.join(work.output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();await work.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
