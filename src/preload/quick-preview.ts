import './language';
import './appearance';
import {contextBridge,ipcRenderer} from 'electron';
import type {QuickPreviewAPI} from '../shared/quick-preview';
const api:QuickPreviewAPI={onState:callback=>{const listener=(_event:unknown,value:any)=>callback(value);ipcRenderer.on('clip:quick-preview-state',listener);return()=>ipcRenderer.removeListener('clip:quick-preview-state',listener);},presence:inside=>ipcRenderer.send('clip:quick-preview-presence',inside)};
contextBridge.exposeInMainWorld('clipQuickPreview',api);
