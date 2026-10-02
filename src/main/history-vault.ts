import {randomBytes,randomUUID,scrypt,createCipheriv,createDecipheriv} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {writeAtomic} from './data-files';
interface Box {iv:string;body:string;tag:string}
export interface VaultRecord {version:1;id:string;cipher:'chacha20';salt:string;password:Box;recovery:Box;hello?:string;idleMinutes:number}
export interface KeyProtector {available():Promise<boolean>;encrypt(value:string):Promise<string>;decrypt(value:string):Promise<string>}
export interface HelloVerifier {available():Promise<boolean>;verify():Promise<boolean>}
const fileName='history-vault.json';
const b64=(v:unknown,size:number)=>typeof v==='string'&&Buffer.from(v,'base64').length===size&&Buffer.from(v,'base64').toString('base64')===v;
function checked(value:unknown):VaultRecord {const v=value as VaultRecord;if(!v||v.version!==1||v.cipher!=='chacha20'||typeof v.id!=='string'||! /^[0-9a-f-]{36}$/.test(v.id)||!b64(v.salt,16)||!Number.isInteger(v.idleMinutes)||v.idleMinutes<0||v.idleMinutes>120||v.hello!==undefined&&(typeof v.hello!=='string'||v.hello.length>16384))throw new Error('历史加密配置损坏，请使用完整资料副本恢复');for(const box of [v.password,v.recovery])if(!box||!b64(box.iv,12)||!b64(box.body,32)||!b64(box.tag,16))throw new Error('历史加密配置损坏');return v;}
function password(value:unknown):string {if(typeof value!=='string'||value.length<12||value.length>1024)throw new Error('解锁密码需为 12–1024 个字符');return value;}
async function derive(value:string,salt:string){return new Promise<Buffer>((resolve,reject)=>scrypt(value,Buffer.from(salt,'base64'),32,{N:32768,r:8,p:1,maxmem:64*1024*1024},(e,key)=>e?reject(e):resolve(key)));}
function seal(key:Buffer,data:Buffer,id:string,role:string):Box {const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from('clipper-history-v1:'+id+':'+role));return {iv:iv.toString('base64'),body:Buffer.concat([c.update(data),c.final()]).toString('base64'),tag:c.getAuthTag().toString('base64')};}
function unseal(key:Buffer,box:Box,id:string,role:string){try{const c=createDecipheriv('aes-256-gcm',key,Buffer.from(box.iv,'base64'));c.setAAD(Buffer.from('clipper-history-v1:'+id+':'+role));c.setAuthTag(Buffer.from(box.tag,'base64'));return Buffer.concat([c.update(Buffer.from(box.body,'base64')),c.final()]);}catch{throw new Error(role==='password'?'密码不正确或加密配置已损坏':'恢复密钥不正确或加密配置已损坏');}}
export async function readVault(directory:string):Promise<VaultRecord|undefined>{const file=join(directory,fileName);try{if((await stat(file)).size>32768)throw new Error('历史加密配置过大');return checked(JSON.parse(await readFile(file,'utf8')));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw e;}}
export class HistoryVault {
 private key?:Buffer;private record?:VaultRecord;private failedAt=0;private generation=0;private directory='';
 constructor(private protector?:KeyProtector,private hello?:HelloVerifier){}
 get unlocked(){return !!this.key;}
 copyKey(){return this.key?Buffer.from(this.key):undefined;}
 state(){return {encrypted:!!this.record,unlocked:!!this.key,hello:!!this.record?.hello,idleMinutes:this.record?.idleMinutes||0};}
 async load(directory:string){this.lock();this.directory=directory;this.record=await readVault(directory);return this.state();}
 async prepare(value:unknown){const pass=password(value),id=randomUUID(),salt=randomBytes(16).toString('base64'),key=randomBytes(32),recoveryKey=randomBytes(32),derived=await derive(pass,salt);try{return {key,record:{version:1 as const,id,cipher:'chacha20' as const,salt,password:seal(derived,key,id,'password'),recovery:seal(recoveryKey,key,id,'recovery'),idleMinutes:15},recoveryKey:'C7-'+recoveryKey.toString('base64url')};}finally{derived.fill(0);recoveryKey.fill(0);}}
 async unlock(value:unknown,mode:'password'|'recovery'|'hello'='password'){
  const generation=this.generation,record=this.record;if(!record)throw new Error('当前资料未启用加密');if(Date.now()-this.failedAt<1500)throw new Error('请稍候再试');let key:Buffer|undefined;
  try{if(mode==='hello'){if(!record.hello||!this.hello||!this.protector||!await this.hello.available()||!await this.hello.verify())throw new Error('Windows Hello 未通过验证');if(generation!==this.generation)throw new Error('解锁已取消');const v=JSON.parse(await this.protector.decrypt(record.hello));if(v.id!==record.id||!b64(v.key,32))throw new Error('本机快捷解锁凭据无效，请使用密码');key=Buffer.from(v.key,'base64');}
   else if(mode==='password'){const derived=await derive(password(value),record.salt);try{key=unseal(derived,record.password,record.id,'password');}finally{derived.fill(0);}}
   else if(mode==='recovery'){if(typeof value!=='string'||!/^C7-[A-Za-z0-9_-]{43}$/.test(value.trim()))throw new Error('恢复密钥格式无效');const recovery=Buffer.from(value.trim().slice(3),'base64url');try{key=unseal(recovery,record.recovery,record.id,'recovery');}finally{recovery.fill(0);}}
   else throw new Error('解锁方式无效');
   if(generation!==this.generation)throw new Error('解锁已取消');this.key?.fill(0);this.key=key;key=undefined;this.failedAt=0;
  }catch(e){this.failedAt=Date.now();throw e;}finally{key?.fill(0);}
 }
 /** Writes the envelope before a pointer can make this directory active. */
 adopt(directory:string,record:VaultRecord,key:Buffer){checked(record);if(key.length!==32)throw new Error('历史密钥格式无效');const copy=Buffer.from(key);this.lock();this.directory=directory;this.record=record;this.key=copy;}
 async install(directory:string,record:VaultRecord,key:Buffer){checked(record);await writeAtomic(join(directory,fileName),JSON.stringify(record));this.adopt(directory,record,key);}
 async changePassword(value:unknown){if(!this.key||!this.record)throw new Error('请先解锁');const pass=password(value),generation=this.generation,salt=randomBytes(16).toString('base64'),derived=await derive(pass,salt);try{if(generation!==this.generation||!this.key)throw new Error('操作已取消');const next={...this.record,salt,password:seal(derived,this.key,this.record.id,'password')};await writeAtomic(join(this.directory,fileName),JSON.stringify(next));this.record=next;}finally{derived.fill(0);}}
 async configure(hello:boolean,idleMinutes:number){if(!this.key||!this.record)throw new Error('请先解锁');if(typeof hello!=='boolean'||!Number.isInteger(idleMinutes)||idleMinutes<0||idleMinutes>120)throw new Error('锁定设置无效');const generation=this.generation;let wrapped:string|undefined=hello?this.record.hello:undefined;if(hello&&!wrapped){if(!this.hello||!this.protector||!await this.hello.available()||!await this.protector.available()||!await this.hello.verify())throw new Error('Windows Hello 不可用或验证未通过');if(generation!==this.generation||!this.key)throw new Error('操作已取消');wrapped=await this.protector.encrypt(JSON.stringify({id:this.record.id,key:this.key.toString('base64')}));}if(generation!==this.generation)throw new Error('操作已取消');const next={...this.record,hello:wrapped,idleMinutes};await writeAtomic(join(this.directory,fileName),JSON.stringify(next));this.record=next;}
 lock(){this.generation++;this.key?.fill(0);this.key=undefined;}
 reset(directory:string){this.lock();this.record=undefined;this.directory=directory;}
}
