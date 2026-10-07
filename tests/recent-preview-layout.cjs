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
   ['image',''],
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
   await page.waitForSelector('.tray-row');
   if(name==='image')await page.locator('[data-id="image"]').hover();
   await page.waitForSelector(name==='image'?'#preview img.preview-image':'.preview-content pre');
   assert.equal(await page.evaluate(()=>document.activeElement?.id),'search','Opening the active recent panel should be ready for typing');
   const layout=await page.evaluate(name=>{
    const rect=selector=>document.querySelector(selector).getBoundingClientRect();
    const container=document.querySelector('#preview');
    const icon=rect('.tray-row .type-icon'),glyph=rect('.tray-row .type-icon svg'),content=rect('.preview-content'),metadata=rect('#preview-meta'),actions=rect('.preview-actions');
    return {top:rect('#preview').top,contentTop:content.top,scrollHeight:container.scrollHeight,clientHeight:container.clientHeight,overflow:document.body.scrollWidth>innerWidth,iconCenterX:icon.x+icon.width/2,glyphCenterX:glyph.x+glyph.width/2,iconCenterY:icon.y+icon.height/2,glyphCenterY:glyph.y+glyph.height/2,glyphWidth:glyph.width,metadataBottom:metadata.bottom,actionsTop:actions.top,image:name==='image'?{contentTop:content.top,contentBottom:content.bottom,top:rect('#preview img.preview-image').top,bottom:rect('#preview img.preview-image').bottom}:null};
   },name);
   assert(layout.contentTop-layout.top<35,`${name} preview starts too low: ${JSON.stringify(layout)}`);
   assert.equal(layout.overflow,false);
   assert(Math.abs(layout.iconCenterX-layout.glyphCenterX)<1&&Math.abs(layout.iconCenterY-layout.glyphCenterY)<1,`${name} record icon is not centered: ${JSON.stringify(layout)}`);
   assert(layout.glyphWidth>=19,`${name} record icon is too small: ${JSON.stringify(layout)}`);
   assert(layout.metadataBottom<=layout.actionsTop+1,`${name} preview metadata is not fixed above actions: ${JSON.stringify(layout)}`);
   assert.notEqual(await page.locator('.tray-row.selected').evaluate(row=>getComputedStyle(row).backgroundColor),'rgba(0, 0, 0, 0)',`${name} selected record lost its background`);
   if(name==='long'){
    assert(layout.scrollHeight>layout.clientHeight,'Long text should scroll inside the preview');
    await page.locator('#preview').evaluate(element=>{element.scrollTop=element.scrollHeight;});
    assert(await page.locator('#preview-meta').isVisible(),'Metadata remains visible while content scrolls');
   }else if(name==='image'){
    assert(Math.abs((layout.image.top+layout.image.bottom)-(layout.image.contentTop+layout.image.contentBottom))<4,`Image is not centered in the available preview area: ${JSON.stringify(layout)}`);
    await fs.mkdir('work/recent-preview-layout',{recursive:true});
    await page.screenshot({path:'work/recent-preview-layout/image.png'});
   }else{
    for(const scale of [1,1.5]){
     await page.evaluate(value=>document.documentElement.style.setProperty('--text-scale',value),String(scale));
     for(const [width,height] of [[740,560],[480,420],[420,340],[360,300],[280,240]]){
      await page.setViewportSize({width,height});
      const narrow=await page.evaluate(()=>{
       const rect=selector=>document.querySelector(selector).getBoundingClientRect();
       const item=rect('.tray-row'),list=rect('.list-pane'),copy=rect('#copy-selected'),paste=rect('#paste-selected'),preview=document.querySelector('#preview');
       return {horizontalOverflow:document.body.scrollWidth>innerWidth,visibleRow:item.top<list.bottom&&item.bottom>list.top,copyBottom:copy.bottom,pasteBottom:paste.bottom,previewVisible:getComputedStyle(preview).display!=='none',height:innerHeight};
      });
      assert.equal(narrow.horizontalOverflow,false,`${width}x${height} at ${scale} has horizontal overflow`);
      assert(narrow.visibleRow,`${width}x${height} at ${scale} hides every record`);
      assert(narrow.copyBottom<=height+1&&narrow.pasteBottom<=height+1,`${width}x${height} at ${scale} hides actions: ${JSON.stringify(narrow)}`);
      assert.equal(narrow.previewVisible,height>320,`${width}x${height} at ${scale} preview mode`);
     }
    }
   }
   await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log('Recent short, long and image previews keep icons centered, content accessible and metadata fixed');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
