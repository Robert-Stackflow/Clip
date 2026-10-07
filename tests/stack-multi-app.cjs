const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {fixture}=require('./efficiency-fixture.cjs');

function edgeWindow(title){
 const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-Process -Name msedge -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like '*"+title+"*' } | Select-Object -First 1 Id,MainWindowHandle | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true}).trim();
 return output?JSON.parse(output):undefined;
}

async function run(){
 const f=await fixture('stack-multi-app');let browser;
 const title='ClipperStack-'+randomUUID();
 const foreground=()=>f.helper.evaluate(({app})=>{
  const req=process.getBuiltinModule('node:module').createRequire(process.getBuiltinModule('node:path').join(app.getAppPath(),'package.json'));
  return req('koffi').load('user32.dll').func('uintptr_t __stdcall GetForegroundWindow()')();
 });
 const activate=hwnd=>f.helper.evaluate(({app},hwnd)=>{
  const req=process.getBuiltinModule('node:module').createRequire(process.getBuiltinModule('node:path').join(app.getAppPath(),'package.json'));
  return req('koffi').load('user32.dll').func('bool __stdcall SetForegroundWindow(uintptr_t)')(hwnd);
 },hwnd);
 const state=()=>f.page.evaluate(()=>window.clipper.state());
 try{
  const first='堆栈第一项 '+randomUUID(),second='堆栈第二项 '+randomUUID();
  const ids=await f.page.evaluate(async values=>{
   const ids=[];for(const value of values){const id=await window.clipper.applyText({mode:'save',source:'脚本处理',text:value});await window.clipper.action(id,'enqueue');ids.push(id);}return ids;
  },[first,second]);
  assert.deepEqual((await state()).queue,ids);
  browser=await chromium.launch({channel:'msedge',headless:false});
  const context=await browser.newContext({viewport:{width:850,height:620}}),edge=await context.newPage();
  await edge.setContent(`<title>${title}</title><textarea id="input" style="width:500px;height:100px"></textarea>`);
  await expect.poll(()=>edgeWindow(title),{timeout:15000}).toEqual(expect.objectContaining({MainWindowHandle:expect.any(Number)}));
  const hwnd=edgeWindow(title).MainWindowHandle;

  // The physical queue shortcut pastes into an independent Electron text field.
  await f.focus();await f.key((await state()).settings.nextShortcut);
  await expect(f.target.locator('#target')).toHaveValue(first);
  assert.deepEqual((await state()).queue,[ids[1]]);

  // Ordinary Ctrl+V in Edge uses the current clipboard and must not consume the queue.
  await edge.bringToFront();await edge.locator('#input').click();
  assert.equal(await activate(hwnd),true);await expect.poll(foreground).toBe(hwnd);
  await f.key('Control+V');await expect(edge.locator('#input')).toHaveValue(first);
  assert.deepEqual((await state()).queue,[ids[1]]);

  // The queue shortcut now targets Edge and advances only after that paste succeeds.
  await edge.locator('#input').fill('');await edge.locator('#input').focus();
  assert.equal(await activate(hwnd),true);await expect.poll(foreground).toBe(hwnd);
  await f.key((await state()).settings.nextShortcut);
  await expect(edge.locator('#input')).toHaveValue(second);
  await expect.poll(async()=>(await state()).queue.length).toBe(0);
  assert.equal(await f.helper.evaluate(({clipboard})=>clipboard.readText()),second);

  // The main-window button must return to the last real target application.
  const third='堆栈按钮粘贴 '+randomUUID(),fourth='等待目标 '+randomUUID();
  const remaining=await f.page.evaluate(async values=>{
   const ids=[];for(const value of values){const id=await window.clipper.applyText({mode:'save',source:'脚本处理',text:value});await window.clipper.action(id,'enqueue');ids.push(id);}return ids;
  },[third,fourth]);
  await edge.locator('#input').fill('');await edge.locator('#input').focus();
  assert.equal(await activate(hwnd),true);await expect.poll(foreground).toBe(hwnd);
  await f.key((await state()).settings.shortcut);
  await f.page.locator('[data-page=stack]').click();await f.page.locator('#paste-next').click();
  await expect(edge.locator('#input')).toHaveValue(third);
  assert.deepEqual((await state()).queue,[remaining[1]]);

  // A normal history paste uses the same target check without consuming the queue.
  await edge.locator('#input').fill('');await edge.locator('#input').focus();
  assert.equal(await activate(hwnd),true);await expect.poll(foreground).toBe(hwnd);
  await f.page.evaluate(id=>window.clipper.copy(id,true),remaining[1]);
  await expect(edge.locator('#input')).toHaveValue(fourth);
  assert.deepEqual((await state()).queue,[remaining[1]]);

  // Once Edge closes, the remembered handle is stale: preserve queue and clipboard.
  const mainHandle=await f.app.evaluate(({BrowserWindow})=>{
   const main=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/index.html'));
   main.show();main.focus();return Number(main.getNativeWindowHandle().readBigUInt64LE());
  });
  await f.click('#search');
  await f.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/index.html')).setAlwaysOnTop(false));
  await expect.poll(foreground).toBe(mainHandle);
  await browser.close();browser=undefined;
  const failure=await f.page.evaluate(async()=>{
   try{await window.clipper.next();return '';}catch(error){return String(error.message);}
  });
  assert.match(failure,/请先切换到需要粘贴的应用/);
  assert.deepEqual((await state()).queue,[remaining[1]]);
  await assert.rejects(f.page.evaluate(id=>window.clipper.copy(id,true),remaining[1]),/请先切换到需要粘贴的应用/);
  assert.deepEqual((await state()).queue,[remaining[1]]);
  assert.equal(await f.helper.evaluate(({clipboard})=>clipboard.readText()),fourth);
  console.log(JSON.stringify({result:'PASS',packaged:!!process.env.CLIPPER_PACKAGED_EXE,firstApp:'Electron helper',secondApp:'Microsoft Edge',normalPastePreservesQueue:true,queueConsumedInOrder:true,mainButtonPastes:true,historyPasteChecksTarget:true,staleTargetRejected:true}));
 }finally{
  if(browser)await browser.close();
  await f.close();
 }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
