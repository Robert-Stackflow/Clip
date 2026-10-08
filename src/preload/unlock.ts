import './language';
import './appearance';
import {contextBridge,ipcRenderer} from 'electron';
import type {UnlockAPI} from '../shared/vault';
const invoke=(name:string,...args:unknown[])=>ipcRenderer.invoke('clip-unlock:'+name,...args);
const api:UnlockAPI={state:()=>invoke('state'),unlock:(value,mode,password)=>invoke('unlock',value,mode,password),recover:()=>invoke('recover'),quit:()=>invoke('quit')};
contextBridge.exposeInMainWorld('unlock',api);
