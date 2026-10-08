import './language';
import './appearance';
import {contextBridge,ipcRenderer} from 'electron';
import type {RecoveryAPI} from '../shared/recovery';
const invoke=(name:string,...args:unknown[])=>ipcRenderer.invoke('clip-recovery:'+name,...args);
const api:RecoveryAPI={checkpoints:()=>invoke('checkpoints'),chooseCheckpoint:id=>invoke('checkpoint-choose',id),state:()=>invoke('state'),retry:()=>invoke('retry'),choose:kind=>invoke('choose',kind),preview:(token,password,newPassword,mode)=>invoke('preview',token,password,newPassword,mode),commit:(token,proof)=>invoke('commit',token,proof),cancel:()=>invoke('cancel'),quit:()=>invoke('quit')};
contextBridge.exposeInMainWorld('recovery',api);
