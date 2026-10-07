import './language';
import './appearance';
import {contextBridge,ipcRenderer} from 'electron';
import type {TrayAPI} from '../shared/tray';
const invoke=(name:string,...args:unknown[])=>ipcRenderer.invoke('clipper:tray-'+name,...args);
const api:TrayAPI={state:query=>invoke('state',query),preview:token=>invoke('preview',token),use:(token,paste)=>invoke('use',token,paste),drag:token=>ipcRenderer.send('clipper:tray-drag',token),hide:()=>invoke('hide'),main:()=>invoke('main'),appIcons:names=>invoke('app-icons',names),onChange:callback=>{const listener=()=>callback();ipcRenderer.on('clipper:changed',listener);return()=>ipcRenderer.removeListener('clipper:changed',listener);},onNotice:callback=>{const listener=(_event:unknown,text:string)=>callback(text);ipcRenderer.on('clipper:notice',listener);return()=>ipcRenderer.removeListener('clipper:notice',listener);}};
api.onSession=callback=>{const listener=(_event:unknown,open:boolean)=>callback(open===true);ipcRenderer.on('clipper:tray-session',listener);return()=>ipcRenderer.removeListener('clipper:tray-session',listener);};
contextBridge.exposeInMainWorld('clipperTray',api);
