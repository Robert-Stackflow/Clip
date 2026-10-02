import {parentPort,workerData} from 'node:worker_threads';
import {setInterfaceLanguage} from '../shared/i18n';
import {snapshotSyncFiles} from './sync-files-core';
setInterfaceLanguage(workerData.language);
void snapshotSyncFiles(workerData.files).then(attachments=>parentPort!.postMessage({ok:true,attachments})).catch(e=>parentPort!.postMessage({ok:false,error:String(e.message).slice(0,300)}));
