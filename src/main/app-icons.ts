import {app} from 'electron';
import {execFile} from 'node:child_process';
import {basename,join} from 'node:path';
import {promisify} from 'node:util';
import {runningApplications} from './native';
import type {Store} from './store';
const key=(name:string)=>name.trim().toLowerCase();
const local=(file:string)=>/^[a-z]:\\/i.test(file)&&!file.includes('\0')&&file.length<32768;
const execFileAsync=promisify(execFile);
const iconHelper=()=>app.isPackaged?join(process.resourcesPath,'app.asar.unpacked/dist/native/SourceHost.exe'):join(__dirname,'../native/SourceHost.exe');
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
 private current?:Store;private paths=new Map<string,string>();private cache=new Map<string,Promise<string|null>>();private scanned=0;
 constructor(private readonly store:()=>Store){}
 private activate(){const store=this.store();if(this.current!==store){this.current=store;this.paths.clear();this.cache.clear();this.scanned=0;const saved=store.meta('source-applications',[]);if(Array.isArray(saved))for(const entry of saved.slice(-256))if(Array.isArray(entry)&&typeof entry[0]==='string'&&typeof entry[1]==='string'&&local(entry[1])&&key(basename(entry[1]))===entry[0])this.paths.set(entry[0],entry[1]);}return store;}
 remember(info:{name:string;executable?:string}|null){const store=this.activate();if(!info?.executable||!local(info.executable))return;const name=key(info.name);if(name!==key(basename(info.executable))||this.paths.get(name)===info.executable)return;this.paths.delete(name);this.paths.set(name,info.executable);while(this.paths.size>256)this.paths.delete(this.paths.keys().next().value!);store.setMeta('source-applications',[...this.paths]);this.cache.delete(name);}
 async get(names:unknown){if(!Array.isArray(names)||names.length>64||names.some(name=>typeof name!=='string'||name.length>256))throw new Error('Invalid source applications');const store=this.activate(),known=new Set(store.sourceApplications().map(key)),selected=[...new Set((names as string[]).map(key))].filter(name=>known.has(name));
  if(selected.some(name=>!this.paths.has(name))&&Date.now()-this.scanned>30000){this.scanned=Date.now();for(const info of runningApplications())if(known.has(key(info.name)))this.remember(info);}
  const result:Record<string,string|null>={};
  const load=async(name:string)=>{const file=this.paths.get(name);if(!file){result[name]=null;return;}let pending=this.cache.get(name);if(!pending){pending=executableIcon(file);this.cache.set(name,pending);while(this.cache.size>64)this.cache.delete(this.cache.keys().next().value!);}result[name]=await pending;};
  // Bound native jobs so a full application menu stays responsive on a cold cache.
  for(let index=0;index<selected.length;index+=4){await Promise.all(selected.slice(index,index+4).map(load));if(this.current!==store||this.store()!==store)return {};}
  return result;
 }
}
