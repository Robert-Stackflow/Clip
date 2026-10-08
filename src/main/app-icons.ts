import {app} from 'electron';
import {execFile} from 'node:child_process';
import {basename,join} from 'node:path';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {lstat,readFile,mkdir,readdir,unlink} from 'node:fs/promises';
import {writeAtomic} from './data-files';
import {runningApplications} from './native';
import type {Store} from './store';
const key=(name:string)=>name.trim().toLowerCase();
const local=(file:string)=>/^[a-z]:\\/i.test(file)&&!file.includes('\0')&&file.length<32768;
const execFileAsync=promisify(execFile);
const iconHelper=()=>app.isPackaged?join(process.resourcesPath,'app.asar.unpacked/dist/native/SourceHost.exe'):join(__dirname,'../native/SourceHost.exe');
const validIcon=(png:Buffer)=>png.length>=24&&png.length<=128*1024&&png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&png.readUInt32BE(16)>0&&png.readUInt32BE(16)<=256&&png.readUInt32BE(20)>0&&png.readUInt32BE(20)<=256;
async function executableIcon(file:string):Promise<string|null>{
  // The Shell cache can supply a generic glyph even for ordinary Win32 programs.
  // Extract the best embedded resource at 128 px, retaining its alpha channel.
  if(process.platform==='win32')try{
    const {stdout}=await execFileAsync(iconHelper(),['icon',file],{windowsHide:true,timeout:3000,maxBuffer:256*1024,encoding:'buffer'});
    const png=Buffer.from(stdout);
    if(png.length>=24&&png.length<=128*1024&&png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&png.readUInt32BE(16)===128&&png.readUInt32BE(20)===128)return 'data:image/png;base64,'+png.toString('base64');
  }catch{/* Keep the normal icon lookup for programs without embedded resources. */}
  try{const image=await app.getFileIcon(file,{size:'large'});if(image.isEmpty?.())return null;const png=image.toPNG();return png.length<=128*1024?'data:image/png;base64,'+png.toString('base64'):null;}catch{return null;}
}
/** Only native observed executables are resolved. Renderer input never becomes a file path. */
export class AppIcons{
 private current?:Store;private paths=new Map<string,string>();private cache=new Map<string,{promise:Promise<string|null>;expires:number}>();private scanned=0;
 constructor(private readonly store:()=>Store,private readonly directory?:string){}
 private iconFile(name:string){return join(this.directory!,createHash('sha256').update(name).digest('hex')+'.png');}
 private async savedIcon(name:string){if(!this.directory)return null;try{const file=this.iconFile(name),info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>128*1024)return null;const png=await readFile(file);return validIcon(png)?'data:image/png;base64,'+png.toString('base64'):null;}catch{return null;}}
 private async loadIcon(name:string,file:string){
  // Keep already observed app artwork across Store package updates, including
  // while the app is closed and its former version directory has disappeared.
  const exists=!this.directory||process.platform!=='win32'||await lstat(file).then(info=>info.isFile(),()=>false);
  const value=exists?await executableIcon(file):null;
  if(!value)return this.savedIcon(name);
  if(this.directory)try{
   const png=Buffer.from(value.split(',')[1],'base64');
   if(validIcon(png)){
    await mkdir(this.directory,{recursive:true});await writeAtomic(this.iconFile(name),png);
    const entries=(await readdir(this.directory)).filter(file=>/^[a-f0-9]{64}\.png$/.test(file));
    if(entries.length>256){const dated=await Promise.all(entries.map(async file=>({file,time:(await lstat(join(this.directory!,file))).mtimeMs})));dated.sort((a,b)=>b.time-a.time);await Promise.all(dated.slice(256).map(entry=>unlink(join(this.directory!,entry.file)).catch(()=>{})));}
   }
  }catch{/* Icon caching must never prevent using an application. */}
  return value;
 }
 private activate(){const store=this.store();if(this.current!==store){this.current=store;this.paths.clear();this.cache.clear();this.scanned=0;const saved=store.meta('source-applications',[]);if(Array.isArray(saved))for(const entry of saved.slice(-256))if(Array.isArray(entry)&&typeof entry[0]==='string'&&typeof entry[1]==='string'&&local(entry[1])&&key(basename(entry[1]))===entry[0])this.paths.set(entry[0],entry[1]);}return store;}
 remember(info:{name:string;executable?:string}|null){const store=this.activate();if(!info?.executable||!local(info.executable))return;const name=key(info.name);if(name!==key(basename(info.executable))||this.paths.get(name)===info.executable)return;this.paths.delete(name);this.paths.set(name,info.executable);while(this.paths.size>256)this.paths.delete(this.paths.keys().next().value!);store.setMeta('source-applications',[...this.paths]);this.cache.delete(name);}
 async get(names:unknown){if(!Array.isArray(names)||names.length>64||names.some(name=>typeof name!=='string'||name.length>256))throw new Error('Invalid source applications');const store=this.activate(),known=new Set(store.sourceApplications().map(key)),selected=[...new Set((names as string[]).map(key))].filter(name=>known.has(name));
  // Store applications change executable paths when updated. Refresh observed
  // paths even when a saved path exists, rather than keeping an obsolete version.
  if(selected.length&&Date.now()-this.scanned>30000){this.scanned=Date.now();try{for(const info of runningApplications())if(known.has(key(info.name)))this.remember(info);}catch{/* Saved native observations remain usable during a transient lookup failure. */}}
  const result:Record<string,string|null>={};
  const load=async(name:string)=>{const file=this.paths.get(name);if(!file){result[name]=await this.savedIcon(name);return;}let entry=this.cache.get(name);if(!entry||entry.expires<=Date.now()){entry={promise:this.loadIcon(name,file),expires:Infinity};const current=entry;void current.promise.then(value=>{if(!value)current.expires=Date.now()+10000;});this.cache.set(name,entry);while(this.cache.size>64)this.cache.delete(this.cache.keys().next().value!);}result[name]=await entry.promise;};
  // Bound native jobs so a full application menu stays responsive on a cold cache.
  for(let index=0;index<selected.length;index+=4){await Promise.all(selected.slice(index,index+4).map(load));if(this.current!==store||this.store()!==store)return {};}
  return result;
 }
}
