import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,mkdtemp,open,statfs,rm,readdir,stat} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import type {IncomingMessage} from 'node:http';
import {releaseAsset,UPDATE_API_URL,type UpdateState,type UpdateRelease} from '../shared/updates';
import {updateTransport,type UpdateTransport} from './update-transport';

export interface UpdateContext {version:string;directory:string;installed:()=>Promise<boolean>;active?:(folder:string)=>Promise<boolean>;changed:(state:UpdateState)=>void;arm:(folder:string,release:UpdateRelease,valid:()=>boolean,checkpoint?:{id:string;profileId:string})=>Promise<()=>void>;openFolder:(folder:string)=>void}
export class UpdateService {
  private value:UpdateState;
  private controller?:AbortController;
  private operation?:Promise<UpdateState>;
  private folder='';
  private lastProgress=0;
  private preferences:Promise<unknown>=Promise.resolve();
  constructor(private context:UpdateContext,private transport:UpdateTransport=updateTransport){this.value={current:context.version,automatic:false,installed:false,phase:'idle',checkedAt:0,downloaded:0,error:''};}
  state():UpdateState{return structuredClone(this.value);}
  get installing(){return this.value.phase==='installing';}
  private changed(patch:Partial<UpdateState>){Object.assign(this.value,patch);this.context.changed(this.state());}
  async init(){
    await mkdir(this.context.directory,{recursive:true});
    try{const pref=JSON.parse(await readFile(join(this.context.directory,'preferences.json'),'utf8'));if(typeof pref.automatic==='boolean')this.value.automatic=pref.automatic;if(Number.isSafeInteger(pref.checkedAt)&&pref.checkedAt<=Date.now())this.value.checkedAt=pref.checkedAt;}catch{}
    this.value.installed=await this.context.installed().catch(()=>false);
    const entries=await readdir(this.context.directory,{withFileTypes:true}),completed:{folder:string;time:number;result:any}[]=[];
    for(const entry of entries){if(!entry.isDirectory()||!/^download-[a-zA-Z0-9]+$/.test(entry.name))continue;const folder=join(this.context.directory,entry.name);
      try{const file=join(folder,'result.json'),result=JSON.parse(await readFile(file,'utf8'));if(typeof result.success==='boolean'&&typeof result.version==='string'&&typeof result.reason==='string')completed.push({folder,time:(await stat(file)).mtimeMs,result});}catch{if(!await this.context.active?.(folder))await this.remove(folder);}
    }
    completed.sort((a,b)=>b.time-a.time);if(completed[0])this.value.previous={success:completed[0].result.success,version:completed[0].result.version,reason:completed[0].result.reason};
    for(const item of completed.slice(3))await this.remove(item.folder);return this.state();
  }
  private persist(){const data=JSON.stringify({automatic:this.value.automatic,checkedAt:this.value.checkedAt});const task=this.preferences.catch(()=>{}).then(async()=>{const target=join(this.context.directory,'preferences.json');await writeFile(target+'.tmp',data,{mode:0o600});await rename(target+'.tmp',target);});this.preferences=task;return task;}
  async configure(value:unknown){if(typeof value!=='boolean')throw new Error('UPDATE_OPTIONS_INVALID');this.changed({automatic:value});await this.persist();return this.state();}
  async scheduled(){if(this.value.automatic&&!this.operation&&['idle','current','unpublished','error'].includes(this.value.phase)&&Date.now()-this.value.checkedAt>=86400000)return this.check();return this.state();}
  private async remove(folder:string){const root=resolve(this.context.directory),target=resolve(folder);if(dirname(target)!==root||!/^download-[a-zA-Z0-9]+$/.test(target.slice(root.length+1)))throw new Error('UPDATE_PATH_INVALID');await rm(target,{recursive:true,force:true}).catch(()=>{});}
  private run(operation:(signal:AbortSignal)=>Promise<void>,milliseconds:number){
    if(this.operation||this.value.phase==='installing')throw new Error('UPDATE_BUSY');
    const controller=new AbortController();this.controller=controller;
    const timer=setTimeout(()=>controller.abort(new Error('UPDATE_TIMEOUT')),milliseconds);timer.unref();
    const pending=(async()=>{try{await operation(controller.signal);}catch(error){if(controller.signal.aborted&&controller.signal.reason==='cancel')this.changed({phase:this.value.release?'available':'idle',downloaded:0,error:''});else this.changed({phase:'error',error:controller.signal.reason instanceof Error?controller.signal.reason.message:(error as Error).message||'UPDATE_NETWORK_ERROR'});}finally{clearTimeout(timer);this.controller=undefined;this.operation=undefined;}return this.state();})();
    this.operation=pending;return pending;
  }
  check(){return this.run(async signal=>{
    this.changed({phase:'checking',error:'',downloaded:0,checkedAt:Date.now()});await this.persist();
    const response=await this.transport(UPDATE_API_URL,signal),code=response.statusCode;
    if(code===404){response.destroy();if(this.folder){await this.remove(this.folder);this.folder='';}this.changed({phase:'unpublished',release:undefined,checkedAt:Date.now()});await this.persist();return;}
    if(code!==200){response.destroy();throw new Error(code===403||code===429?'UPDATE_RATE_LIMIT':'UPDATE_NETWORK_ERROR');}
    const data=await this.body(response,signal,1024*1024);let parsed:unknown;try{parsed=JSON.parse(data.toString('utf8'));}catch{throw new Error('UPDATE_RELEASE_INVALID');}
    const release=releaseAsset(parsed,this.context.version);if(signal.aborted)throw signal.reason;
    if(this.folder){await this.remove(this.folder);this.folder='';}
    this.changed({phase:release?'available':'current',release:release||undefined,checkedAt:Date.now()});await this.persist();
  },45000);}
  private async body(response:IncomingMessage,signal:AbortSignal,limit:number){const chunks:Buffer[]=[];let total=0;try{for await(const chunk of response){if(signal.aborted)throw signal.reason;const data=Buffer.from(chunk);total+=data.length;if(total>limit)throw new Error('UPDATE_RELEASE_INVALID');chunks.push(data);}return Buffer.concat(chunks);}finally{response.destroy();}}
  download(){const release=this.value.release;if(!release)throw new Error('UPDATE_ASSET_MISSING');return this.run(async signal=>{
    if(this.folder){await this.remove(this.folder);this.folder='';}
    this.changed({phase:'downloading',downloaded:0,error:''});
    const disk=await statfs(this.context.directory);if(disk.bavail*disk.bsize<release.bytes+64*1024*1024)throw new Error('UPDATE_SPACE');
    const folder=await mkdtemp(join(this.context.directory,'download-'));let accepted=false;
    try{
      const response=await this.transport(release.assetURL,signal);if(response.statusCode!==200){response.destroy();throw new Error('UPDATE_NETWORK_ERROR');}
      if(response.headers['content-encoding']&&response.headers['content-encoding']!=='identity'){response.destroy();throw new Error('UPDATE_LENGTH');}
      const length=response.headers['content-length'];if(length!==undefined&&Number(length)!==release.bytes){response.destroy();throw new Error('UPDATE_LENGTH');}
      let file:import('node:fs/promises').FileHandle|undefined;const hash=createHash('sha256');let total=0;
      try{file=await open(join(folder,'installer.exe'),'wx',0o600);for await(const value of response){if(signal.aborted)throw signal.reason;const chunk=Buffer.from(value);total+=chunk.length;if(total>release.bytes)throw new Error('UPDATE_LENGTH');hash.update(chunk);await file.writeFile(chunk);this.value.downloaded=total;if(Date.now()-this.lastProgress>100){this.lastProgress=Date.now();this.changed({});}}await file.sync();}
      finally{response.destroy();await file?.close();}
      if(signal.aborted)throw signal.reason;if(total!==release.bytes)throw new Error('UPDATE_LENGTH');if(hash.digest('hex')!==release.sha256)throw new Error('UPDATE_CHECKSUM');
      this.folder=folder;accepted=true;this.changed({phase:'ready',downloaded:total});
    }finally{if(!accepted)await this.remove(folder);}
  },600000);}
  cancel(){if(this.value.phase==='installing')throw new Error('UPDATE_BUSY');this.controller?.abort('cancel');return this.state();}
  async install(valid:()=>boolean,checkpoint?:{id:string;profileId:string}){
    if(this.operation||this.value.phase!=='ready'||!this.folder||!this.value.release)throw new Error('UPDATE_NOT_READY');
    if(!this.value.installed||!await this.context.installed())throw new Error('UPDATE_PORTABLE');
    if(!valid())throw new Error('UPDATE_UNSAVED');
    const folder=this.folder,release=this.value.release;this.changed({phase:'installing',error:''});
    try{const cancel=await this.context.arm(folder,release,valid,checkpoint);if(!valid()){cancel();throw new Error('UPDATE_UNSAVED');}}
    catch(e){this.changed({phase:'ready',error:(e as Error).message});throw e;}
    return this.state();
  }
  showDownload(){if(this.value.phase!=='ready'||!this.folder)throw new Error('UPDATE_NOT_READY');this.context.openFolder(join(this.folder,'installer.exe'));}
  async stop(){this.controller?.abort('cancel');await this.operation;await this.preferences.catch(()=>{});}
}
