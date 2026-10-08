import {parentPort,workerData} from 'node:worker_threads';
import {openDatabase} from './database';
import {inspectDatabase} from './database-check';
import {Store} from './store';
import {copyDatabase} from './database-copy';
import {copyRawDatabase,prepareRollbackData} from './rollback-data';
import {createHash} from 'node:crypto';
import {open,lstat,readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {checkpointID} from '../shared/checkpoints';
import {t as tr} from '../shared/i18n';
export async function fileDigest(file:string){
 const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>512*1024*1024)throw new Error(tr('恢复点文件无效'));
 const handle=await open(file,'r');try{const initial=await handle.stat();if(initial.ino!==info.ino||(info.dev!==0&&initial.dev!==info.dev)||initial.size!==info.size)throw new Error(tr('恢复点文件已改变，未恢复或删除任何内容'));const hash=createHash('sha256');for await(const chunk of handle.createReadStream({autoClose:false}))hash.update(chunk);const end=await handle.stat(),current=await lstat(file);if(end.size!==initial.size||end.mtimeMs!==initial.mtimeMs||current.isSymbolicLink()||current.ino!==initial.ino||(current.dev!==0&&current.dev!==initial.dev)||current.size!==initial.size||current.mtimeMs!==initial.mtimeMs)throw new Error(tr('恢复点文件已改变，未恢复或删除任何内容'));return {bytes:initial.size,sha256:hash.digest('hex')};}finally{await handle.close();}
}
function describe(file:string,key?:Uint8Array,expectedProfile?:string){const db=openDatabase(file,true,key);let applicationVersion:string,schema:number;try{if(expectedProfile){const owner=db.prepare("SELECT value FROM meta WHERE key='profile-id'").get();if(!owner||owner.value!==JSON.stringify(expectedProfile))throw new Error(tr('此目录不属于当前 Clip 数据'));}const row=db.prepare("SELECT value FROM meta WHERE key='application-version'").get();applicationVersion=row?JSON.parse(row.value):'';schema=Number(db.prepare('PRAGMA user_version').get().user_version);}finally{db.close();}return {...inspectDatabase(file,key),applicationVersion,schema};}
async function run(){const v=workerData;
 try{
  if(v.operation==='checkpoint-references'){const result:string[]=[];const root=join(v.root,'program-versions');for(const entry of await readdir(root,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){if(!entry.isDirectory()||!checkpointID(entry.name))continue;try{const dir=join(root,entry.name),info=await lstat(dir);if(info.isSymbolicLink())continue;const file=join(dir,'archive.json'),stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4*1024*1024)continue;const archive=JSON.parse(await readFile(file,'utf8'));if(archive?.format==='clip-program-version'&&archive.formatVersion===1&&archive.id===entry.name&&checkpointID(archive.checkpointId)&&archive.profileId===v.profileId)result.push(archive.checkpointId);}catch{}}return result;}
  if(v.operation==='digest')return fileDigest(v.file);
  if(v.operation==='inspect')return describe(v.source,v.sourceKey,v.profileId);
  if(v.operation==='copy'){const source=new Store(v.source,false,true,v.sourceKey);try{copyDatabase(source,v.file,v.targetKey);}finally{source.close();}return inspectDatabase(v.file,v.targetKey);}
  if(v.operation==='rollback-copy'){const before=describe(v.source,v.sourceKey,v.profileId);copyRawDatabase(v.source,v.file,v.sourceKey,v.targetKey);prepareRollbackData(v.file,v.version,v.targetKey);const after=describe(v.file,v.targetKey,v.profileId);if(after.schema!==before.schema||after.clips!==before.clips||after.snippets!==before.snippets)throw new Error(tr('回退副本校验失败'));const h=await open(v.file,'r+');try{await h.sync();}finally{await h.close();}return {...after,files:await fileDigest(v.file)};}
  if(v.operation!=='snapshot')throw new Error(tr('恢复点操作无效'));
  const info=await lstat(v.source);if(!info.isFile()||info.isSymbolicLink())throw new Error(tr('恢复点文件无效'));
  // SQLite takes one consistent read transaction, including committed WAL pages.
  // Writers may continue after that instant; the archived snapshot is immutable.
  const db=openDatabase(v.source,true,v.sourceKey);try{db.exec('PRAGMA busy_timeout=5000');db.prepare('VACUUM INTO ?').run(v.file);}finally{db.close();}
  const after=describe(v.file,v.sourceKey),h=await open(v.file,'r+');try{await h.sync();}finally{await h.close();}return {...after,files:await fileDigest(v.file)};
 }finally{v.sourceKey?.fill(0);v.targetKey?.fill(0);}
}
void run().then(value=>parentPort?.postMessage({ok:true,value}),e=>parentPort?.postMessage({ok:false,error:String(e instanceof Error?e.message:e)}));
