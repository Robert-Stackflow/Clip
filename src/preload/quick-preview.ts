import './language';
import './appearance';
import {contextBridge,ipcRenderer} from 'electron';
import type {QuickPreviewAPI} from '../shared/quick-preview';
const api:QuickPreviewAPI={onState:callback=>{const listener=(_event:unknown,value:any)=>callback(value);ipcRenderer.on('clipper:quick-preview-state',listener);return()=>ipcRenderer.removeListener('clipper:quick-preview-state',listener);},presence:inside=>ipcRenderer.send('clipper:quick-preview-presence',inside)};
contextBridge.exposeInMainWorld('clipperQuickPreview',api);
