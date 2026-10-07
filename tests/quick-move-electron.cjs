const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util'),{build}=require('esbuild');
(async()=>{
 const output=path.resolve(process.env.CLIPPER_TEST_OUTPUT_DIR||'work/quick-move-electron');await fs.mkdir(output,{recursive:true});
 await build({entryPoints:['src/main/tray-panel.ts'],outfile:path.join(output,'panel.cjs'),bundle:true,platform:'node',target:'node22',external:['electron','./native','better-sqlite3-multiple-ciphers','koffi']});
 const host=path.join(output,'host.cjs');await fs.writeFile(host,`
 const {app,BrowserWindow,screen}=require('electron'),{Module}=require('node:module'),fs=require('node:fs'),assert=require('node:assert/strict');
 const original=Module._load;let held=true,point={x:100,y:100};Module._load=function(name,...args){if(name==='./native')return {mouseButtons:()=>({left:held}),foregroundBelongsTo:()=>true,activateNativeWindow:()=>true};return original.call(this,name,...args);};
 app.commandLine.appendSwitch('force-device-scale-factor',process.argv[2]);
 app.whenReady().then(async()=>{
  screen.getCursorScreenPoint=()=>point;const {TrayPanel}=require('./panel.cjs'),panel=new TrayPanel({store:()=>({}),blocked:()=>false,dark:()=>false},'quick');
  const window=new BrowserWindow({x:120,y:120,width:400,height:560,show:false,frame:true,titleBarStyle:'hidden',titleBarOverlay:false,thickFrame:true,hasShadow:true,resizable:false,maximizable:false,minimizable:false,skipTaskbar:true});window.isVisible=()=>true;
  panel.window=window;panel.opened=true;const start=window.getBounds(),samples=[],nativeBounds=window.setBounds.bind(window);let writes=0;window.setBounds=bounds=>{writes++;nativeBounds(bounds);samples.push(window.getBounds());};
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));panel.move();await pause(250);assert.equal(writes,0,'Holding the mouse still must not reapply bounds');
  for(let i=1;i<=80;i++){point={x:100+i,y:100+Math.floor(i/2)};await pause(20);}await pause(40);const end=window.getBounds();assert.equal(end.x,start.x+80);assert.equal(end.y,start.y+40);assert(samples.every(b=>Math.abs(b.width-start.width)<=2&&Math.abs(b.height-start.height)<=2),'Native frame must not accumulate size changes');
  const stopped=writes;await pause(250);assert.equal(writes,stopped,'A stationary cursor must stop window writes');held=false;await pause(35);point={x:350,y:400};await pause(40);assert.equal(writes,stopped,'Mouse-up must stop movement');assert.equal(panel.moveTimer,undefined);assert.equal(panel.focusing,false);
  panel.dispose();fs.writeFileSync(process.argv[3],JSON.stringify({scale:process.argv[2],start,end,writes,samples:samples.length}));app.quit();
 }).catch(error=>{console.error(error);app.exit(1);});
 `);
 const results=[];for(const scale of ['1','1.25','1.5']){const result=path.join(output,'scale-'+scale+'.json'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;await promisify(execFile)(require('electron'),[host,scale,result],{cwd:path.resolve('.'),windowsHide:true,env,timeout:30000});results.push(JSON.parse(await fs.readFile(result,'utf8')));}
 assert.equal(results.length,3);await fs.writeFile(path.join(output,'result.json'),JSON.stringify({passed:true,results,hiddenNativeWindows:true,desktopInput:false},null,2));console.log('PASS: native quick-panel movement retains its size at 100%, 125% and 150%, including held mouse, stationary cursor and mouse-up');
})().catch(error=>{console.error(error);process.exitCode=1;});
