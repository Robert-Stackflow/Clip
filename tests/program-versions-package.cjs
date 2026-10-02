const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const asar=require('@electron/asar');
const root=path.resolve(process.env.CLIPPER_CHECKPOINT_PACKAGE||'../delivery-0.26.0/release/0.26.0/win-unpacked');
const archive=path.join(root,'resources/app.asar'),version=JSON.parse(fs.readFileSync('package.json')).version;
const buildRoot=path.resolve(process.env.CLIPPER_CHECKPOINT_BUILD||'../delivery-0.26.0');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function files(folder,prefix=''){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(path.join(folder,item.name),prefix+item.name+'/'):[prefix+item.name]);}
for(const folder of ['src','build','assets','build/installer-ui','scripts'])for(const file of files(folder))assert(fs.readFileSync(path.join(folder,file)).equals(fs.readFileSync(path.join(buildRoot,folder,file))),folder+'/'+file);
const expected=files(path.join(buildRoot,'dist')),normalized=[],nativeRebuilt=[];
assert.deepEqual(expected,files('dist'));
for(const file of expected){const built=fs.readFileSync(path.join(buildRoot,'dist',file)),development=fs.readFileSync(path.join('dist',file));
 if(!built.equals(development)&&file.startsWith('native/')&&file.endsWith('.exe'))nativeRebuilt.push(file);
 else if(!built.equals(development)){assert(/\.(?:cjs|js|map|css)$/.test(file),file);
  if(file.endsWith('.map')){const a=JSON.parse(built),b=JSON.parse(development);b.sources=b.sources.map(s=>s.replace(/^(?:\.\.\/)+delivery-0\.23\.0\/node_modules\//,'../../node_modules/'));delete a.mappings;delete b.mappings;assert.deepEqual(a,b,file);}
  else assert.equal(built.toString('utf8'),development.toString('utf8').replaceAll('../delivery-0.23.0/node_modules/','node_modules/'),file);normalized.push(file);}
 assert.equal(hash(asar.extractFile(archive,('dist/'+file).replaceAll('/','\\'))),hash(built),file);
}
assert.equal(JSON.parse(asar.extractFile(archive,'package.json')).version,version);
for(const file of ['SelectionHost.exe','AttachmentHost.exe','UpdateHost.exe','RollbackHost.exe'])assert.equal(hash(fs.readFileSync(path.join(root,'resources/app.asar.unpacked/dist/native',file))),hash(fs.readFileSync(path.join(buildRoot,'dist/native',file))),file);
const evidence=path.resolve('work/checkpoints/package');fs.mkdirSync(evidence,{recursive:true});
const helper=path.join(evidence,'runtime.cjs');
fs.writeFileSync(helper,`const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module');
const archive=${JSON.stringify(archive)},evidence=${JSON.stringify(evidence)},exportsFile=${JSON.stringify(path.resolve('work/test-exports.cjs'))};
const fixtureModule=new Module(path.join(archive,'dist/main/checkpoint-fixture.cjs'));fixtureModule.filename=path.join(archive,'dist/main/checkpoint-fixture.cjs');fixtureModule.paths=Module._nodeModulePaths(path.dirname(fixtureModule.filename));fixtureModule._compile(fs.readFileSync(exportsFile,'utf8'),fixtureModule.filename);
const {StorageManager,CheckpointRecovery,HistoryVault,recoveryJob}=fixtureModule.exports;
(async()=>{const root=await fsp.mkdtemp(path.join(evidence,'isolated-'));
const old=new StorageManager(root,undefined,'0.24.0');const original=await old.start();original.add({text:'PACKAGED_CHECKPOINT_PRIVATE_MARKER'},'fixture');const prepared=await old.prepareEncryption('packaged checkpoint fixture password');const encrypted=await old.encrypt(prepared.token,prepared.recoveryKey);encrypted.close();old.vault.lock();
const next=new StorageManager(root);const current=await next.start({value:'packaged checkpoint fixture password',mode:'password'});const points=await next.checkpoints.list(next.profileId);assert.equal(points.length,1);assert.equal(points[0].encrypted,true);assert.equal(points[0].reason,'upgrade');assert.equal(points[0].sourceVersion,'0.24.0');assert.equal(points[0].targetVersion,${JSON.stringify(version)});
const point=await next.checkpoints.verify(points[0].id,next.profileId);assert.equal(fs.readFileSync(path.join(point.directory,'history.sqlite')).includes(Buffer.from('PACKAGED_CHECKPOINT_PRIVATE_MARKER')),false);
const service=new CheckpointRecovery(next),choice=await service.choose(point.value.id);const preview=await service.preview(choice.token,prepared.recoveryKey,undefined,'recovery');assert.equal(preview.clips,1);const restored=await service.commit(choice.token);assert.equal(restored.get(restored.list()[0].id).payload.text,'PACKAGED_CHECKPOINT_PRIVATE_MARKER');assert.equal(restored.settings.paused,true);assert.throws(()=>current.list());restored.close();next.vault.lock();
assert.equal(fs.readFileSync(path.join(next.directory,'history.sqlite')).includes(Buffer.from('PACKAGED_CHECKPOINT_PRIVATE_MARKER')),false);const vault=new HistoryVault();await vault.load(next.directory);await vault.unlock('packaged checkpoint fixture password','password');vault.lock();await next.checkpoints.verify(point.value.id,next.profileId);
const plainRoot=await fsp.mkdtemp(path.join(evidence,'plain-')),plain=new StorageManager(plainRoot);const plainStore=await plain.start();plainStore.add({text:'English 中文'},'fixture');const manual=await plain.checkpoint();assert.equal(manual.encrypted,false);await plain.checkpoints.verify(manual.id,plain.profileId);plainStore.close();const programContext=fixtureModule.exports.programVersionContext(plainRoot,'0.26.0');assert.equal(await programContext.installed(),false);assert.deepEqual(await programContext.list(),[]);await assert.rejects(()=>programContext.inspect(require('node:crypto').randomUUID()),/旧程序归档/);assert.equal(fs.existsSync(path.join(path.dirname(process.execPath),'resources/app.asar.unpacked/dist/native/rollback.log')),false);const koffi=require(path.join(archive,'node_modules/koffi'));assert.equal(typeof koffi.load,'function');
console.log(JSON.stringify({passed:true,electron:process.versions.electron,sqlite:true,nativeBridge:true,packagedWorkerPath:path.join(archive,'dist/main/recovery-worker.cjs'),plainSnapshot:true,encryptedUpgradeSnapshot:true,originalRecoveryKey:true,encryptedIndependentRestore:true,originalAndPointPreserved:true,clipboardAccess:false,inputAccess:false,coreFixture:'Production core exports compiled with packaged dependency and worker paths; application main/UI startup not exercised'}));
})().catch(error=>{console.error(error);process.exitCode=1;});`);
const output=execFileSync(path.join(root,'Clipper.exe'),[helper],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,encoding:'utf8',timeout:60000});
const runtime=JSON.parse(output.trim());
const result={passed:true,version,builtFilesVerified:expected.length,sourceMatchesBuild:true,developmentEquivalent:true,dependencyPathNormalization:normalized,nativeRebuiltFromIdenticalSource:nativeRebuilt,asarSHA256:hash(fs.readFileSync(archive)),runtime};
fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
