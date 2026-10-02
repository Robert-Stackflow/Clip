import {contextBridge,ipcRenderer} from 'electron';
import type {SelectionAPI} from '../shared/selection';
const api:SelectionAPI={state:()=>ipcRenderer.invoke('clipper:selection-view'),action:(token,action)=>ipcRenderer.invoke('clipper:selection-action',token,action),hide:()=>ipcRenderer.invoke('clipper:selection-hide'),onChange:callback=>{const listener=()=>callback();ipcRenderer.on('clipper:selection-changed',listener);ipcRenderer.on('clipper:changed',listener);return()=>{ipcRenderer.removeListener('clipper:selection-changed',listener);ipcRenderer.removeListener('clipper:changed',listener);};}};
contextBridge.exposeInMainWorld('clipperSelection',api);
