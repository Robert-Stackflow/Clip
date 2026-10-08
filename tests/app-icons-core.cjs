const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){let scanned=0,calls=[],active;const database=(clips,saved=[])=>({sourceApplications:()=>clips,list:()=>{throw Error('Icon lookup must not read full history');},meta:()=>saved,setMeta:(_key,value)=>{saved=value;}}),module={exports:{}};active=database(['Code.exe','Missing.exe','One.exe'],[['code.exe','C:\\Apps\\Code.exe'],['one.exe','\\\\remote\\One.exe'],['bad.exe','C:\\Apps\\different.exe']]);const native={runningApplications:()=>{scanned++;return [{name:'One.exe',executable:'D:\\Apps\\One.exe'},{name:'Missing.exe',executable:'\\\\remote\\Missing.exe'},{name:'Secret.exe',executable:'C:\\Secret.exe'}];}},electron={app:{getFileIcon:async file=>{calls.push(file);return {toPNG:()=>Buffer.from('small-icon'),isEmpty:()=>false};}}};vm.runInNewContext(fs.readFileSync('work/test-app-icons.cjs','utf8'),{module,exports:module.exports,process:{platform:'linux'},require:name=>name==='electron'?electron:name==='./native'?native:require(name),Buffer,console});return {service:new module.exports.AppIcons(()=>active),calls,scanned:()=>scanned,database,change:store=>active=store};}
test('Application icons accept only observed local executables belonging to current history',async()=>{const f=fixture(),icons=await f.service.get(['CODE.exe','One.exe','Missing.exe','C:\\private.txt','Secret.exe']);assert(icons['code.exe'].startsWith('data:image/png;base64,'));assert(icons['one.exe'].startsWith('data:image/png;base64,'));assert.equal(icons['missing.exe'],null);assert(!('c:\\private.txt'in icons)&&!('secret.exe'in icons));assert.deepEqual(f.calls,['C:\\Apps\\Code.exe','D:\\Apps\\One.exe']);assert.equal(f.scanned(),1);await assert.rejects(f.service.get(Array(65).fill('Code.exe')));await assert.rejects(f.service.get([{}]));});
test('Application icon requests reuse the cache and discard it when history store changes',async()=>{const f=fixture();await f.service.get(['Code.exe']);await f.service.get(['CODE.exe']);assert.equal(f.calls.length,1);f.change(f.database(['Code.exe'],[['code.exe','D:\\Alternate\\Code.exe']]));await f.service.get(['Code.exe']);assert.deepEqual(f.calls,['C:\\Apps\\Code.exe','D:\\Alternate\\Code.exe']);f.change(f.database([]));assert.deepEqual(Object.keys(await f.service.get(['Code.exe'])),[]);});

function windowsFixture(fail=false){
 const names=Array.from({length:10},(_,i)=>'App'+i+'.exe'),png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(128,16);png.writeUInt32BE(128,20);
 let active=0,peak=0,shell=0;const requests=[],execute=()=>{};execute[require('node:util').promisify.custom]=async(file,args,options)=>{requests.push({file,args,options});peak=Math.max(peak,++active);await new Promise(resolve=>setImmediate(resolve));active--;if(fail)throw Error('No embedded icon');return {stdout:png};};
 const store={sourceApplications:()=>names,meta:()=>names.map(name=>[name.toLowerCase(),'D:\\Apps\\'+name]),setMeta:()=>{}},module={exports:{}};
 vm.runInNewContext(fs.readFileSync('work/test-app-icons.cjs','utf8'),{module,exports:module.exports,Buffer,console,__dirname:'D:\\Clip\\dist\\main',process:{platform:'win32'},require:name=>name==='electron'?{app:{isPackaged:false,getFileIcon:async()=>{shell++;return {toPNG:()=>Buffer.from('fallback'),isEmpty:()=>false};}}}:name==='./native'?{runningApplications:()=>[]}:name==='node:child_process'?{execFile:execute}:require(name)});
 return {service:new module.exports.AppIcons(()=>store),names,requests,peak:()=>peak,shell:()=>shell};
}
test('Windows icons bypass the generic Shell cache and bound concurrent resource extraction',async()=>{
 const f=windowsFixture(),result=await f.service.get([...f.names,'D:\\Private\\Secret.exe']);assert.equal(Object.keys(result).length,10);assert.equal(f.shell(),0);assert.equal(f.peak(),4);assert.equal(f.requests.length,10);assert(f.requests.every(call=>call.file==='D:\\Clip\\dist\\native\\SourceHost.exe'&&call.args[0]==='icon'&&call.options.windowsHide));
 const png=Buffer.from(result['app0.exe'].split(',')[1],'base64');assert.equal(png.readUInt32BE(16),128);assert.equal(png.readUInt32BE(20),128);await f.service.get(f.names);assert.equal(f.requests.length,10);
});
test('Programs without embedded icons retain a usable Shell fallback',async()=>{
 const f=windowsFixture(true),result=await f.service.get(['App0.exe']);assert.equal(f.requests.length,1);assert.equal(f.shell(),1);assert.equal(Buffer.from(result['app0.exe'].split(',')[1],'base64').toString(),'fallback');
});

test('Packaged ChatGPT icons refresh Store app paths and retry temporary failures instead of caching them forever',async()=>{
 let now=100000,failed=true,observed=[],saved=[['chatgpt.exe','C:\\Program Files\\WindowsApps\\OpenAI.Codex_old\\app\\ChatGPT.exe']];const requests=[],png=Buffer.alloc(24);
 Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(128,16);png.writeUInt32BE(128,20);
 const execute=()=>{};execute[require('node:util').promisify.custom]=async(file,args)=>{requests.push({file,args});if(failed)throw Error('Temporarily unavailable');return {stdout:png};};
 const store={sourceApplications:()=>['ChatGPT.exe'],meta:()=>saved,setMeta:(_key,value)=>saved=value},module={exports:{}};
 vm.runInNewContext(fs.readFileSync('work/test-app-icons.cjs','utf8'),{module,exports:module.exports,Buffer,console,Date:class extends Date{static now(){return now;}},process:{platform:'win32',resourcesPath:'D:\\Program Files\\Clip\\resources'},require:name=>name==='electron'?{app:{isPackaged:true,getFileIcon:async()=>({isEmpty:()=>true})}}:name==='./native'?{runningApplications:()=>observed}:name==='node:child_process'?{execFile:execute}:require(name)});
 const service=new module.exports.AppIcons(()=>store);assert.equal((await service.get(['ChatGPT.exe']))['chatgpt.exe'],null);
 failed=false;now+=9000;assert.equal((await service.get(['ChatGPT.exe']))['chatgpt.exe'],null);assert.equal(requests.length,1);
 now+=2000;assert((await service.get(['ChatGPT.exe']))['chatgpt.exe']);assert.equal(requests.length,2);
 now+=30000;const current='C:\\Program Files\\WindowsApps\\OpenAI.Codex_new\\app\\ChatGPT.exe';observed=[{name:'ChatGPT.exe',executable:current}];
 assert((await service.get(['ChatGPT.exe']))['chatgpt.exe']);assert.equal(requests[2].args[1],current);
 assert.equal(requests[2].file,'D:\\Program Files\\Clip\\resources\\app.asar.unpacked\\dist\\native\\SourceHost.exe');assert.equal(saved[0][1],current);
});

test('Cached app artwork survives a restart and a removed Store version directory without exposing arbitrary paths',async()=>{
 const root=await require('./generated-fixtures.cjs').mkdtemp(require('node:path').resolve('work/icon-cache-')),file=require('node:path').join(root,'ChatGPT.exe'),directory=require('node:path').join(root,'icons');fs.writeFileSync(file,'observed executable fixture');
 const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(128,16);png.writeUInt32BE(128,20);
 let requests=0;const execute=()=>{};execute[require('node:util').promisify.custom]=async()=>{requests++;return {stdout:png};};
 const store={sourceApplications:()=>['ChatGPT.exe'],meta:()=>[['chatgpt.exe',file]],setMeta:()=>{}},module={exports:{}};
 vm.runInNewContext(fs.readFileSync('work/test-app-icons.cjs','utf8'),{module,exports:module.exports,Buffer,console,__dirname:root,process:{platform:'win32',env:{}},require:name=>name==='electron'?{app:{isPackaged:false,getFileIcon:async()=>{throw Error('Unexpected generic Shell fallback');}}}:name==='./native'?{runningApplications:()=>[]}:name==='node:child_process'?{execFile:execute}:require(name)});
 const first=await new module.exports.AppIcons(()=>store,directory).get(['ChatGPT.exe']);assert(first['chatgpt.exe']);assert.equal(requests,1);fs.unlinkSync(file);
 const second=await new module.exports.AppIcons(()=>store,directory).get(['ChatGPT.exe','C:\\private.txt']);assert.equal(second['chatgpt.exe'],first['chatgpt.exe']);assert.equal(requests,1);assert.equal(Object.keys(second).length,1);
});
