const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const asar=require('@electron/asar'),{execFileSync}=require('node:child_process');
const version=JSON.parse(fs.readFileSync('package.json','utf8')).version;const root=path.resolve(process.env.CLIP_LANGUAGE_PACKAGE||path.join('release',version,'win-unpacked'));
const archive=path.join(root,'resources/app.asar');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function files(folder,prefix=''){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(path.join(folder,item.name),prefix+item.name+'/'):[prefix+item.name]);}
// Dev may write source maps into dist after packaging; they are not release assets.
const expected=files('dist').filter(file=>!file.endsWith('.map'));
for(const file of expected)assert.equal(hash(asar.extractFile(archive,('dist/'+file).replaceAll('/','\\'))),hash(fs.readFileSync(path.join('dist',file))),file);
assert.equal(JSON.parse(asar.extractFile(archive,'package.json')).version,version);
for(const file of ['AttachmentHost.exe','UpdateHost.exe'])assert.equal(hash(fs.readFileSync(path.join(root,'resources/app.asar.unpacked/dist/native',file))),hash(fs.readFileSync(path.join('dist/native',file))),file);
const script=`const path=require('node:path');const archive=${JSON.stringify(archive)};const Database=require(path.join(archive,'node_modules/better-sqlite3-multiple-ciphers'));const db=new Database(':memory:');db.exec('CREATE TABLE language_test (value TEXT)');db.prepare('INSERT INTO language_test VALUES (?)').run('English 中文');if(db.prepare('SELECT value FROM language_test').get().value!=='English 中文')throw Error('Database roundtrip failed');db.close();const koffi=require(path.join(archive,'node_modules/koffi'));if(typeof koffi.load!=='function')throw Error('Native bridge missing');console.log(JSON.stringify({electron:process.versions.electron,sqlite:true,nativeBridge:true,clipboardAccess:false,inputAccess:false}));`;
const output=execFileSync(path.join(root,'Clip.exe'),['-e',script],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,encoding:'utf8',timeout:20000});
const runtime=JSON.parse(output.trim());
const result={passed:true,version,builtFilesVerified:expected.length,asarSHA256:hash(fs.readFileSync(archive)),runtime};
fs.mkdirSync('work/language-package',{recursive:true});fs.writeFileSync('work/language-package/results.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
