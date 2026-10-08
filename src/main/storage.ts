import {t as tr} from '../shared/i18n';
import {openDatabase,type DatabaseConnection} from './database';
import {mkdir,readFile,readdir,unlink,copyFile,open,stat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {randomUUID,createHash,createHmac} from 'node:crypto';
import {Store} from './store';
import {localDirectory,writeAtomic} from './data-files';
import type {StoragePlan} from '../shared/data';
import {inspectDatabase,startupDatabaseInfo} from './database-check';
import {HistoryVault,readVault,type VaultRecord} from './history-vault';
import {copyDatabase} from './database-copy';
import {CheckpointManager} from './checkpoints';
import {recoveryJob} from './recovery-jobs';
import {APP_VERSION} from '../shared/version';
import {stableVersion} from '../shared/updates';
import type {CheckpointEntry} from '../shared/checkpoints';
export class HistoryLockedError extends Error {constructor(){super(tr('历史已加密，请先解锁'));}}
function fingerprint(db:DatabaseConnection){const hash=createHash('sha256');for(const table of ['clips','snippets','meta']){hash.update(table);for(const row of db.prepare(`SELECT * FROM ${table} ORDER BY ${table==='meta'?'key':'id'}`).iterate())hash.update(JSON.stringify(row)+'\n');}return hash.digest('hex');}
function checkDatabase(file:string,profileId:string,expected?:string,key?:Uint8Array){const db=openDatabase(file,true,key);try{const result=db.prepare('PRAGMA quick_check').get() as any;if(result.quick_check!=='ok')throw new Error(tr('数据完整性检查失败'));const id=db.prepare("SELECT value FROM meta WHERE key='profile-id'").get() as any;if(!id||JSON.parse(id.value)!==profileId)throw new Error(tr('此目录不属于当前 Clip 数据'));if(expected&&fingerprint(db)!==expected)throw new Error(tr('迁移副本与当前数据不一致'));}finally{db.close();}}
export class StorageManager {
 store!:Store;directory='';profileId='';previousDirectory='';private plan:{token:string;directory:string;expires:number}|undefined;
 private encryptionPlan?:{token:string;key:Buffer;record:VaultRecord;recoveryKey:string;directory:string;expires:number};
 private protectionExpected=false;
 get requiresProtection(){return this.protectionExpected||this.vault.state().encrypted;}
 private encryptionTimer?:NodeJS.Timeout;private encryptionGeneration=0;
 readonly checkpoints:CheckpointManager;
 constructor(readonly defaultDirectory:string,readonly vault=new HistoryVault(),readonly applicationVersion=APP_VERSION){this.checkpoints=new CheckpointManager(defaultDirectory);}
 private get pointer(){return join(this.defaultDirectory,'storage-location.json');}
 async start(credential?:{value:unknown;mode:'password'|'recovery'|'hello'}){
  await mkdir(this.defaultDirectory,{recursive:true});let saved:any,hasPointer=false;
  try{saved=JSON.parse(await readFile(this.pointer,'utf8'));hasPointer=true;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw new Error(tr('存储位置配置无法读取。请选择已有资料或备份进行恢复；未创建空历史'));}
  if(hasPointer){if(!saved||saved.version!==1||typeof saved.profileId!=='string'||! /^[0-9a-f-]{36}$/.test(saved.profileId)||typeof saved.directory!=='string')throw new Error(tr('存储位置配置无效'));
   this.protectionExpected=saved.encrypted===true;this.directory=await localDirectory(saved.directory).catch(()=>{throw new Error(tr`历史目录不可用：${saved.directory}。请恢复该目录后重试；未创建空历史`);});this.profileId=saved.profileId;
   this.previousDirectory=typeof saved.previousDirectory==='string'?saved.previousDirectory:'';
  }else this.directory=this.defaultDirectory;
  this.protectionExpected=saved?.encrypted===true||await stat(join(this.directory,'history-vault.json')).then(()=>true,()=>false);
  const protection=await this.vault.load(this.directory);if(this.protectionExpected&&!protection.encrypted)throw new Error(tr('加密资料的 history-vault.json 缺失或损坏，请使用完整目录副本或备份恢复'));if(protection.encrypted){if(!credential)throw new HistoryLockedError();await this.vault.unlock(credential.value,credential.mode);}const key=this.vault.copyKey();
  const permitted=()=>!protection.encrypted||this.vault.unlocked;
  const file=join(this.directory,'history.sqlite');let candidate:Store|undefined;try{const exists=await stat(file).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});if((protection.encrypted||hasPointer)&&!exists)throw new Error(tr('历史数据库缺失，未创建空历史'));if(exists){let info=startupDatabaseInfo(file,key,hasPointer?this.profileId:undefined);const previous=stableVersion(info.applicationVersion)||'';
   if(!hasPointer||info.schema!==7||previous!==this.applicationVersion)info=await recoveryJob<any>({operation:'inspect',source:file,sourceKey:key,profileId:hasPointer?this.profileId:undefined});
   if(!permitted())throw new HistoryLockedError();this.profileId=info.profileId||randomUUID();if(previous!==this.applicationVersion)await this.checkpoints.create(this.directory,this.profileId,previous,this.applicationVersion,'upgrade',key,permitted);}if(!permitted())throw new HistoryLockedError();
   candidate=new Store(file,true,false,key);this.profileId=candidate.meta('profile-id','')||this.profileId||randomUUID();candidate.setMeta('profile-id',this.profileId);candidate.setMeta('application-version',this.applicationVersion);
   if(!saved)await this.savePointer(this.directory,'');this.store=candidate;return candidate;
  }catch(e){candidate?.close();this.vault.lock();throw e;}finally{key?.fill(0);}
 }
 async checkpoint(reason:CheckpointEntry['reason']='manual',targetVersion=this.applicationVersion,valid=()=>true){const key=this.vault.copyKey();try{return await this.checkpoints.create(this.directory,this.profileId,this.store.meta('application-version',''),targetVersion,reason,key,valid);}finally{key?.fill(0);}}
 async adoptRecovery(directory:string,candidate:Store,protection?:{record:VaultRecord;key:Buffer},valid=()=>true){
  const profileId=candidate.meta('profile-id','');if(!/^[0-9a-f-]{36}$/.test(profileId))throw new Error(tr('恢复资料编号无效'));
  candidate.setMeta('application-version',this.applicationVersion);
  // Keep the exact broken pointer before committing the replacement.
  try{await copyFile(this.pointer,join(this.defaultDirectory,`storage-location.before-recovery-${randomUUID()}.json`),constants.COPYFILE_EXCL);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  await writeAtomic(this.pointer,JSON.stringify({version:1,profileId,directory,previousDirectory:this.directory,encrypted:!!protection},null,2),undefined,valid);
  this.protectionExpected=!!protection;this.profileId=profileId;this.previousDirectory=this.directory;this.directory=directory;this.store=candidate;if(protection)this.vault.adopt(directory,protection.record,protection.key);else this.vault.reset(directory);return candidate;
 }
 private savePointer(directory:string,previousDirectory:string,encrypted=this.vault.state().encrypted){return writeAtomic(this.pointer,JSON.stringify({version:1,profileId:this.profileId,directory,previousDirectory,encrypted},null,2));}
 async bytes(){const info=await stat(join(this.directory,'history.sqlite'));const wal=await stat(join(this.directory,'history.sqlite-wal')).catch(()=>({size:0}));return info.size+wal.size;}
 async prepare(directory:unknown):Promise<StoragePlan>{
  const target=await localDirectory(directory);if(target.toLowerCase()===this.directory.toLowerCase())throw new Error(tr('这已经是当前数据目录'));if((await readdir(target)).length)throw new Error(tr('迁移目标需要是空文件夹；现有文件不会被覆盖'));
  this.plan={token:randomUUID(),directory:target,expires:Date.now()+600000};return {...this.plan,bytes:await this.bytes()};
 }
 async migrate(token:string){
  const plan=this.plan;if(!plan||plan.token!==token||plan.expires<Date.now())throw new Error(tr('迁移预览已过期，请重新选择目录'));this.plan=undefined;
  const target=await localDirectory(plan.directory);if(target!==plan.directory||(await readdir(target)).length)throw new Error(tr('目标文件夹已改变，请重新选择'));
  const temp=join(target,`.clip-migration-${randomUUID()}.sqlite`),destination=join(target,'history.sqlite'),previous=this.directory,key=this.vault.copyKey(),record=await readVault(previous);let created=false,next:Store|undefined,committed=false,envelopeCreated=false,predecessorCreated=false;
  try{
   this.store.db.prepare('VACUUM INTO ?').run(temp);checkDatabase(temp,this.profileId,fingerprint(this.store.db),key);
   await copyFile(temp,destination,constants.COPYFILE_EXCL);created=true;const handle=await open(destination,'r+');try{await handle.sync();}finally{await handle.close();}
   checkDatabase(destination,this.profileId,fingerprint(this.store.db),key);next=new Store(destination,false,false,key);
   if(record){await copyFile(join(previous,'history-vault.json'),join(target,'history-vault.json'),constants.COPYFILE_EXCL);envelopeCreated=true;}
   if(await this.predecessor()){await copyFile(join(previous,'plaintext-predecessor.json'),join(target,'plaintext-predecessor.json'),constants.COPYFILE_EXCL);predecessorCreated=true;}
   await this.savePointer(target,previous);committed=true;const old=this.store;this.store=next;this.directory=target;this.previousDirectory=previous;if(record&&key)this.vault.adopt(target,record,key);try{old.close();}catch{console.warn(tr('原数据库关闭时发生错误，当前数据目录已切换'));}return this.store;
  }catch(e){if(!committed){next?.close();if(created){await unlink(destination).catch(()=>{});await unlink(destination+'-wal').catch(()=>{});await unlink(destination+'-shm').catch(()=>{});}if(envelopeCreated)await unlink(join(target,'history-vault.json')).catch(()=>{});if(predecessorCreated)await unlink(join(target,'plaintext-predecessor.json')).catch(()=>{});}throw e;}
  finally{key?.fill(0);await unlink(temp).catch(()=>{});}
 }
 async prepareEncryption(value:unknown){if(this.vault.state().encrypted)throw new Error(tr('当前数据库已经加密'));this.cancelEncryption();const generation=this.encryptionGeneration,result=await this.vault.prepare(value),token=randomUUID();if(generation!==this.encryptionGeneration){result.key.fill(0);throw new Error(tr('加密准备已取消'));}this.encryptionPlan={...result,token,directory:this.directory,expires:Date.now()+600000};this.encryptionTimer=setTimeout(()=>this.cancelEncryption(),600000);this.encryptionTimer.unref();return {token,recoveryKey:result.recoveryKey};}
 cancelEncryption(){this.encryptionGeneration++;clearTimeout(this.encryptionTimer);this.encryptionPlan?.key.fill(0);this.encryptionPlan=undefined;}
 async encrypt(token:string,recoveryProof:unknown){const p=this.encryptionPlan;if(!p||p.token!==token||p.expires<Date.now()||p.directory!==this.directory){this.cancelEncryption();throw new Error(tr('加密预览已过期，请重新设置'));}if(typeof recoveryProof!=='string'||recoveryProof.trim()!==p.recoveryKey)throw new Error(tr('请填写刚才保存的完整恢复密钥'));
  const previous=this.directory,target=join(this.defaultDirectory,'encrypted-'+randomUUID()),file=join(target,'history.sqlite');let next:Store|undefined,committed=false;
  await mkdir(target);try{const expected=copyDatabase(this.store,file,p.key);checkDatabase(file,this.profileId,expected,p.key);await writeAtomic(join(target,'history-vault.json'),JSON.stringify(p.record));const h=await open(file,'r+');try{await h.sync();}finally{await h.close();}
   next=new Store(file,false,false,p.key);const cleanup={directory:previous,fingerprint:expected,profileId:this.profileId};await writeAtomic(join(target,'plaintext-predecessor.json'),JSON.stringify({...cleanup,mac:createHmac('sha256',p.key).update(JSON.stringify(cleanup)).digest('hex')}));await this.savePointer(target,previous,true);committed=true;this.protectionExpected=true;const old=this.store;this.store=next;this.directory=target;this.previousDirectory=previous;this.vault.adopt(target,p.record,p.key);old.close();return next;
  }catch(e){if(!committed){next?.close();for(const name of ['history.sqlite','history.sqlite-wal','history.sqlite-shm','history-vault.json','plaintext-predecessor.json'])await unlink(join(target,name)).catch(()=>{});}throw e;}finally{this.cancelEncryption();}
 }
 async decrypt(){
  if(!this.vault.state().encrypted||!this.vault.unlocked)throw new Error(tr('请先解锁加密资料'));
  const previous=this.directory,target=join(this.defaultDirectory,'plaintext-'+randomUUID()),file=join(target,'history.sqlite'),key=this.vault.copyKey();let next:Store|undefined,committed=false;
  if(!key)throw new Error(tr('请先解锁加密资料'));
  try{
   await mkdir(target);
   const copied=await recoveryJob<{profileId:string;fingerprint:string}>({operation:'copy',source:join(previous,'history.sqlite'),file,sourceKey:key});
   if(copied.profileId!==this.profileId)throw new Error(tr('迁移副本与当前数据不一致'));
   const handle=await open(file,'r+');try{await handle.sync();}finally{await handle.close();}
   next=new Store(file,false,false);if(fingerprint(next.db)!==copied.fingerprint)throw new Error(tr('迁移副本与当前数据不一致'));
   await this.savePointer(target,previous,false);committed=true;
   const old=this.store;this.store=next;this.directory=target;this.previousDirectory=previous;this.protectionExpected=false;this.vault.reset(target);
   try{old.close();}catch{console.warn(tr('原数据库关闭时发生错误，当前数据目录已切换'));}
   return next;
  }catch(e){if(!committed){next?.close();for(const suffix of ['','-wal','-shm'])await unlink(file+suffix).catch(()=>{});}throw e;}
  finally{key.fill(0);}
 }
 async predecessor(){try{const p=JSON.parse(await readFile(join(this.directory,'plaintext-predecessor.json'),'utf8')),key=this.vault.copyKey();try{const data={directory:p.directory,fingerprint:p.fingerprint,profileId:p.profileId};if(!key||typeof p.directory!=='string'||p.profileId!==this.profileId||typeof p.fingerprint!=='string'||p.mac!==createHmac('sha256',key).update(JSON.stringify(data)).digest('hex'))throw new Error(tr('原副本清理信息无效'));return data as {directory:string;fingerprint:string;profileId:string};}finally{key?.fill(0);}}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
 /** Explicitly requested only after the encrypted copy has passed inspection. Never recursive. */
 async removePredecessor(){if(!this.vault.unlocked)throw new Error(tr('请先解锁'));const p=await this.predecessor();if(!p)return;const root=await localDirectory(p.directory),file=resolve(root,'history.sqlite');if(root.toLowerCase()===this.directory.toLowerCase()||dirname(file)!==resolve(root))throw new Error(tr('原目录不允许清理'));const key=this.vault.copyKey();try{checkDatabase(join(this.directory,'history.sqlite'),this.profileId,undefined,key);}finally{key?.fill(0);}const exists=await stat(file).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});if(exists&&inspectDatabase(file).fingerprint!==p.fingerprint)throw new Error(tr('原副本已改变，未删除任何内容'));for(const suffix of ['','-wal','-shm'])await unlink(file+suffix).catch(e=>{if(e.code!=='ENOENT')throw e;});await unlink(join(this.directory,'plaintext-predecessor.json'));}
}
