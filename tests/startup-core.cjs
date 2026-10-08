const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {Store,StorageManager,startupDatabaseInfo,inspectDatabase,configureLoginItem,isLoginStartup,manualLaunchArguments,LOGIN_ITEM_NAME,LOGIN_STARTUP_ARGUMENT}=require('../work/test-exports.cjs');
const generated=require('./generated-fixtures.cjs'),folder=()=>generated.mkdtemp(path.resolve('work/startup-'));

test('Login startup uses the current executable, a stable entry and a tray-only argument',()=>{
 const calls=[],app={setLoginItemSettings:value=>calls.push(value)},file='D:\\Program Files\\Clip\\Clip.exe';
 configureLoginItem(app,true,file);configureLoginItem(app,false,file);
 assert.deepEqual(calls,[{name:LOGIN_ITEM_NAME,path:file,args:[LOGIN_STARTUP_ARGUMENT],openAtLogin:true,enabled:true},{name:LOGIN_ITEM_NAME,path:file,args:[LOGIN_STARTUP_ARGUMENT],openAtLogin:false,enabled:false}]);
 assert.equal(isLoginStartup([file,'--startup']),true);assert.equal(isLoginStartup([file,'--startup-extra']),false);
 assert.deepEqual(manualLaunchArguments(['app','--startup','clip://open']),['app','clip://open']);
});

test('Startup checks profile ownership, primary table structure and future schema before writing',async()=>{
 const root=await folder(),file=path.join(root,'history.sqlite'),store=new Store(file),id=require('node:crypto').randomUUID();
 store.setMeta('profile-id',id);store.setMeta('application-version','0.50.19');store.close();
 assert.equal(startupDatabaseInfo(file,undefined,id).profileId,id);
 assert.throws(()=>startupDatabaseInfo(file,undefined,require('node:crypto').randomUUID()),/不属于/);
 const changed=new Store(file,false);changed.db.exec('PRAGMA user_version=8');changed.close();
 assert.throws(()=>startupDatabaseInfo(file),/较新版本/);
 const d=new (require('node:sqlite').DatabaseSync)(file);d.exec('PRAGMA user_version=7;DROP TABLE snippets;');d.close();
 assert.throws(()=>startupDatabaseInfo(file));
});

test('Same-version startup reads compact metadata; imports and upgrades retain full content validation',async()=>{
 const root=await folder(),file=path.join(root,'history.sqlite'),store=new Store(file),version=require('../package.json').version,id=require('node:crypto').randomUUID();
 store.setMeta('profile-id',id);store.setMeta('application-version',version);
 for(let i=0;i<24;i++)store.add({text:`startup-${i}-`+'x'.repeat(900000)},'fixture',undefined,undefined,false);
 store.close();
 await fs.writeFile(path.join(root,'storage-location.json'),JSON.stringify({version:1,profileId:id,directory:root,previousDirectory:'',encrypted:false}));
 const full=performance.now();assert.equal(inspectDatabase(file).clips,24);const fullMs=performance.now()-full;
 const compact=performance.now();assert.equal(startupDatabaseInfo(file,undefined,id).schema,7);const compactMs=performance.now()-compact;
 const begin=performance.now(),manager=new StorageManager(root,undefined,version),opened=await manager.start(),startMs=performance.now()-begin;
 assert.equal(opened.list().length,24);opened.close();
 assert(compactMs<fullMs/4,`Compact ${compactMs.toFixed(1)}ms; full ${fullMs.toFixed(1)}ms`);
 console.log(JSON.stringify({startupBenchmark:{bytes:24*900000,fullMs:Math.round(fullMs),compactMs:Math.round(compactMs),startMs:Math.round(startMs)}}));
 const corrupt=new Store(file,false);corrupt.db.exec('DROP TRIGGER clip_list_update;DROP TRIGGER clip_preview_update;');corrupt.db.prepare('UPDATE clips SET data=? WHERE id=(SELECT id FROM clips LIMIT 1)').run('{broken');corrupt.close();
 await assert.rejects(new StorageManager(root,undefined,'999.0.0').start());
});
