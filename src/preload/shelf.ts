import './language';
import './appearance';
import {contextBridge,ipcRenderer,webUtils} from 'electron';
import type {ShelfAPI} from '../shared/desktop';
const invoke=(name:string,...args:unknown[])=>ipcRenderer.invoke('clipper:shelf-'+name,...args);
const api:ShelfAPI={state:()=>invoke('state'),choose:()=>invoke('choose'),dropFiles:files=>invoke('files',files.map(f=>webUtils.getPathForFile(f))),dropText:text=>invoke('text',text),remove:id=>invoke('remove',id),copy:(id,paste)=>invoke('copy',id,paste),drag:id=>ipcRenderer.send('clipper:shelf-drag',id),hide:()=>invoke('hide'),main:()=>invoke('main'),top:value=>invoke('top',value),onChange:callback=>{const fn=()=>callback();ipcRenderer.on('clipper:changed',fn);return()=>ipcRenderer.removeListener('clipper:changed',fn);},onNotice:callback=>{const fn=(_e:unknown,text:string)=>callback(text);ipcRenderer.on('clipper:notice',fn);return()=>ipcRenderer.removeListener('clipper:notice',fn);}};
contextBridge.exposeInMainWorld('clipperShelf',api);
