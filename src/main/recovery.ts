import {t as tr} from '../shared/i18n';
import {mkdir,unlink,rmdir,open} from 'node:fs/promises';
import {join,basename,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Store} from './store';
import {StorageManager} from './storage';
import {boundedFile,localDirectory,writeAtomic} from './data-files';
import {decodeBackup,isEncryptedBackup} from './backup-crypto';
import {validateBackup} from '../shared/core';
import type {Payload} from '../shared/types';
import type {RecoveryChoice,RecoveryPreview} from '../shared/recovery';
import {HistoryVault,readVault,type VaultRecord} from './history-vault';
import {recoveryJob} from './recovery-jobs';
const digest=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
export class RecoveryManager {
 private pending:(RecoveryChoice&{destination:string;file:string;expires:number;hash:string;fingerprint?:string;value?:unknown;ready?:boolean;protection?:{key:Buffer;record:VaultRecord;recoveryKey:string}})|undefined;
 private generation=0;
 private sourceVault=new HistoryVault();
 private expiryTimer:NodeJS.Timeout|undefined;
 constructor(private storage:StorageManager,private thumbnail:(p:Payload)=>string|undefined=()=>undefined){}
 cancel(){this.generation++;this.pending?.protection?.key.fill(0);this.pending=undefined;this.sourceVault.lock();clearTimeout(this.expiryTimer);}
 async choose(kind:'database'|'backup',path:string):Promise<RecoveryChoice>{
  this.cancel();const generation=this.generation,token=randomUUID();let file:string,hash:string,encrypted=false;
  if(kind==='database'){file=join(await localDirectory(path),'history.sqlite');const vault=await readVault(dirname(file));encrypted=!!vault;hash=vault?digest(Buffer.from(JSON.stringify(vault))):(await recoveryJob<any>({operation:'inspect',source:file})).fingerprint;}
  else if(kind==='backup'){file=path;const bytes=await boundedFile(file);hash=digest(bytes);encrypted=isEncryptedBackup(bytes);}
  else throw new Error(tr('恢复来源无效'));
  if(generation!==this.generation)throw new Error(tr('恢复预览已过期，请重新选择'));const choice={token,name:kind==='database'?path:basename(path),kind,encrypted,requiresProtection:this.storage.requiresProtection&&!(kind==='database'&&encrypted)};this.pending={...choice,destination:this.storage.directory,file,hash,expires:Date.now()+600000};this.expiryTimer=setTimeout(()=>this.cancel(),600000);this.expiryTimer.unref();return choice;
 }
 private request(token:string){const p=this.pending;if(!p||p.token!==token||p.expires<Date.now()||p.destination!==this.storage.directory||p.requiresProtection!==(this.storage.requiresProtection&&!(p.kind==='database'&&p.encrypted))){this.cancel();throw new Error(tr('恢复预览已过期，请重新选择'));}return p;}
 async preview(token:string,password?:string,newPassword?:string,mode?:'password'|'recovery'):Promise<RecoveryPreview>{
  const p=this.request(token);p.ready=false;p.value=undefined;p.protection?.key.fill(0);p.protection=undefined;let counts:{clips:number;snippets:number;categories:number;scripts:number};
  if(p.requiresProtection&&!newPassword)throw new Error(tr('恢复新资料前，请设置新的历史解锁密码'));
  if(p.kind==='database'){let key:Buffer|undefined;try{if(p.encrypted){const record=await readVault(dirname(p.file));if(digest(Buffer.from(JSON.stringify(record)))!==p.hash)throw new Error(tr('原目录的加密配置已改变，请重新选择'));await this.sourceVault.load(dirname(p.file));await this.sourceVault.unlock(password,mode||(password?.trim().startsWith('C7-')?'recovery':'password'));this.request(token);key=this.sourceVault.copyKey();}const info=await recoveryJob<any>({operation:'inspect',source:p.file,sourceKey:key});this.request(token);if(!p.encrypted&&info.fingerprint!==p.hash)throw new Error(tr('原目录内容已改变，请重新选择'));p.fingerprint=info.fingerprint;counts=info;}finally{key?.fill(0);}}
  else{const bytes=await boundedFile(p.file);if(digest(bytes)!==p.hash)throw new Error(tr('备份文件已改变，请重新选择'));const value=await decodeBackup(bytes,password);const data=validateBackup(value);const test=new Store(':memory:');try{test.import(value,this.thumbnail);}finally{test.close();}p.value=value;counts={clips:data.clips.length,snippets:data.snippets.length,categories:data.categories.length,scripts:data.scripts.length};}
  this.request(token);if(newPassword&&!(p.kind==='database'&&p.encrypted)){const protection=await this.sourceVault.prepare(newPassword);try{this.request(token);p.protection=protection;}catch(e){protection.key.fill(0);throw e;}}
  p.ready=true;return {token:p.token,name:p.name,kind:p.kind,encrypted:p.encrypted,requiresProtection:p.requiresProtection,recoveryKey:p.protection?.recoveryKey,clips:counts.clips,snippets:counts.snippets,categories:counts.categories,scripts:counts.scripts};
 }
 async commit(token:string,recoveryProof?:string){
  const p=this.request(token);if(!p.ready)throw new Error(tr('请先校验并预览资料'));
  if(p.protection&&p.protection.recoveryKey!==recoveryProof?.trim())throw new Error(tr('请确认已保存完整恢复密钥'));
  const directory=join(this.storage.defaultDirectory,`recovered-${Date.now()}-${randomUUID()}`),file=join(directory,'history.sqlite'),sourceKey=p.kind==='database'&&p.encrypted?this.sourceVault.copyKey():undefined,key=p.protection?Buffer.from(p.protection.key):sourceKey;let next:Store|undefined,created=false,record:VaultRecord|undefined=p.protection?.record;
  try{
   await mkdir(directory);created=true;
   if(p.kind==='database'){
    if(p.encrypted){const original=await readVault(dirname(p.file));if(!original||digest(Buffer.from(JSON.stringify(original)))!==p.hash||!sourceKey)throw new Error(tr('原加密资料已改变，请重新预览'));record={...original,hello:undefined};}
    const result=await recoveryJob<any>({operation:'copy',source:p.file,file,sourceKey,targetKey:key});this.request(token);
    if(result.fingerprint!==p.fingerprint)throw new Error(tr('原目录内容已改变，请重新预览'));
   }else if(digest(await boundedFile(p.file))!==p.hash)throw new Error(tr('备份文件已改变，请重新选择'));
   next=new Store(file,false,false,key);if(p.kind==='backup')next.import(p.value,this.thumbnail);
   next.settings={...next.settings,paused:true};next.setMeta('settings',next.settings);
   next.setMeta('automatic-backup',{...next.meta('automatic-backup',{}),enabled:false,nextAt:0,lastError:''});
   next.setMeta('lan-config',{enabled:false,autoNew:false});next.setMeta('lan-index',[]);
   next.db.exec("UPDATE clips SET data=json_set(data,'$.shared',json('false')) WHERE json_extract(data,'$.shared')=1");
   next.setMeta('profile-id',next.meta('profile-id','')||randomUUID());next.close();next=undefined;
   const handle=await open(file,'r+');try{await handle.sync();}finally{await handle.close();}
   await recoveryJob({operation:'inspect',source:file,sourceKey:key});this.request(token);if(record)await writeAtomic(join(directory,'history-vault.json'),JSON.stringify(record));next=new Store(file,false,false,key);this.request(token);await this.storage.adoptRecovery(directory,next,record&&key?{record,key}:undefined,()=>{this.request(token);return true;});this.cancel();return next;
  }catch(e){next?.close();if(created){for(const suffix of ['','-wal','-shm'])await unlink(file+suffix).catch(()=>{});await unlink(join(directory,'history-vault.json')).catch(()=>{});await rmdir(directory).catch(()=>{});}throw e;}finally{sourceKey?.fill(0);if(key!==sourceKey)key?.fill(0);}
 }
}
