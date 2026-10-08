import './language';
import './appearance';
import { contextBridge,ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('capture',{data:()=>ipcRenderer.invoke('clip:capture-data'),complete:(rect:unknown)=>ipcRenderer.invoke('clip:capture-complete',rect)});
