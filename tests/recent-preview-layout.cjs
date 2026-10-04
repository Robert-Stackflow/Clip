const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {setup}=require('./renderer-fixture.cjs');

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const errors=[];
 try{
  for(const [name,text] of [
   ['short','Short preview'],
   ['long',Array.from({length:180},(_,index)=>`Line ${index+1}: a realistic long clipboard note`).join('\n')],
  ]){
   const context=await browser.newContext({viewport:{width:920,height:700},reducedMotion:'reduce'});
   await context.addInitScript({content:`(${setup.toString()})();clipperTray.onSession=fn=>{setTimeout(()=>fn(true),0);return()=>{}};clipperTray.onChange=()=>()=>{};const original=clipperTray.preview;clipperTray.preview=async token=>({...await original(token),text:${JSON.stringify(text)}});`});
   await context.route('https://clipper.test/**',async route=>{
    const file=new URL(route.request().url()).pathname.slice(1);
    await route.fulfill({body:await fs.readFile(path.join('dist/renderer',file)),contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript'});
   });
   const page=await context.newPage();
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto('https://clipper.test/tray.html');
   await page.waitForSelector('.preview-content pre');
   const layout=await page.evaluate(()=>{
    const rect=selector=>document.querySelector(selector).getBoundingClientRect();
    const container=document.querySelector('#preview');
    return {top:rect('#preview').top,headingHeight:rect('.preview-heading').height,contentTop:rect('.preview-content pre').top,scrollHeight:container.scrollHeight,clientHeight:container.clientHeight,overflow:document.body.scrollWidth>innerWidth};
   });
   assert(layout.headingHeight<50,`${name} preview heading grew: ${JSON.stringify(layout)}`);
   assert(layout.contentTop-layout.top<80,`${name} preview starts too low: ${JSON.stringify(layout)}`);
   assert.equal(layout.overflow,false);
   if(name==='long'){
    assert(layout.scrollHeight>layout.clientHeight,'Long text should scroll inside the preview');
    await page.locator('#preview').evaluate(element=>{element.scrollTop=element.scrollHeight;});
    assert(await page.locator('#preview dl').isVisible(),'Metadata remains reachable after scrolling');
   }
   await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log('Recent short and long previews keep their heading compact and content accessible');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
