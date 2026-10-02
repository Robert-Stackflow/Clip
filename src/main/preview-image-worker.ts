import {parentPort,workerData} from 'node:worker_threads';
import {openDatabase} from './database';
import {setInterfaceLanguage,t as tr} from '../shared/i18n';
setInterfaceLanguage(workerData.language);
const key:Uint8Array|undefined=workerData.key;let db:ReturnType<typeof openDatabase>|undefined;
try{
 db=openDatabase(workerData.source,true,key);key?.fill(0);db.exec('BEGIN');
 const table=workerData.snippet?'snippets':'clips';
 const row=db.prepare(`SELECT json_extract(data,'$.payload.png') AS png FROM ${table} WHERE id=?`).get(workerData.id) as {png?:string}|undefined;
 if(!row?.png)throw new Error(tr('图片已不存在'));
 // Dedicated transferable storage avoids a second copy on the worker/main boundary.
 const length=Buffer.byteLength(row.png,'base64'),bytes=Buffer.allocUnsafeSlow(length);if(bytes.write(row.png,0,length,'base64')!==length){bytes.fill(0);throw new Error(tr('无法读取图片预览'));}
 db.exec('ROLLBACK');db.close();db=undefined;parentPort!.postMessage({ok:true,bytes},[bytes.buffer]);
}catch(error){parentPort!.postMessage({ok:false,error:error instanceof Error?error.message:String(error)});}
finally{key?.fill(0);db?.close();}
