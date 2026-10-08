const generated=require('./generated-fixtures.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createHash}=require('node:crypto');
const {parseExternalUrl,validateBackup,encodeBackup,decodeBackup,isEncryptedBackup,LOGIN_ITEM_NAME}=require('../work/test-exports.cjs');

async function bootstrap(directory,env,packaged=true){
 const paths={appData:path.join(directory,'Roaming')},state={paths};
 const app={isPackaged:packaged,getAppPath:()=>directory,setName:name=>state.name=name,getPath:name=>paths[name],setPath:(name,value)=>paths[name]=value,setAppLogsPath:value=>state.logs=value,getPreferredSystemLanguages:()=>['en']};
 const module={exports:{}};
 vm.runInNewContext(await fs.readFile('work/test-language-bootstrap.cjs','utf8'),{module,exports:module.exports,require:name=>name==='electron'?{app}:require(name),process:{env,argv:[]},Buffer,URL,console});
 return state;
}
test('Clip isolates production, development, session, logs and crash files without reading old environment overrides',async()=>{
 const directory=await generated.mkdtemp(path.resolve('work/identity-'));
 const old=path.join(directory,'Clipper');await fs.mkdir(old);await fs.writeFile(path.join(old,'language.json'),JSON.stringify({version:1,choice:'en'}));
 const env={CLIPPER_TEST_MODE:'1',CLIPPER_DATA_DIR:old,CLIP_DEVELOPMENT:'1'},production=await bootstrap(directory,env);
 assert.equal(production.name,'Clip');assert.equal(production.paths.userData,path.join(directory,'Roaming','Clip'));assert.equal(env.CLIP_UI_LANGUAGE,'zh-CN');
 for(const name of ['sessionData','crashDumps'])assert.equal(path.dirname(production.paths[name]),production.paths.userData);
 assert.equal(path.dirname(production.logs),production.paths.userData);
 const devEnv={CLIP_DEVELOPMENT:'1'},development=await bootstrap(directory,devEnv,false);
 assert.equal(development.paths.userData,path.join(directory,'work','Clip','dev-profile'));
 await assert.rejects(()=>bootstrap(directory,{CLIP_DEVELOPMENT:'1',CLIP_DEV_DATA_DIR:old},false),/Development profile must remain inside/);
 assert.equal((await fs.readFile(path.join(old,'language.json'),'utf8')).includes('en'),true);
});
test('Clip URI and backups accept the current identity and reject older identities and versions',async()=>{
 assert.equal(parseExternalUrl('clip-win://open').action,'open');assert.throws(()=>parseExternalUrl('clipper-win://open'));
 const value={format:'clip-backup',version:7,clips:[],snippets:[{title:'Current',payload:{text:'hello'}}],categories:[],scripts:[],commands:[]};
 assert.equal(validateBackup(value).snippets[0].payload.text,'hello');
 assert.throws(()=>validateBackup({...value,format:'clipper-backup'}));
 for(const version of [1,2,3,4,5,6])assert.throws(()=>validateBackup({...value,version}));
 assert.throws(()=>validateBackup({...value,snippets:[{title:'Old template',text:'hello'}]}));
 const encoded=await encodeBackup(value,'Clip isolated password');assert.equal(isEncryptedBackup(encoded),true);assert.deepEqual(await decodeBackup(encoded,'Clip isolated password'),value);
 const old=Buffer.concat([Buffer.from('CLIPPER-ENC\x01','binary'),encoded.subarray(9)]);assert.equal(isEncryptedBackup(old),false);await assert.rejects(()=>decodeBackup(old,'Clip isolated password'));
});
test('Windows installation, updater and login startup use the requested app identity',async()=>{
 const pkg=require('../package.json');assert.equal(pkg.build.appId,'com.cloudchewie.clip');assert.equal(LOGIN_ITEM_NAME,pkg.build.appId);assert.equal(pkg.build.productName,'Clip');
 const namespace=Buffer.from('50e065bc313411e69bab38c9862bdaf3','hex'),bytes=createHash('sha1').update(Buffer.concat([namespace,Buffer.from(pkg.build.appId)])).digest().subarray(0,16);
 bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;const hex=bytes.toString('hex'),guid=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
 for(const file of ['native/UpdateHost.cs','native/ProgramVersions.cs'])assert((await fs.readFile(file,'utf8')).includes(guid));
 assert((await fs.readFile('src/main/index.ts','utf8')).includes(`setAppUserModelId('${pkg.build.appId}')`));
});
