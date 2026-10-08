const {app,nativeImage}=require('electron'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const output=path.resolve('work/current/collection-settings'),{AppIcons,initNative,runningApplications}=require('../work/test-app-icons-native.cjs');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');app.setPath('userData',path.join(output,'native-icon-profile'));
app.whenReady().then(async()=>{
 initNative();assert(Array.isArray(runningApplications()));
 const store={sourceApplications:()=>['Electron.exe','Missing.exe'],meta:()=>[['electron.exe',process.execPath]],setMeta:()=>{}},service=new AppIcons(()=>store);
 const result=await service.get(['Electron.exe','Missing.exe','C:\\private.txt']);assert(result['electron.exe'].startsWith('data:image/png;base64,'));
 const image=Buffer.from(result['electron.exe'].split(',')[1],'base64');assert.deepEqual([...image.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 assert.deepEqual(nativeImage.createFromBuffer(image).getSize(),{width:128,height:128});assert.equal(image.readUInt32BE(16),128);assert.equal(image.readUInt32BE(20),128);
 assert.equal(result['missing.exe'],null);assert.equal(Object.keys(result).length,2);
 // Use the installed-style resource location and the actual Store app executable.
 // An obsolete observation must be replaced even though it already has a path.
 let packagedChatGPT=false;const observed=runningApplications().find(info=>info.name.toLowerCase()==='chatgpt.exe');
 if(observed){
  let resources=path.resolve('release',require('../package.json').version,'win-unpacked','resources');
  if(!fs.existsSync(path.join(resources,'app.asar.unpacked/dist/native/SourceHost.exe'))){resources=path.join(output,'icon-resources');const helper=path.join(resources,'app.asar.unpacked/dist/native/SourceHost.exe');fs.mkdirSync(path.dirname(helper),{recursive:true});fs.copyFileSync(path.resolve('dist/native/SourceHost.exe'),helper);}
  const descriptor=Object.getOwnPropertyDescriptor(app,'isPackaged'),resourceDescriptor=Object.getOwnPropertyDescriptor(process,'resourcesPath');
  try{
   Object.defineProperty(app,'isPackaged',{value:true,configurable:true});Object.defineProperty(process,'resourcesPath',{value:resources,configurable:true});
   let saved=[['chatgpt.exe','C:\\Program Files\\WindowsApps\\OpenAI.Codex_old\\app\\ChatGPT.exe']];
   // Keep one store identity across requests, just like production.
   const allowed={sourceApplications:()=>['ChatGPT.exe'],meta:()=>saved,setMeta:(_key,value)=>saved=value},lookup=new AppIcons(()=>allowed);
   const icons=await lookup.get(['ChatGPT.exe']),bytes=Buffer.from(icons['chatgpt.exe'].split(',')[1],'base64');
   assert.deepEqual(nativeImage.createFromBuffer(bytes).getSize(),{width:128,height:128});assert.equal(saved[0][1],observed.executable);packagedChatGPT=true;
  }finally{
   if(descriptor)Object.defineProperty(app,'isPackaged',descriptor);else delete app.isPackaged;
   Object.defineProperty(process,'resourcesPath',resourceDescriptor);
  }
 }
 fs.writeFileSync(path.join(output,'native-icons.json'),JSON.stringify({passed:true,iconBytes:image.length,pixels:128,packagedChatGPT,cases:packagedChatGPT?5:4,scope:'Actual Electron native executable icon retrieval with production AppIcons and read-only Windows application discovery; synthetic allowed metadata, no UI windows, capture or physical input.'},null,2));
 console.log(JSON.stringify({passed:true,iconBytes:image.length,pixels:128,packagedChatGPT}));app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
