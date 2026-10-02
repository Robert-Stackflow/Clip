const {app,nativeImage}=require('electron'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const output=path.resolve('work/current/collection-settings'),{AppIcons,initNative,runningApplications}=require('../work/test-app-icons-native.cjs');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');app.setPath('userData',path.join(output,'native-icon-profile'));
app.whenReady().then(async()=>{
 initNative();assert(Array.isArray(runningApplications()));
 const store={sourceApplications:()=>['Electron.exe','Missing.exe'],meta:()=>[['electron.exe',process.execPath]],setMeta:()=>{}},service=new AppIcons(()=>store);
 const result=await service.get(['Electron.exe','Missing.exe','C:\\private.txt']);assert(result['electron.exe'].startsWith('data:image/png;base64,'));
 const image=Buffer.from(result['electron.exe'].split(',')[1],'base64');assert.deepEqual([...image.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 assert.deepEqual(nativeImage.createFromBuffer(image).getSize(),{width:32,height:32});assert.equal(image.readUInt32BE(16),32);assert.equal(image.readUInt32BE(20),32);
 assert.equal(result['missing.exe'],null);assert.equal(Object.keys(result).length,2);
 fs.writeFileSync(path.join(output,'native-icons.json'),JSON.stringify({passed:true,iconBytes:image.length,pixels:32,cases:4,scope:'Actual Electron native executable icon retrieval with production AppIcons and read-only Windows application discovery; synthetic allowed metadata, no UI windows, capture or physical input.'},null,2));
 console.log(JSON.stringify({passed:true,iconBytes:image.length,pixels:32}));app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
