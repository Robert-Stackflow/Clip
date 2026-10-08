import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {join,dirname} from 'node:path';
import {copyFile,writeFile,mkdir,readFile,unlink,rmdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {StorageManager} from './storage';
import {HistoryVault,readVault,type VaultRecord} from './history-vault';
import {recoveryJob} from './recovery-jobs';
import {checkpointID} from '../shared/checkpoints';
import {newerVersion} from '../shared/updates';
import type {ProgramVersionEntry,ProgramRollbackChoice,ProgramRollbackPreview} from '../shared/program-versions';
import {t as tr} from '../shared/i18n';
const execute=promisify(execFile),host=()=>join(__dirname,'../native/RollbackHost.exe').replace('app.asar','app.asar.unpacked');
type FileInfo={bytes:number;sha256:string};
interface ArchiveInspection {entry:ProgramVersionEntry;manifestSha256:string}
export interface RollbackTicket {pid:number;executable:string;archiveId:string;archiveSha256:string;currentVersion:string;currentProgramSha256:string;currentCheckpointId:string;profileId:string;pointerSha256:string;directory:string;pointer:string;files:Record<string,FileInfo>}
export interface ProgramVersionContext {version:string;executable:string;installed():Promise<boolean>;list():Promise<ProgramVersionEntry[]>;inspect(id:string):Promise<ArchiveInspection>;remove(id:string):Promise<unknown>;arm(ticket:RollbackTicket,valid:()=>boolean):Promise<()=>void>}
export function programVersionContext(directory:string,version:string):ProgramVersionContext{
 const call=async(action:string,id?:string)=>{try{const result=await execute(host(),[action,Buffer.from(directory+(id?'\n'+id:'')).toString('base64')],{windowsHide:true,timeout:180000,maxBuffer:4*1024*1024});return JSON.parse(result.stdout);}catch(error){const reason=String((error as {stderr?:string}).stderr||'');throw new Error(reason.includes('ROLLBACK_CHANGED')?tr('旧程序归档已改变，请重新选择'):reason.includes('ROLLBACK_CHECKPOINT')?tr('关联的数据恢复点无法校验'):tr('旧程序归档无法读取或校验'));}};
 return {version,executable:process.execPath,installed:async()=>{const {installedClip}=await import('./update-host');return installedClip();},list:()=>call('--list'),inspect:id=>call('--inspect',id),remove:id=>call('--delete',id),arm:async(ticket,valid)=>{
  const folder=join(directory,'rollback-actions','action-'+randomUUID());await mkdir(folder,{recursive:true});await copyFile(host(),join(folder,'RollbackHost.exe'));await writeFile(join(folder,'handoff.json'),JSON.stringify(ticket),{mode:0o600});if(!valid())throw new Error(tr('回退操作已取消'));
  return new Promise<()=>void>((resolve,reject)=>{let output='',settled=false,sent=false;const child=spawn(join(folder,'RollbackHost.exe'),[join(folder,'handoff.json')],{windowsHide:true,detached:true,stdio:['pipe','pipe','pipe']});
   const timer=setTimeout(()=>finish(new Error(tr('无法接管程序回退，请重新校验'))),180000);timer.unref();
   const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);if(error){child.kill();reject(error);}else{child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();child.unref();resolve(()=>child.kill());}};
   child.on('error',e=>finish(e));child.on('exit',()=>finish(new Error(tr('无法接管程序回退，请重新校验'))));child.stdin.on('error',e=>finish(e));child.stdout.on('data',value=>{output+=String(value);if(output.length>4096)return finish(new Error(tr('无法接管程序回退，请重新校验')));if(output.includes('ready')&&!sent){sent=true;if(!valid())return finish(new Error(tr('回退操作已取消')));child.stdin.write('rollback\n');}if(output.includes('armed'))finish();});
  });
 }};
}
export class ProgramRollbackManager {
 private sourceVault=new HistoryVault();private generation=0;private expiry?:NodeJS.Timeout;private armed=false;
 private pending?:{token:string;entry:ProgramVersionEntry;manifest:string;directory:string;destination:string;expires:number;encrypted:boolean;requiresProtection:boolean;preview?:ProgramRollbackPreview;protection?:{key:Buffer;record:VaultRecord;recoveryKey:string}};
 installing=false;
 constructor(private storage:StorageManager,private context:ProgramVersionContext){}
 cancel(){if(this.armed)return;this.generation++;clearTimeout(this.expiry);this.pending?.protection?.key.fill(0);this.pending=undefined;this.sourceVault.lock();}
 async list(){return (await this.context.list()).filter(p=>p.profileId===this.storage.profileId);}
 async remove(id:unknown){if(this.installing)throw new Error(tr('正在准备程序回退'));if(!checkpointID(id))throw new Error(tr('旧程序编号无效'));const entry=(await this.context.inspect(id)).entry;if(entry.profileId!==this.storage.profileId)throw new Error(tr('旧程序归档不属于当前资料'));await this.context.remove(id);}
 private request(token:string){const p=this.pending;if(!p||p.token!==token||p.expires<Date.now()||p.destination!==this.storage.directory||p.requiresProtection!==(this.storage.requiresProtection&&!p.encrypted)){this.cancel();throw new Error(tr('程序回退预览已过期，请重新选择'));}return p;}
 private async verify(token:string){try{const p=this.request(token),inspection=await this.context.inspect(p.entry.id);this.request(token);if(inspection.manifestSha256!==p.manifest)throw new Error(tr('旧程序归档已改变，请重新选择'));const point=await this.storage.checkpoints.verify(p.entry.checkpointId,this.storage.profileId);this.request(token);if(point.value.sourceVersion!==p.entry.version)throw new Error(tr('旧程序与数据恢复点不匹配'));return point;}catch(e){this.cancel();throw e;}}
 async choose(id:unknown):Promise<ProgramRollbackChoice>{if(this.installing)throw new Error(tr('正在准备程序回退'));this.cancel();const generation=this.generation;if(!checkpointID(id))throw new Error(tr('旧程序编号无效'));if(!await this.context.installed())throw new Error(tr('程序回退仅支持当前用户安装版'));const inspection=await this.context.inspect(id),entry=inspection.entry;
  if(entry.profileId!==this.storage.profileId||!newerVersion(this.context.version,entry.version))throw new Error(tr('不能切换到此程序版本'));const point=await this.storage.checkpoints.verify(entry.checkpointId,this.storage.profileId);if(point.value.sourceVersion!==entry.version)throw new Error(tr('旧程序与数据恢复点不匹配'));if(generation!==this.generation)throw new Error(tr('回退操作已取消'));
  const token=randomUUID(),encrypted=point.value.encrypted,requiresProtection=this.storage.requiresProtection&&!encrypted;this.pending={token,entry,manifest:inspection.manifestSha256,directory:point.directory,destination:this.storage.directory,expires:Date.now()+600000,encrypted,requiresProtection};this.expiry=setTimeout(()=>this.cancel(),600000);this.expiry.unref();return {token,version:entry.version,encrypted,requiresProtection};
 }
 async preview(token:string,password?:string,newPassword?:string,mode:'password'|'recovery'='password'):Promise<ProgramRollbackPreview>{const p=this.request(token);p.preview=undefined;p.protection?.key.fill(0);p.protection=undefined;const point=await this.verify(token);let key:Buffer|undefined;
  try{if(p.encrypted){await this.sourceVault.load(p.directory);await this.sourceVault.unlock(password,mode);this.request(token);key=this.sourceVault.copyKey();}if(p.requiresProtection&&!newPassword)throw new Error(tr('回退前需要设置新的历史解锁密码'));const info=await recoveryJob<any>({operation:'inspect',source:join(p.directory,'history.sqlite'),sourceKey:key,profileId:this.storage.profileId});this.request(token);if(info.schema!==point.value.schema)throw new Error(tr('旧程序与数据恢复点不匹配'));
   if(p.requiresProtection){const protection=await this.sourceVault.prepare(newPassword);try{this.request(token);p.protection=protection;}catch(e){protection.key.fill(0);throw e;}}
   p.preview={token,version:p.entry.version,encrypted:p.encrypted,requiresProtection:p.requiresProtection,schema:info.schema,clips:info.clips,snippets:info.snippets,categories:info.categories,scripts:info.scripts,recoveryKey:p.protection?.recoveryKey};return {...p.preview};
  }finally{key?.fill(0);}
 }
 async commit(token:string,proof:string|undefined,allowed:()=>boolean){const p=this.request(token);if(!p.preview)throw new Error(tr('请先校验并预览旧程序与资料'));if(p.protection&&proof?.trim()!==p.protection.recoveryKey)throw new Error(tr('请确认已保存完整恢复密钥'));if(this.installing)throw new Error(tr('正在准备程序回退'));this.installing=true;const generation=this.generation,valid=()=>{if(!allowed()||generation!==this.generation)return false;try{return this.request(token)===p;}catch{return false;}};
  const directory=join(this.storage.defaultDirectory,'version-recovered-'+randomUUID()),sourceKey=p.encrypted?this.sourceVault.copyKey():undefined,key=p.protection?Buffer.from(p.protection.key):sourceKey;let created=false;
  try{
   if(!valid()||!await this.context.installed())throw new Error(tr('回退操作已取消'));await this.verify(token);await mkdir(directory);created=true;
   const result=await recoveryJob<any>({operation:'rollback-copy',source:join(p.directory,'history.sqlite'),file:join(directory,'history.sqlite'),sourceKey,targetKey:key,version:p.entry.version,profileId:this.storage.profileId});if(!valid())throw new Error(tr('回退操作已取消'));if(result.schema!==p.preview.schema)throw new Error(tr('回退副本校验失败'));
   const files:Record<string,FileInfo>={'history.sqlite':result.files},record=p.protection?.record||await readVault(p.directory);if(record){const value=JSON.stringify({...record,hello:undefined});const {writeAtomic}=await import('./data-files');await writeAtomic(join(directory,'history-vault.json'),value);files['history-vault.json']={bytes:Buffer.byteLength(value),sha256:createHash('sha256').update(value).digest('hex')};}
   await this.verify(token);const current=await this.storage.checkpoint('manual',p.entry.version,valid);if(!valid())throw new Error(tr('回退操作已取消'));
   const pointerFile=join(this.storage.defaultDirectory,'storage-location.json'),pointerSha256=(await recoveryJob<FileInfo>({operation:'digest',file:pointerFile})).sha256,currentProgramSha256=(await recoveryJob<FileInfo>({operation:'digest',file:join(dirname(this.context.executable),'resources/app.asar')})).sha256;
   const pointer=JSON.stringify({version:1,profileId:this.storage.profileId,directory,previousDirectory:this.storage.directory,encrypted:!!key},null,2);
   const cancel=await this.context.arm({pid:process.pid,executable:this.context.executable,archiveId:p.entry.id,archiveSha256:p.manifest,currentVersion:this.context.version,currentProgramSha256,currentCheckpointId:current.id,profileId:this.storage.profileId,pointerSha256,directory,pointer,files},valid);if(!valid()){cancel();throw new Error(tr('回退操作已取消'));}this.armed=true;this.pending?.protection?.key.fill(0);this.sourceVault.lock();clearTimeout(this.expiry);return;
  }catch(e){if(created){for(const name of ['history.sqlite','history.sqlite-wal','history.sqlite-shm','history-vault.json'])await unlink(join(directory,name)).catch(()=>{});await rmdir(directory).catch(()=>{});}this.installing=false;throw e;}finally{sourceKey?.fill(0);if(key!==sourceKey)key?.fill(0);}
 }
}
