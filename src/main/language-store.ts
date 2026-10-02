import {openSync,readSync,fstatSync,closeSync} from 'node:fs';
import {open,mkdir,rename,unlink} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {resolveLanguage,validateLanguageChoice,type LanguageChoice,type LanguageState,type InterfaceLanguage} from '../shared/language';
export class LanguageStore {
 private choice:LanguageChoice='zh-CN';private warning=false;private pending:Promise<unknown>=Promise.resolve();private readonly current:InterfaceLanguage;
 constructor(private readonly file:string,private readonly systemLanguage:string){try{const handle=openSync(file,'r');let raw:string;try{const info=fstatSync(handle);if(!info.isFile()||info.size>2048)throw new Error('Invalid language settings');const buffer=Buffer.alloc(2049),size=readSync(handle,buffer,0,buffer.length,0);if(size>2048)throw new Error('Invalid language settings');raw=buffer.subarray(0,size).toString('utf8');}finally{closeSync(handle);}const saved=JSON.parse(raw);if(saved?.version!==1)throw new Error('Unsupported language settings');this.choice=validateLanguageChoice(saved.choice);}catch(error){this.warning=(error as NodeJS.ErrnoException).code!=='ENOENT';}this.current=resolveLanguage(this.choice,systemLanguage);}
 state():LanguageState{const next=resolveLanguage(this.choice,this.systemLanguage);return {choice:this.choice,current:this.current,next,restartRequired:next!==this.current,warning:this.warning};}
 save(value:unknown){const next=validateLanguageChoice(value),task=this.pending.catch(()=>{}).then(async()=>{const folder=dirname(this.file),temporary=join(folder,'.language-'+randomUUID()+'.tmp');let created=false;try{await mkdir(folder,{recursive:true});const handle=await open(temporary,'wx',0o600);created=true;try{await handle.writeFile(JSON.stringify({version:1,choice:next})+'\n','utf8');await handle.sync();}finally{await handle.close();}await rename(temporary,this.file);created=false;this.choice=next;this.warning=false;return this.state();}finally{if(created)await unlink(temporary).catch(()=>{});}});this.pending=task;return task;}
}
