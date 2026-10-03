import {parentPort,workerData} from 'node:worker_threads';
import {Store} from './store';
import {readBackupPlaintext,parseBackup} from './backup-crypto';
import {validateBackup} from '../shared/core';
import type {Thumbnails} from './thumbnails';
import {t as tr,setInterfaceLanguage} from '../shared/i18n';

setInterfaceLanguage(workerData.language);
const flags=new Int32Array(workerData.flags),live=()=>Atomics.load(flags,0)===0;
function check(){if(!live())throw new Error(tr('备份已取消或处理超时，请稍后重试'));}
async function run(){
 let plain:Buffer|undefined=await readBackupPlaintext(workerData.file,workerData.hash,workerData.password,live),thumbnails:Thumbnails|undefined;
 let result:unknown;
 try{
  check();
  const value=parseBackup(plain);
  // Transfer the inspected source bytes once. The parent cannot authorize restore until rehearsal exits successfully.
  const snapshot=plain.byteOffset===0&&plain.byteLength===plain.buffer.byteLength?new Uint8Array(plain.buffer as ArrayBuffer):Uint8Array.from(plain);
  if(snapshot.buffer!==plain.buffer)plain.fill(0);plain=undefined;
  parentPort!.postMessage({snapshot},[snapshot.buffer]);check();
  const summary=validateBackup(value),rendered=new Map<string,string>();
  for(const entry of [...summary.clips,...summary.snippets])if(entry.payload.png&&!rendered.has(entry.payload.png)){
   Atomics.store(flags,1,1);
   try{check();thumbnails??=new (await import('./thumbnails')).Thumbnails(workerData.imageHost,15000);check();rendered.set(entry.payload.png,(await thumbnails.run(entry.payload,live))!);}finally{await thumbnails?.stop();Atomics.store(flags,1,0);}
  }
  check();
  const temporary=new Store(':memory:');
  try{temporary.import(value,p=>{check();return p.png?rendered.get(p.png):undefined;});}finally{temporary.close();}
  check();
  result={clips:summary.clips.length,snippets:summary.snippets.length,categories:summary.categories.length,scripts:summary.scripts.length,exportedAt:typeof value.exportedAt==='string'?value.exportedAt.slice(0,100):''};
 }finally{plain?.fill(0);await thumbnails?.stop();}
 check();parentPort!.postMessage({ok:true,result});
}
void run().catch(error=>parentPort?.postMessage({ok:false,error:String(error instanceof Error?error.message:error).slice(0,1000)}));
