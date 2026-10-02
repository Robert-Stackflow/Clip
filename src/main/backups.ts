import {mkdir,readdir,lstat,unlink} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {Store} from './store';
import {validateBackup} from '../shared/core';
import {validateBackupOptions,type BackupStatus,type BackupEntry,type RestoreFile,type RestorePreview} from '../shared/data';
import {localDirectory,writeAtomic,boundedFile} from './data-files';
import {decodeBackup,encodeBackup,isEncryptedBackup,validateBackupPassword} from './backup-crypto';
import type {Payload} from '../shared/types';
interface SavedBackup extends BackupStatus {secret?:string}
interface Vault {available():Promise<boolean>;encrypt(value:string):Promise<string>;decrypt(value:string):Promise<string>}
export class BackupManager {
 private restoring:{token:string;file:string;name:string;expires:number;encrypted:boolean;hash:string;value?:unknown}|undefined;
 private busy=false;
 private expiryTimer:NodeJS.Timeout|undefined;
 constructor(private store:()=>Store,private profileId:string,private defaultFolder:string,private vault:Vault,private changed:()=>void,private thumbnail:(p:Payload)=>string|undefined=()=>undefined,private exporter?:(file:string,password?:string)=>Promise<void>){}
 private saved():SavedBackup{return {enabled:false,directory:this.defaultFolder,intervalHours:24,keep:7,encrypted:true,hasPassword:false,lastSuccess:0,lastAttempt:0,nextAt:0,lastError:'',...this.store().meta('automatic-backup',{})};}
 async exclusive<T>(operation:()=>Promise<T>){if(this.busy)throw new Error('正在备份或切换资料，请完成后重试');this.busy=true;try{return await operation();}finally{this.busy=false;}}
 status():BackupStatus{if(this.restoring&&this.restoring.expires<Date.now())this.restoring=undefined;const {secret,...state}=this.saved();return {...state,hasPassword:!!secret};}
 configure(value:unknown){return this.exclusive(()=>this.configureIdle(value));}
 private async configureIdle(value:unknown){
  const v=validateBackupOptions(value),old=this.saved();let secret=old.secret;
  if(v.password){validateBackupPassword(v.password);if(!await this.vault.available())throw new Error('Windows 安全存储不可用，无法保存自动备份密码');secret=await this.vault.encrypt(v.password);}
  if(!v.encrypted)secret=undefined;if(v.enabled&&v.encrypted&&!secret)throw new Error('请设置自动备份密码，并保存到安全的位置');
  let directory=v.directory;if(v.enabled){if(directory===this.defaultFolder)await mkdir(directory,{recursive:true});directory=await localDirectory(directory);}
  const changed=!old.enabled||directory!==old.directory||v.encrypted!==old.encrypted||!!v.password;
  this.store().setMeta('automatic-backup',{...old,...v,password:undefined,directory,secret,hasPassword:!!secret,nextAt:v.enabled?(changed?Date.now():Date.now()+v.intervalHours*3600000):0,lastError:''});this.changed();return this.status();
 }
 private pattern(){return new RegExp('^Clipper-auto-'+this.profileId+'-[0-9]{17}-[0-9a-f-]{36}\\.(json|clipper)$');}
 async entries():Promise<BackupEntry[]>{
  const state=this.saved();let directory:string;try{directory=await localDirectory(state.directory);}catch{return [];}
  if(directory!==state.directory&&state.directory!==this.defaultFolder)return [];
  const files=await readdir(directory,{withFileTypes:true}),result:BackupEntry[]=[];
  for(const f of files)if(f.isFile()&&this.pattern().test(f.name)){const info=await lstat(join(directory,f.name));if(info.isFile()&&!info.isSymbolicLink())result.push({name:f.name,bytes:info.size,createdAt:info.mtimeMs,encrypted:f.name.endsWith('.clipper')});}
  return result.sort((a,b)=>b.createdAt-a.createdAt||b.name.localeCompare(a.name));
 }
 async run(now=Date.now(),force=false){
  const state=this.saved();if(this.busy){if(force)throw new Error('正在备份或切换资料，请完成后重试');return null;}if(!state.enabled) {if(force)throw new Error('请先启用并保存自动备份');return null;}
  if(!force&&state.nextAt>now)return null;this.busy=true;
  this.store().setMeta('automatic-backup',{...state,lastAttempt:now});this.changed();
  try{
   const directory=await localDirectory(state.directory);if(directory!==state.directory)throw new Error('备份目录已改变，请重新选择');
   const password=state.encrypted?await this.vault.decrypt(state.secret!):undefined;
   const file=join(directory,`Clipper-auto-${this.profileId}-${new Date(now).toISOString().replace(/\D/g,'')}-${randomUUID()}.${state.encrypted?'clipper':'json'}`);
   await this.write(file,password);
   // Only retire this profile's own ordinary files after the new backup validates.
   const entries=await this.entries();let cleanupError='';for(const entry of entries.slice(state.keep)){const path=join(directory,entry.name);try{const info=await lstat(path);if(info.isFile()&&!info.isSymbolicLink())await unlink(path);}catch{cleanupError='备份已完成，但部分旧备份无法清理';}}
   this.store().setMeta('automatic-backup',{...state,lastAttempt:now,lastSuccess:now,nextAt:now+state.intervalHours*3600000,lastError:cleanupError});this.changed();return basename(file);
  }catch(e){const error=String(e instanceof Error?e.message:e).slice(0,1000);this.store().setMeta('automatic-backup',{...state,lastAttempt:now,nextAt:now+15*60000,lastError:error});this.changed();if(force)throw e;return null;}
  finally{this.busy=false;}
 }
 private rehearse(value:unknown){validateBackup(value);const temporary=new Store(':memory:');try{temporary.import(value,this.thumbnail);}finally{temporary.close();}}
 private async write(file:string,password?:string){if(this.exporter)return this.exporter(file,password);const value=this.store().backup();this.rehearse(value);await writeAtomic(file,await encodeBackup(value,password));this.rehearse(await decodeBackup(await boundedFile(file),password));}
 export(file:string,password?:string){return this.exclusive(async()=>{if(/^Clipper-auto-/i.test(basename(file)))throw new Error('此文件名保留给自动备份，请选择其他名称');if(password!==undefined)validateBackupPassword(password);await this.write(file,password);return basename(file);});}
 async chooseRestore(file:string):Promise<RestoreFile>{const bytes=await boundedFile(file);const encrypted=isEncryptedBackup(bytes),token=randomUUID();this.restoring={token,file,name:basename(file),expires:Date.now()+600000,encrypted,hash:createHash('sha256').update(bytes).digest('hex')};clearTimeout(this.expiryTimer);this.expiryTimer=setTimeout(()=>this.cancelRestore(token),600000);this.expiryTimer.unref();return {token,name:basename(file),encrypted};}
 async chooseOwn(name:string){if(typeof name!=='string'||!this.pattern().test(name)||(await this.entries()).every(e=>e.name!==name))throw new Error('此备份不在当前列表中');return this.chooseRestore(join(this.saved().directory,name));}
 private request(token:unknown){const request=this.restoring;if(!request||token!==request.token||request.expires<Date.now())throw new Error('恢复预览已过期，请重新选择备份');return request;}
 async preview(token:string,password?:string):Promise<RestorePreview>{
  const request=this.request(token);request.value=undefined;const bytes=await boundedFile(request.file);if(createHash('sha256').update(bytes).digest('hex')!==request.hash)throw new Error('备份文件已改变，请重新选择');const value=await decodeBackup(bytes,password);this.rehearse(value);request.value=value;const summary=validateBackup(value);
  return {token,name:request.name,clips:summary.clips.length,snippets:summary.snippets.length,categories:summary.categories.length,scripts:summary.scripts.length,exportedAt:typeof value.exportedAt==='string'?value.exportedAt.slice(0,100):'',encrypted:request.encrypted};
 }
 restore(token:string){const request=this.request(token);if(!request.value)throw new Error('请先校验并预览备份');const count=this.store().import(request.value,this.thumbnail);this.cancelRestore(token);this.changed();return count;}
 cancelRestore(token:string){if(this.restoring?.token===token){this.restoring=undefined;clearTimeout(this.expiryTimer);}}
 dispose(){this.restoring=undefined;clearTimeout(this.expiryTimer);}
}
