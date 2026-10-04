const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {setup}=require('./renderer-fixture.cjs');

function categoriesFixture(){
 const original=window.clipperTray.state;
 const categories=Array.from({length:12},(_,index)=>({id:`00000000-0000-0000-0000-${String(index+1).padStart(12,'0')}`,name:`分类 ${index+1} 长名称`}));
 window.categoryQueries=[];
 window.clipperTray.state=async query=>{
  window.categoryQueries.push({...query});
  const result=await original(query);
  return {...result,categories,items:query.category&&query.category!=='favorites'?result.items.slice(0,1):result.items};
 };
}

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:740,height:560},reducedMotion:'reduce'});
  await context.addInitScript({content:`(${setup.toString()})();(${categoriesFixture.toString()})();`});
  await context.route('https://clipper.test/**',async route=>{
   const file=new URL(route.request().url()).pathname.slice(1);
   await route.fulfill({body:await fs.readFile(path.join('dist/renderer',file)),contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript'});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('https://clipper.test/tray.html');
  await expect(page.locator('#categories button')).toHaveCount(14);
  await expect(page.locator('#filters [data-kind="all"] small')).toHaveText('3');
  await expect(page.locator('#count')).toHaveCount(0);
  for(const [width,height] of [[740,560],[420,340],[280,240]]){
   await page.setViewportSize({width,height});
   await fs.mkdir('work/recent-category-segments',{recursive:true});
   await page.screenshot({path:`work/recent-category-segments/${width}.png`});
   assert.equal(await page.evaluate(()=>document.body.scrollWidth>innerWidth),false,`${width}px body overflow`);
   if(width===280){
    const layout=await page.evaluate(()=>{const types=document.querySelector('#filters').getBoundingClientRect(),categories=document.querySelector('#categories').getBoundingClientRect(),actions=document.querySelector('.preview-actions').getBoundingClientRect(),items=document.querySelector('#items').getBoundingClientRect(),row=document.querySelector('.tray-row').getBoundingClientRect();return {typesBottom:types.bottom,categoryTop:categories.top,categoryWidth:categories.width,actionsBottom:actions.bottom,actionsTop:actions.top,itemsTop:items.top,itemsBottom:items.bottom,rowTop:row.top,rowBottom:row.bottom};});
    assert(layout.categoryTop>=layout.typesBottom-1,'compact categories stay on their own row');
    assert(layout.categoryWidth>=width-32,`compact categories remain usable across the window: ${JSON.stringify(layout)}`);
    assert(layout.rowBottom<=layout.itemsBottom+1,'at least one complete recent record stays visible');
    assert(layout.actionsBottom<=height,'compact copy and paste actions remain visible');
   }
   const last=page.locator('#categories button').last();await last.click();
   await expect(last).toHaveAttribute('aria-pressed','true');
   await expect(page.locator('.tray-row')).toHaveCount(1);
   assert.equal((await page.evaluate(()=>categoryQueries.at(-1))).category,'00000000-0000-0000-0000-000000000012');
   await page.locator('#categories [data-category=""]').click();
   await expect(page.locator('.tray-row')).toHaveCount(3);
   if(width===280){
    await page.locator('#categories [data-category=""]').focus();
    await page.keyboard.press('End');
    await expect(last).toHaveAttribute('aria-pressed','true');
    const visibility=await last.evaluate(button=>{const group=button.parentElement,box=group.getBoundingClientRect(),rect=button.getBoundingClientRect();return {visible:rect.left>=box.left-2&&rect.right<=box.right+2,buttonLeft:rect.left,buttonRight:rect.right,groupLeft:box.left,groupRight:box.right,scrollLeft:group.scrollLeft,offsetLeft:button.offsetLeft};});
    assert(visibility.visible,`keyboard-selected category remains visible in its segment row: ${JSON.stringify(visibility)}`);
    await page.keyboard.press('Home');
    await expect(page.locator('#categories [data-category=""]')).toHaveAttribute('aria-pressed','true');
   }
  }
  assert.deepEqual(errors,[]);
  await context.close();
  console.log('Recent category segments filter records and remain reachable at compact sizes');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
