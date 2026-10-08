const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const output=path.resolve(process.env.CLIP_TEST_OUTPUT_DIR||'work/browser-image-drop');

if(!process.versions.electron){
 (async()=>{
  fs.mkdirSync(output,{recursive:true});
  const build=require('esbuild').build;
  await build({stdin:{contents:"export {incomingImage,incomingImages,incomingFiles} from './src/main/transfer';export {decodeBrowserImage} from './src/main/image-decode';export {framePNG} from './tests/image-fixture';",resolveDir:process.cwd(),loader:'ts'},outfile:path.join(output,'transfer.cjs'),bundle:true,platform:'node',external:['electron','koffi','./native','./attachment-runtime']});
  await build({entryPoints:['src/renderer/image-drop.ts'],outfile:path.join(output,'renderer.js'),bundle:true,platform:'browser',format:'iife',globalName:'dropFixture'});
  await build({entryPoints:['src/main/heic-decode-worker.ts'],outfile:'dist/main/heic-decode-worker.cjs',bundle:true,platform:'node',external:['heic-decode']});
  await build({entryPoints:['src/main/native.ts'],outfile:path.join(output,'native.cjs'),bundle:true,platform:'node',external:['koffi']});
  await build({stdin:{contents:"import {contextBridge,ipcRenderer} from 'electron';import {importDroppedFiles} from './src/preload/file-drop';contextBridge.exposeInMainWorld('imageFixture',{drop:(files:File[])=>importDroppedFiles(files,value=>ipcRenderer.invoke('fixture-files',value),value=>ipcRenderer.invoke('fixture-image',value))});",resolveDir:process.cwd(),loader:'ts'},outfile:path.join(output,'preload.cjs'),bundle:true,platform:'node',external:['electron']});
  const env={...process.env,CLIP_TEST_OUTPUT_DIR:output};delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').execFileSync(require('electron'),[__filename],{env,windowsHide:true,stdio:'inherit',timeout:60000});
 })().catch(error=>{console.error(error);process.exitCode=1});
}else{
 const electron=require('electron'),{app,BrowserWindow,ipcMain,nativeImage}=electron;
 app.setPath('userData',path.join(output,'profile'));app.on('window-all-closed',()=>{});
 app.whenReady().then(async()=>{
  const file=path.join(output,'transfer.cjs'),module={exports:{}};
  require('node:vm').runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require:name=>name==='./native'?{limitChildProcess:require(path.join(output,'native.cjs')).limitChildProcess}:name==='./attachment-runtime'?{}:require(name),__dirname:path.resolve('dist/main'),Buffer,Uint8Array,TextDecoder,TextEncoder,process,console,URL,AbortController,setTimeout,clearTimeout,setInterval,clearInterval},{filename:file});
  const api=module.exports,pixels=Buffer.alloc(5*3*4);for(let i=0;i<pixels.length;i+=4){pixels[i]=80;pixels[i+1]=110;pixels[i+2]=160;pixels[i+3]=255;}
  const png=api.framePNG({width:5,height:3,data:pixels});
  const fixture=new BrowserWindow({show:false,skipTaskbar:true,focusable:false,webPreferences:{preload:path.join(output,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  let server;
  try{
   await fixture.loadURL('data:text/html,<!doctype html>');
   const webp=Buffer.from(await fixture.webContents.executeJavaScript(`(async()=>{const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(${JSON.stringify(png.toString('base64'))}),c=>c.charCodeAt(0))],{type:'image/png'}));const canvas=new OffscreenCanvas(5,3);canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close();const blob=await canvas.convertToBlob({type:'image/webp',quality:1});return btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())))})()`),'base64');
   // This is the real Windows decoder limitation, not a mocked decode failure.
   assert.equal(nativeImage.createFromBuffer(webp).isEmpty(),true);
   const count=BrowserWindow.getAllWindows().length;
   const verify=payload=>{
    const decoded=nativeImage.createFromBuffer(Buffer.from(payload.png,'base64'));assert.equal(decoded.isEmpty(),false);assert.deepEqual(decoded.getSize(),{width:5,height:3});
    const bitmap=decoded.toBitmap();assert(Math.abs(bitmap[0]-80)<=3&&Math.abs(bitmap[1]-110)<=3&&Math.abs(bitmap[2]-160)<=3);assert.equal(bitmap[3],255);
    assert.equal(payload.formats.length,1);assert.equal(payload.formats[0].name,'image/webp');assert.equal(payload.formats[0].data,webp.toString('base64'));assert.equal(BrowserWindow.getAllWindows().length,count);
   };
   verify(await api.incomingImage({data:webp.toString('base64')}));
   const local=path.join(output,'browser-thumbnail.webp');fs.writeFileSync(local,webp);verify(await api.incomingFiles([local]));
   let filesCalled=0,imagesCalled=0;
   ipcMain.handle('fixture-files',()=>{filesCalled++;throw Error('Virtual file must not require a filesystem path')});
   ipcMain.handle('fixture-image',async(_event,value)=>{imagesCalled++;for(const payload of await api.incomingImages(value))verify(payload)});
   await fixture.webContents.executeJavaScript(`imageFixture.drop([new File([Uint8Array.from(atob(${JSON.stringify(webp.toString('base64'))}),c=>c.charCodeAt(0))],'thumbnail.webp',{type:'image/webp'})])`);
   assert.equal(filesCalled,0);assert.equal(imagesCalled,1);
   await fixture.webContents.executeJavaScript(`imageFixture.drop([new File([Uint8Array.from(atob(${JSON.stringify(webp.toString('base64'))}),c=>c.charCodeAt(0))],'blank-type.webp'),new File([Uint8Array.from(atob(${JSON.stringify(webp.toString('base64'))}),c=>c.charCodeAt(0))],'second.webp',{type:'image/webp'})])`);
   assert.equal(imagesCalled,2);const batch=await api.incomingImages([{data:webp.toString('base64')},{data:webp.toString('base64')}]);assert.equal(batch.length,2);batch.forEach(verify);
   await assert.rejects(api.incomingImages([{data:webp.toString('base64')},{data:Buffer.from('invalid').toString('base64')}]),/图片文件无效/);
   await assert.rejects(api.incomingImages(Array(33).fill({data:webp.toString('base64')})),/32/);
   let externalSVGRequests=0,originalRequests=0;
   server=require('node:http').createServer((request,response)=>{
    if(request.url==='/page'){response.writeHead(200,{'Content-Type':'text/html','Set-Cookie':'fixture=authenticated; SameSite=Lax'});response.end('<!doctype html><img id="private" src="/authenticated"><img id="original" src="/thumbnail" data-original="/original"><img id="blob">');return;}
    if(request.url==='/external'){externalSVGRequests++;response.end('denied');return;}
    if(request.url==='/authenticated'&&request.headers.cookie!=='fixture=authenticated'){response.writeHead(403);response.end();return;}
    if(request.url==='/referer'&&!request.headers.referer?.endsWith('/page')){response.writeHead(403);response.end();return;}
    if(request.url==='/missing'){response.writeHead(404);response.end();return;}
    if(request.url==='/slow'){response.writeHead(200,{'Content-Type':'image/webp'});const timer=setTimeout(()=>response.end(webp),2000);response.on('close',()=>clearTimeout(timer));return;}
    if(request.url==='/original')originalRequests++;
    response.writeHead(200,{'Content-Type':'image/webp','Content-Length':webp.length});response.end(webp);
   });
   await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));verify(await api.incomingImage({url:'http://127.0.0.1:'+server.address().port+'/thumbnail'}));
   const origin='http://127.0.0.1:'+server.address().port;
   verify(await api.incomingImage({url:origin+'/referer',referrer:origin+'/page'}));
   verify(await api.incomingImage({url:origin+'/missing',fallback:origin+'/thumbnail'}));
   await assert.rejects(api.incomingImage({url:origin+'/authenticated'}),/浏览器权限/);
   let live=true;const pending=api.incomingImage({url:origin+'/slow'},()=>live);setTimeout(()=>{live=false;},100);const began=Date.now();await assert.rejects(pending,/记录已取消/);assert(Date.now()-began<1000,'Cancellation must interrupt a blocked download');
   const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="5" height="3"><rect width="5" height="3" fill="#506ea0"/><image href="${origin}/external" width="1" height="1"/><script>fetch('${origin}/external')</script></svg>`;
   const svgPayload=await api.incomingImage({url:'data:image/svg+xml,'+encodeURIComponent(svg)});assert.deepEqual(nativeImage.createFromBuffer(Buffer.from(svgPayload.png,'base64')).getSize(),{width:5,height:3});assert.equal(svgPayload.formats[0].name,'image/svg+xml');assert.equal(externalSVGRequests,0);
   await fixture.loadURL(origin+'/page');await fixture.webContents.executeJavaScript(fs.readFileSync('browser-extension/page.js','utf8'));await fixture.webContents.executeJavaScript(fs.readFileSync(path.join(output,'renderer.js'),'utf8'));
   const extensionPayloads=await fixture.webContents.executeJavaScript(`(async()=>{
    const blob=document.querySelector('#blob');blob.src=URL.createObjectURL(new Blob([Uint8Array.from(atob(${JSON.stringify(webp.toString('base64'))}),c=>c.charCodeAt(0))],{type:'image/webp'}));
    const results=[];for(const id of ['private','original','blob']){const image=document.getElementById(id);if(!image.complete)await new Promise(resolve=>{image.onload=resolve;image.onerror=resolve});image.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,150));const transfer=new DataTransfer();image.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));results.push({payload:dropFixture.droppedImage(transfer),types:transfer.types});}return results;
   })()`);
   for(const result of extensionPayloads){assert(result.types.includes('application/x-clip-images'));assert(result.payload[0].data);verify(await api.incomingImage(result.payload[0]));}assert(originalRequests>0);
   const extracted=await fixture.webContents.executeJavaScript(`(()=>{const transfer=new DataTransfer();transfer.setData('text/html','<img src="https://share.cloudchewie.com/i/abc/thumbnail"><img src="https://test.example/photo.avif">');return dropFixture.droppedImage(transfer)})()`);assert.equal(extracted.length,2);assert.equal(extracted[0].url,'https://share.cloudchewie.com/i/abc');assert.equal(extracted[0].fallback,'https://share.cloudchewie.com/i/abc/thumbnail');
   for(const [name,format]of [['rainbow.heic','image/heic'],['sample.avif','image/avif']]){const source=path.resolve('work/image-codecs',name);if(fs.existsSync(source)){const bytes=fs.readFileSync(source),payload=await api.incomingImage({data:bytes.toString('base64')});assert.equal(nativeImage.createFromBuffer(Buffer.from(payload.png,'base64')).isEmpty(),false);assert.equal(payload.formats[0].name,format);assert.equal(payload.formats[0].data,bytes.toString('base64'));}}
   await assert.rejects(api.decodeBrowserImage(webp,'image/webp',()=>false),/记录已取消/);
   let checks=0;await assert.rejects(api.decodeBrowserImage(webp,'image/webp',()=>++checks<2),/记录已取消/);
   await assert.rejects(api.decodeBrowserImage(Buffer.from('invalid image'),'image/webp',()=>true),/图片无法解码/);
   assert.equal(BrowserWindow.getAllWindows().length,count);
   const result={passed:true,webpBytes:true,localWebp:true,virtualBrowserFile:true,blankMime:true,batchImages:true,extensionlessImageURL:true,originalPreserved:true,originalFallback:true,referrer:true,authenticatedBrowserImage:true,blobBrowserImage:true,extensionOriginal:true,svgIsolated:true,cancelledDownload:true,cancelledDecoderReleased:true,invalidImageRejected:true,systemClipboard:false,desktopInput:false};
   fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{if(server)await new Promise(resolve=>server.close(resolve));fixture.destroy();}
  app.quit();
 }).catch(error=>{console.error(error);app.exit(1)});
}
