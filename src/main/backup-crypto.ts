import {t as tr} from '../shared/i18n';
import {randomBytes,scrypt,createCipheriv,createDecipheriv,createHash,type DecipherGCM} from 'node:crypto';
import {open} from 'node:fs/promises';
import {MAX_BACKUP_FILE} from './data-files';
const magic=Buffer.from('CLIP-ENC\x01','binary'),headerSize=magic.length+16+12;
export function isEncryptedBackup(data:Buffer){return data.subarray(0,magic.length).equals(magic);}
export function validateBackupPassword(password:unknown){if(typeof password!=='string'||password.length<12||password.length>1024)throw new Error(tr('备份密码需为 12–1024 个字符，请保存好；忘记后无法恢复'));return password;}
const derive=(password:string,salt:Buffer)=>new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024},(err,key)=>err?reject(err):resolve(key)));
export async function encodeBackup(value:unknown,password?:string){
 const plain=Buffer.from(JSON.stringify(value));if(plain.length>MAX_BACKUP_FILE-headerSize-16)throw new Error(tr('备份超过 384 MiB'));if(password===undefined)return plain;
 validateBackupPassword(password);const salt=randomBytes(16),iv=randomBytes(12),header=Buffer.concat([magic,salt,iv]),key=await derive(password,salt);
 try{const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(header);return Buffer.concat([header,cipher.update(plain),cipher.final(),cipher.getAuthTag()]);}finally{key.fill(0);plain.fill(0);}
}
/** Caller owns and clears the returned plaintext; unencrypted input is returned without copying. */
export async function backupPlaintext(data:Buffer,password?:string){
 if(data.length>MAX_BACKUP_FILE)throw new Error(tr('备份文件过大'));let plain=data;
 if(isEncryptedBackup(data)){
  if(typeof password!=='string'||!password||password.length>1024)throw new Error(tr('请输入备份密码'));if(data.length<headerSize+16)throw new Error(tr('加密备份不完整'));
  const header=data.subarray(0,headerSize),key=await derive(password,header.subarray(magic.length,magic.length+16));
  let decoded:Buffer|undefined;
  try{const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(magic.length+16));decipher.setAAD(header);decipher.setAuthTag(data.subarray(-16));decoded=decipher.update(data.subarray(headerSize,-16));const tail=decipher.final();plain=tail.length?Buffer.concat([decoded,tail]):decoded;if(tail.length){decoded.fill(0);tail.fill(0);}}
  catch{decoded?.fill(0);throw new Error(tr('密码不正确或备份已损坏，未恢复任何内容'));}finally{key.fill(0);}
 }
 return plain;
}
export function parseBackup(plain:Buffer){try{return JSON.parse(plain.toString('utf8'));}catch{throw new Error(tr('备份内容无法解析，未恢复任何内容'));}}
export async function decodeBackup(data:Buffer,password?:string){
 const plain=await backupPlaintext(data,password);try{return parseBackup(plain);}finally{if(plain!==data)plain.fill(0);}
}
/** Preview-only reader: one plaintext allocation plus bounded ciphertext blocks, never a second whole encrypted file. */
export async function readBackupPlaintext(file:string,expectedHash:string,password:string|undefined,valid:()=>boolean){
 const handle=await open(file,'r'),block=Buffer.alloc(256*1024);let plain:Buffer|undefined,key:Buffer|undefined,header:Buffer|undefined;
 const check=()=>{if(!valid())throw new Error(tr('备份已取消或处理超时，请稍后重试'));};
 async function read(target:Buffer,position:number){let at=0;while(at<target.length){check();const {bytesRead}=await handle.read(target,at,target.length-at,position+at);if(!bytesRead)throw new Error(tr('备份文件在读取时改变'));at+=bytesRead;}}
 try{
  check();const info=await handle.stat();if(!info.isFile()||info.size>MAX_BACKUP_FILE)throw new Error(tr('备份文件无效或超过 384 MiB'));
  header=Buffer.alloc(Math.min(info.size,headerSize));await read(header,0);const encrypted=isEncryptedBackup(header),digest=createHash('sha256');digest.update(header);
  if(encrypted&&(header.length!==headerSize||info.size<headerSize+16))throw new Error(tr('加密备份不完整'));
  let decipher:DecipherGCM|undefined,tag:Buffer|undefined;const end=encrypted?info.size-16:info.size;
  if(encrypted){if(typeof password!=='string'||!password||password.length>1024)throw new Error(tr('请输入备份密码'));key=await derive(password,header.subarray(magic.length,magic.length+16));check();decipher=createDecipheriv('aes-256-gcm',key,header.subarray(magic.length+16));decipher.setAAD(header);tag=Buffer.alloc(16);await read(tag,end);decipher.setAuthTag(tag);}
  plain=Buffer.alloc(encrypted?end-headerSize:info.size);let output=0;if(!encrypted){header.copy(plain);output=header.length;}
  for(let position=header.length;position<end;){const length=Math.min(block.length,end-position),chunk=block.subarray(0,length);await read(chunk,position);digest.update(chunk);position+=length;if(decipher){const decoded=decipher.update(chunk);try{output+=decoded.copy(plain,output);}finally{decoded.fill(0);}}else output+=chunk.copy(plain,output);}
  if(tag)digest.update(tag);const extra=Buffer.alloc(1);if((await handle.read(extra,0,1,info.size)).bytesRead)throw new Error(tr('备份文件在读取时改变'));check();if(digest.digest('hex')!==expectedHash)throw new Error(tr('备份文件已改变，请重新选择'));
  if(decipher){let tail:Buffer;try{tail=decipher.final();}catch{throw new Error(tr('密码不正确或备份已损坏，未恢复任何内容'));}try{output+=tail.copy(plain,output);}finally{tail.fill(0);}}
  if(output!==plain.length)throw new Error(tr('备份内容无法解析，未恢复任何内容'));const result=plain;plain=undefined;return result;
 }finally{plain?.fill(0);key?.fill(0);header?.fill(0);block.fill(0);await handle.close();}
}
