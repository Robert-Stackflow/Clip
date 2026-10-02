import {t as tr} from '../shared/i18n';
import {randomBytes,scrypt,createCipheriv,createDecipheriv} from 'node:crypto';
import {MAX_BACKUP_FILE} from './data-files';
const magic=Buffer.from('CLIPPER-ENC\x01','binary'),headerSize=magic.length+16+12;
export function isEncryptedBackup(data:Buffer){return data.subarray(0,magic.length).equals(magic);}
export function validateBackupPassword(password:unknown){if(typeof password!=='string'||password.length<12||password.length>1024)throw new Error(tr('备份密码需为 12–1024 个字符，请保存好；忘记后无法恢复'));return password;}
const derive=(password:string,salt:Buffer)=>new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024},(err,key)=>err?reject(err):resolve(key)));
export async function encodeBackup(value:unknown,password?:string){
 const plain=Buffer.from(JSON.stringify(value));if(plain.length>MAX_BACKUP_FILE-headerSize-16)throw new Error(tr('备份超过 384 MiB'));if(password===undefined)return plain;
 validateBackupPassword(password);const salt=randomBytes(16),iv=randomBytes(12),header=Buffer.concat([magic,salt,iv]),key=await derive(password,salt);
 try{const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(header);return Buffer.concat([header,cipher.update(plain),cipher.final(),cipher.getAuthTag()]);}finally{key.fill(0);plain.fill(0);}
}
export async function decodeBackup(data:Buffer,password?:string){
 if(data.length>MAX_BACKUP_FILE)throw new Error(tr('备份文件过大'));let plain=data;
 if(isEncryptedBackup(data)){
  if(typeof password!=='string'||!password||password.length>1024)throw new Error(tr('请输入备份密码'));if(data.length<headerSize+16)throw new Error(tr('加密备份不完整'));
  const header=data.subarray(0,headerSize),key=await derive(password,header.subarray(magic.length,magic.length+16));
  try{const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(magic.length+16));decipher.setAAD(header);decipher.setAuthTag(data.subarray(-16));plain=Buffer.concat([decipher.update(data.subarray(headerSize,-16)),decipher.final()]);}catch{throw new Error(tr('密码不正确或备份已损坏，未恢复任何内容'));}finally{key.fill(0);}
 }
 try{return JSON.parse(plain.toString('utf8'));}catch{throw new Error(tr('备份内容无法解析，未恢复任何内容'));}finally{if(plain!==data)plain.fill(0);}
}
