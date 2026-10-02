import {BrowserWindow,type MessageBoxOptions,type IpcMainInvokeEvent} from 'electron';
import {randomUUID} from 'node:crypto';
import {t as tr} from '../shared/i18n';
import type {WindowConfirmation} from '../shared/chrome';
interface Pending{window:BrowserWindow;request:WindowConfirmation;finish(response:number):void}
const pending=new Map<number,Pending>();
export function confirmWindow(window:BrowserWindow|undefined,options:MessageBoxOptions):Promise<{response:number}>{
 const cancel=options.cancelId??0;if(!window||window.isDestroyed()||window.webContents.isDestroyed()||pending.has(window.id))return Promise.resolve({response:cancel});
 const request:WindowConfirmation={token:randomUUID(),message:options.message,detail:options.detail||'',buttons:options.buttons||[],defaultId:options.defaultId??cancel,cancelId:cancel};
 return new Promise(resolve=>{const closed=()=>finish(cancel),finish=(response:number)=>{if(pending.get(window.id)?.request.token!==request.token)return;pending.delete(window.id);window.removeListener('closed',closed);window.webContents.removeListener('render-process-gone',closed);resolve({response});};pending.set(window.id,{window,request,finish});window.once('closed',closed);window.webContents.once('render-process-gone',closed);try{window.webContents.send('clipper:window-confirm',request);}catch{finish(cancel);}});
}
export function answerWindowConfirmation(event:IpcMainInvokeEvent,window:BrowserWindow,token:unknown,response:unknown){
 const value=pending.get(window.id);if(!value||value.window!==window||event.sender!==window.webContents||typeof token!=='string'||token!==value.request.token||!Number.isInteger(response)||Number(response)<0||Number(response)>=value.request.buttons.length)throw new Error(tr('请求已失效'));
 value.finish(Number(response));
}
