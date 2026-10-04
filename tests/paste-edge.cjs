const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {fixture}=require('./efficiency-fixture.cjs');
const {Store}=require('../work/test-exports.cjs');

function edgeWindow(title){
 const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-Process -Name msedge -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like '*"+title+"*' } | Select-Object -First 1 Id,MainWindowHandle,MainWindowTitle | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true}).trim();
 return output?JSON.parse(output):undefined;
}
async function run(){
 const f=await fixture('paste-edge');let browser;
 const id=randomUUID(),title='ClipperPasteEdge-'+id;
 const foreground=()=>f.helper.evaluate(({app})=>{
  const req=process.getBuiltinModule('node:module').createRequire(process.getBuiltinModule('node:path').join(app.getAppPath(),'package.json'));
  return req('koffi').load('user32.dll').func('uintptr_t __stdcall GetForegroundWindow()')();
 });
 const activate=hwnd=>f.helper.evaluate(({app},hwnd)=>{
  const req=process.getBuiltinModule('node:module').createRequire(process.getBuiltinModule('node:path').join(app.getAppPath(),'package.json'));
  return req('koffi').load('user32.dll').func('bool __stdcall SetForegroundWindow(uintptr_t)')(hwnd);
 },hwnd);
 try{
  browser=await chromium.launch({channel:'msedge',headless:false});
  const context=await browser.newContext({viewport:{width:850,height:620}}),page=await context.newPage();
  await page.setContent(`<title>${title}</title><textarea id="input" style="width:500px;height:100px"></textarea><div id="editor" contenteditable="true" style="width:500px;height:100px;border:1px solid #ccc"></div>`);
  await expect.poll(()=>edgeWindow(title),{timeout:15000}).toEqual(expect.objectContaining({MainWindowHandle:expect.any(Number)}));
  const hwnd=edgeWindow(title).MainWindowHandle;assert.ok(hwnd>0);
  const value='Clipper Edge 浏览器粘贴 😀 '+id;
  const richValue='Clipper Edge rich '+id,html='<span style="color:#d7263d;font-weight:700;font-size:18pt">'+richValue+'</span>';
  const store=new Store(':memory:');
  try{
   store.add({text:richValue,html},'Edge rich paste test');
   const seed=path.join(f.output,id+'-seed.json');await fs.writeFile(seed,JSON.stringify(store.backup()));
   await f.app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),seed);
   await f.page.evaluate(()=>window.clipper.backup('import'));
  }finally{store.close();}
  await f.page.evaluate(text=>window.clipper.saveOcr(text),value);
  await f.helper.evaluate(async()=>{await global.focusTarget();global.helperWindow.setAlwaysOnTop(false);});
  for(const selector of ['#input','#editor']){
   await page.bringToFront();await page.locator(selector).click();assert.equal(await activate(hwnd),true);await expect.poll(foreground).toBe(hwnd);
   const warm=f.app.windows().find(window=>window.url().endsWith('/tray.html'));
   const opened=warm?Promise.resolve(warm):f.app.waitForEvent('window');
   await f.page.evaluate(()=>window.clipper.showTray());const panel=await opened;
   await panel.waitForSelector('.tray-row');await panel.locator('.tray-row').filter({hasText:value}).click({button:'right'});
   await expect.poll(foreground).toBe(hwnd);
   assert.equal(await f.helper.evaluate(({clipboard})=>clipboard.readText()),value);
   if(selector==='#input')await expect(page.locator(selector)).toHaveValue(value);
   else await expect(page.locator(selector)).toHaveText(value);
  }
  await page.locator('#editor').evaluate(element=>element.replaceChildren());
  await page.locator('#editor').click();assert.equal(await activate(hwnd),true);await expect.poll(foreground).toBe(hwnd);
  const warm=f.app.windows().find(window=>window.url().endsWith('/tray.html'));
  const opened=warm?Promise.resolve(warm):f.app.waitForEvent('window');
  await f.page.evaluate(()=>window.clipper.showTray());const panel=await opened;
  await panel.waitForSelector('.tray-row');await panel.locator('.tray-row').filter({hasText:richValue}).click({button:'right'});
  await expect.poll(foreground).toBe(hwnd);await expect(page.locator('#editor')).toHaveText(richValue);
  const styles=await page.locator('#editor').evaluate(element=>[...element.querySelectorAll('*')].map(node=>({color:getComputedStyle(node).color,weight:getComputedStyle(node).fontWeight,size:getComputedStyle(node).fontSize,html:node.outerHTML})));
  assert.ok(styles.some(style=>style.color==='rgb(215, 38, 61)'&&Number(style.weight)>=700&&style.size==='24px'),JSON.stringify(styles));
  await page.screenshot({path:path.join(f.output,'edge-paste.png')});
  console.log(JSON.stringify({result:'PASS',packaged:!!process.env.CLIPPER_PACKAGED_EXE,edgeTextarea:true,edgeContenteditable:true,edgeRich:true,foregroundRestored:true}));
 }finally{
  if(browser)await browser.close();
  await f.close();
 }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
