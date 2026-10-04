import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {watch} from 'node:fs';
import {mkdir,copyFile,readFile,writeFile,readdir,lstat,realpath,unlink} from 'node:fs/promises';
import {resolve,join,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {context} from 'esbuild';
import electron from 'electron';
import {bundles,staticFiles} from './bundle-options.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));process.chdir(root);
const temp=join(root,'work/development/temp');await mkdir(temp,{recursive:true});
const env={...process.env,TEMP:temp,TMP:temp,CLIPPER_DEVELOPMENT:'1'};delete env.ELECTRON_RUN_AS_NODE;delete env.CLIPPER_TEST_MODE;delete env.CLIPPER_DATA_DIR;
await promisify(execFile)(process.execPath,['scripts/build.mjs'],{cwd:root,env,windowsHide:true,maxBuffer:8*1024*1024}).then(result=>{process.stdout.write(result.stdout);process.stderr.write(result.stderr);});
let child,stopping=false,restarting=false,quitRequested=false,timer,quitTimer,exitCode=0;
const contexts=[],watchers=[],copyTimers=new Map(),building=new Set(),failed=new Set();
function send(type){if(child?.connected)child.send({type},error=>{if(error&&!stopping){if(type==='clipper:dev-quit')quitRequested=false;console.error(error.message);}});}
function changed(restart){restarting ||= restart;clearTimeout(timer);timer=setTimeout(()=>{if(stopping||building.size||failed.size||!child?.connected)return;if(restarting){if(quitRequested)return;quitRequested=true;const target=child;console.log('主进程已更新，正常退出后重启…');send('clipper:dev-quit');clearTimeout(quitTimer);quitTimer=setTimeout(()=>{if(child===target&&quitRequested)console.warn('开发窗口仍在退出中；请先完成或取消未保存的操作。');},15000);}else{console.log('界面已更新');send('clipper:dev-reload');}},180);}
function launch(){
 quitRequested=false;clearTimeout(quitTimer);
 const args=['.'],port=process.env.CLIPPER_DEV_DEBUG_PORT;
 if(port){if(!/^\d+$/.test(port)||+port<1024||+port>65535)throw new Error('Invalid development debug port');args.unshift('--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port);}
 child=spawn(electron,args,{cwd:root,env,stdio:['inherit','inherit','inherit','ipc'],windowsHide:true});
 child.on('error',error=>{console.error(error);void finish(1);});
 child.on('message',message=>{if(message?.type==='clipper:dev-deferred')console.log('当前有未保存的捕获或图片编辑；保存后继续修改可刷新。');if(message?.type==='clipper:dev-quit-canceled'){quitRequested=false;clearTimeout(quitTimer);console.log('开发窗口取消退出；下次修改主进程时再重试。');}if(message?.type==='clipper:dev-renderer-gone')console.warn('开发窗口渲染进程退出：'+message.reason+'；恢复尝试 '+Math.min(message.retry,3)+'/3'+(message.retry>3?'，已停止自动重试':''));if(message?.type==='clipper:dev-ready')console.log('Clipper 开发窗口已就绪；资料：'+message.profile);});
 child.once('exit',code=>{clearTimeout(quitTimer);child=undefined;if(restarting&&!stopping){restarting=false;launch();}else void finish(stopping?exitCode:code??0);});
}
async function pruneReader(result){
 const folder=resolve('dist/renderer/text-preview');if((await lstat(folder)).isSymbolicLink()||await realpath(folder)!==folder)throw new Error('Unsafe development reader output');
 const keep=new Set(Object.keys(result.metafile.outputs).map(file=>resolve(file)));
 for(const item of await readdir(folder,{withFileTypes:true})){if(!item.isFile())throw new Error('Unexpected development reader entry');const file=join(folder,item.name);if(!keep.has(file))await unlink(file);}
}
async function finish(code=0){
 if(stopping)return;stopping=true;exitCode=code;clearTimeout(timer);clearTimeout(quitTimer);for(const current of copyTimers.values())clearTimeout(current);for(const watcher of watchers)watcher.close();send('clipper:dev-quit');
 await Promise.all(contexts.map(current=>current.dispose()));process.exitCode=code;if(process.connected)process.disconnect();
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void finish());
process.on('message',message=>{if(message?.type==='clipper:dev-stop')void finish();});
try{
 for(const bundle of bundles){
  let initial=true,settled;const ready=new Promise(resolve=>settled=resolve);
  const current=await context({...bundle.options,metafile:bundle.name==='text-preview',plugins:[{name:'clipper-development',setup(builder){
   builder.onStart(()=>{building.add(bundle.name);clearTimeout(timer);});
   builder.onEnd(async result=>{
    let ok=!result.errors.length;if(ok&&bundle.name==='text-preview')try{await pruneReader(result);}catch(error){ok=false;console.error(error);}
    building.delete(bundle.name);ok?failed.delete(bundle.name):failed.add(bundle.name);
    if(initial){initial=false;settled(ok);return;}
    if(ok)changed(bundle.restart);
   });
  }}]});contexts.push(current);await current.watch();if(!await ready)throw new Error('Initial development bundle failed: '+bundle.name);
 }
 const files=new Map(staticFiles.map(file=>[resolve(file[0]),file]));
 for(const sourceRoot of ['src','native','assets','scripts'])watchers.push(watch(sourceRoot,{recursive:true},(_event,name)=>{
  if(!name||stopping)return;const source=resolve(sourceRoot,String(name)),file=files.get(source);
  if(!file){if(sourceRoot==='native'||sourceRoot==='scripts')console.log('开发构建配置或原生源码已更新，请重新运行 npm run dev。');return;}
  clearTimeout(copyTimers.get(source));copyTimers.set(source,setTimeout(async()=>{copyTimers.delete(source);try{const [,target,bom]=file;await mkdir(dirname(target),{recursive:true});if(bom)await writeFile(target,Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),await readFile(source)]));else await copyFile(source,target);changed(target.startsWith('dist/main/')||target==='dist/clipper.png');}catch(error){console.error('复制开发资源失败：'+relative(root,source),error.message);}},60));
 }));
 launch();console.log('Electron 开发模式：界面自动刷新，主进程/预加载正常重启；原生源码修改后重新启动开发命令。');
}catch(error){console.error(error);await finish(1);}
