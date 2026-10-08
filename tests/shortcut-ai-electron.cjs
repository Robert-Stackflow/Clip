const {_electron:electron,expect}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{build}=require('esbuild');
const {Store,defaults,desktopDefaults,efficiencyDefaults}=require('../work/test-exports.cjs');

(async()=>{
 const output=path.resolve('work/current/shortcut-ai-electron');await fs.mkdir(output,{recursive:true});const profile=await fs.mkdtemp(path.join(output,'profile-')),host=path.join(output,'host');await fs.mkdir(host,{recursive:true});
 // Keep real IPC, persistence, registration and clipboard code; replace only the external account backend.
 const runtime=path.resolve('src/main/codex-runtime.ts').replaceAll('\\','/');
 await build({entryPoints:['src/main/index.ts'],outfile:path.join(host,'main.cjs'),bundle:true,platform:'node',target:'node22',packages:'external',define:{__dirname:JSON.stringify(path.resolve('dist/main'))},plugins:[{name:'account-fixture',setup(builder){builder.onResolve({filter:/codex-provider$/},()=>({path:'codex-fixture',namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export {codexExecutables} from '${runtime}';export class CodexProvider {async status(){return {available:true,loggedIn:false,login:'pending',userCode:'TEST-2468',verificationUrl:'https://auth.openai.com/codex/device'};}async login(){return this.status();}async cancelLogin(){}async logout(){}async catalog(){return [{id:'fixture-model',name:'Fixture model'}];}async models(){return ['fixture-model'];}dispose(){}}`,loader:'ts',resolveDir:path.resolve('.')}));}}]});
 await fs.writeFile(path.join(host,'package.json'),JSON.stringify({name:'clip-test',version:'0.50.17',main:'main.cjs'}));
 const keys=['Control+Alt+Shift+F16','Control+Alt+Shift+F17','Control+Alt+Shift+F18','Control+Alt+Shift+F19','Control+Alt+Shift+F20','Control+Alt+Shift+F21'];
 const store=new Store(path.join(profile,'history.sqlite'));store.saveSettings({...defaults,paused:true,shortcut:keys[0],nextShortcut:keys[1]});store.setMeta('desktop-options',{...desktopDefaults,shelfShortcut:keys[4]});store.setMeta('efficiency',{...efficiencyDefaults,repliesShortcut:keys[5]});store.setMeta('quick-panel-shortcut',keys[2]);store.setMeta('ai-chat-options',{shortcut:keys[3],onTop:false,keepOpen:true});store.close();
 const env={...process.env,CLIP_TEST_MODE:'1',CLIP_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.CLIP_DEVELOPMENT;delete env.CLIP_DEV_DATA_DIR;delete env.CLIP_DEV_HIDDEN;
 let app,page,originalClipboard;const errors=[];const launch=async()=>{app=await electron.launch({args:[host],env});page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));await page.waitForSelector('#search');};
 const registered=()=>app.evaluate(({globalShortcut},keys)=>keys.map(key=>globalShortcut.isRegistered(key)),keys);
 const settings=async()=>{await page.locator('[data-page=settings]').click();await expect(page.locator('.settings-nav')).toBeVisible();await page.locator('.settings-nav').getByRole('button',{name:'快捷键',exact:true}).click();};
 try{
  await launch();await expect.poll(registered).toEqual(keys.map(()=>true));await settings();
  for(const id of ['shortcut','nextShortcut','quick-panel-shortcut','ai-chat-shortcut','desktop-shortcut','replies-shortcut']){const input=page.locator('#'+id);await input.locator('xpath=ancestor::span[contains(@class,"shortcut-field")]').getByRole('button',{name:'清除快捷键'}).click();await expect(input).toHaveAttribute('data-value','');}
  await expect.poll(registered).toEqual(keys.map(()=>false));
  await expect.poll(()=>page.evaluate(async()=>{const s=await clip.state(),d=await clip.desktopState(),e=await clip.efficiencyState();return [s.settings.shortcut,s.settings.nextShortcut,s.quickShortcut,s.chatShortcut,d.options.shelfShortcut,e.options.repliesShortcut,s.interceptWinV,s.hotkeyError];})).toEqual(['','','','','','',false,'']);
  await app.evaluate(async({clipboard,ClipboardItem})=>{global.clipTestClipboard=[];for(const item of await clipboard.read()){const data={};for(const type of item.types)data[type]=await item.getType(type);global.clipTestClipboard.push(new ClipboardItem(data));}});originalClipboard=true;
  try{await page.evaluate(()=>clip.codexCopyCode());assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()),'TEST-2468');}finally{await app.evaluate(async({clipboard})=>{if(clipboard.readText()==='TEST-2468')await clipboard.write(global.clipTestClipboard);delete global.clipTestClipboard;});originalClipboard=undefined;}
  assert.deepEqual(await page.evaluate(()=>clip.codexModels(crypto.randomUUID())),[{id:'fixture-model',name:'Fixture model'}]);
  const ids=await page.evaluate(async()=>{const make=name=>clip.aiProfile({name,kind:'codex',baseUrl:'codex://local',model:'',timeoutSeconds:90,maxTokens:2048,temperature:null,tokenField:'max_tokens'});return [await make('First'),await make('Second'),await make('Third')];});
  await page.evaluate(async ids=>{await clip.defaultAIProfile(ids[1]);await clip.reorderAIProfiles([ids[1],ids[2],ids[0]]);},ids);
  assert.deepEqual(await page.evaluate(async()=> (await clip.aiState()).profiles.map(p=>p.name)),['Second','Third','First']);
  await assert.rejects(page.evaluate(ids=>clip.reorderAIProfiles([ids[0],ids[0],ids[1]]),ids),/顺序/);
  await page.evaluate(async id=>{const p=(await clip.aiState()).profiles.find(p=>p.id===id);await clip.aiProfile({...p,name:'Edited'});},ids[2]);
  assert.deepEqual(await page.evaluate(async()=> (await clip.aiState()).profiles.map(p=>p.name)),['Second','Edited','First']);

  await app.close();app=undefined;await launch();await settings();await expect.poll(registered).toEqual(keys.map(()=>false));
  for(const id of ['shortcut','nextShortcut','quick-panel-shortcut','ai-chat-shortcut','desktop-shortcut','replies-shortcut'])await expect(page.locator('#'+id)).toHaveAttribute('data-value','');
  assert.deepEqual(await page.evaluate(async()=> (await clip.aiState()).profiles.map(p=>p.name)),['Second','Edited','First']);
  await page.screenshot({path:path.join(output,'cleared-shortcuts.png')});assert.deepEqual(errors,[]);console.log('PASS: actual shortcut removal and restart persistence, native authorization-code copy, draft model discovery and persisted AI order');
 }finally{if(app&&originalClipboard!==undefined)await app.evaluate(async({clipboard})=>{if(clipboard.readText()==='TEST-2468')await clipboard.write(global.clipTestClipboard);}).catch(()=>{});await app?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
