import {contextBridge,ipcRenderer} from 'electron';
import type {ScrollAPI} from '../shared/scroll';
const call=(name:string,...args:unknown[])=>ipcRenderer.invoke('clipper:scroll-'+name,...args);
const api:ScrollAPI={state:()=>call('state'),screens:()=>call('screens'),start:id=>call('start',id),append:()=>call('append'),align:n=>call('align',n),reject:()=>call('reject'),undo:()=>call('undo'),finish:()=>call('finish'),cancel:()=>call('cancel'),save:()=>call('save'),copy:()=>call('copy'),onChange:cb=>{const fn=()=>cb();ipcRenderer.on('clipper:scroll-changed',fn);ipcRenderer.on('clipper:changed',fn);return()=>{ipcRenderer.removeListener('clipper:scroll-changed',fn);ipcRenderer.removeListener('clipper:changed',fn);};}};
contextBridge.exposeInMainWorld('clipperScroll',api);
