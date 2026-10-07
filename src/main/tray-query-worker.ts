import {parentPort,workerData} from 'node:worker_threads';
import {openDatabase} from './database';
import {readTrayRows} from './tray-query';
import {setInterfaceLanguage} from '../shared/i18n';
setInterfaceLanguage(workerData.language);
const key:Uint8Array|undefined=workerData.key;let db:ReturnType<typeof openDatabase>|undefined;
try{
 db=openDatabase(workerData.source,true,key);key?.fill(0);db.exec('BEGIN');
 const row=db.prepare("SELECT value FROM meta WHERE key='categories'").get();
 const result=readTrayRows(db,row?JSON.parse(row.value):[],workerData.query,workerData.pinnedFirst===true);
 db.exec('ROLLBACK');db.close();db=undefined;parentPort!.postMessage({ok:true,result});
}catch(error){parentPort!.postMessage({ok:false,error:error instanceof Error?error.message:String(error)});}
finally{key?.fill(0);db?.close();}
