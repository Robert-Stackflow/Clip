const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util'),{build}=require('esbuild');
(async()=>{
 const output=path.resolve(process.env.CLIP_TEST_OUTPUT_DIR||'work/current/quick-dismiss-electron');await fs.mkdir(output,{recursive:true});
 await build({entryPoints:['src/main/tray-panel.ts'],outfile:path.join(output,'panel.cjs'),bundle:true,platform:'node',target:'node22',external:['electron','./native','better-sqlite3-multiple-ciphers','koffi']});
 const host=path.join(output,'host.cjs');await fs.writeFile(host,`
 const {app,BrowserWindow,screen}=require('electron'),{Module}=require('node:module'),assert=require('node:assert/strict');
 let pressed=false,focused=true,popup=false,point={x:100,y:100};const visible=new Set(),load=Module._load;
 Module._load=function(name,...args){if(name==='./native')return {mouseButtons:()=>({left:pressed}),foregroundBelongsTo:()=>focused,activateNativeWindow:()=>true};return load.call(this,name,...args);};
 BrowserWindow.prototype.showInactive=BrowserWindow.prototype.show=function(){visible.add(this.id);};BrowserWindow.prototype.focus=function(){};BrowserWindow.prototype.isFocused=function(){return focused&&!popup;};BrowserWindow.prototype.isVisible=function(){return visible.has(this.id);};BrowserWindow.prototype.hide=function(){visible.delete(this.id);this.emit('hide');};BrowserWindow.prototype.loadURL=function(){setImmediate(()=>this.emit('ready-to-show'));return Promise.resolve();};
 app.whenReady().then(async()=>{
  screen.getCursorScreenPoint=()=>point;const area={x:0,y:0,width:1600,height:1000};screen.getDisplayNearestPoint=()=>({workArea:area});
  const {TrayPanel}=require('./panel.cjs'),panel=new TrayPanel({store:()=>({}),blocked:()=>false,dark:()=>false,target:()=>undefined},'quick');
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),bounds={x:100,y:100,width:400,height:560},outside={x:20,y:20};
  const open=async()=>{pressed=false;focused=true;popup=false;point={x:150,y:150};panel.open(undefined,{bounds});await pause(30);assert(panel.window.isVisible());};
  await open();point=outside;pressed=true;panel.window.emit('blur');assert(!panel.window.isVisible(),'An explicit outside click dismisses even during startup grace and when foreground focus is unchanged');
  pressed=true;focused=false;point=outside;panel.open(undefined,{bounds});await pause(120);assert(panel.window.isVisible(),'The held opening click does not dismiss the panel');pressed=false;await pause(60);pressed=true;await pause(70);assert(!panel.window.isVisible(),'A second outside click dismisses without initial activation');
  await open();pressed=true;await pause(70);assert(panel.window.isVisible(),'Clicks inside remain usable');pressed=false;await pause(60);
  popup=true;point=outside;pressed=true;panel.window.emit('blur');assert(panel.window.isVisible(),'Owned native popup focus is preserved');pressed=false;popup=false;await pause(60);
  panel.busy=true;focused=false;pressed=true;panel.window.emit('blur');assert(panel.window.isVisible(),'An in-flight paste keeps its target valid');pressed=false;panel.busy=false;await pause(70);assert(!panel.window.isVisible(),'Pending dismissal completes once the paste settles');
  await open();const preview=new BrowserWindow({x:530,y:100,width:200,height:300,show:false});preview.show();panel.hoverPreview.window=preview;point={x:550,y:150};pressed=true;focused=false;panel.window.emit('blur');assert(panel.window.isVisible(),'The preview belongs to the interactive panel surface');
  pressed=false;await pause(60);point=outside;pressed=true;panel.window.emit('blur');assert(!panel.window.isVisible());assert(preview.isDestroyed(),'Dismissal closes the preview too');
  panel.dispose();app.quit();
 }).catch(error=>{console.error(error);app.exit(1);});
 `);
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;await promisify(execFile)(require('electron'),[host],{cwd:path.resolve('.'),windowsHide:true,env,timeout:20000});
 const result={passed:true,hiddenNativeWindows:true,desktopInput:false,checks:['outside click','startup click','refused activation','inside click','owned popup','in-flight paste','companion preview']};await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(error=>{console.error(error);process.exitCode=1;});
