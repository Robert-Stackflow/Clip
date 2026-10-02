import {app} from 'electron';
import {basename} from 'node:path';
import {runningApplications} from './native';
import type {Store} from './store';
const key=(name:string)=>name.trim().toLowerCase();
const local=(file:string)=>/^[a-z]:\\/i.test(file)&&!file.includes('\0')&&file.length<32768;
/** Only native observed executables are resolved. Renderer input never becomes a file path. */
export class AppIcons{
 private current?:Store;private paths=new Map<string,string>();private cache=new Map<string,Promise<string|null>>();private scanned=0;
 constructor(private readonly store:()=>Store){}
 private activate(){const store=this.store();if(this.current!==store){this.current=store;this.paths.clear();this.cache.clear();this.scanned=0;const saved=store.meta('source-applications',[]);if(Array.isArray(saved))for(const entry of saved.slice(-256))if(Array.isArray(entry)&&typeof entry[0]==='string'&&typeof entry[1]==='string'&&local(entry[1])&&key(basename(entry[1]))===entry[0])this.paths.set(entry[0],entry[1]);}return store;}
 remember(info:{name:string;executable?:string}|null){const store=this.activate();if(!info?.executable||!local(info.executable))return;const name=key(info.name);if(name!==key(basename(info.executable))||this.paths.get(name)===info.executable)return;this.paths.delete(name);this.paths.set(name,info.executable);while(this.paths.size>256)this.paths.delete(this.paths.keys().next().value!);store.setMeta('source-applications',[...this.paths]);this.cache.delete(name);}
 async get(names:unknown){if(!Array.isArray(names)||names.length>64||names.some(name=>typeof name!=='string'||name.length>256))throw new Error('Invalid source applications');const store=this.activate(),known=new Set(store.sourceApplications().map(key)),selected=[...new Set((names as string[]).map(key))].filter(name=>known.has(name));
  if(selected.some(name=>!this.paths.has(name))&&Date.now()-this.scanned>30000){this.scanned=Date.now();for(const info of runningApplications())if(known.has(key(info.name)))this.remember(info);}
  const result:Record<string,string|null>={};for(const name of selected){const file=this.paths.get(name);if(!file){result[name]=null;continue;}let pending=this.cache.get(name);if(!pending){pending=app.getFileIcon(file,{size:'normal'}).then(image=>{const png=image.resize({width:32,height:32,quality:'best'}).toPNG();return png.length<=32768?'data:image/png;base64,'+png.toString('base64'):null;}).catch(()=>null);this.cache.set(name,pending);while(this.cache.size>64)this.cache.delete(this.cache.keys().next().value!);}result[name]=await pending;if(this.current!==store||this.store()!==store)return {};}
  return result;
 }
}
