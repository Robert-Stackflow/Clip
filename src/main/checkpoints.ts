import {t as tr} from '../shared/i18n';
import {mkdir,readFile,readdir,lstat,rename,unlink,rmdir,statfs,stat} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {localDirectory,writeAtomic} from './data-files';
import {readVault} from './history-vault';
import {recoveryJob} from './recovery-jobs';
import {checkpointID,CHECKPOINT_SCHEMA,type CheckpointManifest,type CheckpointEntry} from '../shared/checkpoints';
import {stableVersion} from '../shared/updates';
const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
export class CheckpointManager {
 readonly root:string;
 private busy=false;
 constructor(private defaultDirectory:string){this.root=join(defaultDirectory,'history-checkpoints');}
 private async references(profileId:string){return new Set(await recoveryJob<string[]>({operation:'checkpoint-references',root:this.defaultDirectory,profileId}));}
 private async directory(){await mkdir(this.root,{recursive:true});return localDirectory(this.root);}
 private async manifest(id:unknown):Promise<{directory:string;value:CheckpointManifest}>{
  if(!checkpointID(id))throw new Error(tr('恢复点编号无效'));const root=await this.directory(),directory=await localDirectory(join(root,id));if(dirname(directory).toLowerCase()!==root.toLowerCase())throw new Error(tr('恢复点目录无效'));
  const manifest=join(directory,'checkpoint.json'),info=await lstat(manifest);if(!info.isFile()||info.isSymbolicLink()||info.size>16384)throw new Error(tr('恢复点清单无效'));const v=JSON.parse(await readFile(manifest,'utf8')) as CheckpointManifest;
  if(v?.format!=='clip-history-checkpoint'||v.version!==1||v.id!==id||!checkpointID(v.profileId)||!Number.isSafeInteger(v.createdAt)||v.createdAt<=0||!Number.isSafeInteger(v.schema)||v.schema<0||typeof v.encrypted!=='boolean'||!['upgrade','manual','update'].includes(v.reason)||!stableVersion(v.targetVersion)||v.sourceVersion!==''&&!stableVersion(v.sourceVersion)||!Number.isSafeInteger(v.clips)||v.clips<0||!Number.isSafeInteger(v.snippets)||v.snippets<0||!v.files||Object.keys(v.files).some(k=>!['history.sqlite','history-vault.json'].includes(k))||!v.files['history.sqlite']||v.encrypted!==!!v.files['history-vault.json'])throw new Error(tr('恢复点清单无效'));
  for(const f of Object.values(v.files))if(!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>512*1024*1024||!/^[a-f0-9]{64}$/.test(f.sha256))throw new Error(tr('恢复点清单无效'));
  if(v.bytes!==Object.values(v.files).reduce((n,f)=>n+f.bytes,0))throw new Error(tr('恢复点容量无效'));return {directory,value:v};
 }
 async list(profileId?:string):Promise<CheckpointEntry[]>{const root=await this.directory(),entries=await readdir(root,{withFileTypes:true}),result:CheckpointEntry[]=[];for(const entry of entries){if(!entry.isDirectory()||!checkpointID(entry.name))continue;try{const {value:v}=await this.manifest(entry.name);if(profileId&&v.profileId!==profileId)continue;const {format,version,files,profileId:owner,...item}=v;result.push({...item,compatible:v.schema<=CHECKPOINT_SCHEMA});}catch{/* Incomplete or foreign files are neither shown nor cleaned. */}}return result.sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id));}
 async verify(id:unknown,profileId?:string){const p=await this.manifest(id);if(profileId&&p.value.profileId!==profileId)throw new Error(tr('恢复点不属于当前资料'));const names=await readdir(p.directory),expectedNames=['checkpoint.json',...Object.keys(p.value.files)];if(names.length!==expectedNames.length||names.some(n=>!expectedNames.includes(n)))throw new Error(tr('恢复点目录含有其他文件，未恢复或删除任何内容'));for(const [name,expected]of Object.entries(p.value.files)){const got=await recoveryJob<{bytes:number;sha256:string}>({operation:'digest',file:join(p.directory,name)});if(got.bytes!==expected.bytes||got.sha256!==expected.sha256)throw new Error(tr('恢复点文件已改变，未恢复或删除任何内容'));}return p;}
 async create(sourceDirectory:string,profileId:string,sourceVersion:string,targetVersion:string,reason:CheckpointEntry['reason'],key?:Uint8Array,valid=()=>true){
  if(this.busy)throw new Error(tr('正在创建恢复点，请稍候'));this.busy=true;let pending='';
  try{if(!checkpointID(profileId)||sourceVersion!==''&&!stableVersion(sourceVersion)||!stableVersion(targetVersion)||!['upgrade','manual','update'].includes(reason))throw new Error(tr('恢复点参数无效'));const root=await this.directory(),source=await localDirectory(sourceDirectory),id=randomUUID(),record=await readVault(source);if(!!record!==!!key)throw new Error(tr('恢复点加密状态与资料不一致'));
   const size=(await stat(join(source,'history.sqlite'))).size+(await stat(join(source,'history.sqlite-wal')).catch(()=>({size:0}))).size,disk=await statfs(root);if(disk.bavail*disk.bsize<size+64*1024*1024)throw new Error(tr('磁盘空间不足，无法创建升级恢复点'));
   pending=join(root,'.pending-'+id);await mkdir(pending);const result=await recoveryJob<any>({operation:'snapshot',source:join(source,'history.sqlite'),file:join(pending,'history.sqlite'),sourceKey:key});if(!valid())throw new Error(tr('恢复点创建已取消'));if(result.profileId&&result.profileId!==profileId)throw new Error(tr('恢复点资料编号不一致'));if((stableVersion(result.applicationVersion)||'')!==(stableVersion(sourceVersion)||''))throw new Error(tr('资料版本在创建恢复点时改变，请重试'));
   const files:CheckpointManifest['files']={'history.sqlite':result.files};if(record){const original=await readVault(source);if(JSON.stringify(original)!==JSON.stringify(record))throw new Error(tr('历史加密配置已改变，请重试'));const content=JSON.stringify(record);await writeAtomic(join(pending,'history-vault.json'),content);files['history-vault.json']={bytes:Buffer.byteLength(content),sha256:hash(content)};}
   const manifest:CheckpointManifest={format:'clip-history-checkpoint',version:1,id,profileId,createdAt:Date.now(),sourceVersion,targetVersion,reason,schema:result.schema,encrypted:!!record,bytes:Object.values(files).reduce((n,f)=>n+f.bytes,0),clips:result.clips,snippets:result.snippets,files};await writeAtomic(join(pending,'checkpoint.json'),JSON.stringify(manifest));if(!valid())throw new Error(tr('恢复点创建已取消'));await rename(pending,join(root,id));pending='';
   if(reason!=='manual'){const references=await this.references(profileId),automatic=(await this.list(profileId)).filter(x=>x.reason!=='manual'&&!references.has(x.id));for(const old of automatic.slice(3))await this.remove(old.id,profileId).catch(()=>{});}return manifest;
  }finally{if(pending){for(const name of ['history.sqlite','history.sqlite-wal','history.sqlite-shm','history-vault.json','checkpoint.json'])await unlink(join(pending,name)).catch(()=>{});await rmdir(pending).catch(()=>{});}this.busy=false;}
 }
 async remove(id:unknown,profileId:string){const p=await this.verify(id,profileId);if((await this.references(profileId)).has(p.value.id))throw new Error(tr('此恢复点关联旧程序归档，请先删除对应的旧程序'));const names=await readdir(p.directory);if(names.length!==Object.keys(p.value.files).length+1||names.some(n=>n!=='checkpoint.json'&&!(n in p.value.files)))throw new Error(tr('恢复点目录含有其他文件，未删除任何内容'));for(const name of names){const info=await lstat(join(p.directory,name));if(!info.isFile()||info.isSymbolicLink())throw new Error(tr('恢复点目录含有其他文件，未删除任何内容'));}for(const name of names)await unlink(join(p.directory,name));await rmdir(p.directory);}
}
