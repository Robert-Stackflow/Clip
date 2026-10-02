import {t as tr} from '../shared/i18n';
import {open,mkdir,rename,unlink} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {defaultAppearance,validateAppearance,type AppearanceState,type UIAppearance} from '../shared/appearance';
export class AppearanceStore {
 private value:UIAppearance=defaultAppearance();private warning='';private pending:Promise<unknown>=Promise.resolve();
 constructor(private file:string){}
 state():AppearanceState{return {value:{...this.value},warning:this.warning};}
 async load(){try{const file=await open(this.file,'r');let raw:string;try{const info=await file.stat();if(!info.isFile()||info.size>2048)throw new Error('Invalid appearance file');const buffer=Buffer.alloc(2049),{bytesRead}=await file.read(buffer,0,buffer.length,0);if(bytesRead>2048)throw new Error('Invalid appearance file');raw=buffer.subarray(0,bytesRead).toString('utf8');}finally{await file.close();}const saved=JSON.parse(raw);if(saved?.version!==1)throw new Error('Unsupported appearance file');this.value=validateAppearance(saved.value);this.warning='';}catch(e){this.value=defaultAppearance();this.warning=(e as NodeJS.ErrnoException).code==='ENOENT'?'':tr('外观设置无法读取，暂用默认值。保存后可重新建立外观设置。');}return this.state();}
 save(value:unknown){const next=validateAppearance(value);const task=this.pending.catch(()=>{}).then(async()=>{const folder=dirname(this.file),temporary=join(folder,'.appearance-'+randomUUID()+'.tmp');let created=false;try{await mkdir(folder,{recursive:true});const file=await open(temporary,'wx',0o600);created=true;try{await file.writeFile(JSON.stringify({version:1,value:next})+'\n','utf8');await file.sync();}finally{await file.close();}await rename(temporary,this.file);created=false;this.value=next;this.warning='';return this.state();}finally{if(created)await unlink(temporary).catch(()=>{});}});this.pending=task;return task;}
}
