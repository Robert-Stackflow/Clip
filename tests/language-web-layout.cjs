const {chromium}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {createContext,start,join}=require('./language-web-fixture.cjs');
const cases=['join','waiting','text','image','empty','receive-only','closed'];
(async()=>{await fs.mkdir('work/language-web',{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true}),results=[],failures=[],errors=[];let context;
 try{for(const language of ['en','zh-CN'])for(const theme of ['light','dark']){
  context=await createContext(browser,{saved:language,colorScheme:theme});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  for(const scenario of cases){await start(page);if(scenario==='waiting')await page.evaluate(()=>fixture.state.approved=false);if(!['join','closed'].includes(scenario))await join(page);if(['text','image','receive-only'].includes(scenario)){if(scenario==='receive-only')await page.evaluate(()=>{fixture.state.allowSend=false;fixture.event('changed');});await page.locator('[data-id="'+(scenario==='image'?'image':'text')+'"]').click();await page.waitForSelector('#detail',{state:'visible'});}if(scenario==='empty'){await page.evaluate(()=>{fixture.state.items=[];fixture.event('changed');});await page.waitForFunction(()=>document.querySelectorAll('.item').length===0);}if(scenario==='closed'){await join(page);await page.waitForFunction(()=>fixture.calls.some(c=>c.route==='/api/events'));await page.evaluate(()=>fixture.event('closed'));await page.waitForSelector('#closed',{state:'visible'});}
   for(const width of [360,390,720,1200])for(const scale of [1,1.5]){
    // Reproduce the reduced CSS viewport of page zoom. This is layout emulation,
    // not native browser/mobile zoom or device accessibility acceptance.
    await page.setViewportSize({width:Math.floor(width/scale),height:Math.floor(900/scale)});await page.evaluate(()=>new Promise(requestAnimationFrame));
    const label=`${language} ${theme} ${scenario} ${width} zoom-${scale}`,metrics=await page.evaluate(()=>{
     const visible=el=>el.getClientRects().length>0;const viewport=innerWidth,overflow=[];
     for(const el of document.querySelectorAll('header,main,section,footer,.check,.code,.section-head,.send-actions,h1,h2,p,button,select,.file-button')){
      if(!visible(el))continue;const box=el.getBoundingClientRect(),style=getComputedStyle(el);if(box.left<-.5||box.right>viewport+.5)overflow.push({id:el.id||el.className||el.tagName,kind:'outside viewport',left:box.left,right:box.right});
      if(el.scrollWidth>el.clientWidth+1&&!['auto','scroll','hidden'].includes(style.overflowX))overflow.push({id:el.id||el.className||el.tagName,kind:'uncontained text',width:el.clientWidth,scroll:el.scrollWidth});
     }
     const untranslated=[];if(document.documentElement.lang==='en'){const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode()){if(/[\u3400-\u9fff]/.test(node.data)&&!node.parentElement.closest('[data-no-translate],#connection,#items,#title,#text,#message,#notice'))untranslated.push(node.data);}}
     return {viewport,bodyWidth:document.documentElement.scrollWidth,overflow,untranslated};
    });
    const controls=await page.locator('button:visible,input:visible:not([type=file]),textarea:visible,select:visible,a:visible,.file-button:visible').all();const unreachable=[];
    for(const control of controls){await control.scrollIntoViewIfNeeded();const info=await control.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {id:el.id||el.className||el.tagName,reachable:r.width>0&&r.height>0&&r.left>=-.5&&r.right<=innerWidth+.5&&!!hit&&(hit===el||el.contains(hit))};});if(!info.reachable)unreachable.push(info);}
    results.push({label,...metrics,unreachable});if(metrics.bodyWidth>metrics.viewport+1||metrics.overflow.length||metrics.untranslated.length||unreachable.length)failures.push(results.at(-1));
    if(width===390&&scale===1&&theme==='light'&&['join','text'].includes(scenario)||width===1200&&scale===1&&theme==='dark'&&['text','image'].includes(scenario)){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`work/language-web/${scenario}-${language}-${theme}-${width}.png`,fullPage:true});}
   }
  }await context.close();context=undefined;
 }await fs.writeFile('work/language-web/layout-results.json',JSON.stringify({scope:'Headless production web; synthetic transport. Two languages, two themes, seven states, four widths and two reduced CSS viewport scale settings',cases:results.length,failures,errors,results},null,2));console.log(JSON.stringify({cases:results.length,failures:failures.length,firstFailures:failures.slice(0,8),errors},null,2));assert.deepEqual(errors,[]);assert.deepEqual(failures,[],'See work/language-web/layout-results.json');
 }finally{await context?.close();await browser.close();console.log('Headless web layout contexts and browser closed.');}
})().catch(e=>{console.error(e);process.exitCode=1;});
