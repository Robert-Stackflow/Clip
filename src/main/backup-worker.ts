import {parentPort,workerData} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import {Store} from './store';
import {encodeBackup,decodeBackup} from './backup-crypto';
import {writeAtomic,boundedFile} from './data-files';
import {validateBackup} from '../shared/core';
async function run(){
 const {source,file,password,temp,databaseKey}=workerData;let store:Store;try{store=new Store(source,false,true,databaseKey);}finally{databaseKey?.fill(0);}let value:ReturnType<Store['backup']>;
 try{value=store.backup();}finally{store.close();}
 // Rehearse the import away from the clipboard/UI thread before writing anything.
 const test=new Store(':memory:');try{test.import(value);}finally{test.close();}
 const data=await encodeBackup(value,password);await writeAtomic(file,data,temp);
 const saved=await boundedFile(file),hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
 if(hash(saved)!==hash(data))throw new Error('备份写入校验失败');validateBackup(await decodeBackup(saved,password));
}
void run().then(()=>parentPort?.postMessage({ok:true}),error=>parentPort?.postMessage({ok:false,error:String(error instanceof Error?error.message:error).slice(0,1000)}));
