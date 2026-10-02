import {DatabaseSync} from 'node:sqlite';
import CipherDatabase from 'better-sqlite3-multiple-ciphers';
export interface DatabaseConnection {
 exec(sql:string):unknown;
 prepare(sql:string):{get(...args:any[]):any;all(...args:any[]):any[];iterate(...args:any[]):Iterable<any>;run(...args:any[]):unknown};
 close():unknown;
}
/** The key is supplied through the native buffer API, never interpolated into SQL. */
export function openDatabase(file:string,readOnly=false,key?:Uint8Array):DatabaseConnection {
 if(!key)return new DatabaseSync(file,{readOnly});
 if(key.length!==32)throw new Error('历史密钥格式无效');
 const db=new CipherDatabase(file,{readonly:readOnly,fileMustExist:readOnly});
 try{db.exec("PRAGMA temp_store=MEMORY;PRAGMA cipher='chacha20';PRAGMA legacy=0;PRAGMA plaintext_header_size=0;PRAGMA hmac_check=1;PRAGMA memory_security=1;");const material=Buffer.from(key);try{db.key(material);}finally{material.fill(0);}db.prepare('SELECT count(*) FROM sqlite_master').get();return db;}catch(e){db.close();throw new Error('无法解密历史，密钥不正确或数据库已损坏');}
}
