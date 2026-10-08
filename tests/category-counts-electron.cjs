const {_electron:electron,expect}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const {beginCase}=await import('../scripts/workspace.mjs'),work=await beginCase('category-counts-electron'),profile=path.join(work.fixtures,'profile'),host=path.join(work.fixtures,'host.cjs');await fs.mkdir(profile,{recursive:true});
 const env={...process.env,CLIP_TEST_MODE:'1',CLIP_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.CLIP_DEVELOPMENT;
 // Use the real main process and sandboxed preload while keeping native windows and shortcuts isolated.
 await fs.writeFile(host,`const {app,BrowserWindow,globalShortcut}=require('electron');app.setAppPath(${JSON.stringify(path.resolve('.'))});const visible=new Set();BrowserWindow.prototype.show=function(){visible.add(this.id);};BrowserWindow.prototype.showInactive=BrowserWindow.prototype.show;BrowserWindow.prototype.focus=function(){};BrowserWindow.prototype.isVisible=function(){return visible.has(this.id);};BrowserWindow.prototype.hide=function(){visible.delete(this.id);this.emit('hide');};const shortcuts=new Set();globalShortcut.register=(key)=>{shortcuts.add(key);return true;};globalShortcut.unregister=key=>shortcuts.delete(key);globalShortcut.unregisterAll=()=>shortcuts.clear();globalShortcut.isRegistered=key=>shortcuts.has(key);require(${JSON.stringify(path.resolve('dist/main/index.cjs'))});`);
 let application;const errors=[];
 try{
  application=await electron.launch({args:[host],env});const page=await application.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'});await page.waitForSelector('#search');await application.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows()){window.webContents.setBackgroundThrottling(false);window.show();window.emit('show');}});
  await page.evaluate(async()=>{const state=await clip.state();await clip.settings({...state.settings,paused:true});});
  const prefix='category-count-fixture-',ids=await page.evaluate(async prefix=>{
   const api=window.clip,rule={color:'#f59e0b',icon:'alarm-clock-check',kind:'text',contains:prefix,source:'',tag:''};
   const save=async value=>{await api.category(value);return (await api.state()).categories.find(category=>category.name===value.name).id;};
   const first=await api.applyText({mode:'save',source:'脚本处理',text:prefix+'parent '+prefix+'child'}),second=await api.applyText({mode:'save',source:'脚本处理',text:prefix+'child'}),parent=await save({...rule,name:'Parent',contains:prefix+'parent',allowChildren:true}),child=await save({...rule,name:'Child',parentId:parent,contains:prefix+'child'}),favorite=await save({...rule,name:'Favorites',favorite:true}),pinned=await save({...rule,name:'Pinned',pinned:true});return {first,second,parent,child,favorite,pinned};
  },prefix);
  const verify=async(favorite,pinned,all=2)=>{
   const counts=await page.evaluate(()=>window.clip.categoryCounts());assert.equal(counts[ids.parent],all);assert.equal(counts[ids.child],all);assert.equal(counts[ids.favorite],favorite);assert.equal(counts[ids.pinned],pinned);
   for(const id of[ids.parent,ids.child,ids.favorite,ids.pinned])await expect(page.locator(`[data-category="${id}"] small`)).toHaveText(String(counts[id]));
  };
  await verify(0,0);await page.evaluate(async id=>{await clip.action(id,'favorite');await clip.action(id,'pin');},ids.first);await verify(1,1);
  const original=await page.evaluate(async id=>{const item=await clip.detail(id);return {hash:item.hash,createdAt:item.createdAt};},ids.first);await page.evaluate(id=>clip.action(id,'delete'),ids.first);await verify(0,0,1);await page.evaluate(()=>clip.undo());await verify(1,1);assert.equal(await page.evaluate(async hash=>(await clip.state()).clips.find(item=>item.hash===hash).createdAt,original.hash),original.createdAt);
  const alignment=await page.evaluate(id=>{
   const measure=row=>{const r=row.getBoundingClientRect(),icon=row.querySelector('.category-mark')||row.querySelector('.icon'),name=row.querySelector('.category-name')||row.querySelector('span'),count=row.querySelector('small');return {height:r.height,iconWidth:icon.getBoundingClientRect().width,iconLeft:icon.getBoundingClientRect().left-r.left,nameLeft:name.getBoundingClientRect().left-r.left,countRight:r.right-count.getBoundingClientRect().right};};return {category:measure(document.querySelector(`[data-category="${id}"]`)),reference:measure(document.querySelector('.sidebar [data-page=replies]'))};
  },ids.parent);assert.deepEqual(alignment.category,alignment.reference);
  await page.locator(`[data-category="${ids.parent}"] [data-category-glyph=alarm-clock-check]`).waitFor({state:'attached'});await page.screenshot({path:path.join(work.output,'sidebar-counts.png')});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,counts:true,preloadAndMain:true,mutationRefresh:true,undoTimePreserved:true,sidebarAlignment:alignment.category,scope:'Real sandboxed application in an isolated profile; hidden windows, synthetic saved records, no clipboard writes.'}));
 }finally{await application?.close().catch(()=>{});await work.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
