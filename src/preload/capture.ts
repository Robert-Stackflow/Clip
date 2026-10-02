import './language';
import './appearance';
import { contextBridge,ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('capture',{data:()=>ipcRenderer.invoke('clipper:capture-data'),complete:(rect:unknown)=>ipcRenderer.invoke('clipper:capture-complete',rect)});
