const {app,BrowserWindow,protocol,nativeImage,dialog}=require('electron'),path=require('node:path');
app.setPath('userData',path.resolve('work/confirm-029/private-profile'));
protocol.registerSchemesAsPrivileged([{scheme:'clipper',privileges:{standard:true,secure:true}},{scheme:'clipper-font',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
// Keep every test surface hidden and suppress native activation by production services.
app.on('browser-window-created',(_event,w)=>{w.show=()=>{};w.focus=()=>{};});
app.on('window-all-closed',()=>app.quit());
dialog.showMessageBox=()=>{throw Error('A native confirmation must not be used');};
app.whenReady().then(async()=>{
 const api=require('../work/confirm-029/services.cjs');global.confirmAPI=api;
 await new api.AppearanceService(path.join(app.getPath('userData'),'appearance.json')).init();
 const image=nativeImage.createFromBitmap(Buffer.alloc(320*200*4,180),{width:320,height:200}).toPNG().toString('base64');
 const item={id:'fixture',hash:'original',title:'Image fixture',payload:{png:image}};global.commits=[];
 const editor=new api.ImageEditorService({blocked:()=>false,dark:()=>false,get:()=>item,protect:()=>{},background:task=>task,commit:async(...args)=>{global.commits.push(args.slice(0,4));return 'saved-copy';}});
 global.fixtureEditor=editor;await editor.open(item.id);global.fixtureWindow=editor.window;global.keepAlive=new BrowserWindow({width:100,height:100,show:false,webPreferences:{sandbox:true,offscreen:true}});console.log('HOST_READY');
}).catch(error=>{require('node:fs').writeFileSync(path.resolve('work/confirm-029/host-error.txt'),String(error.stack||error));app.exit(1);});
